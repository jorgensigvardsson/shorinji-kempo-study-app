package api

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/persistence/internal/store"
)

type Handler struct {
	store       store.Store
	jwks        KeySource
	frontendURL string
}

func NewHandler(s store.Store, ks KeySource, frontendURL string) *Handler {
	return &Handler{store: s, jwks: ks, frontendURL: frontendURL}
}

func (h *Handler) Register(mux *http.ServeMux) {
	inner := http.NewServeMux()
	inner.HandleFunc("GET /healthz", h.healthz)
	inner.Handle("GET /api/v1/document", authMiddleware(h.jwks, http.HandlerFunc(h.getDocument)))
	inner.Handle("PUT /api/v1/document", authMiddleware(h.jwks, http.HandlerFunc(h.putDocument)))
	mux.Handle("/", corsMiddleware(h.frontendURL, inner))
}

func (h *Handler) healthz(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

func (h *Handler) getDocument(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	doc, err := h.store.Load(userID)
	if err != nil {
		log.Printf("store.Load(%s): %v", userID, err)
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
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var doc store.Document
	if err := json.NewDecoder(r.Body).Decode(&doc); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if err := h.store.Save(userID, &doc); err != nil {
		log.Printf("store.Save(%s): %v", userID, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(doc)
}
