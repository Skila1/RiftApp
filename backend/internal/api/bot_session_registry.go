package api

import "sync"

type BotGatewaySendFunc func(op int, d interface{}, eventName string)

type botSession struct {
	appID     string
	botUserID string
	send      BotGatewaySendFunc
}

type BotSessionRegistry struct {
	mu       sync.RWMutex
	sessions map[string]*botSession // keyed by botUserID
}

func NewBotSessionRegistry() *BotSessionRegistry {
	return &BotSessionRegistry{
		sessions: make(map[string]*botSession),
	}
}

func (r *BotSessionRegistry) Register(appID, botUserID string, send BotGatewaySendFunc) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sessions[botUserID] = &botSession{
		appID:     appID,
		botUserID: botUserID,
		send:      send,
	}
}

func (r *BotSessionRegistry) Unregister(botUserID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.sessions, botUserID)
}

func (r *BotSessionRegistry) SendToApp(appID string, op int, d interface{}, eventName string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, sess := range r.sessions {
		if sess.appID == appID {
			sess.send(op, d, eventName)
			return true
		}
	}
	return false
}
