package service

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

type FriendService struct {
	friendRepo *repository.FriendshipRepo
	blockRepo  *repository.BlockRepo
	hub        *ws.Hub
}

func NewFriendService(fr *repository.FriendshipRepo, br *repository.BlockRepo, hub *ws.Hub) *FriendService {
	return &FriendService{friendRepo: fr, blockRepo: br, hub: hub}
}

func (s *FriendService) SendRequest(ctx context.Context, requesterID, targetID string) error {
	if requesterID == targetID {
		return errors.New("cannot friend yourself")
	}

	blocked, err := s.blockRepo.EitherBlocked(ctx, requesterID, targetID)
	if err != nil {
		return err
	}
	if blocked {
		return errors.New("cannot send request to this user")
	}

	existing, err := s.friendRepo.Get(ctx, requesterID, targetID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if existing != nil {
		if existing.Status == 1 {
			return errors.New("already friends")
		}
		return errors.New("friend request already pending")
	}

	if err := s.friendRepo.Create(ctx, requesterID, targetID); err != nil {
		return err
	}

	s.hub.SendToUser(targetID, ws.NewEvent(ws.OpFriendRequest, map[string]string{
		"user_id": requesterID,
	}))
	return nil
}

func (s *FriendService) AcceptRequest(ctx context.Context, userID, requesterID string) error {
	existing, err := s.friendRepo.Get(ctx, requesterID, userID)
	if err != nil {
		return errors.New("no pending request found")
	}
	if existing.Status != 0 || existing.UserID != requesterID || existing.FriendID != userID {
		return errors.New("no pending request from this user")
	}

	if err := s.friendRepo.Accept(ctx, requesterID, userID); err != nil {
		return err
	}

	s.hub.SendToUser(requesterID, ws.NewEvent(ws.OpFriendAccept, map[string]string{
		"user_id": userID,
	}))
	return nil
}

func (s *FriendService) RejectRequest(ctx context.Context, userID, requesterID string) error {
	existing, err := s.friendRepo.Get(ctx, requesterID, userID)
	if err != nil {
		return errors.New("no pending request found")
	}
	if existing.Status != 0 || existing.UserID != requesterID || existing.FriendID != userID {
		return errors.New("no pending request from this user")
	}

	return s.friendRepo.Delete(ctx, requesterID, userID)
}

func (s *FriendService) CancelRequest(ctx context.Context, requesterID, targetID string) error {
	existing, err := s.friendRepo.Get(ctx, requesterID, targetID)
	if err != nil {
		return errors.New("no pending request found")
	}
	if existing.Status != 0 || existing.UserID != requesterID {
		return errors.New("no outgoing request to this user")
	}

	return s.friendRepo.Delete(ctx, requesterID, targetID)
}

func (s *FriendService) RemoveFriend(ctx context.Context, userID, friendID string) error {
	existing, err := s.friendRepo.Get(ctx, userID, friendID)
	if err != nil {
		return errors.New("not friends")
	}
	if existing.Status != 1 {
		return errors.New("not friends")
	}

	if err := s.friendRepo.Delete(ctx, userID, friendID); err != nil {
		return err
	}

	s.hub.SendToUser(friendID, ws.NewEvent(ws.OpFriendRemove, map[string]string{
		"user_id": userID,
	}))
	return nil
}

func (s *FriendService) ListFriends(ctx context.Context, userID string) ([]models.Friendship, error) {
	return s.friendRepo.ListFriends(ctx, userID)
}

func (s *FriendService) ListPendingIncoming(ctx context.Context, userID string) ([]models.Friendship, error) {
	return s.friendRepo.ListPendingIncoming(ctx, userID)
}

func (s *FriendService) ListPendingOutgoing(ctx context.Context, userID string) ([]models.Friendship, error) {
	return s.friendRepo.ListPendingOutgoing(ctx, userID)
}

func (s *FriendService) CountPending(ctx context.Context, userID string) (int, error) {
	return s.friendRepo.CountPendingIncoming(ctx, userID)
}

func (s *FriendService) Block(ctx context.Context, blockerID, blockedID string) error {
	if blockerID == blockedID {
		return errors.New("cannot block yourself")
	}

	// Remove any existing friendship
	_ = s.friendRepo.Delete(ctx, blockerID, blockedID)

	if err := s.blockRepo.Create(ctx, blockerID, blockedID); err != nil {
		return err
	}
	return nil
}

func (s *FriendService) Unblock(ctx context.Context, blockerID, blockedID string) error {
	return s.blockRepo.Delete(ctx, blockerID, blockedID)
}

func (s *FriendService) ListBlocked(ctx context.Context, userID string) ([]models.Block, error) {
	return s.blockRepo.List(ctx, userID)
}

func (s *FriendService) GetRelationship(ctx context.Context, userID, targetID string) (string, error) {
	blocked, _ := s.blockRepo.IsBlocked(ctx, userID, targetID)
	if blocked {
		return "blocked", nil
	}
	blockedBy, _ := s.blockRepo.IsBlocked(ctx, targetID, userID)
	if blockedBy {
		return "blocked_by", nil
	}

	f, err := s.friendRepo.Get(ctx, userID, targetID)
	if err != nil {
		return "none", nil
	}
	if f.Status == 1 {
		return "friends", nil
	}
	if f.UserID == userID {
		return "pending_outgoing", nil
	}
	return "pending_incoming", nil
}
