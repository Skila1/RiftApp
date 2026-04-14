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

const (
	GatewayOpDispatch            = 0
	GatewayOpHeartbeat           = 1
	GatewayOpIdentify            = 2
	GatewayOpStatusUpdate        = 3
	GatewayOpVoiceStateUpdate    = 4
	GatewayOpResume              = 6
	GatewayOpReconnect           = 7
	GatewayOpRequestGuildMembers = 8
	GatewayOpInvalidSession      = 9
	GatewayOpHello               = 10
	GatewayOpHeartbeatAck        = 11
)

type GatewayMessage struct {
	Op int             `json:"op"`
	D  json.RawMessage `json:"d,omitempty"`
	S  *int            `json:"s,omitempty"`
	T  *string         `json:"t,omitempty"`
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
	devRepo   *repository.DeveloperRepo
	hubSvc    *service.HubService
	streamSvc *service.StreamService
	rankRepo  *repository.RankRepo
	wsHub     presenceSetter
	botReg    *BotSessionRegistry
	upgrader  websocket.Upgrader
}

type presenceSetter interface {
	SetPresence(userID string, status int)
}

func NewDiscordGatewayHandler(
	devSvc *service.DeveloperService,
	devRepo *repository.DeveloperRepo,
	hubSvc *service.HubService,
	streamSvc *service.StreamService,
	rankRepo *repository.RankRepo,
	wsHub presenceSetter,
	botReg *BotSessionRegistry,
	origins []string,
) *DiscordGatewayHandler {
	originSet := make(map[string]struct{}, len(origins))
	for _, origin := range origins {
		originSet[origin] = struct{}{}
	}
	return &DiscordGatewayHandler{
		devSvc:    devSvc,
		devRepo:   devRepo,
		hubSvc:    hubSvc,
		streamSvc: streamSvc,
		rankRepo:  rankRepo,
		wsHub:     wsHub,
		botReg:    botReg,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				if len(originSet) == 0 {
					return true
				}
				origin := r.Header.Get("Origin")
				if origin == "" {
					return true
				}
				_, ok := originSet[origin]
				return ok
			},
		},
	}
}

func (h *DiscordGatewayHandler) Handle(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("gateway upgrade error: %v", err)
		return
	}
	defer conn.Close()

	var identifiedBotUserID string
	defer func() {
		if identifiedBotUserID != "" {
			if h.botReg != nil {
				h.botReg.Unregister(identifiedBotUserID)
			}
			if h.wsHub != nil {
				h.wsHub.SetPresence(identifiedBotUserID, 0)
			}
		}
	}()

	sessionID := uuid.New().String()
	var seq int64
	var writeMu sync.Mutex

	send := func(op int, d interface{}, eventName string) {
		writeMu.Lock()
		defer writeMu.Unlock()
		msg := GatewayMessage{Op: op}
		if d != nil {
			raw, err := json.Marshal(d)
			if err != nil {
				log.Printf("gateway: marshal error: %v", err)
				return
			}
			msg.D = raw
		}
		if eventName != "" {
			msg.T = &eventName
			s := int(atomic.AddInt64(&seq, 1))
			msg.S = &s
		}
		if err := conn.WriteJSON(msg); err != nil {
			log.Printf("gateway: write error: %v", err)
		}
	}

	heartbeatInterval := 41250
	send(GatewayOpHello, map[string]interface{}{
		"heartbeat_interval": heartbeatInterval,
	}, "")

	var lastHeartbeat atomic.Int64
	lastHeartbeat.Store(time.Now().UnixMilli())

	go func() {
		for {
			time.Sleep(time.Duration(heartbeatInterval*2) * time.Millisecond)
			if time.Now().UnixMilli()-lastHeartbeat.Load() > int64(heartbeatInterval*3) {
				log.Printf("gateway: no heartbeat, closing session %s", sessionID)
				conn.Close()
				return
			}
		}
	}()

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg GatewayMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}

		switch msg.Op {
		case GatewayOpHeartbeat:
			lastHeartbeat.Store(time.Now().UnixMilli())
			send(GatewayOpHeartbeatAck, nil, "")

		case GatewayOpIdentify:
			var payload IdentifyPayload
			if err := json.Unmarshal(msg.D, &payload); err != nil {
				send(GatewayOpInvalidSession, false, "")
				continue
			}
			ctx := context.Background()
			bt, err := h.devSvc.ValidateBotToken(ctx, payload.Token)
			if err != nil {
				send(GatewayOpInvalidSession, false, "")
				continue
			}
			botUser, err := h.devRepo.GetUserByID(ctx, bt.BotUserID)
			if err != nil {
				send(GatewayOpInvalidSession, false, "")
				continue
			}

			send(GatewayOpDispatch, map[string]interface{}{
				"v":          10,
				"user":       toDiscordUser(botUser),
				"guilds":     h.getUnavailableGuilds(ctx, bt.BotUserID),
				"session_id": sessionID,
				"application": map[string]interface{}{
					"id":    bt.ApplicationID,
					"flags": 0,
				},
			}, "READY")

			identifiedBotUserID = bt.BotUserID
			if h.botReg != nil {
				h.botReg.Register(bt.ApplicationID, bt.BotUserID, send)
			}
			if h.wsHub != nil {
				h.wsHub.SetPresence(bt.BotUserID, 1)
			}

			go h.sendGuildCreates(ctx, bt.BotUserID, send)

		case GatewayOpResume:
			send(GatewayOpDispatch, nil, "RESUMED")
		}
	}
}

func (h *DiscordGatewayHandler) getUnavailableGuilds(ctx context.Context, botUserID string) []map[string]interface{} {
	hubs, _ := h.hubSvc.List(ctx, botUserID)
	guilds := make([]map[string]interface{}, 0, len(hubs))
	for _, hub := range hubs {
		guilds = append(guilds, map[string]interface{}{
			"id":          hub.ID,
			"unavailable": true,
		})
	}
	return guilds
}

func (h *DiscordGatewayHandler) sendGuildCreates(ctx context.Context, botUserID string, send func(int, interface{}, string)) {
	hubs, err := h.hubSvc.List(ctx, botUserID)
	if err != nil {
		return
	}
	for _, hub := range hubs {
		channels := make([]map[string]interface{}, 0)
		streams, err := h.streamSvc.List(ctx, hub.ID, botUserID)
		if err != nil {
			log.Printf("gateway: failed to load visible channels for hub %s: %v", hub.ID, err)
			streams = nil
		}
		for _, s := range streams {
			channels = append(channels, toDiscordChannel(&s))
		}

		ranks, err := h.rankRepo.ListByHub(ctx, hub.ID)
		if err != nil {
			log.Printf("gateway: failed to load roles for hub %s: %v", hub.ID, err)
			ranks = nil
		}
		roles := discordRolesForGuild(&hub, ranks)

		members, err := h.hubSvc.Members(ctx, hub.ID, botUserID)
		if err != nil {
			log.Printf("gateway: failed to load members for hub %s: %v", hub.ID, err)
			members = nil
		}
		discordMembers := make([]map[string]interface{}, 0, len(members))
		for _, m := range members {
			discordMembers = append(discordMembers, toDiscordMember(&m))
		}

		g := toDiscordGuild(&hub)
		g["channels"] = channels
		g["roles"] = roles
		g["members"] = discordMembers
		g["member_count"] = len(discordMembers)

		send(GatewayOpDispatch, g, "GUILD_CREATE")
	}
}
