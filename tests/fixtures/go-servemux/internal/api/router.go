package api

import (
	"net/http"
)

type deps struct{}

func (d *deps) Item(w http.ResponseWriter, r *http.Request)   {}
func (d *deps) Legacy(w http.ResponseWriter, r *http.Request) {}
func (d *deps) Hosted(w http.ResponseWriter, r *http.Request) {}
func (d *deps) Sub(w http.ResponseWriter, r *http.Request)    {}

func Build(d *deps) *http.ServeMux {
	root := http.NewServeMux()

	root.HandleFunc("GET /items/{id}", d.Item)
	root.HandleFunc("/legacy", d.Legacy)
	root.HandleFunc("admin.example.com/hosted", d.Hosted)

	inner := http.NewServeMux()
	inner.HandleFunc("POST /reports", d.Sub)
	root.Handle("/api/", inner)

	return root
}
