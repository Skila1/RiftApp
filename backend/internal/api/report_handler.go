package api

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/riftapp-cloud/riftapp/internal/admin"
	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/service"
)

type ReportHandler struct {
	svc    *service.ReportService
	devSvc *service.DeveloperService
}

func NewReportHandler(svc *service.ReportService, devSvc *service.DeveloperService) *ReportHandler {
	return &ReportHandler{svc: svc, devSvc: devSvc}
}

func (h *ReportHandler) isAdminContext(r *http.Request) bool {
	return admin.GetAdminClaims(r.Context()) != nil
}

func (h *ReportHandler) getActorID(r *http.Request) string {
	if claims := admin.GetAdminClaims(r.Context()); claims != nil {
		return claims.UserID
	}
	return middleware.GetUserID(r.Context())
}

func (h *ReportHandler) isSuperAdmin(r *http.Request) bool {
	if h.isAdminContext(r) {
		return true
	}
	userID := middleware.GetUserID(r.Context())
	u, err := h.devSvc.GetUserByID(r.Context(), userID)
	if err != nil || u == nil || u.Email == nil {
		return false
	}
	return service.IsSuperAdmin(*u.Email)
}

func (h *ReportHandler) CreateReport(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	var input service.CreateReportInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	report, err := h.svc.Create(r.Context(), userID, input)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, report)
}

func (h *ReportHandler) ListReports(w http.ResponseWriter, r *http.Request) {
	if !h.isSuperAdmin(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	status := r.URL.Query().Get("status")
	category := r.URL.Query().Get("category")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	reports, total, err := h.svc.List(r.Context(), status, category, limit, offset)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"reports": reports,
		"total":   total,
	})
}

func (h *ReportHandler) GetReport(w http.ResponseWriter, r *http.Request) {
	if !h.isSuperAdmin(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	id := chi.URLParam(r, "reportID")
	report, err := h.svc.Get(r.Context(), id)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, report)
}

func (h *ReportHandler) UpdateReport(w http.ResponseWriter, r *http.Request) {
	if !h.isSuperAdmin(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	id := chi.URLParam(r, "reportID")
	userID := h.getActorID(r)
	var body struct {
		Status string  `json:"status"`
		Note   *string `json:"note"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.svc.Resolve(r.Context(), id, userID, body.Status, body.Note); err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *ReportHandler) TakeAction(w http.ResponseWriter, r *http.Request) {
	if !h.isSuperAdmin(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	reportID := chi.URLParam(r, "reportID")
	userID := h.getActorID(r)
	var input service.TakeActionInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.svc.TakeAction(r.Context(), reportID, userID, input); err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *ReportHandler) Stats(w http.ResponseWriter, r *http.Request) {
	if !h.isSuperAdmin(r) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	stats, err := h.svc.Stats(r.Context())
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, stats)
}
