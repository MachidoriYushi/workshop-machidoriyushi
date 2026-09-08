// Pomodoro timer app
package main

import (
	"log"
	"net/http"

	"pomodoro/internal/server"
)

func main() {
	addr := ":8080"
	log.Printf("starting pomodoro server on http://localhost%s", addr)
	log.Fatal(http.ListenAndServe(addr, server.NewMux()))
}
