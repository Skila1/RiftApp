package api

import "context"

type discordContextKey string

const (
	ctxBotUserID discordContextKey = "discord_bot_user_id"
	ctxAppID     discordContextKey = "discord_app_id"
)

func setBotUserID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, ctxBotUserID, id)
}

func getBotUserID(ctx context.Context) string {
	if v, ok := ctx.Value(ctxBotUserID).(string); ok {
		return v
	}
	return ""
}

func setAppID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, ctxAppID, id)
}

func getAppID(ctx context.Context) string {
	if v, ok := ctx.Value(ctxAppID).(string); ok {
		return v
	}
	return ""
}
