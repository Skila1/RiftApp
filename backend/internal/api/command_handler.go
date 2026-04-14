package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/riftapp-cloud/riftapp/internal/botengine"
	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/repository"
)

type CommandHandler struct {
	cmdRepo   *repository.AppCommandRepo
	botEngine *botengine.Engine
}

func NewCommandHandler(cmdRepo *repository.AppCommandRepo, engine *botengine.Engine) *CommandHandler {
	return &CommandHandler{cmdRepo: cmdRepo, botEngine: engine}
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

	var commands []models.ApplicationCommand

	if h.cmdRepo != nil {
		externalCmds, err := h.cmdRepo.ListByHub(r.Context(), hubID)
		if err == nil {
			commands = append(commands, externalCmds...)
		}
	}

	if h.botEngine != nil {
		builtinCmds := h.botEngine.GetBuiltinCommandsForHub(hubID)
		commands = append(commands, builtinCmds...)
	}

	if commands == nil {
		commands = []models.ApplicationCommand{}
	}

	writeData(w, http.StatusOK, commands)
}
