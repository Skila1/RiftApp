package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/repository"
)

var superAdminEmails = map[string]bool{
	"skila@riftapp.io":  true,
	"lovely@riftapp.io": true,
}

type DeveloperService struct {
	repo *repository.DeveloperRepo
}

func NewDeveloperService(repo *repository.DeveloperRepo) *DeveloperService {
	return &DeveloperService{repo: repo}
}

func IsSuperAdmin(email string) bool { return superAdminEmails[email] }

func (s *DeveloperService) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	return s.repo.GetUserByEmail(ctx, email)
}

func (s *DeveloperService) CreateApplication(ctx context.Context, ownerID, name string) (*models.Application, string, error) {
	appID := uuid.New().String()
	botUserID := uuid.New().String()
	now := time.Now()

	botUser := &models.User{
		ID:           botUserID,
		Username:     name + " Bot",
		DisplayName:  name + " Bot",
		PasswordHash: "-",
		IsBot:        true,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := s.repo.CreateBotUser(ctx, botUser); err != nil {
		return nil, "", fmt.Errorf("create bot user: %w", err)
	}

	app := &models.Application{
		ID:        appID,
		OwnerID:   ownerID,
		Name:      name,
		BotUserID: &botUserID,
		BotPublic: true,
		Tags:      []string{},
		CreatedAt: now,
		UpdatedAt: now,
	}
	verifyKey, _ := generateRandomHex(32)
	app.VerifyKey = verifyKey
	if err := s.repo.CreateApplication(ctx, app); err != nil {
		return nil, "", fmt.Errorf("create application: %w", err)
	}

	token, err := s.generateAndStoreBotToken(ctx, appID, botUserID)
	if err != nil {
		return nil, "", err
	}

	return app, token, nil
}

func (s *DeveloperService) ListApplications(ctx context.Context, ownerID string, isSuperAdmin bool) ([]*models.Application, error) {
	if isSuperAdmin {
		return s.repo.ListAllApplications(ctx)
	}
	return s.repo.ListApplicationsByOwner(ctx, ownerID)
}

func (s *DeveloperService) GetApplication(ctx context.Context, id string) (*models.Application, error) {
	return s.repo.GetApplication(ctx, id)
}

func (s *DeveloperService) UpdateApplication(ctx context.Context, app *models.Application) error {
	return s.repo.UpdateApplication(ctx, app)
}

func (s *DeveloperService) DeleteApplication(ctx context.Context, id string) error {
	return s.repo.DeleteApplication(ctx, id)
}

func (s *DeveloperService) CanAccessApplication(ctx context.Context, appOwnerID, requesterID string, isSuperAdmin bool) bool {
	return appOwnerID == requesterID || isSuperAdmin
}

func (s *DeveloperService) ResetBotToken(ctx context.Context, appID string) (string, error) {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		return "", err
	}
	if app.BotUserID == nil {
		return "", errors.New("application has no bot user")
	}
	if err := s.repo.DeleteBotTokensByApp(ctx, appID); err != nil {
		return "", err
	}
	return s.generateAndStoreBotToken(ctx, appID, *app.BotUserID)
}

func (s *DeveloperService) ValidateBotToken(ctx context.Context, rawToken string) (*models.BotToken, error) {
	hash := hashToken(rawToken)
	return s.repo.GetBotTokenByHash(ctx, hash)
}

func (s *DeveloperService) GetApplicationByBotUserID(ctx context.Context, botUserID string) (*models.Application, error) {
	return s.repo.GetApplicationByBotUserID(ctx, botUserID)
}

func (s *DeveloperService) GetBotUser(ctx context.Context, appID string) (*models.User, error) {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		return nil, err
	}
	if app.BotUserID == nil {
		return nil, errors.New("no bot user")
	}
	return s.repo.GetUserByID(ctx, *app.BotUserID)
}

func (s *DeveloperService) UpdateBotUser(ctx context.Context, id, username, displayName string, avatarURL *string) error {
	return s.repo.UpdateBotUser(ctx, id, username, displayName, avatarURL)
}

func (s *DeveloperService) UpdateBotUserAvatar(ctx context.Context, id string, avatarURL *string) error {
	return s.repo.UpdateBotUserAvatar(ctx, id, avatarURL)
}

func (s *DeveloperService) CountGuildsForBotUser(ctx context.Context, botUserID string) (int, error) {
	return s.repo.CountGuildsForBotUser(ctx, botUserID)
}

func (s *DeveloperService) GetUserByID(ctx context.Context, id string) (*models.User, error) {
	return s.repo.GetUserByID(ctx, id)
}

// ─── Sub-resource passthroughs ──────────────────────────────────────────────

func (s *DeveloperService) CreateOAuth2Redirect(ctx context.Context, rd *models.OAuth2Redirect) error {
	rd.ID = uuid.New().String()
	rd.CreatedAt = time.Now()
	return s.repo.CreateOAuth2Redirect(ctx, rd)
}
func (s *DeveloperService) ListOAuth2Redirects(ctx context.Context, appID string) ([]models.OAuth2Redirect, error) {
	return s.repo.ListOAuth2Redirects(ctx, appID)
}
func (s *DeveloperService) DeleteOAuth2Redirect(ctx context.Context, id string) error {
	return s.repo.DeleteOAuth2Redirect(ctx, id)
}

func (s *DeveloperService) CreateAppEmoji(ctx context.Context, e *models.AppEmoji) error {
	e.ID = uuid.New().String()
	e.CreatedAt = time.Now()
	return s.repo.CreateAppEmoji(ctx, e)
}
func (s *DeveloperService) ListAppEmojis(ctx context.Context, appID string) ([]models.AppEmoji, error) {
	return s.repo.ListAppEmojis(ctx, appID)
}
func (s *DeveloperService) DeleteAppEmoji(ctx context.Context, id string) error {
	return s.repo.DeleteAppEmoji(ctx, id)
}

func (s *DeveloperService) CreateAppWebhook(ctx context.Context, wh *models.AppWebhook) error {
	wh.ID = uuid.New().String()
	wh.CreatedAt = time.Now()
	wh.UpdatedAt = wh.CreatedAt
	return s.repo.CreateAppWebhook(ctx, wh)
}
func (s *DeveloperService) ListAppWebhooks(ctx context.Context, appID string) ([]models.AppWebhook, error) {
	return s.repo.ListAppWebhooks(ctx, appID)
}
func (s *DeveloperService) DeleteAppWebhook(ctx context.Context, id string) error {
	return s.repo.DeleteAppWebhook(ctx, id)
}

func (s *DeveloperService) AddAppTester(ctx context.Context, appID, userID string) error {
	return s.repo.AddAppTester(ctx, appID, userID)
}
func (s *DeveloperService) ListAppTesters(ctx context.Context, appID string) ([]models.AppTester, error) {
	return s.repo.ListAppTesters(ctx, appID)
}
func (s *DeveloperService) RemoveAppTester(ctx context.Context, appID, userID string) error {
	return s.repo.RemoveAppTester(ctx, appID, userID)
}

func (s *DeveloperService) CreateRichPresenceAsset(ctx context.Context, a *models.RichPresenceAsset) error {
	a.ID = uuid.New().String()
	a.CreatedAt = time.Now()
	return s.repo.CreateRichPresenceAsset(ctx, a)
}
func (s *DeveloperService) ListRichPresenceAssets(ctx context.Context, appID string) ([]models.RichPresenceAsset, error) {
	return s.repo.ListRichPresenceAssets(ctx, appID)
}
func (s *DeveloperService) DeleteRichPresenceAsset(ctx context.Context, id string) error {
	return s.repo.DeleteRichPresenceAsset(ctx, id)
}

func (s *DeveloperService) BulkUpdateApplicationFields(ctx context.Context, appID string, fields map[string]interface{}) error {
	return s.repo.BulkUpdateApplicationFields(ctx, appID, fields)
}

// ─── Import from Discord (full application profile) ─────────────────────────

type DiscordImportResult struct {
	Application *models.Application `json:"application"`
	BotToken    string              `json:"bot_token"`
}

func (s *DeveloperService) ImportDiscordApplication(ctx context.Context, ownerID string, discordApp *DiscordApplicationInfo) (*DiscordImportResult, error) {
	app, token, err := s.CreateApplication(ctx, ownerID, discordApp.Name)
	if err != nil {
		return nil, err
	}

	fields := make(map[string]interface{})
	if discordApp.Description != "" {
		fields["description"] = discordApp.Description
	}
	if discordApp.Icon != "" {
		fields["icon"] = discordApp.Icon
	}
	if len(discordApp.Tags) > 0 {
		fields["tags"] = discordApp.Tags
	}
	if discordApp.TermsOfServiceURL != "" {
		fields["terms_of_service_url"] = discordApp.TermsOfServiceURL
	}
	if discordApp.PrivacyPolicyURL != "" {
		fields["privacy_policy_url"] = discordApp.PrivacyPolicyURL
	}
	if discordApp.CustomInstallURL != "" {
		fields["custom_install_url"] = discordApp.CustomInstallURL
	}
	if discordApp.InteractionsEndpointURL != "" {
		fields["interactions_endpoint_url"] = discordApp.InteractionsEndpointURL
	}
	if discordApp.RoleConnectionsVerificationURL != "" {
		fields["role_connections_verification_url"] = discordApp.RoleConnectionsVerificationURL
	}

	flagBits := 0
	if discordApp.BotPublic {
		fields["bot_public"] = true
	}
	if discordApp.BotRequireCodeGrant {
		fields["bot_require_code_grant"] = true
	}
	fields["flags"] = flagBits

	if len(fields) > 0 {
		if err := s.repo.BulkUpdateApplicationFields(ctx, app.ID, fields); err != nil {
			return nil, fmt.Errorf("update imported fields: %w", err)
		}
	}

	if discordApp.BotUsername != "" && app.BotUserID != nil {
		_ = s.repo.UpdateBotUser(ctx, *app.BotUserID, discordApp.BotUsername, discordApp.BotUsername, nil)
	}

	updated, _ := s.repo.GetApplication(ctx, app.ID)
	if updated != nil {
		app = updated
	}

	return &DiscordImportResult{Application: app, BotToken: token}, nil
}

type DiscordApplicationInfo struct {
	ID                             string   `json:"id"`
	Name                           string   `json:"name"`
	Description                    string   `json:"description"`
	Icon                           string   `json:"icon"`
	BotPublic                      bool     `json:"bot_public"`
	BotRequireCodeGrant            bool     `json:"bot_require_code_grant"`
	Tags                           []string `json:"tags"`
	TermsOfServiceURL              string   `json:"terms_of_service_url"`
	PrivacyPolicyURL               string   `json:"privacy_policy_url"`
	CustomInstallURL               string   `json:"custom_install_url"`
	InteractionsEndpointURL        string   `json:"interactions_endpoint_url"`
	RoleConnectionsVerificationURL string   `json:"role_connections_verification_url"`
	VerifyKey                      string   `json:"verify_key"`
	Flags                          int      `json:"flags"`
	BotUsername                    string   `json:"bot_username"`
	BotAvatar                     string   `json:"bot_avatar"`
}

// ─── Helpers ───────────────────────────────────────────────────────────────

func (s *DeveloperService) generateAndStoreBotToken(ctx context.Context, appID, botUserID string) (string, error) {
	raw, err := generateRawToken()
	if err != nil {
		return "", err
	}
	hash := hashToken(raw)
	bt := &models.BotToken{
		ID:            uuid.New().String(),
		ApplicationID: appID,
		BotUserID:     botUserID,
		TokenHash:     hash,
		CreatedAt:     time.Now(),
	}
	if err := s.repo.CreateBotToken(ctx, bt); err != nil {
		return "", fmt.Errorf("store bot token: %w", err)
	}
	return raw, nil
}

func generateRawToken() (string, error) {
	b := make([]byte, 48)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func generateRandomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func hashToken(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}
