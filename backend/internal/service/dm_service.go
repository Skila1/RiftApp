package service

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/riftapp-cloud/riftapp/internal/apperror"
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/moderation"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

type DMService struct {
	dmRepo   *repository.DMRepo
	msgRepo  *repository.MessageRepo
	notifSvc *NotificationService
	hub      *ws.Hub
	modSvc   *moderation.Service
}

func NewDMService(dmRepo *repository.DMRepo, msgRepo *repository.MessageRepo, notifSvc *NotificationService, hub *ws.Hub) *DMService {
	svc := &DMService{dmRepo: dmRepo, msgRepo: msgRepo, notifSvc: notifSvc, hub: hub}
	if hub != nil {
		hub.SetConversationCallHistoryRecorder(svc)
	}
	return svc
}

func (s *DMService) SetModerationService(mod *moderation.Service) {
	s.modSvc = mod
}

func (s *DMService) IsMember(ctx context.Context, convID, userID string) (bool, error) {
	return s.dmRepo.IsMember(ctx, convID, userID)
}

func (s *DMService) StartConversationCallRing(ctx context.Context, userID, convID, mode string) (ws.DMConversationCallStateData, error) {
	if s.hub == nil {
		return ws.DMConversationCallStateData{}, apperror.Internal("DM call state unavailable", fmt.Errorf("websocket hub unavailable"))
	}

	normalizedMode := strings.ToLower(strings.TrimSpace(mode))
	if normalizedMode != "audio" && normalizedMode != "video" {
		return ws.DMConversationCallStateData{}, apperror.BadRequest("mode must be audio or video")
	}

	isMember, err := s.dmRepo.IsMember(ctx, convID, userID)
	if err != nil {
		return ws.DMConversationCallStateData{}, apperror.Internal("internal error", err)
	}
	if !isMember {
		return ws.DMConversationCallStateData{}, apperror.Forbidden("not a member of this conversation")
	}

	state, started := s.hub.StartConversationCallRing(convID, userID, normalizedMode)
	if started {
		if err := s.createConversationCallStartedMessage(ctx, convID, userID, normalizedMode); err != nil {
			log.Printf("dm: failed to create call-start system message for conversation %s: %v", convID, err)
		}
		if s.notifSvc != nil && state.Ring != nil && len(state.Ring.TargetUserIDs) > 0 {
			s.pushConversationCallStart(convID, userID, *state.Ring)
		}
	}
	return state, nil
}

func (s *DMService) CancelConversationCallRing(ctx context.Context, userID, convID string) error {
	if s.hub == nil {
		return apperror.Internal("DM call state unavailable", fmt.Errorf("websocket hub unavailable"))
	}

	isMember, err := s.dmRepo.IsMember(ctx, convID, userID)
	if err != nil {
		return apperror.Internal("internal error", err)
	}
	if !isMember {
		return apperror.Forbidden("not a member of this conversation")
	}

	s.hub.CancelConversationCallRing(convID, userID, "cancelled")
	return nil
}

func (s *DMService) DeclineConversationCallRing(ctx context.Context, userID, convID string) error {
	if s.hub == nil {
		return apperror.Internal("DM call state unavailable", fmt.Errorf("websocket hub unavailable"))
	}

	isMember, err := s.dmRepo.IsMember(ctx, convID, userID)
	if err != nil {
		return apperror.Internal("internal error", err)
	}
	if !isMember {
		return apperror.Forbidden("not a member of this conversation")
	}

	s.hub.DeclineConversationCallRing(convID, userID)
	return nil
}

func (s *DMService) ListConversationCallStates(ctx context.Context, userID string) ([]ws.DMConversationCallStateData, error) {
	if s.hub == nil {
		return []ws.DMConversationCallStateData{}, nil
	}

	states, err := s.hub.GetConversationCallStatesForUser(ctx, userID)
	if err != nil {
		return nil, apperror.Internal("failed to load DM call states", err)
	}
	if states == nil {
		states = []ws.DMConversationCallStateData{}
	}
	return states, nil
}

func displayUserLabel(user *models.User) string {
	if user == nil {
		return "Someone"
	}
	if displayName := strings.TrimSpace(user.DisplayName); displayName != "" {
		return displayName
	}
	if username := strings.TrimSpace(user.Username); username != "" {
		return username
	}
	return "Someone"
}

func callModeLabel(mode string) string {
	if strings.EqualFold(mode, "video") {
		return "Video call"
	}
	return "Voice call"
}

func callPushBody(conversation *models.Conversation, mode string) string {
	modeLabel := callModeLabel(mode)
	if conversation == nil || !conversation.IsGroup {
		return modeLabel
	}
	if conversation.Name != nil {
		if name := strings.TrimSpace(*conversation.Name); name != "" {
			return name + " • " + modeLabel
		}
	}
	return "Group DM • " + modeLabel
}

func conversationCallStartedSystemType(mode string) string {
	if strings.EqualFold(mode, "video") {
		return models.MessageSystemTypeConversationVideoCallStarted
	}
	return models.MessageSystemTypeConversationCallStarted
}

func conversationCallMissedSystemType(mode string) string {
	if strings.EqualFold(mode, "video") {
		return models.MessageSystemTypeConversationVideoCallMissed
	}
	return models.MessageSystemTypeConversationCallMissed
}

func conversationCallDeclinedSystemType(mode string) string {
	if strings.EqualFold(mode, "video") {
		return models.MessageSystemTypeConversationVideoCallDeclined
	}
	return models.MessageSystemTypeConversationCallDeclined
}

func conversationCallEndedSystemType(mode string) string {
	if strings.EqualFold(mode, "video") {
		return models.MessageSystemTypeConversationVideoCallEnded
	}
	return models.MessageSystemTypeConversationCallEnded
}

func conversationCallSystemMessageContent(systemType string) string {
	switch systemType {
	case models.MessageSystemTypeConversationVideoCallStarted:
		return "Started a video call"
	case models.MessageSystemTypeConversationCallStarted:
		return "Started a call"
	case models.MessageSystemTypeConversationVideoCallMissed:
		return "Missed a video call"
	case models.MessageSystemTypeConversationCallMissed:
		return "Missed a call"
	case models.MessageSystemTypeConversationVideoCallDeclined:
		return "Video call declined"
	case models.MessageSystemTypeConversationCallDeclined:
		return "Call declined"
	case models.MessageSystemTypeConversationVideoCallEnded:
		return "Video call ended"
	case models.MessageSystemTypeConversationCallEnded:
		return "Call ended"
	default:
		return "Call updated"
	}
}

func formatConversationCallDurationLabel(startedAt *time.Time, endedAt time.Time) string {
	if startedAt == nil || startedAt.IsZero() || endedAt.IsZero() {
		return ""
	}
	duration := endedAt.Sub(*startedAt)
	if duration < 0 {
		duration = 0
	}
	secondsTotal := int(duration.Round(time.Second).Seconds())
	if secondsTotal < 1 {
		secondsTotal = 1
	}
	hours := secondsTotal / 3600
	minutes := (secondsTotal % 3600) / 60
	seconds := secondsTotal % 60

	if hours > 0 {
		if minutes > 0 {
			return fmt.Sprintf("%dh %02dm", hours, minutes)
		}
		return fmt.Sprintf("%dh", hours)
	}
	if minutes > 0 {
		if seconds > 0 {
			return fmt.Sprintf("%dm %02ds", minutes, seconds)
		}
		return fmt.Sprintf("%dm", minutes)
	}
	return fmt.Sprintf("%ds", seconds)
}

func conversationCallEndedMessageContent(mode string, startedAt *time.Time, endedAt time.Time) string {
	prefix := "Call ended"
	if strings.EqualFold(mode, "video") {
		prefix = "Video call ended"
	}
	if durationLabel := formatConversationCallDurationLabel(startedAt, endedAt); durationLabel != "" {
		return prefix + " after " + durationLabel
	}
	return prefix
}

func (s *DMService) createConversationCallSystemMessage(ctx context.Context, convID, userID, systemType, content string) error {
	trimmedContent := strings.TrimSpace(content)
	if trimmedContent == "" {
		trimmedContent = conversationCallSystemMessageContent(systemType)
	}
	msg := &models.Message{
		ID:             uuid.New().String(),
		ConversationID: &convID,
		AuthorID:       userID,
		SystemType:     &systemType,
		Content:        trimmedContent,
		CreatedAt:      time.Now(),
	}

	if err := s.msgRepo.Create(ctx, msg); err != nil {
		return err
	}

	_ = s.dmRepo.UpdateConversationTimestamp(ctx, convID, msg.CreatedAt)

	msg, err := s.loadDetailedMessage(ctx, msg.ID)
	if err != nil {
		return err
	}

	evt := ws.NewEvent(ws.OpDMMessageCreate, msg)
	s.hub.SendToUser(userID, evt)
	others, _ := s.dmRepo.GetOtherMembers(ctx, convID, userID)
	for _, uid := range others {
		s.hub.SendToUser(uid, evt)
	}

	return nil
}

func (s *DMService) createConversationCallStartedMessage(ctx context.Context, convID, userID, mode string) error {
	return s.createConversationCallSystemMessage(ctx, convID, userID, conversationCallStartedSystemType(mode), "")
}

func (s *DMService) RecordConversationCallRingEnd(data ws.DMCallRingEndData) {
	if strings.TrimSpace(data.ConversationID) == "" {
		return
	}

	var systemType string
	authorID := strings.TrimSpace(data.InitiatorID)
	switch data.Reason {
	case "timeout":
		systemType = conversationCallMissedSystemType(data.Mode)
	case "declined":
		systemType = conversationCallDeclinedSystemType(data.Mode)
		if endedBy := strings.TrimSpace(data.EndedByUserID); endedBy != "" {
			authorID = endedBy
		}
	default:
		return
	}

	if authorID == "" {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := s.createConversationCallSystemMessage(ctx, data.ConversationID, authorID, systemType, ""); err != nil {
		log.Printf("dm: failed to create %s system message for conversation %s: %v", data.Reason, data.ConversationID, err)
	}
}

func (s *DMService) RecordConversationCallEnded(data ws.DMConversationCallEndedData) {
	if strings.TrimSpace(data.ConversationID) == "" {
		return
	}
	authorID := strings.TrimSpace(data.EndedByUserID)
	if authorID == "" {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	content := conversationCallEndedMessageContent(data.Mode, data.StartedAt, data.EndedAt)
	if err := s.createConversationCallSystemMessage(ctx, data.ConversationID, authorID, conversationCallEndedSystemType(data.Mode), content); err != nil {
		log.Printf("dm: failed to create call-ended system message for conversation %s: %v", data.ConversationID, err)
	}
}

func (s *DMService) pushConversationCallStart(convID, userID string, ring ws.DMCallRingData) {
	go func() {
		lookupCtx, cancelLookup := context.WithTimeout(context.Background(), 5*time.Second)

		caller, err := s.dmRepo.GetUserInfo(lookupCtx, userID)
		if err != nil {
			caller = nil
		}
		conversation, err := s.dmRepo.GetConversation(lookupCtx, convID)
		if err != nil {
			conversation = nil
		}
		cancelLookup()

		title := displayUserLabel(caller) + " is calling"
		body := callPushBody(conversation, ring.Mode)
		pushCtx, cancelPush := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancelPush()

		if err := s.notifSvc.PushUsers(pushCtx, ring.TargetUserIDs, PushPayload{
			Title: title,
			Body:  body,
			Data: map[string]string{
				"type":            "dm_call",
				"conversation_id": convID,
				"initiator_id":    userID,
				"mode":            ring.Mode,
			},
			CollapseKey: "dm_call_" + convID,
		}); err != nil {
			log.Printf("push: enqueue dm call notifications failed for conversation %s: %v", convID, err)
		}
	}()
}

func (s *DMService) ListConversations(ctx context.Context, userID string) ([]repository.ConvResponse, error) {
	convos, err := s.dmRepo.ListConversations(ctx, userID)
	if err != nil {
		return nil, apperror.Internal("internal error", err)
	}

	if len(convos) > 0 {
		convoIDs := make([]string, len(convos))
		for i := range convos {
			convoIDs[i] = convos[i].ID
		}
		lastMsgs, err := s.dmRepo.FetchLastMessages(ctx, convoIDs)
		if err == nil {
			for i := range convos {
				if msg, ok := lastMsgs[convos[i].ID]; ok {
					convos[i].LastMessage = &msg
				}
			}
		}
	}

	return convos, nil
}

func (s *DMService) CreateOrOpen(ctx context.Context, userID, recipientID string) (repository.ConvResponse, bool, error) {
	if recipientID == "" {
		return repository.ConvResponse{}, false, apperror.BadRequest("recipient_id is required")
	}
	if recipientID == userID {
		return repository.ConvResponse{}, false, apperror.BadRequest("cannot DM yourself")
	}

	return s.createOrOpenConversation(ctx, userID, []string{recipientID}, false)
}

func (s *DMService) CreateOrOpenGroup(ctx context.Context, userID string, memberIDs []string) (repository.ConvResponse, bool, error) {
	return s.createOrOpenConversation(ctx, userID, memberIDs, true)
}

type PatchConversationInput struct {
	NameSet    bool
	Name       *string
	IconURLSet bool
	IconURL    *string
}

func (s *DMService) createOrOpenConversation(ctx context.Context, userID string, requestedMemberIDs []string, requireGroup bool) (repository.ConvResponse, bool, error) {
	memberIDs, err := normalizeConversationMembers(userID, requestedMemberIDs)
	if err != nil {
		return repository.ConvResponse{}, false, err
	}
	if requireGroup && len(memberIDs) < 3 {
		return repository.ConvResponse{}, false, apperror.BadRequest("group DMs require at least 3 members")
	}

	for _, memberID := range memberIDs {
		if memberID == userID {
			continue
		}
		exists, lookupErr := s.dmRepo.UserExists(ctx, memberID)
		if lookupErr != nil {
			return repository.ConvResponse{}, false, apperror.Internal("internal error", lookupErr)
		}
		if !exists {
			return repository.ConvResponse{}, false, apperror.NotFound("user not found")
		}
	}

	tx, err := s.dmRepo.BeginTx(ctx)
	if err != nil {
		return repository.ConvResponse{}, false, apperror.Internal("internal error", err)
	}
	defer tx.Rollback(ctx)

	lockKey := repository.AdvisoryConversationLockKey(memberIDs)
	tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, lockKey)

	existingID, err := s.dmRepo.FindConversationByMembers(ctx, tx, memberIDs)
	if err == nil {
		tx.Rollback(ctx)
		response, buildErr := s.buildConversationResponse(ctx, existingID, userID)
		if buildErr != nil {
			return repository.ConvResponse{}, false, buildErr
		}
		return response, false, nil
	}
	if err != pgx.ErrNoRows {
		return repository.ConvResponse{}, false, apperror.Internal("internal error", err)
	}

	convID := uuid.New().String()
	now := time.Now()

	if err := s.dmRepo.CreateConversation(ctx, tx, convID, memberIDs, now, requireGroup); err != nil {
		return repository.ConvResponse{}, false, apperror.Internal("failed to create conversation", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return repository.ConvResponse{}, false, apperror.Internal("internal error", err)
	}
	if s.hub != nil {
		s.hub.SetConversationMembers(convID, memberIDs)
	}

	members, err := s.dmRepo.GetUsersInfo(ctx, memberIDs)
	if err != nil {
		return repository.ConvResponse{}, false, apperror.Internal("internal error", err)
	}
	sort.SliceStable(members, func(i, j int) bool {
		return indexOfMember(memberIDs, members[i].ID) < indexOfMember(memberIDs, members[j].ID)
	})

	conversation := models.Conversation{
		ID:        convID,
		CreatedAt: now,
		UpdatedAt: now,
		IsGroup:   requireGroup,
	}

	for _, memberID := range memberIDs {
		if memberID == userID {
			continue
		}
		payload := buildConversationPayload(conversation, members, memberID)
		s.hub.SendToUser(memberID, ws.NewEvent(ws.OpDMConversationCreate, payload))
	}

	return buildConversationPayload(conversation, members, userID), true, nil
}

func (s *DMService) PatchConversation(ctx context.Context, userID, convID string, input PatchConversationInput) (repository.ConvResponse, error) {
	conversation, err := s.dmRepo.GetConversation(ctx, convID)
	if err != nil {
		return repository.ConvResponse{}, apperror.NotFound("conversation not found")
	}
	isMember, memberErr := s.dmRepo.IsMember(ctx, convID, userID)
	if memberErr != nil {
		return repository.ConvResponse{}, apperror.Internal("internal error", memberErr)
	}
	if !isMember {
		return repository.ConvResponse{}, apperror.Forbidden("not a member of this conversation")
	}
	if !conversation.IsGroup {
		return repository.ConvResponse{}, apperror.BadRequest("only group DMs can be updated")
	}
	if !input.NameSet && !input.IconURLSet {
		return repository.ConvResponse{}, apperror.BadRequest("no conversation updates provided")
	}

	normalizedName, err := normalizeConversationMetadataValue(input.NameSet, input.Name, 100)
	if err != nil {
		return repository.ConvResponse{}, err
	}
	normalizedIconURL, err := normalizeConversationMetadataValue(input.IconURLSet, input.IconURL, 2048)
	if err != nil {
		return repository.ConvResponse{}, err
	}

	now := time.Now()
	if err := s.dmRepo.UpdateConversationMetadata(ctx, convID, input.NameSet, normalizedName, input.IconURLSet, normalizedIconURL, now); err != nil {
		return repository.ConvResponse{}, apperror.Internal("failed to update conversation", err)
	}

	response, err := s.buildConversationResponse(ctx, convID, userID)
	if err != nil {
		return repository.ConvResponse{}, err
	}
	if broadcastErr := s.broadcastConversationUpdate(ctx, convID); broadcastErr != nil {
		return repository.ConvResponse{}, broadcastErr
	}
	return response, nil
}

func (s *DMService) AddMembers(ctx context.Context, userID, convID string, memberIDs []string) (repository.ConvResponse, error) {
	conversation, err := s.dmRepo.GetConversation(ctx, convID)
	if err != nil {
		return repository.ConvResponse{}, apperror.NotFound("conversation not found")
	}
	isMember, memberErr := s.dmRepo.IsMember(ctx, convID, userID)
	if memberErr != nil {
		return repository.ConvResponse{}, apperror.Internal("internal error", memberErr)
	}
	if !isMember {
		return repository.ConvResponse{}, apperror.Forbidden("not a member of this conversation")
	}
	if !conversation.IsGroup {
		return repository.ConvResponse{}, apperror.BadRequest("only group DMs can add members")
	}

	existingMembers, err := s.dmRepo.GetAllMembers(ctx, convID)
	if err != nil {
		return repository.ConvResponse{}, apperror.Internal("internal error", err)
	}
	existingSet := make(map[string]struct{}, len(existingMembers))
	for _, memberID := range existingMembers {
		existingSet[memberID] = struct{}{}
	}

	newMemberIDs := make([]string, 0, len(memberIDs))
	for _, memberID := range memberIDs {
		memberID = strings.TrimSpace(memberID)
		if memberID == "" {
			continue
		}
		if _, exists := existingSet[memberID]; exists {
			continue
		}
		exists, lookupErr := s.dmRepo.UserExists(ctx, memberID)
		if lookupErr != nil {
			return repository.ConvResponse{}, apperror.Internal("internal error", lookupErr)
		}
		if !exists {
			return repository.ConvResponse{}, apperror.NotFound("user not found")
		}
		existingSet[memberID] = struct{}{}
		newMemberIDs = append(newMemberIDs, memberID)
	}

	if len(newMemberIDs) == 0 {
		return s.buildConversationResponse(ctx, convID, userID)
	}

	tx, err := s.dmRepo.BeginTx(ctx)
	if err != nil {
		return repository.ConvResponse{}, apperror.Internal("internal error", err)
	}
	defer tx.Rollback(ctx)

	now := time.Now()
	if err := s.dmRepo.AddConversationMembers(ctx, tx, convID, newMemberIDs, now); err != nil {
		return repository.ConvResponse{}, apperror.Internal("failed to add conversation members", err)
	}
	if err := s.dmRepo.UpdateConversationTimestampTx(ctx, tx, convID, now); err != nil {
		return repository.ConvResponse{}, apperror.Internal("failed to update conversation", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return repository.ConvResponse{}, apperror.Internal("internal error", err)
	}
	if s.hub != nil {
		memberSnapshot := make([]string, 0, len(existingSet))
		for memberID := range existingSet {
			memberSnapshot = append(memberSnapshot, memberID)
		}
		s.hub.SetConversationMembers(convID, memberSnapshot)
	}

	response, err := s.buildConversationResponse(ctx, convID, userID)
	if err != nil {
		return repository.ConvResponse{}, err
	}
	if err := s.broadcastConversationMembershipChange(ctx, convID, newMemberIDs); err != nil {
		return repository.ConvResponse{}, err
	}
	return response, nil
}

func (s *DMService) RemoveMember(ctx context.Context, userID, convID, targetUserID string) error {
	conversation, err := s.dmRepo.GetConversation(ctx, convID)
	if err != nil {
		return apperror.NotFound("conversation not found")
	}
	isMember, memberErr := s.dmRepo.IsMember(ctx, convID, userID)
	if memberErr != nil {
		return apperror.Internal("internal error", memberErr)
	}
	if !isMember {
		return apperror.Forbidden("not a member of this conversation")
	}
	if !conversation.IsGroup {
		return apperror.BadRequest("only group DMs can remove members")
	}
	targetIsMember, targetErr := s.dmRepo.IsMember(ctx, convID, targetUserID)
	if targetErr != nil {
		return apperror.Internal("internal error", targetErr)
	}
	if !targetIsMember {
		return apperror.NotFound("conversation member not found")
	}

	tx, err := s.dmRepo.BeginTx(ctx)
	if err != nil {
		return apperror.Internal("internal error", err)
	}
	defer tx.Rollback(ctx)

	if err := s.dmRepo.RemoveConversationMember(ctx, tx, convID, targetUserID); err != nil {
		return apperror.Internal("failed to remove conversation member", err)
	}

	remainingCount, err := s.dmRepo.CountConversationMembers(ctx, tx, convID)
	if err != nil {
		return apperror.Internal("internal error", err)
	}

	remainingMembers, err := s.dmRepo.GetAllMembersTx(ctx, tx, convID)
	if err != nil {
		return apperror.Internal("internal error", err)
	}

	if remainingCount < 2 {
		if err := s.dmRepo.DeleteConversation(ctx, tx, convID); err != nil {
			return apperror.Internal("failed to delete conversation", err)
		}
	} else {
		if err := s.dmRepo.UpdateConversationTimestampTx(ctx, tx, convID, time.Now()); err != nil {
			return apperror.Internal("failed to update conversation", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return apperror.Internal("internal error", err)
	}
	if s.hub != nil {
		if remainingCount < 2 {
			s.hub.ClearConversationMembers(convID)
		} else {
			s.hub.SetConversationMembers(convID, remainingMembers)
		}
	}

	s.hub.SendToUser(targetUserID, ws.NewEvent(ws.OpDMConversationDelete, ws.DMConversationDeleteData{ConversationID: convID}))
	if remainingCount < 2 {
		for _, remainingMemberID := range remainingMembers {
			s.hub.SendToUser(remainingMemberID, ws.NewEvent(ws.OpDMConversationDelete, ws.DMConversationDeleteData{ConversationID: convID}))
		}
		return nil
	}

	if err := s.broadcastConversationUpdate(ctx, convID); err != nil {
		return err
	}
	return nil
}

func (s *DMService) LeaveConversation(ctx context.Context, userID, convID string) error {
	return s.RemoveMember(ctx, userID, convID, userID)
}

func buildConversationPayload(conversation models.Conversation, members []models.User, viewerUserID string) repository.ConvResponse {
	memberCopy := append([]models.User(nil), members...)
	conversation.Members = memberCopy
	return repository.ConvResponse{
		Conversation: conversation,
		Recipient:    pickConversationRecipient(memberCopy, viewerUserID),
	}
}

func pickConversationRecipient(members []models.User, viewerUserID string) models.User {
	for _, member := range members {
		if member.ID != viewerUserID {
			return member
		}
	}
	if len(members) > 0 {
		return members[0]
	}
	return models.User{}
}

func normalizeConversationMembers(userID string, requestedMemberIDs []string) ([]string, error) {
	seen := map[string]struct{}{userID: {}}
	memberIDs := []string{userID}
	for _, memberID := range requestedMemberIDs {
		if memberID == "" {
			continue
		}
		if memberID == userID {
			continue
		}
		if _, exists := seen[memberID]; exists {
			continue
		}
		seen[memberID] = struct{}{}
		memberIDs = append(memberIDs, memberID)
	}
	if len(memberIDs) < 2 {
		return nil, apperror.BadRequest("at least one recipient is required")
	}
	return memberIDs, nil
}

func indexOfMember(memberIDs []string, target string) int {
	for index, memberID := range memberIDs {
		if memberID == target {
			return index
		}
	}
	return len(memberIDs)
}

func (s *DMService) buildConversationResponse(ctx context.Context, convID, viewerUserID string) (repository.ConvResponse, error) {
	conversation, err := s.dmRepo.GetConversation(ctx, convID)
	if err != nil {
		return repository.ConvResponse{}, apperror.Internal("internal error", err)
	}
	members, err := s.dmRepo.GetConversationMembersDetailed(ctx, convID)
	if err != nil {
		return repository.ConvResponse{}, apperror.Internal("internal error", err)
	}
	conversation.Members = members
	return buildConversationPayload(*conversation, members, viewerUserID), nil
}

func normalizeConversationMetadataValue(set bool, value *string, maxLen int) (*string, error) {
	if !set {
		return nil, nil
	}
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, nil
	}
	if len(trimmed) > maxLen {
		return nil, apperror.BadRequest("conversation value is too long")
	}
	return &trimmed, nil
}

func (s *DMService) broadcastConversationUpdate(ctx context.Context, convID string) error {
	conversation, err := s.dmRepo.GetConversation(ctx, convID)
	if err != nil {
		return apperror.Internal("internal error", err)
	}
	members, err := s.dmRepo.GetConversationMembersDetailed(ctx, convID)
	if err != nil {
		return apperror.Internal("internal error", err)
	}
	for _, member := range members {
		payload := buildConversationPayload(*conversation, members, member.ID)
		s.hub.SendToUser(member.ID, ws.NewEvent(ws.OpDMConversationUpdate, payload))
	}
	return nil
}

func (s *DMService) broadcastConversationMembershipChange(ctx context.Context, convID string, newMemberIDs []string) error {
	conversation, err := s.dmRepo.GetConversation(ctx, convID)
	if err != nil {
		return apperror.Internal("internal error", err)
	}
	members, err := s.dmRepo.GetConversationMembersDetailed(ctx, convID)
	if err != nil {
		return apperror.Internal("internal error", err)
	}
	newMemberSet := make(map[string]struct{}, len(newMemberIDs))
	for _, memberID := range newMemberIDs {
		newMemberSet[memberID] = struct{}{}
	}
	for _, member := range members {
		payload := buildConversationPayload(*conversation, members, member.ID)
		if _, isNewMember := newMemberSet[member.ID]; isNewMember {
			s.hub.SendToUser(member.ID, ws.NewEvent(ws.OpDMConversationCreate, payload))
			continue
		}
		s.hub.SendToUser(member.ID, ws.NewEvent(ws.OpDMConversationUpdate, payload))
	}
	return nil
}

func (s *DMService) ListMessages(ctx context.Context, convID, userID string, before *string, limit int) ([]models.Message, error) {
	isMember, _ := s.dmRepo.IsMember(ctx, convID, userID)
	if !isMember {
		return nil, apperror.Forbidden("not a member of this conversation")
	}
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	messages, err := s.msgRepo.ListByConversation(ctx, convID, before, limit)
	if err != nil {
		return nil, apperror.Internal("internal error", err)
	}
	if err := s.msgRepo.EnrichMessages(ctx, messages); err != nil {
		return nil, apperror.Internal("internal error", err)
	}
	return messages, nil
}

type SendDMInput struct {
	Content            string   `json:"content"`
	AttachmentIDs      []string `json:"attachment_ids"`
	ReplyToMessageID   *string  `json:"reply_to_message_id"`
	ForwardedMessageID *string  `json:"-"`
}

func (s *DMService) SendMessage(ctx context.Context, convID, userID string, input SendDMInput) (*models.Message, error) {
	isMember, _ := s.dmRepo.IsMember(ctx, convID, userID)
	if !isMember {
		return nil, apperror.Forbidden("not a member of this conversation")
	}
	if input.Content == "" && len(input.AttachmentIDs) == 0 {
		return nil, apperror.BadRequest("content or attachments required")
	}
	if len(input.Content) > 4000 {
		return nil, apperror.BadRequest("content too long (max 4000)")
	}
	if len(input.AttachmentIDs) > 10 {
		return nil, apperror.BadRequest(fmt.Sprintf("too many attachments (max %d)", 10))
	}

	if input.Content != "" && s.modSvc != nil {
		if result := s.modSvc.CheckText(ctx, input.Content); result != nil && result.Flagged {
			return nil, apperror.BadRequest("message blocked by content moderation: " + result.Category)
		}
	}

	replyToMessageID := normalizeOptionalMessageID(input.ReplyToMessageID)
	if replyToMessageID != nil {
		belongs, err := s.dmRepo.MessageBelongsToConversation(ctx, *replyToMessageID, convID)
		if err != nil || !belongs {
			return nil, apperror.BadRequest("reply target must be in the same conversation")
		}
	}

	msg := &models.Message{
		ID:                 uuid.New().String(),
		ConversationID:     &convID,
		AuthorID:           userID,
		Content:            input.Content,
		ReplyToMessageID:   replyToMessageID,
		ForwardedMessageID: normalizeOptionalMessageID(input.ForwardedMessageID),
		CreatedAt:          time.Now(),
	}

	if err := s.msgRepo.Create(ctx, msg); err != nil {
		return nil, apperror.Internal("failed to create message", err)
	}

	_ = s.dmRepo.UpdateConversationTimestamp(ctx, convID, msg.CreatedAt)

	if len(input.AttachmentIDs) > 0 {
		_ = s.msgRepo.LinkAttachments(ctx, msg.ID, userID, input.AttachmentIDs)
	}

	msg, err := s.loadDetailedMessage(ctx, msg.ID)
	if err != nil {
		return nil, apperror.Internal("failed to load created message", err)
	}

	evt := ws.NewEvent(ws.OpDMMessageCreate, msg)
	// Sender: apply immediately in their UI (and other tabs/devices).
	s.hub.SendToUser(userID, evt)
	others, _ := s.dmRepo.GetOtherMembers(ctx, convID, userID)
	for _, uid := range others {
		s.hub.SendToUser(uid, evt)
	}

	if s.notifSvc != nil && msg.Author != nil {
		for _, recipientID := range others {
			rid := recipientID
			title := msg.Author.DisplayName + " sent you a message"
			bodyStr := input.Content
			notifCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			go func() {
				defer cancel()
				s.notifSvc.CreateWithPushData(notifCtx, rid, "dm", title, &bodyStr, &msg.ID, nil, nil, &userID, map[string]string{
					"conversation_id": convID,
				})
			}()
		}
	}

	return msg, nil
}

func (s *DMService) loadDetailedMessage(ctx context.Context, msgID string) (*models.Message, error) {
	msg, err := s.msgRepo.GetDetailedByID(ctx, msgID)
	if err != nil {
		return nil, err
	}
	messages := []models.Message{*msg}
	if err := s.msgRepo.EnrichMessages(ctx, messages); err != nil {
		return nil, err
	}
	return &messages[0], nil
}

func (s *DMService) AckDM(ctx context.Context, convID, userID, messageID string) error {
	isMember, _ := s.dmRepo.IsMember(ctx, convID, userID)
	if !isMember {
		return apperror.Forbidden("not a member of this conversation")
	}
	if messageID == "" {
		return apperror.BadRequest("message_id is required")
	}
	belongs, _ := s.dmRepo.MessageBelongsToConversation(ctx, messageID, convID)
	if !belongs {
		return apperror.BadRequest("message does not belong to this conversation")
	}
	if err := s.dmRepo.AckDM(ctx, userID, convID, messageID); err != nil {
		return apperror.Internal("failed to ack conversation", err)
	}
	return nil
}

func (s *DMService) ReadStates(ctx context.Context, userID string) ([]repository.DMReadState, error) {
	states, err := s.dmRepo.GetReadStates(ctx, userID)
	if err != nil {
		return nil, apperror.Internal("internal error", err)
	}
	return states, nil
}
