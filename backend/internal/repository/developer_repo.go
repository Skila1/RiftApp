package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

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

// ─── Applications ───────────────────────────────────────────────────────────

func (r *DeveloperRepo) CreateApplication(ctx context.Context, app *models.Application) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO applications (id,owner_id,name,description,icon,bot_user_id,bot_public,bot_require_code_grant,verify_key,tags,terms_of_service_url,privacy_policy_url,interactions_endpoint_url,role_connections_verification_url,custom_install_url,install_params,flags,created_at,updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
		app.ID, app.OwnerID, app.Name, app.Description, app.Icon, app.BotUserID,
		app.BotPublic, app.BotRequireCodeGrant, app.VerifyKey, app.Tags,
		app.TermsOfServiceURL, app.PrivacyPolicyURL, app.InteractionsEndpointURL,
		app.RoleConnectionsVerificationURL, app.CustomInstallURL, app.InstallParams,
		app.Flags, app.CreatedAt, app.UpdatedAt)
	return err
}

func (r *DeveloperRepo) GetApplication(ctx context.Context, id string) (*models.Application, error) {
	app := &models.Application{}
	err := r.db.QueryRow(ctx, `
		SELECT id,owner_id,name,description,icon,bot_user_id,bot_public,bot_require_code_grant,
		       verify_key,tags,terms_of_service_url,privacy_policy_url,interactions_endpoint_url,
		       role_connections_verification_url,custom_install_url,install_params,flags,created_at,updated_at
		FROM applications WHERE id = $1`, id).Scan(
		&app.ID, &app.OwnerID, &app.Name, &app.Description, &app.Icon, &app.BotUserID,
		&app.BotPublic, &app.BotRequireCodeGrant, &app.VerifyKey, &app.Tags,
		&app.TermsOfServiceURL, &app.PrivacyPolicyURL, &app.InteractionsEndpointURL,
		&app.RoleConnectionsVerificationURL, &app.CustomInstallURL, &app.InstallParams,
		&app.Flags, &app.CreatedAt, &app.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return app, nil
}

func (r *DeveloperRepo) ListApplicationsByOwner(ctx context.Context, ownerID string) ([]*models.Application, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id,owner_id,name,description,icon,bot_user_id,bot_public,bot_require_code_grant,
		       verify_key,tags,terms_of_service_url,privacy_policy_url,interactions_endpoint_url,
		       role_connections_verification_url,custom_install_url,install_params,flags,created_at,updated_at
		FROM applications WHERE owner_id = $1 ORDER BY created_at DESC`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanApplications(rows)
}

func (r *DeveloperRepo) ListAllApplications(ctx context.Context) ([]*models.Application, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id,owner_id,name,description,icon,bot_user_id,bot_public,bot_require_code_grant,
		       verify_key,tags,terms_of_service_url,privacy_policy_url,interactions_endpoint_url,
		       role_connections_verification_url,custom_install_url,install_params,flags,created_at,updated_at
		FROM applications ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanApplications(rows)
}

func scanApplications(rows pgx.Rows) ([]*models.Application, error) {
	var apps []*models.Application
	for rows.Next() {
		app := &models.Application{}
		if err := rows.Scan(
			&app.ID, &app.OwnerID, &app.Name, &app.Description, &app.Icon, &app.BotUserID,
			&app.BotPublic, &app.BotRequireCodeGrant, &app.VerifyKey, &app.Tags,
			&app.TermsOfServiceURL, &app.PrivacyPolicyURL, &app.InteractionsEndpointURL,
			&app.RoleConnectionsVerificationURL, &app.CustomInstallURL, &app.InstallParams,
			&app.Flags, &app.CreatedAt, &app.UpdatedAt); err != nil {
			return nil, err
		}
		apps = append(apps, app)
	}
	return apps, nil
}

func (r *DeveloperRepo) UpdateApplication(ctx context.Context, app *models.Application) error {
	app.UpdatedAt = time.Now()
	_, err := r.db.Exec(ctx, `
		UPDATE applications SET name=$2,description=$3,icon=$4,bot_public=$5,bot_require_code_grant=$6,
		       tags=$7,terms_of_service_url=$8,privacy_policy_url=$9,interactions_endpoint_url=$10,
		       role_connections_verification_url=$11,custom_install_url=$12,install_params=$13,flags=$14,updated_at=$15
		WHERE id=$1`,
		app.ID, app.Name, app.Description, app.Icon, app.BotPublic, app.BotRequireCodeGrant,
		app.Tags, app.TermsOfServiceURL, app.PrivacyPolicyURL, app.InteractionsEndpointURL,
		app.RoleConnectionsVerificationURL, app.CustomInstallURL, app.InstallParams, app.Flags, app.UpdatedAt)
	return err
}

func (r *DeveloperRepo) DeleteApplication(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM applications WHERE id = $1`, id)
	return err
}

func (r *DeveloperRepo) GetApplicationByBotUserID(ctx context.Context, botUserID string) (*models.Application, error) {
	app := &models.Application{}
	err := r.db.QueryRow(ctx, `
		SELECT id,owner_id,name,description,icon,bot_user_id,bot_public,bot_require_code_grant,
		       verify_key,tags,terms_of_service_url,privacy_policy_url,interactions_endpoint_url,
		       role_connections_verification_url,custom_install_url,install_params,flags,created_at,updated_at
		FROM applications WHERE bot_user_id = $1`, botUserID).Scan(
		&app.ID, &app.OwnerID, &app.Name, &app.Description, &app.Icon, &app.BotUserID,
		&app.BotPublic, &app.BotRequireCodeGrant, &app.VerifyKey, &app.Tags,
		&app.TermsOfServiceURL, &app.PrivacyPolicyURL, &app.InteractionsEndpointURL,
		&app.RoleConnectionsVerificationURL, &app.CustomInstallURL, &app.InstallParams,
		&app.Flags, &app.CreatedAt, &app.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return app, nil
}

func (r *DeveloperRepo) CountGuildsForBotUser(ctx context.Context, botUserID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `SELECT count(*) FROM hub_members WHERE user_id = $1`, botUserID).Scan(&count)
	return count, err
}

// ─── Bot tokens ─────────────────────────────────────────────────────────────

func (r *DeveloperRepo) CreateBotToken(ctx context.Context, bt *models.BotToken) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO bot_tokens (id,application_id,bot_user_id,token_hash,created_at)
		VALUES ($1,$2,$3,$4,$5)`,
		bt.ID, bt.ApplicationID, bt.BotUserID, bt.TokenHash, bt.CreatedAt)
	return err
}

func (r *DeveloperRepo) DeleteBotTokensByApp(ctx context.Context, appID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM bot_tokens WHERE application_id = $1`, appID)
	return err
}

func (r *DeveloperRepo) GetBotTokenByHash(ctx context.Context, hash string) (*models.BotToken, error) {
	bt := &models.BotToken{}
	err := r.db.QueryRow(ctx, `
		SELECT id,application_id,bot_user_id,token_hash,created_at
		FROM bot_tokens WHERE token_hash = $1`, hash).Scan(
		&bt.ID, &bt.ApplicationID, &bt.BotUserID, &bt.TokenHash, &bt.CreatedAt)
	if err != nil {
		return nil, err
	}
	return bt, nil
}

// ─── Bot user (creates row in users table) ──────────────────────────────────

func (r *DeveloperRepo) CreateBotUser(ctx context.Context, u *models.User) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO users (id,username,email,password_hash,is_bot,display_name,avatar_url,status,created_at,updated_at)
		VALUES ($1,$2,$3,$4,true,$5,$6,0,$7,$8)`,
		u.ID, u.Username, u.Email, u.PasswordHash, u.DisplayName, u.AvatarURL, u.CreatedAt, u.UpdatedAt)
	return err
}

func (r *DeveloperRepo) UpdateBotUser(ctx context.Context, id, username, displayName string, avatarURL *string) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET username=$2,display_name=$3,avatar_url=$4,updated_at=now() WHERE id=$1`,
		id, username, displayName, avatarURL)
	return err
}

func (r *DeveloperRepo) UpdateBotUserAvatar(ctx context.Context, id string, avatarURL *string) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET avatar_url=$2,updated_at=now() WHERE id=$1`, id, avatarURL)
	return err
}

func (r *DeveloperRepo) GetUserByID(ctx context.Context, id string) (*models.User, error) {
	u := &models.User{}
	err := r.db.QueryRow(ctx, `
		SELECT id,username,email,password_hash,is_bot,display_name,avatar_url,bio,status,last_seen,created_at,updated_at
		FROM users WHERE id = $1`, id).Scan(
		&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.IsBot, &u.DisplayName,
		&u.AvatarURL, &u.Bio, &u.Status, &u.LastSeen, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (r *DeveloperRepo) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	u := &models.User{}
	err := r.db.QueryRow(ctx, `
		SELECT id,username,email,password_hash,is_bot,display_name,avatar_url,bio,status,last_seen,created_at,updated_at
		FROM users WHERE email = $1`, email).Scan(
		&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.IsBot, &u.DisplayName,
		&u.AvatarURL, &u.Bio, &u.Status, &u.LastSeen, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return u, nil
}

// ─── OAuth2 Redirects ──────────────────────────────────────────────────────

func (r *DeveloperRepo) CreateOAuth2Redirect(ctx context.Context, rd *models.OAuth2Redirect) error {
	_, err := r.db.Exec(ctx, `INSERT INTO oauth2_redirects (id,application_id,redirect_uri,created_at) VALUES ($1,$2,$3,$4)`,
		rd.ID, rd.ApplicationID, rd.RedirectURI, rd.CreatedAt)
	return err
}

func (r *DeveloperRepo) ListOAuth2Redirects(ctx context.Context, appID string) ([]models.OAuth2Redirect, error) {
	rows, err := r.db.Query(ctx, `SELECT id,application_id,redirect_uri,created_at FROM oauth2_redirects WHERE application_id = $1`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.OAuth2Redirect
	for rows.Next() {
		var rd models.OAuth2Redirect
		if err := rows.Scan(&rd.ID, &rd.ApplicationID, &rd.RedirectURI, &rd.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, rd)
	}
	return out, nil
}

func (r *DeveloperRepo) DeleteOAuth2Redirect(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM oauth2_redirects WHERE id = $1`, id)
	return err
}

// ─── App Emojis ────────────────────────────────────────────────────────────

func (r *DeveloperRepo) CreateAppEmoji(ctx context.Context, e *models.AppEmoji) error {
	_, err := r.db.Exec(ctx, `INSERT INTO app_emojis (id,application_id,name,image_hash,created_at) VALUES ($1,$2,$3,$4,$5)`,
		e.ID, e.ApplicationID, e.Name, e.ImageHash, e.CreatedAt)
	return err
}

func (r *DeveloperRepo) ListAppEmojis(ctx context.Context, appID string) ([]models.AppEmoji, error) {
	rows, err := r.db.Query(ctx, `SELECT id,application_id,name,image_hash,created_at FROM app_emojis WHERE application_id = $1`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.AppEmoji
	for rows.Next() {
		var e models.AppEmoji
		if err := rows.Scan(&e.ID, &e.ApplicationID, &e.Name, &e.ImageHash, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, nil
}

func (r *DeveloperRepo) DeleteAppEmoji(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM app_emojis WHERE id = $1`, id)
	return err
}

// ─── App Webhooks ──────────────────────────────────────────────────────────

func (r *DeveloperRepo) CreateAppWebhook(ctx context.Context, wh *models.AppWebhook) error {
	_, err := r.db.Exec(ctx, `INSERT INTO app_webhooks (id,application_id,url,secret,event_types,enabled,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		wh.ID, wh.ApplicationID, wh.URL, wh.Secret, wh.EventTypes, wh.Enabled, wh.CreatedAt, wh.UpdatedAt)
	return err
}

func (r *DeveloperRepo) ListAppWebhooks(ctx context.Context, appID string) ([]models.AppWebhook, error) {
	rows, err := r.db.Query(ctx, `SELECT id,application_id,url,secret,event_types,enabled,created_at,updated_at FROM app_webhooks WHERE application_id = $1`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.AppWebhook
	for rows.Next() {
		var wh models.AppWebhook
		if err := rows.Scan(&wh.ID, &wh.ApplicationID, &wh.URL, &wh.Secret, &wh.EventTypes, &wh.Enabled, &wh.CreatedAt, &wh.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, wh)
	}
	return out, nil
}

func (r *DeveloperRepo) DeleteAppWebhook(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM app_webhooks WHERE id = $1`, id)
	return err
}

// ─── App Testers ───────────────────────────────────────────────────────────

func (r *DeveloperRepo) AddAppTester(ctx context.Context, appID, userID string) error {
	_, err := r.db.Exec(ctx, `INSERT INTO app_testers (application_id,user_id,status,created_at) VALUES ($1,$2,'pending',now()) ON CONFLICT DO NOTHING`, appID, userID)
	return err
}

func (r *DeveloperRepo) ListAppTesters(ctx context.Context, appID string) ([]models.AppTester, error) {
	rows, err := r.db.Query(ctx, `
		SELECT t.application_id, t.user_id, t.status, t.created_at,
		       u.id, u.username, u.display_name, u.avatar_url
		FROM app_testers t JOIN users u ON t.user_id = u.id WHERE t.application_id = $1`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.AppTester
	for rows.Next() {
		var t models.AppTester
		u := &models.User{}
		if err := rows.Scan(&t.ApplicationID, &t.UserID, &t.Status, &t.CreatedAt,
			&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL); err != nil {
			return nil, err
		}
		t.User = u
		out = append(out, t)
	}
	return out, nil
}

func (r *DeveloperRepo) RemoveAppTester(ctx context.Context, appID, userID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM app_testers WHERE application_id = $1 AND user_id = $2`, appID, userID)
	return err
}

// ─── Rich Presence Assets ──────────────────────────────────────────────────

func (r *DeveloperRepo) CreateRichPresenceAsset(ctx context.Context, a *models.RichPresenceAsset) error {
	_, err := r.db.Exec(ctx, `INSERT INTO rich_presence_assets (id,application_id,name,type,image_hash,created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
		a.ID, a.ApplicationID, a.Name, a.Type, a.ImageHash, a.CreatedAt)
	return err
}

func (r *DeveloperRepo) ListRichPresenceAssets(ctx context.Context, appID string) ([]models.RichPresenceAsset, error) {
	rows, err := r.db.Query(ctx, `SELECT id,application_id,name,type,image_hash,created_at FROM rich_presence_assets WHERE application_id = $1`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.RichPresenceAsset
	for rows.Next() {
		var a models.RichPresenceAsset
		if err := rows.Scan(&a.ID, &a.ApplicationID, &a.Name, &a.Type, &a.ImageHash, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, nil
}

func (r *DeveloperRepo) DeleteRichPresenceAsset(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM rich_presence_assets WHERE id = $1`, id)
	return err
}

// ─── Helpers ───────────────────────────────────────────────────────────────

func (r *DeveloperRepo) SetApplicationBotUserID(ctx context.Context, appID, botUserID string) error {
	_, err := r.db.Exec(ctx, `UPDATE applications SET bot_user_id = $2, updated_at = now() WHERE id = $1`, appID, botUserID)
	return err
}

func (r *DeveloperRepo) BulkUpdateApplicationFields(ctx context.Context, appID string, fields map[string]interface{}) error {
	if len(fields) == 0 {
		return nil
	}
	setClauses := make([]string, 0, len(fields))
	args := make([]interface{}, 0, len(fields)+1)
	args = append(args, appID)
	i := 2
	for col, val := range fields {
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", col, i))
		args = append(args, val)
		i++
	}
	setClauses = append(setClauses, fmt.Sprintf("updated_at = $%d", i))
	args = append(args, time.Now())
	q := fmt.Sprintf("UPDATE applications SET %s WHERE id = $1", strings.Join(setClauses, ", "))
	_, err := r.db.Exec(ctx, q, args...)
	return err
}
