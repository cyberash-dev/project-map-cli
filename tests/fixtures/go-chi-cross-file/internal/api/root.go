package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func Serve(h *handlers) chi.Router {
	root := chi.NewRouter()
	orders := chi.NewRouter()

	h.Register(orders)
	root.Mount("/v2", orders)

	http.ListenAndServe(":8080", root)
	return root
}
