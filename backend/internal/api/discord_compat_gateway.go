package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/service"
)

// Discord gateway opcodes
const (
	GatewayOpDispatch        = 0
	GatewayOpHeartbeat       = 1
	GatewayOpIdentify        = 2
	GatewayOpResume          = 6
	GatewayOpReconnect       = 7
	GatewayOpInvalidSession  = 9
	GatewayOpHello           = 10
	GatewayOpHeartbeatAck    = 11
)

const heartbeatIntervalMs = 45000

type GatewayMessage struct {
	Op   int              `json:"op"`
	D    json.RawMessage  `json:"d,omitempty"`
	S    *int64           `json:"s,omitempty"`
	T    *string          `json:"t,omitempty"`
}

type IdentifyPayload struct {
	Token      string `json:"token"`
	Intents    int    `json:"intents"`
	Properties struct {
		OS      string `json:"os"`
		Browser string `json:"browser"`
		Device  string `json:"device"`
	} `json:"properties"`
}

type DiscordGatewayHandler struct {
	devSvc    *service.DeveloperService
	hubRepo   *repository.HubRepo
	streamRepo *repository.StreamRepo
	devRepo   *repository.DeveloperRepo
	upgrader  websocket.Upgrader
}

func NewDiscordGatewayHandler(
	devSvc *service.DeveloperService,
	hubRepo *repository.HubRepo,
	streamRepo *repository.StreamRepo,
	devRepo *repository.DeveloperRepo,
	allowedOrigins []string,
) *DiscordGatewayHandler {
	return &DiscordGatewayHandler{
		devSvc:     devSvc,
		hubRepo:    hubRepo,
		streamRepo: streamRepo,
		devRepo:    devRepo,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
}

type gatewaySession struct {
	conn        *websocket.Conn
	mu          sync.Mutex
	botUserID   string
	appID       string
	intents     int
	sessionID   string
	seq         int64
	identified  bool
	heartbeatOK atomic.Bool
	done        chan struct{}
}

func (s *gatewaySession) sendJSON(msg interface{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return s.conn.WriteJSON(msg)
}

func (s *gatewaySession) nextSeq() int64 {
	return atomic.AddInt64(&s.seq, 1)
}

func (h *DiscordGatewayHandler) Handle(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("discord gateway upgrade error: %v", err)
		return
	}
	defer conn.Close()

	sess := &gatewaySession{
		conn:      conn,
		sessionID: uuid.New().String(),
		done:      make(chan struct{}),
	}
	sess.heartbeatOK.Store(true)

	// Send Hello (op 10)
	hello := GatewayMessage{
		Op: GatewayOpHello,
		D:  mustMarshal(map[string]interface{}{"heartbeat_interval": heartbeatIntervalMs}),
	}
	if err := sess.sendJSON(hello); err != nil {
		return
	}

	// Start heartbeat checker
	go h.heartbeatWatchdog(sess)

	// Read loop
	conn.SetReadLimit(4096)
	for {
		_, msgBytes, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg GatewayMessage
		if err := json.Unmarshal(msgBytes, &msg); err != nil {
			continue
		}

		switch msg.Op {
		case GatewayOpHeartbeat:
			sess.heartbeatOK.Store(true)
			ack := GatewayMessage{Op: GatewayOpHeartbeatAck}
			sess.sendJSON(ack)

		case GatewayOpIdentify:
			h.handleIdentify(sess, msg.D)

		case GatewayOpResume:
			// For now, treat resume as re-identify
			h.handleIdentify(sess, msg.D)
		}
	}

	close(sess.done)
}

func (h *DiscordGatewayHandler) handleIdentify(sess *gatewaySession, data json.RawMessage) {
	var payload IdentifyPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		sess.sendJSON(GatewayMessage{
			Op: GatewayOpInvalidSession,
			D:  mustMarshal(false),
		})
		return
	}

	botUserID, appID, err := h.devSvc.ValidateBotToken(context.Background(), payload.Token)
	if err != nil {
		sess.sendJSON(GatewayMessage{
			Op: GatewayOpInvalidSession,
			D:  mustMarshal(false),
		})
		return
	}

	sess.botUserID = botUserID
	sess.appID = appID
	sess.intents = payload.Intents
	sess.identified = true

	botUser, _ := h.devRepo.GetUserByID(context.Background(), botUserID)

	readyEvent := "READY"
	seq := sess.nextSeq()

	readyData := map[string]interface{}{
		"v":                  10,
		"user":               toDiscordUser(botUser),
		"guilds":             h.getUnavailableGuilds(botUserID),
		"session_id":         sess.sessionID,
		"resume_gateway_url": "wss://gateway.riftapp.io",
		"application": map[string]interface{}{
			"id":    appID,
			"flags": 0,
		},
	}

	sess.sendJSON(GatewayMessage{
		Op: GatewayOpDispatch,
		D:  mustMarshal(readyData),
		S:  &seq,
		T:  &readyEvent,
	})

	// Send GUILD_CREATE for each guild the bot is in
	go h.sendGuildCreates(sess, botUserID)
}

func (h *DiscordGatewayHandler) sendGuildCreates(sess *gatewaySession, botUserID string) {
	ctx := context.Background()
	hubs, err := h.hubRepo.ListByUser(ctx, botUserID)
	if err != nil {
		return
	}

	eventName := "GUILD_CREATE"
	for _, hub := range hubs {
		streams, _ := h.streamRepo.ListByHub(ctx, hub.ID)
		channels := make([]map[string]interface{}, 0, len(streams))
		for _, s := range streams {
			channels = append(channels, toDiscordChannel(&s))
		}

		guildData := toDiscordGuild(&hub)
		guildData["channels"] = channels
		guildData["members"] = []interface{}{}

		seq := sess.nextSeq()
		select {
		case <-sess.done:
			return
		default:
			sess.sendJSON(GatewayMessage{
				Op: GatewayOpDispatch,
				D:  mustMarshal(guildData),
				S:  &seq,
				T:  &eventName,
			})
		}
	}
}

func (h *DiscordGatewayHandler) getUnavailableGuilds(botUserID string) []map[string]interface{} {
	ctx := context.Background()
	hubs, err := h.hubRepo.ListByUser(ctx, botUserID)
	if err != nil {
		return []map[string]interface{}{}
	}
	guilds := make([]map[string]interface{}, 0, len(hubs))
	for _, hub := range hubs {
		guilds = append(guilds, map[string]interface{}{
			"id":          hub.ID,
			"unavailable": true,
		})
	}
	return guilds
}

func (h *DiscordGatewayHandler) heartbeatWatchdog(sess *gatewaySession) {
	ticker := time.NewTicker(time.Duration(heartbeatIntervalMs+5000) * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-sess.done:
			return
		case <-ticker.C:
			if !sess.heartbeatOK.Load() && sess.identified {
				sess.mu.Lock()
				sess.conn.WriteMessage(websocket.CloseMessage,
					websocket.FormatCloseMessage(4009, "Session timed out"))
				sess.conn.Close()
				sess.mu.Unlock()
				return
			}
			sess.heartbeatOK.Store(false)
		}
	}
}

func mustMarshal(v interface{}) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}
