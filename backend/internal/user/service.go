package user

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/riptide-cloud/riptide/internal/models"
)

// Validation limits
const (
	UsernameMinLen    = 2
	UsernameMaxLen    = 32
	DisplayNameMaxLen = 64
	BioMaxLen         = 190
	AvatarURLMaxLen   = 512
)

var (
	ErrUsernameTooShort = errors.New("username must be at least 2 characters")
	ErrUsernameTooLong  = errors.New("username must be at most 32 characters")
	ErrUsernameInvalid  = errors.New("username may only contain letters, numbers, underscores, and hyphens")
	ErrUsernameTaken    = errors.New("username is already taken")
	ErrDisplayNameTooLong = errors.New("display name must be at most 64 characters")
	ErrBioTooLong       = errors.New("bio must be at most 190 characters")
	ErrAvatarURLTooLong = errors.New("avatar url must be at most 512 characters")
	ErrNothingToUpdate  = errors.New("no fields to update")
)

// Service contains user profile business logic.
type Service struct {
	repo *Repo
}

func NewService(repo *Repo) *Service {
	return &Service{repo: repo}
}

// GetProfile returns the full profile for a user by ID.
func (s *Service) GetProfile(ctx context.Context, userID string) (*models.User, error) {
	return s.repo.GetByID(ctx, userID)
}

// SearchByUsername returns a user whose username matches the given string (case-insensitive).
func (s *Service) SearchByUsername(ctx context.Context, username string) (*models.User, error) {
	return s.repo.GetByUsername(ctx, username)
}

// UpdateProfileInput is the JSON shape accepted from the client.
type UpdateProfileInput struct {
	Username    *string `json:"username,omitempty"`
	DisplayName *string `json:"display_name,omitempty"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
	Bio         *string `json:"bio,omitempty"`
}

// UpdateProfile validates and persists profile changes.
func (s *Service) UpdateProfile(ctx context.Context, userID string, input UpdateProfileInput) (*models.User, error) {
	update := ProfileUpdate{}
	hasChange := false

	if input.Username != nil {
		u := strings.TrimSpace(*input.Username)
		if err := validateUsername(u); err != nil {
			return nil, err
		}
		taken, err := s.repo.UsernameExists(ctx, u, userID)
		if err != nil {
			return nil, err
		}
		if taken {
			return nil, ErrUsernameTaken
		}
		update.Username = &u
		hasChange = true
	}

	if input.DisplayName != nil {
		dn := strings.TrimSpace(*input.DisplayName)
		if utf8.RuneCountInString(dn) > DisplayNameMaxLen {
			return nil, ErrDisplayNameTooLong
		}
		update.DisplayName = &dn
		hasChange = true
	}

	if input.AvatarURL != nil {
		av := strings.TrimSpace(*input.AvatarURL)
		if len(av) > AvatarURLMaxLen {
			return nil, ErrAvatarURLTooLong
		}
		update.AvatarURL = &av
		hasChange = true
	}

	if input.Bio != nil {
		b := strings.TrimSpace(*input.Bio)
		if utf8.RuneCountInString(b) > BioMaxLen {
			return nil, ErrBioTooLong
		}
		update.Bio = &b
		hasChange = true
	}

	if !hasChange {
		return nil, ErrNothingToUpdate
	}

	return s.repo.UpdateProfile(ctx, userID, update)
}

func validateUsername(u string) error {
	n := utf8.RuneCountInString(u)
	if n < UsernameMinLen {
		return ErrUsernameTooShort
	}
	if n > UsernameMaxLen {
		return ErrUsernameTooLong
	}
	for _, r := range u {
		if !isUsernameRune(r) {
			return ErrUsernameInvalid
		}
	}
	return nil
}

func isUsernameRune(r rune) bool {
	return (r >= 'a' && r <= 'z') ||
		(r >= 'A' && r <= 'Z') ||
		(r >= '0' && r <= '9') ||
		r == '_' || r == '-'
}
