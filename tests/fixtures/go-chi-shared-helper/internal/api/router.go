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
func (d *deps) second(o options) { d.shared(o) }

/* Reached at three edges from Build and at one, with one seed. */
func (d *deps) shared(o options) {
	d.register(o)
}

func (d *deps) register(o options) {
	o.BaseRouter.Get("/deep", d.Deep)
}

func Build(d *deps) chi.Router {
	root := chi.NewRouter()
	sub := chi.NewRouter()

	d.first(options{BaseRouter: sub})
	d.shared(options{BaseRouter: sub})

	root.Mount("/v1", sub)

	http.ListenAndServe(":8080", root)
	return root
}
