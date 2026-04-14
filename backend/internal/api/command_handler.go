package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/repository"
)

type CommandHandler struct {
	cmdRepo *repository.AppCommandRepo
}

func NewCommandHandler(cmdRepo *repository.AppCommandRepo) *CommandHandler {
	return &CommandHandler{cmdRepo: cmdRepo}
}

func (h *CommandHandler) ListHubCommands(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	hubID := chi.URLParam(r, "hubID")
	if hubID == "" {
		writeError(w, http.StatusBadRequest, "hub id required")
		return
	}

	commands, err := h.cmdRepo.ListByHub(r.Context(), hubID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list commands")
		return
	}

	writeJSON(w, http.StatusOK, commands)
}
