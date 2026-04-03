package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/livekit/protocol/auth"

	"github.com/riptide-cloud/riptide/internal/config"
	"github.com/riptide-cloud/riptide/internal/middleware"
)

type VoiceHandler struct {
	cfg *config.Config
	db  *pgxpool.Pool
}

func NewVoiceHandler(cfg *config.Config, db *pgxpool.Pool) *VoiceHandler {
	return &VoiceHandler{cfg: cfg, db: db}
}

// Token generates a LiveKit access token for the authenticated user
// to join a voice room scoped to the given stream.
//
// GET /api/voice/token?streamID=...
func (h *VoiceHandler) Token(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	streamID := r.URL.Query().Get("streamID")
	if streamID == "" {
		streamID = chi.URLParam(r, "streamID")
	}
	if streamID == "" {
		writeError(w, http.StatusBadRequest, "streamID is required")
		return
	}

	// Verify the stream exists and user is a member of its hub
	var hubID string
	err := h.db.QueryRow(r.Context(),
		`SELECT s.hub_id FROM streams s
		 JOIN hub_members hm ON s.hub_id = hm.hub_id
		 WHERE s.id = $1 AND hm.user_id = $2`, streamID, userID,
	).Scan(&hubID)
	if err != nil {
		writeError(w, http.StatusForbidden, "stream not found or access denied")
		return
	}

	// Room name scoped to stream
	roomName := "stream:" + streamID

	at := auth.NewAccessToken(h.cfg.LiveKitKey, h.cfg.LiveKitSecret)
	grant := &auth.VideoGrant{
		RoomJoin: true,
		Room:     roomName,
	}
	at.SetVideoGrant(grant).
		SetIdentity(userID).
		SetValidFor(1 * time.Hour)

	token, err := at.ToJWT()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate voice token")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"token":    token,
		"url":      h.cfg.LiveKitHost,
		"room":     roomName,
	})
}
