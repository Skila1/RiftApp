package repository

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riftapp-cloud/riftapp/internal/models"
)

type AppCommandRepo struct {
	db *pgxpool.Pool
}

func NewAppCommandRepo(db *pgxpool.Pool) *AppCommandRepo {
	return &AppCommandRepo{db: db}
}

func (r *AppCommandRepo) BulkUpsert(ctx context.Context, appID string, hubID *string, commands []models.ApplicationCommand) ([]models.ApplicationCommand, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if hubID != nil {
		_, err = tx.Exec(ctx, `DELETE FROM application_commands WHERE application_id = $1 AND hub_id = $2`, appID, *hubID)
	} else {
		_, err = tx.Exec(ctx, `DELETE FROM application_commands WHERE application_id = $1 AND hub_id IS NULL`, appID)
	}
	if err != nil {
		return nil, err
	}

	var result []models.ApplicationCommand
	for _, cmd := range commands {
		id := uuid.New().String()
		opts, _ := json.Marshal(cmd.Options)
		if cmd.Options == nil {
			opts = []byte("[]")
		}
		cmdType := cmd.Type
		if cmdType == 0 {
			cmdType = 1
		}

		var out models.ApplicationCommand
		var optsRaw []byte
		err := tx.QueryRow(ctx,
			`INSERT INTO application_commands (id, application_id, hub_id, name, description, options, type, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
			 RETURNING id, application_id, hub_id, name, description, options, type, created_at, updated_at`,
			id, appID, hubID, cmd.Name, cmd.Description, opts, cmdType,
		).Scan(&out.ID, &out.ApplicationID, &out.HubID, &out.Name, &out.Description, &optsRaw, &out.Type, &out.CreatedAt, &out.UpdatedAt)
		if err != nil {
			return nil, err
		}
		_ = json.Unmarshal(optsRaw, &out.Options)
		if out.Options == nil {
			out.Options = []models.ApplicationCommandOption{}
		}
		result = append(result, out)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return result, nil
}

func (r *AppCommandRepo) ListByApplication(ctx context.Context, appID string, hubID *string) ([]models.ApplicationCommand, error) {
	var rows pgxRows
	var err error

	if hubID != nil {
		rows, err = r.db.Query(ctx,
			`SELECT id, application_id, hub_id, name, description, options, type, created_at, updated_at
			 FROM application_commands WHERE application_id = $1 AND hub_id = $2
			 ORDER BY name`, appID, *hubID)
	} else {
		rows, err = r.db.Query(ctx,
			`SELECT id, application_id, hub_id, name, description, options, type, created_at, updated_at
			 FROM application_commands WHERE application_id = $1 AND hub_id IS NULL
			 ORDER BY name`, appID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanCommandRows(rows)
}

func (r *AppCommandRepo) ListByHub(ctx context.Context, hubID string) ([]models.ApplicationCommand, error) {
	rows, err := r.db.Query(ctx,
		`SELECT c.id, c.application_id, c.hub_id, c.name, c.description, c.options, c.type, c.created_at, c.updated_at,
		        u.id, u.username, u.display_name, u.avatar_url
		 FROM application_commands c
		 JOIN applications a ON a.id = c.application_id
		 JOIN hub_members hm ON hm.user_id = a.bot_user_id AND hm.hub_id = $1
		 LEFT JOIN users u ON u.id = a.bot_user_id
		 WHERE c.hub_id IS NULL OR c.hub_id = $1
		 ORDER BY u.username, c.name`, hubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var commands []models.ApplicationCommand
	for rows.Next() {
		var cmd models.ApplicationCommand
		var optsRaw []byte
		var botID, botUsername, botDisplayName *string
		var botAvatarURL *string

		if err := rows.Scan(
			&cmd.ID, &cmd.ApplicationID, &cmd.HubID, &cmd.Name, &cmd.Description, &optsRaw, &cmd.Type, &cmd.CreatedAt, &cmd.UpdatedAt,
			&botID, &botUsername, &botDisplayName, &botAvatarURL,
		); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(optsRaw, &cmd.Options)
		if cmd.Options == nil {
			cmd.Options = []models.ApplicationCommandOption{}
		}
		if botID != nil {
			cmd.Bot = &models.User{
				ID:          *botID,
				Username:    derefStr(botUsername),
				DisplayName: derefStr(botDisplayName),
				AvatarURL:   botAvatarURL,
				IsBot:       true,
			}
		}
		commands = append(commands, cmd)
	}
	if commands == nil {
		commands = []models.ApplicationCommand{}
	}
	return commands, rows.Err()
}

func (r *AppCommandRepo) GetByID(ctx context.Context, commandID string) (*models.ApplicationCommand, error) {
	var cmd models.ApplicationCommand
	var optsRaw []byte
	err := r.db.QueryRow(ctx,
		`SELECT id, application_id, hub_id, name, description, options, type, created_at, updated_at
		 FROM application_commands WHERE id = $1`, commandID,
	).Scan(&cmd.ID, &cmd.ApplicationID, &cmd.HubID, &cmd.Name, &cmd.Description, &optsRaw, &cmd.Type, &cmd.CreatedAt, &cmd.UpdatedAt)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(optsRaw, &cmd.Options)
	if cmd.Options == nil {
		cmd.Options = []models.ApplicationCommandOption{}
	}
	return &cmd, nil
}

func (r *AppCommandRepo) Delete(ctx context.Context, appID, commandID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM application_commands WHERE id = $1 AND application_id = $2`, commandID, appID)
	return err
}

type pgxRows interface {
	Next() bool
	Scan(dest ...interface{}) error
	Close()
	Err() error
}

func scanCommandRows(rows pgxRows) ([]models.ApplicationCommand, error) {
	var commands []models.ApplicationCommand
	for rows.Next() {
		var cmd models.ApplicationCommand
		var optsRaw []byte
		if err := rows.Scan(&cmd.ID, &cmd.ApplicationID, &cmd.HubID, &cmd.Name, &cmd.Description, &optsRaw, &cmd.Type, &cmd.CreatedAt, &cmd.UpdatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(optsRaw, &cmd.Options)
		if cmd.Options == nil {
			cmd.Options = []models.ApplicationCommandOption{}
		}
		commands = append(commands, cmd)
	}
	if commands == nil {
		commands = []models.ApplicationCommand{}
	}
	return commands, rows.Err()
}

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
