package repository

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riftapp-cloud/riftapp/internal/models"
)

type DeveloperRepo struct {
	db *pgxpool.Pool
}

func NewDeveloperRepo(db *pgxpool.Pool) *DeveloperRepo {
	return &DeveloperRepo{db: db}
}

func (r *DeveloperRepo) CreateApplication(ctx context.Context, app *models.Application) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO applications (id, owner_id, name, description, icon, bot_user_id, bot_public, bot_require_code_grant, verify_key, tags, flags, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
		app.ID, app.OwnerID, app.Name, app.Description, app.Icon, app.BotUserID,
		app.BotPublic, app.BotRequireCodeGrant, app.VerifyKey, app.Tags, app.Flags,
		app.CreatedAt, app.UpdatedAt,
	)
	return err
}

func (r *DeveloperRepo) GetApplication(ctx context.Context, id string) (*models.Application, error) {
	var app models.Application
	err := r.db.QueryRow(ctx,
		`SELECT id, owner_id, name, description, icon, bot_user_id, bot_public, bot_require_code_grant,
		        verify_key, tags, terms_of_service_url, privacy_policy_url, interactions_endpoint_url,
		        role_connections_verification_url, custom_install_url, install_params, flags, created_at, updated_at
		 FROM applications WHERE id = $1`, id,
	).Scan(
		&app.ID, &app.OwnerID, &app.Name, &app.Description, &app.Icon, &app.BotUserID,
		&app.BotPublic, &app.BotRequireCodeGrant, &app.VerifyKey, &app.Tags,
		&app.TermsOfServiceURL, &app.PrivacyPolicyURL, &app.InteractionsEndpointURL,
		&app.RoleConnectionsVerificationURL, &app.CustomInstallURL, &app.InstallParams,
		&app.Flags, &app.CreatedAt, &app.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &app, nil
}

func (r *DeveloperRepo) ListApplicationsByOwner(ctx context.Context, ownerID string) ([]*models.Application, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, owner_id, name, description, icon, bot_user_id, bot_public, bot_require_code_grant,
		        verify_key, tags, flags, created_at, updated_at
		 FROM applications WHERE owner_id = $1 ORDER BY created_at DESC`, ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAppList(rows)
}

func (r *DeveloperRepo) ListAllApplications(ctx context.Context) ([]*models.Application, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, owner_id, name, description, icon, bot_user_id, bot_public, bot_require_code_grant,
		        verify_key, tags, flags, created_at, updated_at
		 FROM applications ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAppList(rows)
}

func scanAppList(rows pgx.Rows) ([]*models.Application, error) {
	var apps []*models.Application
	for rows.Next() {
		var app models.Application
		if err := rows.Scan(
			&app.ID, &app.OwnerID, &app.Name, &app.Description, &app.Icon, &app.BotUserID,
			&app.BotPublic, &app.BotRequireCodeGrant, &app.VerifyKey, &app.Tags,
			&app.Flags, &app.CreatedAt, &app.UpdatedAt,
		); err != nil {
			return nil, err
		}
		apps = append(apps, &app)
	}
	return apps, nil
}

func (r *DeveloperRepo) UpdateApplication(ctx context.Context, app *models.Application) error {
	_, err := r.db.Exec(ctx,
		`UPDATE applications SET name=$2, description=$3, icon=$4, bot_public=$5,
		        bot_require_code_grant=$6, tags=$7, terms_of_service_url=$8, privacy_policy_url=$9,
		        interactions_endpoint_url=$10, role_connections_verification_url=$11,
		        custom_install_url=$12, install_params=$13, flags=$14, updated_at=now()
		 WHERE id = $1`,
		app.ID, app.Name, app.Description, app.Icon, app.BotPublic,
		app.BotRequireCodeGrant, app.Tags, app.TermsOfServiceURL, app.PrivacyPolicyURL,
		app.InteractionsEndpointURL, app.RoleConnectionsVerificationURL,
		app.CustomInstallURL, app.InstallParams, app.Flags,
	)
	return err
}

func (r *DeveloperRepo) DeleteApplication(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM applications WHERE id = $1`, id)
	return err
}

// Bot token operations

func (r *DeveloperRepo) StoreBotToken(ctx context.Context, token *models.BotToken) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO bot_tokens (id, application_id, bot_user_id, token_hash, created_at)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (application_id) DO UPDATE SET token_hash = $4, created_at = $5`,
		token.ID, token.ApplicationID, token.BotUserID, token.TokenHash, token.CreatedAt,
	)
	return err
}

func (r *DeveloperRepo) GetBotTokenByHash(ctx context.Context, hash string) (*models.BotToken, error) {
	var t models.BotToken
	err := r.db.QueryRow(ctx,
		`SELECT id, application_id, bot_user_id, token_hash, created_at FROM bot_tokens WHERE token_hash = $1`,
		hash,
	).Scan(&t.ID, &t.ApplicationID, &t.BotUserID, &t.TokenHash, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *DeveloperRepo) GetBotTokenByAppID(ctx context.Context, appID string) (*models.BotToken, error) {
	var t models.BotToken
	err := r.db.QueryRow(ctx,
		`SELECT id, application_id, bot_user_id, token_hash, created_at FROM bot_tokens WHERE application_id = $1`,
		appID,
	).Scan(&t.ID, &t.ApplicationID, &t.BotUserID, &t.TokenHash, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// Bot user creation in existing users table

func (r *DeveloperRepo) CreateBotUser(ctx context.Context, id, username, displayName string) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO users (id, username, email, password_hash, display_name, is_bot, status, created_at, updated_at)
		 VALUES ($1, $2, NULL, '', $3, true, 0, now(), now())`,
		id, username, displayName,
	)
	return err
}

func (r *DeveloperRepo) UpdateBotUser(ctx context.Context, id string, username, displayName string, avatarURL *string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET username=$2, display_name=$3, avatar_url=$4, updated_at=now() WHERE id = $1 AND is_bot = true`,
		id, username, displayName, avatarURL,
	)
	return err
}

func (r *DeveloperRepo) DeleteBotUser(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM users WHERE id = $1 AND is_bot = true`, id)
	return err
}

func (r *DeveloperRepo) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	err := r.db.QueryRow(ctx,
		`SELECT id, username, email, display_name, avatar_url, bio, status, is_bot, created_at, updated_at
		 FROM users WHERE email = $1`, email,
	).Scan(&u.ID, &u.Username, &u.Email, &u.DisplayName, &u.AvatarURL, &u.Bio, &u.Status, &u.IsBot, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *DeveloperRepo) GetUserByID(ctx context.Context, id string) (*models.User, error) {
	var u models.User
	err := r.db.QueryRow(ctx,
		`SELECT id, username, email, display_name, avatar_url, bio, status, is_bot, created_at, updated_at
		 FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Username, &u.Email, &u.DisplayName, &u.AvatarURL, &u.Bio, &u.Status, &u.IsBot, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// OAuth2 redirects

func (r *DeveloperRepo) ListOAuth2Redirects(ctx context.Context, appID string) ([]models.OAuth2Redirect, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, application_id, redirect_uri, created_at FROM oauth2_redirects WHERE application_id = $1 ORDER BY created_at`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var redirects []models.OAuth2Redirect
	for rows.Next() {
		var rd models.OAuth2Redirect
		if err := rows.Scan(&rd.ID, &rd.ApplicationID, &rd.RedirectURI, &rd.CreatedAt); err != nil {
			return nil, err
		}
		redirects = append(redirects, rd)
	}
	return redirects, nil
}

func (r *DeveloperRepo) CreateOAuth2Redirect(ctx context.Context, rd *models.OAuth2Redirect) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO oauth2_redirects (id, application_id, redirect_uri, created_at) VALUES ($1, $2, $3, $4)`,
		rd.ID, rd.ApplicationID, rd.RedirectURI, rd.CreatedAt)
	return err
}

func (r *DeveloperRepo) DeleteOAuth2Redirect(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM oauth2_redirects WHERE id = $1`, id)
	return err
}

// App emojis

func (r *DeveloperRepo) ListAppEmojis(ctx context.Context, appID string) ([]models.AppEmoji, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, application_id, name, image_hash, created_at FROM app_emojis WHERE application_id = $1 ORDER BY created_at`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var emojis []models.AppEmoji
	for rows.Next() {
		var e models.AppEmoji
		if err := rows.Scan(&e.ID, &e.ApplicationID, &e.Name, &e.ImageHash, &e.CreatedAt); err != nil {
			return nil, err
		}
		emojis = append(emojis, e)
	}
	return emojis, nil
}

func (r *DeveloperRepo) CreateAppEmoji(ctx context.Context, e *models.AppEmoji) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO app_emojis (id, application_id, name, image_hash, created_at) VALUES ($1, $2, $3, $4, $5)`,
		e.ID, e.ApplicationID, e.Name, e.ImageHash, e.CreatedAt)
	return err
}

func (r *DeveloperRepo) DeleteAppEmoji(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM app_emojis WHERE id = $1`, id)
	return err
}

// App webhooks

func (r *DeveloperRepo) ListAppWebhooks(ctx context.Context, appID string) ([]models.AppWebhook, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, application_id, url, secret, event_types, enabled, created_at, updated_at
		 FROM app_webhooks WHERE application_id = $1 ORDER BY created_at`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var webhooks []models.AppWebhook
	for rows.Next() {
		var w models.AppWebhook
		if err := rows.Scan(&w.ID, &w.ApplicationID, &w.URL, &w.Secret, &w.EventTypes, &w.Enabled, &w.CreatedAt, &w.UpdatedAt); err != nil {
			return nil, err
		}
		webhooks = append(webhooks, w)
	}
	return webhooks, nil
}

func (r *DeveloperRepo) CreateAppWebhook(ctx context.Context, w *models.AppWebhook) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO app_webhooks (id, application_id, url, secret, event_types, enabled, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		w.ID, w.ApplicationID, w.URL, w.Secret, w.EventTypes, w.Enabled, w.CreatedAt, w.UpdatedAt)
	return err
}

func (r *DeveloperRepo) UpdateAppWebhook(ctx context.Context, w *models.AppWebhook) error {
	_, err := r.db.Exec(ctx,
		`UPDATE app_webhooks SET url=$2, secret=$3, event_types=$4, enabled=$5, updated_at=now() WHERE id = $1`,
		w.ID, w.URL, w.Secret, w.EventTypes, w.Enabled)
	return err
}

func (r *DeveloperRepo) DeleteAppWebhook(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM app_webhooks WHERE id = $1`, id)
	return err
}

// App testers

func (r *DeveloperRepo) ListAppTesters(ctx context.Context, appID string) ([]models.AppTester, error) {
	rows, err := r.db.Query(ctx,
		`SELECT t.application_id, t.user_id, t.status, t.created_at,
		        u.id, u.username, u.display_name, u.avatar_url
		 FROM app_testers t JOIN users u ON u.id = t.user_id
		 WHERE t.application_id = $1 ORDER BY t.created_at`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var testers []models.AppTester
	for rows.Next() {
		var t models.AppTester
		var u models.User
		if err := rows.Scan(&t.ApplicationID, &t.UserID, &t.Status, &t.CreatedAt,
			&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL); err != nil {
			return nil, err
		}
		t.User = &u
		testers = append(testers, t)
	}
	return testers, nil
}

func (r *DeveloperRepo) AddAppTester(ctx context.Context, appID, userID string) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO app_testers (application_id, user_id, status, created_at) VALUES ($1, $2, 'pending', now())
		 ON CONFLICT DO NOTHING`, appID, userID)
	return err
}

func (r *DeveloperRepo) RemoveAppTester(ctx context.Context, appID, userID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM app_testers WHERE application_id = $1 AND user_id = $2`, appID, userID)
	return err
}

// Rich presence assets

func (r *DeveloperRepo) ListRichPresenceAssets(ctx context.Context, appID string) ([]models.RichPresenceAsset, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, application_id, name, type, image_hash, created_at FROM rich_presence_assets WHERE application_id = $1 ORDER BY created_at`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var assets []models.RichPresenceAsset
	for rows.Next() {
		var a models.RichPresenceAsset
		if err := rows.Scan(&a.ID, &a.ApplicationID, &a.Name, &a.Type, &a.ImageHash, &a.CreatedAt); err != nil {
			return nil, err
		}
		assets = append(assets, a)
	}
	return assets, nil
}

func (r *DeveloperRepo) CreateRichPresenceAsset(ctx context.Context, a *models.RichPresenceAsset) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO rich_presence_assets (id, application_id, name, type, image_hash, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
		a.ID, a.ApplicationID, a.Name, a.Type, a.ImageHash, a.CreatedAt)
	return err
}

func (r *DeveloperRepo) DeleteRichPresenceAsset(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM rich_presence_assets WHERE id = $1`, id)
	return err
}

// Hub membership count for a bot user
func (r *DeveloperRepo) CountBotHubs(ctx context.Context, botUserID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM hub_members WHERE user_id = $1`, botUserID).Scan(&count)
	return count, err
}
