package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

type handlers struct{}

func (h *handlers) List(w http.ResponseWriter, r *http.Request) {}

func (h *handlers) Register(sub chi.Router) {
	sub.Get("/orders", h.List)
}
