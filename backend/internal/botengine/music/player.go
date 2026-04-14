package music

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"os/exec"
	"sync"
	"time"

	"github.com/pion/webrtc/v4"

	lksdk "github.com/livekit/server-sdk-go/v2"

	"github.com/riftapp-cloud/riftapp/internal/models"
)

type Config struct {
	DefaultVolume   int      `json:"default_volume"`
	MaxQueueSize    int      `json:"max_queue_size"`
	AllowedStreams  []string `json:"allowed_streams"`
	DJRoleID        string   `json:"dj_role_id"`
	SpotifyClientID string   `json:"spotify_client_id"`
	SpotifySecret   string   `json:"spotify_client_secret"`
}

type Track struct {
	Title     string `json:"title"`
	URL       string `json:"url"`
	AudioURL  string `json:"audio_url"`
	Duration  string `json:"duration"`
	Query     string `json:"query"`
	Requester string `json:"requester"`
}

type Player struct {
	mu       sync.Mutex
	queue    []Track
	current  *Track
	playing  bool
	paused   bool
	volume   int
	looping  bool
	shuffle  bool

	cancel     context.CancelFunc
	room       *lksdk.Room
	streamID   string
	spotifyCfg *SpotifyClient
}

type HubContext interface {
	SendMessage(ctx context.Context, streamID, content string, embeds []models.Embed, components []models.Component) (*models.Message, error)
	SendEmbed(ctx context.Context, streamID string, embed models.Embed) (*models.Message, error)
}

type Template struct {
	mu      sync.RWMutex
	players map[string]*Player

	lkURL    string
	lkKey    string
	lkSecret string
	source   *Source
}

func NewTemplate(lkURL, lkKey, lkSecret string) *Template {
	return &Template{
		players:  make(map[string]*Player),
		lkURL:    lkURL,
		lkKey:    lkKey,
		lkSecret: lkSecret,
		source:   NewSource(),
	}
}

func (t *Template) Name() string { return "music" }

func (t *Template) DefaultConfig() json.RawMessage {
	cfg := Config{DefaultVolume: 80, MaxQueueSize: 100}
	b, _ := json.Marshal(cfg)
	return b
}

func (t *Template) ValidateConfig(cfg json.RawMessage) error {
	var c Config
	return json.Unmarshal(cfg, &c)
}

type SlashCommandData struct {
	CommandName string            `json:"command_name"`
	Options     map[string]string `json:"options"`
	StreamID    string            `json:"stream_id"`
	UserID      string            `json:"user_id"`
}

type BotEvent struct {
	Type     string
	HubID    string
	StreamID string
	UserID   string
	Data     json.RawMessage
}

func (t *Template) HandleCommand(ctx context.Context, hctx HubContext, hubID string, cmd SlashCommandData) error {
	switch cmd.CommandName {
	case "play":
		return t.handlePlay(ctx, hctx, hubID, cmd)
	case "pause":
		return t.handlePause(ctx, hctx, hubID, cmd)
	case "skip":
		return t.handleSkip(ctx, hctx, hubID, cmd)
	case "stop":
		return t.handleStop(ctx, hctx, hubID, cmd)
	case "queue":
		return t.handleQueue(ctx, hctx, hubID, cmd)
	case "volume":
		return t.handleVolume(ctx, hctx, hubID, cmd)
	case "nowplaying":
		return t.handleNowPlaying(ctx, hctx, hubID, cmd)
	case "loop":
		return t.handleLoop(ctx, hctx, hubID, cmd)
	case "shuffle":
		return t.handleShuffle(ctx, hctx, hubID, cmd)
	}
	return nil
}

func (t *Template) getOrCreatePlayer(hubID string, volume int) *Player {
	t.mu.Lock()
	defer t.mu.Unlock()
	if p, ok := t.players[hubID]; ok {
		return p
	}
	p := &Player{volume: volume}
	t.players[hubID] = p
	return p
}

// spotifyClient creates a Spotify client from the hub's music bot config.
// Returns nil if credentials aren't configured.
func (t *Template) spotifyClient(hubID string) *SpotifyClient {
	t.mu.RLock()
	player, ok := t.players[hubID]
	t.mu.RUnlock()

	if ok && player != nil {
		player.mu.Lock()
		cfg := player.spotifyCfg
		player.mu.Unlock()
		if cfg != nil && cfg.Valid() {
			return cfg
		}
	}

	return nil
}

// SetHubConfig is called by the wrapper to inject Spotify credentials before commands run.
func (t *Template) SetHubConfig(hubID string, rawConfig []byte) {
	var cfg Config
	if err := json.Unmarshal(rawConfig, &cfg); err != nil {
		return
	}
	if cfg.SpotifyClientID == "" || cfg.SpotifySecret == "" {
		return
	}

	player := t.getOrCreatePlayer(hubID, cfg.DefaultVolume)
	player.mu.Lock()
	defer player.mu.Unlock()

	if player.spotifyCfg == nil || player.spotifyCfg.clientID != cfg.SpotifyClientID {
		player.spotifyCfg = NewSpotifyClient(cfg.SpotifyClientID, cfg.SpotifySecret)
	}
}

func (t *Template) handlePlay(ctx context.Context, hctx HubContext, hubID string, cmd SlashCommandData) error {
	query := cmd.Options["query"]
	if query == "" {
		_, _ = hctx.SendMessage(ctx, cmd.StreamID, "Please provide a song name or URL.", nil, nil)
		return nil
	}

	_, _ = hctx.SendMessage(ctx, cmd.StreamID, "🔍 Searching...", nil, nil)

	var tracks []Track

	if IsSpotifyURL(query) {
		spotClient := t.spotifyClient(hubID)
		if spotClient == nil || !spotClient.Valid() {
			_, _ = hctx.SendMessage(ctx, cmd.StreamID,
				"⚠️ Spotify is not configured for this hub. Go to **Hub Settings > Bot Builder > Music Bot** and add your Spotify Client ID & Secret.", nil, nil)
			return nil
		}
		spotTracks, err := spotClient.ResolveTracks(ctx, query)
		if err != nil {
			_, _ = hctx.SendMessage(ctx, cmd.StreamID, fmt.Sprintf("Failed to load Spotify: %v", err), nil, nil)
			return nil
		}
		for _, st := range spotTracks {
			tracks = append(tracks, Track{
				Title:     st.Artists + " - " + st.Name,
				Query:     st.SearchQuery(),
				Duration:  "Unknown",
				Requester: cmd.UserID,
			})
		}
	} else if IsPlaylistURL(query) {
		infos, err := t.source.ResolvePlaylist(ctx, query)
		if err != nil {
			_, _ = hctx.SendMessage(ctx, cmd.StreamID, fmt.Sprintf("Failed to load playlist: %v", err), nil, nil)
			return nil
		}
		for _, info := range infos {
			q := info.URL
			if q == "" {
				q = info.Title
			}
			tracks = append(tracks, Track{
				Title:    info.Title,
				URL:      info.URL,
				AudioURL: info.AudioURL,
				Duration: info.Duration,
				Query:    q,
				Requester: cmd.UserID,
			})
		}
	} else {
		info, err := t.source.Resolve(ctx, query)
		if err != nil {
			_, _ = hctx.SendMessage(ctx, cmd.StreamID, fmt.Sprintf("Failed to find audio: %v", err), nil, nil)
			return nil
		}
		tracks = append(tracks, Track{
			Title:     info.Title,
			URL:       info.URL,
			AudioURL:  info.AudioURL,
			Duration:  info.Duration,
			Query:     query,
			Requester: cmd.UserID,
		})
	}

	if len(tracks) == 0 {
		_, _ = hctx.SendMessage(ctx, cmd.StreamID, "No tracks found.", nil, nil)
		return nil
	}

	player := t.getOrCreatePlayer(hubID, 80)
	player.mu.Lock()

	if len(tracks) == 1 {
		track := tracks[0]
		if player.current == nil {
			player.current = &track
			player.playing = true
			player.paused = false
			player.streamID = cmd.StreamID
			player.mu.Unlock()

			embed := models.Embed{
				Title:       "🎵 Now Playing",
				Description: fmt.Sprintf("**%s**\n⏱ %s\nRequested by <@%s>", track.Title, track.Duration, track.Requester),
				Color:       0x9B59B6,
			}
			_, _ = hctx.SendMessage(ctx, cmd.StreamID, "", []models.Embed{embed}, nowPlayingComponents())
			go t.playTrack(hubID, cmd.StreamID, hctx)
		} else {
			player.queue = append(player.queue, track)
			position := len(player.queue)
			player.mu.Unlock()

			embed := models.Embed{
				Title:       "Added to Queue",
				Description: fmt.Sprintf("**%s**\n⏱ %s\nPosition: #%d\nRequested by <@%s>", track.Title, track.Duration, position, track.Requester),
				Color:       0x3498DB,
			}
			_, _ = hctx.SendEmbed(ctx, cmd.StreamID, embed)
		}
	} else {
		startPlayback := player.current == nil
		first := tracks[0]
		rest := tracks[1:]

		if startPlayback {
			player.current = &first
			player.playing = true
			player.paused = false
			player.streamID = cmd.StreamID
		} else {
			rest = tracks
		}

		player.queue = append(player.queue, rest...)
		totalQueued := len(rest)
		player.mu.Unlock()

		embed := models.Embed{
			Title: "📋 Playlist Loaded",
			Description: fmt.Sprintf("**%d tracks** added to the queue\nRequested by <@%s>",
				len(tracks), cmd.UserID),
			Color: 0x3498DB,
		}
		_, _ = hctx.SendEmbed(ctx, cmd.StreamID, embed)

		if startPlayback {
			npEmbed := models.Embed{
				Title:       "🎵 Now Playing",
				Description: fmt.Sprintf("**%s**\n⏱ %s\n%d more in queue", first.Title, first.Duration, totalQueued),
				Color:       0x9B59B6,
			}
			_, _ = hctx.SendMessage(ctx, cmd.StreamID, "", []models.Embed{npEmbed}, nowPlayingComponents())
			go t.playTrack(hubID, cmd.StreamID, hctx)
		}
	}

	return nil
}

func nowPlayingComponents() []models.Component {
	return []models.Component{
		{
			Type: models.ComponentTypeActionRow,
			Components: []models.Component{
				{Type: models.ComponentTypeButton, Style: models.ButtonStyleSecondary, Label: "⏸ Pause", CustomID: "music:pause"},
				{Type: models.ComponentTypeButton, Style: models.ButtonStylePrimary, Label: "⏭ Skip", CustomID: "music:skip"},
				{Type: models.ComponentTypeButton, Style: models.ButtonStyleDanger, Label: "⏹ Stop", CustomID: "music:stop"},
				{Type: models.ComponentTypeButton, Style: models.ButtonStyleSecondary, Label: "📋 Queue", CustomID: "music:queue"},
			},
		},
	}
}

// playTrack joins LiveKit and streams audio. Automatically advances through the queue.
func (t *Template) playTrack(hubID, streamID string, hctx HubContext) {
	roomName := "stream:" + streamID

	room, err := lksdk.ConnectToRoom(t.lkURL, lksdk.ConnectInfo{
		APIKey:              t.lkKey,
		APISecret:           t.lkSecret,
		RoomName:            roomName,
		ParticipantIdentity: "rift-music-bot",
		ParticipantName:     "Rift Music Bot",
	}, &lksdk.RoomCallback{}, lksdk.WithAutoSubscribe(false))
	if err != nil {
		log.Printf("music: failed to join LiveKit room %s: %v", roomName, err)
		bgCtx := context.Background()
		_, _ = hctx.SendMessage(bgCtx, streamID, "⚠️ Failed to join voice channel.", nil, nil)
		return
	}
	defer room.Disconnect()

	for {
		t.mu.RLock()
		player, ok := t.players[hubID]
		t.mu.RUnlock()
		if !ok {
			return
		}

		player.mu.Lock()
		track := player.current
		if track == nil || !player.playing {
			player.mu.Unlock()
			return
		}
		player.room = room
		playCtx, cancel := context.WithCancel(context.Background())
		player.cancel = cancel
		player.mu.Unlock()

		audioURL := track.AudioURL
		if audioURL == "" {
			bgCtx := context.Background()
			url, err := t.source.StreamURL(bgCtx, track.Query)
			if err != nil {
				log.Printf("music: failed to get stream URL: %v", err)
				_, _ = hctx.SendMessage(bgCtx, streamID, "⚠️ Failed to get audio stream.", nil, nil)
				cancel()
				t.advanceQueue(hubID)
				continue
			}
			audioURL = url
		}

		t.streamAudioOgg(playCtx, room, audioURL)
		cancel()

		player.mu.Lock()
		player.cancel = nil
		wasLooping := player.looping
		wasStopped := !player.playing

		if wasStopped {
			player.mu.Unlock()
			return
		}

		if wasLooping && player.current != nil {
			// Re-resolve the stream URL for the looped track since URLs expire
			player.current.AudioURL = ""
			player.mu.Unlock()
			continue
		}

		if !t.advanceQueueLocked(player) {
			player.current = nil
			player.playing = false
			player.mu.Unlock()

			bgCtx := context.Background()
			embed := models.Embed{
				Description: "Queue finished. Leaving voice channel.",
				Color:       0x95A5A6,
			}
			_, _ = hctx.SendEmbed(bgCtx, streamID, embed)
			return
		}

		nextTrack := player.current
		player.mu.Unlock()

		bgCtx := context.Background()
		embed := models.Embed{
			Title:       "🎵 Now Playing",
			Description: fmt.Sprintf("**%s**\n⏱ %s\nRequested by <@%s>", nextTrack.Title, nextTrack.Duration, nextTrack.Requester),
			Color:       0x9B59B6,
		}
		_, _ = hctx.SendMessage(bgCtx, streamID, "", []models.Embed{embed}, nowPlayingComponents())
	}
}

// streamAudioOgg uses ffmpeg to transcode audio to OGG/Opus and publishes via
// LiveKit's NewLocalReaderTrack (no CGo required).
func (t *Template) streamAudioOgg(ctx context.Context, room *lksdk.Room, audioURL string) {
	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-reconnect", "1",
		"-reconnect_streamed", "1",
		"-reconnect_delay_max", "5",
		"-i", audioURL,
		"-c:a", "libopus",
		"-ar", "48000",
		"-ac", "2",
		"-b:a", "96k",
		"-page_duration", "20000",
		"-vn",
		"-f", "ogg",
		"-loglevel", "error",
		"pipe:1",
	)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Printf("music: ffmpeg stdout pipe: %v", err)
		return
	}

	if err := cmd.Start(); err != nil {
		log.Printf("music: ffmpeg start: %v", err)
		return
	}

	track, err := lksdk.NewLocalReaderTrack(
		io.NopCloser(stdout),
		webrtc.MimeTypeOpus,
		lksdk.ReaderTrackWithOnWriteComplete(func() {
			log.Printf("music: track write complete")
		}),
	)
	if err != nil {
		log.Printf("music: failed to create reader track: %v", err)
		_ = cmd.Process.Kill()
		return
	}

	pub, err := room.LocalParticipant.PublishTrack(track, &lksdk.TrackPublicationOptions{
		Name: "music",
	})
	if err != nil {
		log.Printf("music: failed to publish track: %v", err)
		_ = cmd.Process.Kill()
		return
	}

	// Wait for ffmpeg to finish or context cancellation
	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	select {
	case <-ctx.Done():
		_ = cmd.Process.Kill()
		<-done
	case err := <-done:
		if err != nil && ctx.Err() == nil {
			log.Printf("music: ffmpeg exited: %v", err)
		}
	}

	_ = room.LocalParticipant.UnpublishTrack(pub.SID())
}

func (t *Template) advanceQueue(hubID string) {
	t.mu.RLock()
	player, ok := t.players[hubID]
	t.mu.RUnlock()
	if !ok {
		return
	}
	player.mu.Lock()
	t.advanceQueueLocked(player)
	player.mu.Unlock()
}

func (t *Template) advanceQueueLocked(player *Player) bool {
	if len(player.queue) == 0 {
		player.current = nil
		player.playing = false
		return false
	}

	if player.shuffle && len(player.queue) > 1 {
		i := rand.Intn(len(player.queue))
		player.queue[0], player.queue[i] = player.queue[i], player.queue[0]
	}

	next := player.queue[0]
	player.queue = player.queue[1:]
	player.current = &next
	player.playing = true
	player.paused = false
	return true
}

func (t *Template) handlePause(ctx context.Context, hctx HubContext, hubID string, cmd SlashCommandData) error {
	t.mu.RLock()
	player, ok := t.players[hubID]
	t.mu.RUnlock()
	if !ok || player.current == nil {
		_, _ = hctx.SendMessage(ctx, cmd.StreamID, "Nothing is playing right now.", nil, nil)
		return nil
	}

	player.mu.Lock()
	player.paused = !player.paused
	state := "Paused ⏸"
	if !player.paused {
		state = "Resumed ▶"
	}
	title := player.current.Title
	player.mu.Unlock()

	embed := models.Embed{
		Description: fmt.Sprintf("**%s** — %s", title, state),
		Color:       0xF39C12,
	}
	_, _ = hctx.SendEmbed(ctx, cmd.StreamID, embed)
	return nil
}

func (t *Template) handleSkip(ctx context.Context, hctx HubContext, hubID string, cmd SlashCommandData) error {
	t.mu.RLock()
	player, ok := t.players[hubID]
	t.mu.RUnlock()
	if !ok || player.current == nil {
		_, _ = hctx.SendMessage(ctx, cmd.StreamID, "Nothing to skip.", nil, nil)
		return nil
	}

	player.mu.Lock()
	skipped := player.current.Title
	if player.cancel != nil {
		player.cancel()
	}
	player.mu.Unlock()

	embed := models.Embed{
		Title:       "⏭ Skipped",
		Description: fmt.Sprintf("Skipped **%s**", skipped),
		Color:       0x2ECC71,
	}
	_, _ = hctx.SendEmbed(ctx, cmd.StreamID, embed)
	return nil
}

func (t *Template) handleStop(ctx context.Context, hctx HubContext, hubID string, cmd SlashCommandData) error {
	t.mu.RLock()
	player, ok := t.players[hubID]
	t.mu.RUnlock()
	if !ok {
		_, _ = hctx.SendMessage(ctx, cmd.StreamID, "Nothing is playing right now.", nil, nil)
		return nil
	}

	player.mu.Lock()
	player.playing = false
	player.paused = false
	player.queue = nil
	player.current = nil
	if player.cancel != nil {
		player.cancel()
	}
	player.mu.Unlock()

	t.mu.Lock()
	delete(t.players, hubID)
	t.mu.Unlock()

	embed := models.Embed{
		Description: "⏹ Stopped playback and cleared the queue.",
		Color:       0xE74C3C,
	}
	_, _ = hctx.SendEmbed(ctx, cmd.StreamID, embed)
	return nil
}

func (t *Template) handleQueue(ctx context.Context, hctx HubContext, hubID string, cmd SlashCommandData) error {
	t.mu.RLock()
	player, ok := t.players[hubID]
	t.mu.RUnlock()
	if !ok || player.current == nil {
		_, _ = hctx.SendMessage(ctx, cmd.StreamID, "The queue is empty.", nil, nil)
		return nil
	}

	player.mu.Lock()
	desc := fmt.Sprintf("**Now Playing:** %s (%s)\n", player.current.Title, player.current.Duration)
	if len(player.queue) == 0 {
		desc += "\nNo tracks in queue."
	} else {
		for i, track := range player.queue {
			if i >= 10 {
				desc += fmt.Sprintf("\n...and %d more", len(player.queue)-10)
				break
			}
			desc += fmt.Sprintf("\n`%d.` %s (%s)", i+1, track.Title, track.Duration)
		}
	}
	player.mu.Unlock()

	embed := models.Embed{
		Title:       "📋 Queue",
		Description: desc,
		Color:       0x3498DB,
	}
	_, _ = hctx.SendEmbed(ctx, cmd.StreamID, embed)
	return nil
}

func (t *Template) handleVolume(ctx context.Context, hctx HubContext, hubID string, cmd SlashCommandData) error {
	player := t.getOrCreatePlayer(hubID, 80)

	volStr := cmd.Options["level"]
	if volStr == "" {
		embed := models.Embed{
			Description: fmt.Sprintf("🔊 Current volume: **%d%%**", player.volume),
			Color:       0x9B59B6,
		}
		_, _ = hctx.SendEmbed(ctx, cmd.StreamID, embed)
		return nil
	}

	vol := 0
	if _, err := fmt.Sscanf(volStr, "%d", &vol); err != nil || vol < 0 || vol > 100 {
		_, _ = hctx.SendMessage(ctx, cmd.StreamID, "Volume must be between 0 and 100.", nil, nil)
		return nil
	}

	player.mu.Lock()
	player.volume = vol
	player.mu.Unlock()

	embed := models.Embed{
		Description: fmt.Sprintf("🔊 Volume set to **%d%%**", vol),
		Color:       0x9B59B6,
	}
	_, _ = hctx.SendEmbed(ctx, cmd.StreamID, embed)
	return nil
}

func (t *Template) handleNowPlaying(ctx context.Context, hctx HubContext, hubID string, cmd SlashCommandData) error {
	t.mu.RLock()
	player, ok := t.players[hubID]
	t.mu.RUnlock()
	if !ok || player.current == nil {
		_, _ = hctx.SendMessage(ctx, cmd.StreamID, "Nothing is playing right now.", nil, nil)
		return nil
	}

	player.mu.Lock()
	track := *player.current
	vol := player.volume
	player.mu.Unlock()

	embed := models.Embed{
		Title:       "🎵 Now Playing",
		Description: fmt.Sprintf("**%s**\n⏱ %s\nRequested by <@%s>\n🔊 Volume: %d%%", track.Title, track.Duration, track.Requester, vol),
		Color:       0x9B59B6,
		Footer:      &models.EmbedFooter{Text: time.Now().Format("3:04 PM")},
	}
	_, _ = hctx.SendEmbed(ctx, cmd.StreamID, embed)
	return nil
}

func (t *Template) handleLoop(ctx context.Context, hctx HubContext, hubID string, cmd SlashCommandData) error {
	player := t.getOrCreatePlayer(hubID, 80)
	player.mu.Lock()
	player.looping = !player.looping
	state := "disabled"
	if player.looping {
		state = "enabled"
	}
	player.mu.Unlock()

	embed := models.Embed{
		Description: fmt.Sprintf("🔁 Loop %s", state),
		Color:       0x9B59B6,
	}
	_, _ = hctx.SendEmbed(ctx, cmd.StreamID, embed)
	return nil
}

func (t *Template) handleShuffle(ctx context.Context, hctx HubContext, hubID string, cmd SlashCommandData) error {
	player := t.getOrCreatePlayer(hubID, 80)
	player.mu.Lock()
	player.shuffle = !player.shuffle
	state := "disabled"
	if player.shuffle {
		state = "enabled"
	}
	player.mu.Unlock()

	embed := models.Embed{
		Description: fmt.Sprintf("🔀 Shuffle %s", state),
		Color:       0x9B59B6,
	}
	_, _ = hctx.SendEmbed(ctx, cmd.StreamID, embed)
	return nil
}
