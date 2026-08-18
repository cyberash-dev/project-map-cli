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

func (d *deps) first(o options)  { d.second(o) }
func (d *deps) second(o options) { d.third(o) }
func (d *deps) third(o options)  { d.fourth(o) }

func (d *deps) fourth(o options) {
	o.BaseRouter.Get("/deep", d.Deep)
}

func Build(d *deps) chi.Router {
	root := chi.NewRouter()
	sub := chi.NewRouter()

	d.first(options{BaseRouter: sub})
	root.Mount("/v1", sub)

	http.ListenAndServe(":8080", root)
	return root
}
