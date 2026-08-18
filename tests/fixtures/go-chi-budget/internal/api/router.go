package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

type options struct {
	BaseRouter chi.Router
}

type deps struct{}

func (d *deps) Deep(w http.ResponseWriter, r *http.Request) {}

func (d *deps) outer(o options) {
	d.inner(o)
}

func (d *deps) inner(o options) {
	o.BaseRouter.Get("/deep", d.Deep)
}

func Build(d *deps) chi.Router {
	root := chi.NewRouter()
	sub := chi.NewRouter()

	d.outer(options{BaseRouter: sub})
	root.Mount("/v1", sub)

	http.ListenAndServe(":8080", root)
	return root
}
