package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"example.com/mountkit"
)

func Build() chi.Router {
	root := chi.NewRouter()

	root.Mount("/v4", mountkit.New())

	http.ListenAndServe(":8080", root)
	return root
}
