package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

const apiPrefix = "/v3"

type deps struct{}

func (d *deps) Ping(w http.ResponseWriter, r *http.Request) {}

func Build(d *deps) {
	root := chi.NewRouter()

	sub := chi.NewRouter()
	sub.Get("/ping", d.Ping)

	root.Mount(apiPrefix, sub)

	http.ListenAndServe(":8080", root)
}
