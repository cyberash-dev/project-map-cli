package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

type deps struct{}

func (d *deps) List(w http.ResponseWriter, r *http.Request) {}

func (d *deps) register(sub chi.Router) {
	sub.Get("/orders", d.List)
}

func Build(d *deps) chi.Router {
	root := chi.NewRouter()

	first := chi.NewRouter()
	second := chi.NewRouter()

	d.register(first)
	d.register(second)

	root.Mount("/v1", first)
	root.Mount("/v2", second)

	http.ListenAndServe(":8080", root)
	return root
}
