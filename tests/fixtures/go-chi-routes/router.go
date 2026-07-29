package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

type deps struct {
	auth func(http.Handler) http.Handler
}

func (d *deps) Ping(w http.ResponseWriter, r *http.Request)        {}
func (d *deps) CreateOrder(w http.ResponseWriter, r *http.Request) {}
func (d *deps) DropOrder(w http.ResponseWriter, r *http.Request)   {}
func (d *deps) Loose(w http.ResponseWriter, r *http.Request)       {}
func (d *deps) Health(w http.ResponseWriter, r *http.Request)      {}

func (d *deps) withStats(r chi.Router) chi.Router {
	return r.With(d.auth)
}

func (d *deps) wrapSomehow(r chi.Router) chi.Router {
	return r
}

func Build(d *deps) chi.Router {
	root := chi.NewRouter()

	v1 := chi.NewRouter()
	v1.Get("/ping", d.Ping)

	tagged := d.withStats(v1).With(d.auth)
	tagged.Post("/orders", d.CreateOrder)

	tagged.Group(func(v1 chi.Router) {
		v1.Delete("/orders/{order_id}", d.DropOrder)
	})

	root.Mount("/v1", v1)

	root.NotFound(d.Loose)
	v1.NotFound(d.Loose)

	root.Route("/admin", func(admin chi.Router) {
		admin.Get("/health", d.Health)
	})

	loose := d.wrapSomehow(chi.NewRouter())
	loose.Get("/loose", d.Loose)

	return root
}
