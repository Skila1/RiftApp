package api

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/service"
)

type MessageHandler struct {
	svc *service.MessageService
}

func NewMessageHandler(svc *service.MessageService) *MessageHandler {
	return &MessageHandler{svc: svc}
}

func (h *MessageHandler) List(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	userID := middleware.GetUserID(r.Context())
	limit := parseLimit(r)
	var before *string
	if b := r.URL.Query().Get("before"); b != "" {
		before = &b
	}
	messages, err := h.svc.List(r.Context(), userID, streamID, before, limit)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, messages)
}

func (h *MessageHandler) Create(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	userID := middleware.GetUserID(r.Context())
	var input service.CreateMessageInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	msg, err := h.svc.Create(r.Context(), userID, streamID, input)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusCreated, msg)
}

func (h *MessageHandler) ListPinned(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	userID := middleware.GetUserID(r.Context())
	limit := parseLimit(r)
	messages, err := h.svc.ListPinned(r.Context(), streamID, userID, limit)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, messages)
}

func (h *MessageHandler) Update(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "messageID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Content string `json:"content"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	msg, err := h.svc.Update(r.Context(), msgID, userID, body.Content)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, msg)
}

func (h *MessageHandler) Delete(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "messageID")
	userID := middleware.GetUserID(r.Context())
	if err := h.svc.Delete(r.Context(), msgID, userID); err != nil {
		writeAppError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *MessageHandler) Pin(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "messageID")
	userID := middleware.GetUserID(r.Context())
	msg, err := h.svc.Pin(r.Context(), msgID, userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, msg)
}

func (h *MessageHandler) Unpin(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "messageID")
	userID := middleware.GetUserID(r.Context())
	msg, err := h.svc.Unpin(r.Context(), msgID, userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, msg)
}

func (h *MessageHandler) Search(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	query := r.URL.Query()
	input := service.SearchMessagesInput{
		Query:      query.Get("q"),
		AuthorType: query.Get("author_type"),
		Mention:    query.Get("mentions"),
		Has:        query.Get("has"),
		Filename:   query.Get("filename"),
		Extension:  query.Get("ext"),
		Limit:      parseLimit(r),
	}
	if streamID := query.Get("stream_id"); streamID != "" {
		input.StreamID = &streamID
	}
	if authorID := query.Get("author_id"); authorID != "" {
		input.AuthorID = &authorID
	}

	if after := query.Get("after"); after != "" {
		parsed, err := parseSearchTime(after)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid after filter")
			return
		}
		input.After = parsed
	}
	if before := query.Get("before"); before != "" {
		parsed, err := parseSearchTime(before)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid before filter")
			return
		}
		input.Before = parsed
	}
	if on := query.Get("on"); on != "" {
		start, end, err := parseSearchDayRange(on)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid on filter")
			return
		}
		input.StartAt = &start
		input.EndAt = &end
	} else if during := query.Get("during"); during != "" {
		start, end, err := parseSearchDayRange(during)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid during filter")
			return
		}
		input.StartAt = &start
		input.EndAt = &end
	}

	if raw := query.Get("pinned"); raw != "" {
		value, err := strconv.ParseBool(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid pinned filter")
			return
		}
		input.PinnedOnly = value
	}
	if raw := query.Get("link"); raw != "" {
		value, err := strconv.ParseBool(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid link filter")
			return
		}
		input.LinkOnly = value
	}

	messages, err := h.svc.Search(r.Context(), hubID, userID, input)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, messages)
}

func (h *MessageHandler) AddReaction(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "messageID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Emoji   string  `json:"emoji"`
		EmojiID *string `json:"emoji_id,omitempty"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if _, err := h.svc.ToggleReaction(r.Context(), msgID, userID, body.Emoji, body.EmojiID); err != nil {
		writeAppError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *MessageHandler) RemoveReaction(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "messageID")
	emoji := chi.URLParam(r, "emoji")
	userID := middleware.GetUserID(r.Context())
	// Check for emoji_id query param for custom emoji removal
	var emojiID *string
	if eid := r.URL.Query().Get("emoji_id"); eid != "" {
		emojiID = &eid
	}
	if err := h.svc.RemoveReaction(r.Context(), msgID, userID, emoji, emojiID); err != nil {
		writeAppError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func parseSearchTime(raw string) (*time.Time, error) {
	for _, layout := range []string{time.RFC3339, time.RFC3339Nano, "2006-01-02"} {
		if parsed, err := time.Parse(layout, raw); err == nil {
			return &parsed, nil
		}
	}
	return nil, fmt.Errorf("invalid time format")
}

func parseSearchDayRange(raw string) (time.Time, time.Time, error) {
	parsed, err := parseSearchTime(raw)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	start := time.Date(parsed.Year(), parsed.Month(), parsed.Day(), 0, 0, 0, 0, parsed.Location())
	end := start.Add(24 * time.Hour)
	return start, end, nil
}
