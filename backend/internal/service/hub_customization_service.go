package service

import (
	"context"
	"errors"
	"log"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/riftapp-cloud/riftapp/internal/apperror"
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/repository"
)

// FileDeleter removes an object from storage given a public URL like "/s3/bucket/objname".
type FileDeleter interface {
	DeleteByURL(ctx context.Context, fileURL string) error
}

type HubCustomizationService struct {
	repo        *repository.HubCustomizationRepo
	hubRepo     *repository.HubRepo
	rankRepo    *repository.RankRepo
	fileDeleter FileDeleter // nil = skip cleanup
}

func NewHubCustomizationService(repo *repository.HubCustomizationRepo, hubRepo *repository.HubRepo, rankRepo *repository.RankRepo) *HubCustomizationService {
	return &HubCustomizationService{repo: repo, hubRepo: hubRepo, rankRepo: rankRepo}
}

func (s *HubCustomizationService) SetFileDeleter(fd FileDeleter) {
	s.fileDeleter = fd
}

// nameRe allows alphanumeric, underscores, hyphens, and spaces (no leading/trailing).
var nameRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9 _-]{0,30}[a-zA-Z0-9]$`)

func validateName(name string) error {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 32 {
		return apperror.BadRequest("name must be 1-32 characters")
	}
	// Allow single-character names too.
	if len(name) == 1 {
		if !((name[0] >= 'a' && name[0] <= 'z') || (name[0] >= 'A' && name[0] <= 'Z') || (name[0] >= '0' && name[0] <= '9')) {
			return apperror.BadRequest("name must contain only letters, numbers, spaces, hyphens, or underscores")
		}
		return nil
	}
	if !nameRe.MatchString(name) {
		return apperror.BadRequest("name must contain only letters, numbers, spaces, hyphens, or underscores")
	}
	return nil
}

func (s *HubCustomizationService) canManage(ctx context.Context, hubID, userID string) bool {
	role := s.hubRepo.GetMemberRole(ctx, hubID, userID)
	if role == "" {
		return false
	}
	perms := models.RolePermissions[role]
	if s.rankRepo != nil {
		perms |= s.rankRepo.GetMemberRankPermissions(ctx, hubID, userID)
	}
	return models.HasPermission(perms, models.PermManageHub)
}

func (s *HubCustomizationService) deleteFile(ctx context.Context, fileURL string) {
	if s.fileDeleter == nil || fileURL == "" {
		return
	}
	if err := s.fileDeleter.DeleteByURL(ctx, fileURL); err != nil {
		// Best-effort cleanup — never fail the request because of a storage error.
		log.Printf("warning: failed to delete file %s: %v", fileURL, err)
	}
}

// Per-hub limits.
const (
	maxEmojisPerHub   = 50
	maxStickersPerHub = 50
	maxSoundsPerHub   = 20
)

// ── Emojis ──

func (s *HubCustomizationService) ListEmojis(ctx context.Context, hubID, userID string) ([]models.HubEmoji, error) {
	if !s.hubRepo.IsMember(ctx, hubID, userID) {
		return nil, apperror.Forbidden("not a member")
	}
	items, err := s.repo.ListEmojis(ctx, hubID)
	if err != nil {
		return nil, apperror.Internal("failed to list emojis", err)
	}
	return items, nil
}

func (s *HubCustomizationService) CreateEmoji(ctx context.Context, hubID, userID, name, fileURL string) (*models.HubEmoji, error) {
	if !s.canManage(ctx, hubID, userID) {
		return nil, apperror.Forbidden("you do not have permission")
	}
	name = strings.TrimSpace(name)
	if err := validateName(name); err != nil {
		return nil, err
	}
	fileURL = strings.TrimSpace(fileURL)
	if fileURL == "" || len(fileURL) > 512 {
		return nil, apperror.BadRequest("invalid file URL")
	}
	e, err := s.repo.CreateEmojiTx(ctx, hubID, name, fileURL, maxEmojisPerHub)
	if err != nil {
		if errors.Is(err, repository.ErrLimitReached) {
			return nil, apperror.BadRequest("maximum emoji limit reached (50)")
		}
		if apperror.IsDuplicateKey(err, "uq_hub_emojis_name") {
			return nil, apperror.Conflict("an emoji with this name already exists")
		}
		return nil, apperror.Internal("failed to create emoji", err)
	}
	return e, nil
}

func (s *HubCustomizationService) DeleteEmoji(ctx context.Context, hubID, userID, emojiID string) error {
	if !s.canManage(ctx, hubID, userID) {
		return apperror.Forbidden("you do not have permission")
	}
	fileURL, err := s.repo.DeleteEmoji(ctx, hubID, emojiID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("emoji not found")
		}
		return apperror.Internal("failed to delete emoji", err)
	}
	s.deleteFile(ctx, fileURL)
	return nil
}

// ── Stickers ──

func (s *HubCustomizationService) ListStickers(ctx context.Context, hubID, userID string) ([]models.HubSticker, error) {
	if !s.hubRepo.IsMember(ctx, hubID, userID) {
		return nil, apperror.Forbidden("not a member")
	}
	items, err := s.repo.ListStickers(ctx, hubID)
	if err != nil {
		return nil, apperror.Internal("failed to list stickers", err)
	}
	return items, nil
}

func (s *HubCustomizationService) CreateSticker(ctx context.Context, hubID, userID, name, fileURL string) (*models.HubSticker, error) {
	if !s.canManage(ctx, hubID, userID) {
		return nil, apperror.Forbidden("you do not have permission")
	}
	name = strings.TrimSpace(name)
	if err := validateName(name); err != nil {
		return nil, err
	}
	fileURL = strings.TrimSpace(fileURL)
	if fileURL == "" || len(fileURL) > 512 {
		return nil, apperror.BadRequest("invalid file URL")
	}
	st, err := s.repo.CreateStickerTx(ctx, hubID, name, fileURL, maxStickersPerHub)
	if err != nil {
		if errors.Is(err, repository.ErrLimitReached) {
			return nil, apperror.BadRequest("maximum sticker limit reached (50)")
		}
		if apperror.IsDuplicateKey(err, "uq_hub_stickers_name") {
			return nil, apperror.Conflict("a sticker with this name already exists")
		}
		return nil, apperror.Internal("failed to create sticker", err)
	}
	return st, nil
}

func (s *HubCustomizationService) DeleteSticker(ctx context.Context, hubID, userID, stickerID string) error {
	if !s.canManage(ctx, hubID, userID) {
		return apperror.Forbidden("you do not have permission")
	}
	fileURL, err := s.repo.DeleteSticker(ctx, hubID, stickerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("sticker not found")
		}
		return apperror.Internal("failed to delete sticker", err)
	}
	s.deleteFile(ctx, fileURL)
	return nil
}

// ── Sounds ──

func (s *HubCustomizationService) ListSounds(ctx context.Context, hubID, userID string) ([]models.HubSound, error) {
	if !s.hubRepo.IsMember(ctx, hubID, userID) {
		return nil, apperror.Forbidden("not a member")
	}
	items, err := s.repo.ListSounds(ctx, hubID)
	if err != nil {
		return nil, apperror.Internal("failed to list sounds", err)
	}
	return items, nil
}

func (s *HubCustomizationService) CreateSound(ctx context.Context, hubID, userID, name, fileURL string) (*models.HubSound, error) {
	if !s.canManage(ctx, hubID, userID) {
		return nil, apperror.Forbidden("you do not have permission")
	}
	name = strings.TrimSpace(name)
	if err := validateName(name); err != nil {
		return nil, err
	}
	fileURL = strings.TrimSpace(fileURL)
	if fileURL == "" || len(fileURL) > 512 {
		return nil, apperror.BadRequest("invalid file URL")
	}
	snd, err := s.repo.CreateSoundTx(ctx, hubID, name, fileURL, maxSoundsPerHub)
	if err != nil {
		if errors.Is(err, repository.ErrLimitReached) {
			return nil, apperror.BadRequest("maximum sound limit reached (20)")
		}
		if apperror.IsDuplicateKey(err, "uq_hub_sounds_name") {
			return nil, apperror.Conflict("a sound with this name already exists")
		}
		return nil, apperror.Internal("failed to create sound", err)
	}
	return snd, nil
}

func (s *HubCustomizationService) DeleteSound(ctx context.Context, hubID, userID, soundID string) error {
	if !s.canManage(ctx, hubID, userID) {
		return apperror.Forbidden("you do not have permission")
	}
	fileURL, err := s.repo.DeleteSound(ctx, hubID, soundID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("sound not found")
		}
		return apperror.Internal("failed to delete sound", err)
	}
	s.deleteFile(ctx, fileURL)
	return nil
}
