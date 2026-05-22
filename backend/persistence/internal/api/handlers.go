package api

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/store"
)

type Handler struct {
	store store.Store
}

func NewHandler(s store.Store) *Handler {
	return &Handler{store: s}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", h.healthz)
	mux.HandleFunc("GET /api/v1/document", h.getDocument)
	mux.HandleFunc("PUT /api/v1/document", h.putDocument)
}

func (h *Handler) healthz(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

func (h *Handler) getDocument(w http.ResponseWriter, r *http.Request) {
	doc, err := h.store.Load()
	if err != nil {
		log.Printf("store.Load: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if doc == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(doc)
}

func (h *Handler) putDocument(w http.ResponseWriter, r *http.Request) {
	var doc store.Document
	if err := json.NewDecoder(r.Body).Decode(&doc); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if err := h.store.Save(&doc); err != nil {
		log.Printf("store.Save: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(doc)
}
