package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRootReturnsAppPage(t *testing.T) {
	mux := NewMux()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/", nil)

	mux.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
	}

	body := recorder.Body.String()
	if !strings.Contains(body, "ポモドーロタイマー") {
		t.Fatalf("expected response body to contain app title, got %q", body)
	}
}

func TestRootContainsAppStructure(t *testing.T) {
	mux := NewMux()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/", nil)

	mux.ServeHTTP(recorder, request)

	body := recorder.Body.String()
	expectedFragments := []string{
		`data-role="timer-display"`,
		`data-role="status-label"`,
		`data-role="start-button"`,
		`data-role="reset-button"`,
		`data-role="progress-ring"`,
		`data-role="today-completed-count"`,
		`data-role="today-focus-time"`,
		`href="/static/css/styles.css"`,
		`src="/static/js/timer.js"`,
	}

	for _, fragment := range expectedFragments {
		if !strings.Contains(body, fragment) {
			t.Fatalf("expected response body to contain %q, got %q", fragment, body)
		}
	}
}

func TestHealthzReturnsOK(t *testing.T) {
	mux := NewMux()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)

	mux.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
	}

	body := strings.TrimSpace(recorder.Body.String())
	if body != "ok" {
		t.Fatalf("expected health response %q, got %q", "ok", body)
	}
}

func TestStaticAssetsReturnContent(t *testing.T) {
	tests := []struct {
		name             string
		path             string
		expectedFragment string
	}{
		{
			name:             "css",
			path:             "/static/css/styles.css",
			expectedFragment: ".progress-ring",
		},
		{
			name:             "javascript",
			path:             "/static/js/timer.js",
			expectedFragment: "initializeTimerApp",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mux := NewMux()
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, tt.path, nil)

			mux.ServeHTTP(recorder, request)

			if recorder.Code != http.StatusOK {
				t.Fatalf("expected status %d, got %d", http.StatusOK, recorder.Code)
			}

			body := recorder.Body.String()
			if !strings.Contains(body, tt.expectedFragment) {
				t.Fatalf("expected response body to contain %q, got %q", tt.expectedFragment, body)
			}
		})
	}
}

func TestUnknownPathReturnsNotFound(t *testing.T) {
	mux := NewMux()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/missing", nil)

	mux.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, recorder.Code)
	}
}
