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
	root := chi.NewRouter()
	b.buildV9(root)
	return root
}

func (b *routerBuilder) buildV9(r chi.Router) {
	sub := chi.NewRouter()
	sub.Get("/ping", b.deps.Ping)
	r.Mount("/v9", sub)
}
