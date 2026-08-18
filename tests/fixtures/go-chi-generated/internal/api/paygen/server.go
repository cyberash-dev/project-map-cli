package paygen

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

type ChiServerOptions struct {
	BaseURL          string
	BaseRouter       chi.Router
	ErrorHandlerFunc func(w http.ResponseWriter, r *http.Request, err error)
}
