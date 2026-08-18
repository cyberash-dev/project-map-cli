package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	gen "sample/generated-go/internal/api/paygen"
)

type builder struct {
	auth func(http.Handler) http.Handler
}

func (b *builder) Cart(w http.ResponseWriter, r *http.Request) {}

func (b *builder) withStats(r chi.Router) chi.Router {
	return r.With(b.auth)
}

func Build(b *builder) chi.Router {
	root := chi.NewRouter()
	payV1 := chi.NewRouter()

	b.handlerWithOptions(gen.ChiServerOptions{
		BaseRouter: b.withStats(payV1),
	})

	root.Mount("/pay/v1", payV1)

	http.ListenAndServe(":8080", root)
	return root
}

func (b *builder) handlerWithOptions(options gen.ChiServerOptions) http.Handler {
	r := options.BaseRouter.With(b.auth)
	if r == nil {
		r = chi.NewRouter()
	}
	r.Group(func(r chi.Router) {
		r.Post(options.BaseURL+"/screens/cart", b.Cart)
	})
	return r
}
