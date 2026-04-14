package botengine

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/moderation"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/service"
)

type EngineDeps struct {
	HubBotRepo *repository.HubBotRepo
	HubRepo    *repository.HubRepo
	RankRepo   *repository.RankRepo
	PollRepo   *repository.PollRepo
	XPRepo     *repository.XPRepo
	ModRepo    *repository.HubModerationRepo
	MsgSvc     *service.MessageService
	HubSvc     *service.HubService
	ModSvc     *moderation.Service
}

type Engine struct {
	deps      EngineDeps
	templates map[string]BotTemplate

	mu         sync.RWMutex
	hubConfigs map[string][]repository.HubBot // keyed by hubID
}

func NewEngine(deps EngineDeps) *Engine {
	return &Engine{
		deps:       deps,
		templates:  make(map[string]BotTemplate),
		hubConfigs: make(map[string][]repository.HubBot),
	}
}

func (e *Engine) RegisterTemplate(t BotTemplate) {
	e.templates[t.Name()] = t
}

func (e *Engine) Start(ctx context.Context) {
	e.reloadConfigs(ctx)

	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				e.reloadConfigs(ctx)
			}
		}
	}()

	go func() {
		reminderTicker := time.NewTicker(15 * time.Second)
		defer reminderTicker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-reminderTicker.C:
				e.checkReminders(ctx)
			}
		}
	}()
}

func (e *Engine) reloadConfigs(ctx context.Context) {
	if e.deps.HubBotRepo == nil {
		return
	}
	bots, err := e.deps.HubBotRepo.ListAllEnabled(ctx)
	if err != nil {
		log.Printf("botengine: failed to reload configs: %v", err)
		return
	}

	grouped := make(map[string][]repository.HubBot)
	for _, bot := range bots {
		grouped[bot.HubID] = append(grouped[bot.HubID], bot)
	}

	e.mu.Lock()
	e.hubConfigs = grouped
	e.mu.Unlock()
}

func (e *Engine) InvalidateHub(hubID string) {
	if e.deps.HubBotRepo == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	bots, err := e.deps.HubBotRepo.ListEnabledByHub(ctx, hubID)
	if err != nil {
		return
	}
	e.mu.Lock()
	if len(bots) == 0 {
		delete(e.hubConfigs, hubID)
	} else {
		e.hubConfigs[hubID] = bots
	}
	e.mu.Unlock()
}

func (e *Engine) HandleEvent(ctx context.Context, event Event) {
	e.mu.RLock()
	bots, ok := e.hubConfigs[event.HubID]
	e.mu.RUnlock()
	if !ok || len(bots) == 0 {
		return
	}

	for _, bot := range bots {
		tmpl, ok := e.templates[bot.TemplateType]
		if !ok {
			continue
		}

		hctx := &HubContext{
			HubID:     event.HubID,
			BotUserID: bot.BotUserID,
			Config:    bot.Config,
			msgSvc:    e.deps.MsgSvc,
			hubSvc:    e.deps.HubSvc,
			rankRepo:  e.deps.RankRepo,
			pollRepo:  e.deps.PollRepo,
			xpRepo:    e.deps.XPRepo,
			hubRepo:   e.deps.HubRepo,
			modRepo:   e.deps.ModRepo,
		}

		if err := tmpl.OnEvent(ctx, hctx, event); err != nil {
			log.Printf("botengine: template %s error in hub %s: %v", bot.TemplateType, event.HubID, err)
		}
	}
}

func (e *Engine) HandleComponentInteraction(ctx context.Context, hubID, streamID, userID, messageID, customID string, values []string) error {
	data := ComponentClickData{
		MessageID: messageID,
		CustomID:  customID,
		Values:    values,
		UserID:    userID,
		StreamID:  streamID,
	}
	raw, _ := json.Marshal(data)
	e.HandleEvent(ctx, Event{
		Type:     EventComponentClick,
		HubID:    hubID,
		StreamID: streamID,
		UserID:   userID,
		Data:     raw,
	})
	return nil
}

func (e *Engine) GetModService() *moderation.Service {
	return e.deps.ModSvc
}

func (e *Engine) GetBuiltinCommandsForHub(hubID string) []models.ApplicationCommand {
	e.mu.RLock()
	bots, ok := e.hubConfigs[hubID]
	e.mu.RUnlock()
	if !ok {
		return nil
	}

	var commands []models.ApplicationCommand
	for _, bot := range bots {
		templateCmds, ok := TemplateCommands[bot.TemplateType]
		if !ok || len(templateCmds) == 0 {
			continue
		}
		for _, cmd := range templateCmds {
			commands = append(commands, models.ApplicationCommand{
				ID:            fmt.Sprintf("builtin-%s-%s", bot.TemplateType, cmd.Name),
				ApplicationID: bot.ID,
				HubID:         &bot.HubID,
				Name:          cmd.Name,
				Description:   cmd.Description,
				Options:       cmd.Options,
				Type:          1,
				Bot: &models.User{
					ID:          bot.BotUserID,
					Username:    "rift-" + bot.TemplateType,
					DisplayName: templateDisplayName(bot.TemplateType),
					IsBot:       true,
				},
			})
		}
	}
	return commands
}

func templateDisplayName(t string) string {
	switch t {
	case "moderation":
		return "Rift Mod Bot"
	case "welcome":
		return "Rift Welcome Bot"
	case "music":
		return "Rift Music Bot"
	case "utility":
		return "Rift Utility Bot"
	case "leveling":
		return "Rift Leveling Bot"
	default:
		return "Rift Bot"
	}
}

func (e *Engine) checkReminders(ctx context.Context) {
	if e.deps.PollRepo == nil || e.deps.MsgSvc == nil {
		return
	}
	reminders, err := e.deps.PollRepo.ListPendingReminders(ctx, time.Now())
	if err != nil || len(reminders) == 0 {
		return
	}
	for _, rem := range reminders {
		streamID := ""
		if rem.StreamID != nil {
			streamID = *rem.StreamID
		}
		if streamID != "" {
			embed := models.Embed{
				Title:       "⏰ Reminder",
				Description: fmt.Sprintf("<@%s> %s", rem.UserID, rem.Message),
				Color:       0x43B581,
			}
			_, _ = e.deps.MsgSvc.CreateBotMessage(ctx, streamID, "", []models.Embed{embed}, nil)
		}
		_ = e.deps.PollRepo.MarkReminderFired(ctx, rem.ID)
	}
}

func (e *Engine) HandleSlashCommand(ctx context.Context, hubID, streamID, userID, commandName string, options map[string]string) {
	data := SlashCommandData{
		CommandName: commandName,
		Options:     options,
		StreamID:    streamID,
		UserID:      userID,
	}
	raw, _ := json.Marshal(data)
	e.HandleEvent(ctx, Event{
		Type:     EventSlashCommand,
		HubID:    hubID,
		StreamID: streamID,
		UserID:   userID,
		Data:     raw,
	})
}
