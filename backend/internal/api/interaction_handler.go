package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/service"
)

type InteractionHandler struct {
	cmdRepo *repository.AppCommandRepo
	devSvc  *service.DeveloperService
	msgSvc  *service.MessageService
	botReg  *BotSessionRegistry
}

func NewInteractionHandler(
	cmdRepo *repository.AppCommandRepo,
	devSvc *service.DeveloperService,
	msgSvc *service.MessageService,
	botReg *BotSessionRegistry,
) *InteractionHandler {
	return &InteractionHandler{
		cmdRepo: cmdRepo,
		devSvc:  devSvc,
		msgSvc:  msgSvc,
		botReg:  botReg,
	}
}

type InteractionRequest struct {
	CommandID string            `json:"command_id"`
	HubID     string            `json:"hub_id"`
	StreamID  string            `json:"stream_id"`
	Options   map[string]string `json:"options"`
}

type InteractionResponse struct {
	Type int                    `json:"type"`
	Data *InteractionCallbackData `json:"data,omitempty"`
}

type InteractionCallbackData struct {
	Content string `json:"content"`
}

func (h *InteractionHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req InteractionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.CommandID == "" || req.HubID == "" || req.StreamID == "" {
		writeError(w, http.StatusBadRequest, "command_id, hub_id, and stream_id are required")
		return
	}

	cmd, err := h.cmdRepo.GetByID(r.Context(), req.CommandID)
	if err != nil {
		writeError(w, http.StatusNotFound, "command not found")
		return
	}

	app, err := h.devSvc.GetApplication(r.Context(), cmd.ApplicationID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to lookup application")
		return
	}

	interactionID := uuid.New().String()
	options := make([]map[string]interface{}, 0, len(req.Options))
	for name, value := range req.Options {
		optType := 3 // string default
		for _, opt := range cmd.Options {
			if opt.Name == name {
				optType = opt.Type
				break
			}
		}
		options = append(options, map[string]interface{}{
			"name":  name,
			"type":  optType,
			"value": value,
		})
	}

	interactionPayload := map[string]interface{}{
		"id":             interactionID,
		"application_id": cmd.ApplicationID,
		"type":           2, // APPLICATION_COMMAND
		"data": map[string]interface{}{
			"id":      cmd.ID,
			"name":    cmd.Name,
			"type":    cmd.Type,
			"options": options,
		},
		"guild_id":   req.HubID,
		"channel_id": req.StreamID,
		"member": map[string]interface{}{
			"user": map[string]interface{}{
				"id": userID,
			},
		},
		"token":   interactionID,
		"version": 1,
	}

	if app.InteractionsEndpointURL != nil && *app.InteractionsEndpointURL != "" {
		resp, err := h.httpDispatch(r.Context(), *app.InteractionsEndpointURL, interactionPayload)
		if err != nil {
			log.Printf("interaction: HTTP dispatch to %s failed: %v", *app.InteractionsEndpointURL, err)
			writeError(w, http.StatusBadGateway, "bot did not respond")
			return
		}
		if resp != nil && resp.Data != nil && resp.Data.Content != "" {
			h.postBotResponse(r.Context(), app, req.StreamID, resp.Data.Content)
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"id":   interactionID,
			"type": 2,
			"data": resp,
		})
		return
	}

	if h.botReg != nil {
		sent := h.botReg.SendToApp(cmd.ApplicationID, GatewayOpDispatch, interactionPayload, "INTERACTION_CREATE")
		if sent {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"id":   interactionID,
				"type": 2,
			})
			return
		}
	}

	writeError(w, http.StatusServiceUnavailable, "bot is not connected")
}

func (h *InteractionHandler) httpDispatch(ctx context.Context, url string, payload interface{}) (*InteractionResponse, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("endpoint returned %d: %s", resp.StatusCode, string(respBody))
	}

	var ir InteractionResponse
	if err := json.NewDecoder(resp.Body).Decode(&ir); err != nil {
		return nil, err
	}
	return &ir, nil
}

func (h *InteractionHandler) postBotResponse(ctx context.Context, app *models.Application, streamID, content string) {
	if app.BotUserID == nil || h.msgSvc == nil {
		return
	}
	_, err := h.msgSvc.Create(ctx, *app.BotUserID, streamID, service.CreateMessageInput{
		Content: content,
	})
	if err != nil {
		log.Printf("interaction: failed to post bot response: %v", err)
	}
}
