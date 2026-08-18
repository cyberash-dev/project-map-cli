package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

type deps struct{}

func (d *deps) OnlyInCode(w http.ResponseWriter, r *http.Request) {}

func Build(d *deps) chi.Router {
	root := chi.NewRouter()
	root.Get("/only-in-code", d.OnlyInCode)
	return root
}
