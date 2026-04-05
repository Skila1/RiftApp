package api

import (
	"encoding/json"
	"net/http"

	"github.com/riftapp-cloud/riftapp/internal/apperror"
)

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func writeAppError(w http.ResponseWriter, err error) {
	writeError(w, apperror.HTTPCode(err), apperror.Message(err))
}

func readJSON(r *http.Request, v interface{}) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 1<<20) // 1 MB
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(v)
}
