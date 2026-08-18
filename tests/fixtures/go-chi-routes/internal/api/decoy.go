package api

import "net/http"

func Decoy(w http.ResponseWriter, r *http.Request) {
	token := r.Header.Get("X-Token")
	order := r.URL.Query().Get("order_id")
	_, _ = w.Write([]byte(token + order))
}
