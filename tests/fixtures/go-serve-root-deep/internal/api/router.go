package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

type deps struct{}

func (d *deps) Ping(w http.ResponseWriter, r *http.Request) {}

func NewRouter(d *deps) http.Handler {
	return newChiRouter(d)
}

func newChiRouter(d *deps) chi.Router {
	builder := routerBuilder{deps: d}
	return builder.build()
}

type routerBuilder struct {
	deps *deps
}

func (b *routerBuilder) build() chi.Router {
	d := b.deps
	root := chi.NewRouter()

	sub := chi.NewRouter()
	sub.Get("/ping", d.Ping)

	root.Mount("/v9", sub)
	return root
}
