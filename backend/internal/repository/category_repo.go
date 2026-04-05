package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riftapp-cloud/riftapp/internal/models"
)

type CategoryRepo struct {
	db *pgxpool.Pool
}

func NewCategoryRepo(db *pgxpool.Pool) *CategoryRepo {
	return &CategoryRepo{db: db}
}

func (r *CategoryRepo) Create(ctx context.Context, hubID, name string) (*models.Category, error) {
	var c models.Category
	err := r.db.QueryRow(ctx,
		`INSERT INTO categories (hub_id, name, position)
		 VALUES ($1, $2, COALESCE((SELECT MAX(position) FROM categories WHERE hub_id = $1), -1) + 1)
		 RETURNING id, hub_id, name, position, created_at`,
		hubID, name,
	).Scan(&c.ID, &c.HubID, &c.Name, &c.Position, &c.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *CategoryRepo) List(ctx context.Context, hubID string) ([]models.Category, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, hub_id, name, position, created_at FROM categories WHERE hub_id = $1 ORDER BY position`,
		hubID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []models.Category
	for rows.Next() {
		var c models.Category
		if err := rows.Scan(&c.ID, &c.HubID, &c.Name, &c.Position, &c.CreatedAt); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, nil
}

func (r *CategoryRepo) Delete(ctx context.Context, categoryID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM categories WHERE id = $1`, categoryID)
	return err
}

// BulkUpdatePositions updates position for multiple categories in a single transaction.
func (r *CategoryRepo) BulkUpdatePositions(ctx context.Context, hubID string, items []struct {
	ID       string
	Position int
}) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, item := range items {
		_, err := tx.Exec(ctx,
			`UPDATE categories SET position = $1 WHERE id = $2 AND hub_id = $3`,
			item.Position, item.ID, hubID,
		)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
