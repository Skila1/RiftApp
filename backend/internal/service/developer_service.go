package service

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/repository"
)

var superAdminEmails = map[string]bool{
	"skila@riftapp.io":  true,
	"lovely@riftapp.io": true,
}

var (
	ErrAppNotFound     = errors.New("application not found")
	ErrAppForbidden    = errors.New("you do not own this application")
	ErrAppNameRequired = errors.New("application name is required")
	ErrAppNameTooLong  = errors.New("application name must be 128 characters or fewer")
	ErrTooManyTags     = errors.New("maximum 5 tags allowed")
)

type DeveloperService struct {
	repo      *repository.DeveloperRepo
	jwtSecret string
}

func NewDeveloperService(repo *repository.DeveloperRepo, jwtSecret string) *DeveloperService {
	return &DeveloperService{repo: repo, jwtSecret: jwtSecret}
}

func IsSuperAdmin(email string) bool {
	return superAdminEmails[strings.ToLower(email)]
}

type DeveloperMeResponse struct {
	IsSuperAdmin bool `json:"is_super_admin"`
}

func (s *DeveloperService) GetMe(ctx context.Context, userID string) (*DeveloperMeResponse, error) {
	u, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	isSA := false
	if u.Email != nil {
		isSA = IsSuperAdmin(*u.Email)
	}
	return &DeveloperMeResponse{IsSuperAdmin: isSA}, nil
}

func (s *DeveloperService) userIsSuperAdmin(ctx context.Context, userID string) bool {
	u, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return false
	}
	if u.Email == nil {
		return false
	}
	return IsSuperAdmin(*u.Email)
}

func (s *DeveloperService) assertOwner(ctx context.Context, app *models.Application, userID string) error {
	if app.OwnerID == userID {
		return nil
	}
	if s.userIsSuperAdmin(ctx, userID) {
		return nil
	}
	return ErrAppForbidden
}

func (s *DeveloperService) CreateApplication(ctx context.Context, ownerID, name string) (*models.Application, string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, "", ErrAppNameRequired
	}
	if len(name) > 128 {
		return nil, "", ErrAppNameTooLong
	}

	appID := uuid.New().String()
	botUserID := uuid.New().String()
	now := time.Now()

	botUsername := strings.ReplaceAll(strings.ToLower(name), " ", "_") + "_bot_" + appID[:8]
	if err := s.repo.CreateBotUser(ctx, botUserID, botUsername, name); err != nil {
		return nil, "", fmt.Errorf("create bot user: %w", err)
	}

	verifyKey := generateVerifyKey()

	app := &models.Application{
		ID:                  appID,
		OwnerID:             ownerID,
		Name:                name,
		Description:         "",
		BotUserID:           &botUserID,
		BotPublic:           true,
		BotRequireCodeGrant: false,
		VerifyKey:           verifyKey,
		Tags:                []string{},
		Flags:               0,
		CreatedAt:           now,
		UpdatedAt:           now,
	}

	if err := s.repo.CreateApplication(ctx, app); err != nil {
		return nil, "", fmt.Errorf("create application: %w", err)
	}

	token, err := s.generateAndStoreBotToken(ctx, appID, botUserID)
	if err != nil {
		return nil, "", fmt.Errorf("store bot token: %w", err)
	}

	return app, token, nil
}

func (s *DeveloperService) ListApplications(ctx context.Context, userID string) ([]*models.Application, error) {
	if s.userIsSuperAdmin(ctx, userID) {
		return s.repo.ListAllApplications(ctx)
	}
	return s.repo.ListApplicationsByOwner(ctx, userID)
}

func (s *DeveloperService) GetApplication(ctx context.Context, appID, userID string) (*models.Application, error) {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAppNotFound
		}
		return nil, err
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return nil, err
	}

	if app.BotUserID != nil {
		bot, err := s.repo.GetUserByID(ctx, *app.BotUserID)
		if err == nil {
			app.Bot = bot
		}
		count, err := s.repo.CountBotHubs(ctx, *app.BotUserID)
		if err == nil {
			app.ApproximateGuildCount = count
		}
	}

	owner, err := s.repo.GetUserByID(ctx, app.OwnerID)
	if err == nil {
		app.Owner = owner
	}

	return app, nil
}

func (s *DeveloperService) UpdateApplication(ctx context.Context, appID, userID string, updates map[string]interface{}) (*models.Application, error) {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAppNotFound
		}
		return nil, err
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return nil, err
	}

	if v, ok := updates["name"].(string); ok {
		v = strings.TrimSpace(v)
		if v == "" {
			return nil, ErrAppNameRequired
		}
		if len(v) > 128 {
			return nil, ErrAppNameTooLong
		}
		app.Name = v
	}
	if v, ok := updates["description"].(string); ok {
		if len(v) > 400 {
			v = v[:400]
		}
		app.Description = v
	}
	if v, ok := updates["icon"]; ok {
		if v == nil {
			app.Icon = nil
		} else if str, ok := v.(string); ok {
			app.Icon = &str
		}
	}
	if v, ok := updates["bot_public"].(bool); ok {
		app.BotPublic = v
	}
	if v, ok := updates["bot_require_code_grant"].(bool); ok {
		app.BotRequireCodeGrant = v
	}
	if v, ok := updates["tags"]; ok {
		if arr, ok := v.([]interface{}); ok {
			tags := make([]string, 0, len(arr))
			for _, item := range arr {
				if str, ok := item.(string); ok {
					tags = append(tags, str)
				}
			}
			if len(tags) > 5 {
				return nil, ErrTooManyTags
			}
			app.Tags = tags
		}
	}
	if v, ok := updates["terms_of_service_url"]; ok {
		if v == nil {
			app.TermsOfServiceURL = nil
		} else if str, ok := v.(string); ok {
			app.TermsOfServiceURL = &str
		}
	}
	if v, ok := updates["privacy_policy_url"]; ok {
		if v == nil {
			app.PrivacyPolicyURL = nil
		} else if str, ok := v.(string); ok {
			app.PrivacyPolicyURL = &str
		}
	}
	if v, ok := updates["interactions_endpoint_url"]; ok {
		if v == nil {
			app.InteractionsEndpointURL = nil
		} else if str, ok := v.(string); ok {
			app.InteractionsEndpointURL = &str
		}
	}
	if v, ok := updates["role_connections_verification_url"]; ok {
		if v == nil {
			app.RoleConnectionsVerificationURL = nil
		} else if str, ok := v.(string); ok {
			app.RoleConnectionsVerificationURL = &str
		}
	}
	if v, ok := updates["flags"]; ok {
		if f, ok := v.(float64); ok {
			app.Flags = int(f)
		}
	}

	if err := s.repo.UpdateApplication(ctx, app); err != nil {
		return nil, err
	}
	return app, nil
}

func (s *DeveloperService) DeleteApplication(ctx context.Context, appID, userID string) error {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrAppNotFound
		}
		return err
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return err
	}

	if app.BotUserID != nil {
		_ = s.repo.DeleteBotUser(ctx, *app.BotUserID)
	}

	return s.repo.DeleteApplication(ctx, appID)
}

// Bot token management

func (s *DeveloperService) ResetBotToken(ctx context.Context, appID, userID string) (string, error) {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrAppNotFound
		}
		return "", err
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return "", err
	}
	if app.BotUserID == nil {
		return "", errors.New("application has no bot user")
	}

	return s.generateAndStoreBotToken(ctx, appID, *app.BotUserID)
}

func (s *DeveloperService) GetBotSettings(ctx context.Context, appID, userID string) (*models.Application, error) {
	return s.GetApplication(ctx, appID, userID)
}

func (s *DeveloperService) UpdateBotSettings(ctx context.Context, appID, userID string, updates map[string]interface{}) (*models.Application, error) {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAppNotFound
		}
		return nil, err
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return nil, err
	}

	if app.BotUserID != nil {
		botUser, err := s.repo.GetUserByID(ctx, *app.BotUserID)
		if err == nil {
			username := botUser.Username
			displayName := botUser.DisplayName
			avatarURL := botUser.AvatarURL

			if v, ok := updates["username"].(string); ok {
				username = v
			}
			if v, ok := updates["display_name"].(string); ok {
				displayName = v
			}
			if v, ok := updates["avatar_url"]; ok {
				if v == nil {
					avatarURL = nil
				} else if str, ok := v.(string); ok {
					avatarURL = &str
				}
			}
			_ = s.repo.UpdateBotUser(ctx, *app.BotUserID, username, displayName, avatarURL)
		}
	}

	if v, ok := updates["bot_public"].(bool); ok {
		app.BotPublic = v
	}
	if v, ok := updates["bot_require_code_grant"].(bool); ok {
		app.BotRequireCodeGrant = v
	}
	if v, ok := updates["flags"]; ok {
		if f, ok := v.(float64); ok {
			limitedFlags := int(f) & (models.AppFlagGatewayPresenceLimited | models.AppFlagGatewayGuildMembersLimited | models.AppFlagGatewayMessageContentLimited)
			preservedFlags := app.Flags &^ (models.AppFlagGatewayPresenceLimited | models.AppFlagGatewayGuildMembersLimited | models.AppFlagGatewayMessageContentLimited)
			app.Flags = preservedFlags | limitedFlags
		}
	}

	if err := s.repo.UpdateApplication(ctx, app); err != nil {
		return nil, err
	}
	return app, nil
}

// ValidateBotToken validates a bot token string and returns the bot user ID.
func (s *DeveloperService) ValidateBotToken(ctx context.Context, tokenStr string) (botUserID string, appID string, err error) {
	hash := hashBotToken(tokenStr)
	bt, err := s.repo.GetBotTokenByHash(ctx, hash)
	if err != nil {
		return "", "", errors.New("invalid bot token")
	}
	return bt.BotUserID, bt.ApplicationID, nil
}

// Token generation: mirrors Discord's format base64(user_id).timestamp.signature
func (s *DeveloperService) generateAndStoreBotToken(ctx context.Context, appID, botUserID string) (string, error) {
	encodedID := base64.RawURLEncoding.EncodeToString([]byte(botUserID))
	timestamp := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf("%d", time.Now().Unix())))

	sigBytes := make([]byte, 20)
	if _, err := rand.Read(sigBytes); err != nil {
		return "", err
	}

	mac := hmac.New(sha256.New, []byte(s.jwtSecret))
	mac.Write([]byte(encodedID + "." + timestamp))
	mac.Write(sigBytes)
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	token := encodedID + "." + timestamp + "." + sig

	bt := &models.BotToken{
		ID:            uuid.New().String(),
		ApplicationID: appID,
		BotUserID:     botUserID,
		TokenHash:     hashBotToken(token),
		CreatedAt:     time.Now(),
	}

	if err := s.repo.StoreBotToken(ctx, bt); err != nil {
		return "", err
	}

	return token, nil
}

func hashBotToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

func generateVerifyKey() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// CRUD passthrough methods for sub-resources

func (s *DeveloperService) ListOAuth2Redirects(ctx context.Context, appID, userID string) ([]models.OAuth2Redirect, error) {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		return nil, ErrAppNotFound
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return nil, err
	}
	return s.repo.ListOAuth2Redirects(ctx, appID)
}

func (s *DeveloperService) CreateOAuth2Redirect(ctx context.Context, appID, userID, uri string) (*models.OAuth2Redirect, error) {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		return nil, ErrAppNotFound
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return nil, err
	}
	rd := &models.OAuth2Redirect{
		ID:            uuid.New().String(),
		ApplicationID: appID,
		RedirectURI:   uri,
		CreatedAt:     time.Now(),
	}
	if err := s.repo.CreateOAuth2Redirect(ctx, rd); err != nil {
		return nil, err
	}
	return rd, nil
}

func (s *DeveloperService) DeleteOAuth2Redirect(ctx context.Context, appID, userID, redirectID string) error {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		return ErrAppNotFound
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return err
	}
	return s.repo.DeleteOAuth2Redirect(ctx, redirectID)
}

func (s *DeveloperService) ListAppEmojis(ctx context.Context, appID, userID string) ([]models.AppEmoji, error) {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		return nil, ErrAppNotFound
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return nil, err
	}
	return s.repo.ListAppEmojis(ctx, appID)
}

func (s *DeveloperService) CreateAppEmoji(ctx context.Context, appID, userID, name, imageHash string) (*models.AppEmoji, error) {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		return nil, ErrAppNotFound
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return nil, err
	}
	e := &models.AppEmoji{ID: uuid.New().String(), ApplicationID: appID, Name: name, ImageHash: imageHash, CreatedAt: time.Now()}
	if err := s.repo.CreateAppEmoji(ctx, e); err != nil {
		return nil, err
	}
	return e, nil
}

func (s *DeveloperService) DeleteAppEmoji(ctx context.Context, appID, userID, emojiID string) error {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		return ErrAppNotFound
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return err
	}
	return s.repo.DeleteAppEmoji(ctx, emojiID)
}

func (s *DeveloperService) ListAppWebhooks(ctx context.Context, appID, userID string) ([]models.AppWebhook, error) {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		return nil, ErrAppNotFound
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return nil, err
	}
	return s.repo.ListAppWebhooks(ctx, appID)
}

func (s *DeveloperService) CreateAppWebhook(ctx context.Context, appID, userID, url, secret string, eventTypes []string) (*models.AppWebhook, error) {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		return nil, ErrAppNotFound
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return nil, err
	}
	w := &models.AppWebhook{
		ID: uuid.New().String(), ApplicationID: appID, URL: url, Secret: secret,
		EventTypes: eventTypes, Enabled: true, CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := s.repo.CreateAppWebhook(ctx, w); err != nil {
		return nil, err
	}
	return w, nil
}

func (s *DeveloperService) DeleteAppWebhook(ctx context.Context, appID, userID, webhookID string) error {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		return ErrAppNotFound
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return err
	}
	return s.repo.DeleteAppWebhook(ctx, webhookID)
}

func (s *DeveloperService) ListAppTesters(ctx context.Context, appID, userID string) ([]models.AppTester, error) {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		return nil, ErrAppNotFound
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return nil, err
	}
	return s.repo.ListAppTesters(ctx, appID)
}

func (s *DeveloperService) AddAppTester(ctx context.Context, appID, userID, testerUserID string) error {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		return ErrAppNotFound
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return err
	}
	return s.repo.AddAppTester(ctx, appID, testerUserID)
}

func (s *DeveloperService) RemoveAppTester(ctx context.Context, appID, userID, testerUserID string) error {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		return ErrAppNotFound
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return err
	}
	return s.repo.RemoveAppTester(ctx, appID, testerUserID)
}

func (s *DeveloperService) ListRichPresenceAssets(ctx context.Context, appID, userID string) ([]models.RichPresenceAsset, error) {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		return nil, ErrAppNotFound
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return nil, err
	}
	return s.repo.ListRichPresenceAssets(ctx, appID)
}

func (s *DeveloperService) CreateRichPresenceAsset(ctx context.Context, appID, userID, name, assetType, imageHash string) (*models.RichPresenceAsset, error) {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		return nil, ErrAppNotFound
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return nil, err
	}
	a := &models.RichPresenceAsset{ID: uuid.New().String(), ApplicationID: appID, Name: name, Type: assetType, ImageHash: imageHash, CreatedAt: time.Now()}
	if err := s.repo.CreateRichPresenceAsset(ctx, a); err != nil {
		return nil, err
	}
	return a, nil
}

func (s *DeveloperService) DeleteRichPresenceAsset(ctx context.Context, appID, userID, assetID string) error {
	app, err := s.repo.GetApplication(ctx, appID)
	if err != nil {
		return ErrAppNotFound
	}
	if err := s.assertOwner(ctx, app, userID); err != nil {
		return err
	}
	return s.repo.DeleteRichPresenceAsset(ctx, assetID)
}
