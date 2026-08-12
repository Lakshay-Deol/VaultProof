package extension

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// okHandler stands in for the mux; the CORS wrapper must let it run.
func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{}`))
	})
}

// Without these headers stage 2 never gets a quote: the browser blocks the
// cross-origin read before the extension sees a thing.
func TestCORSAllowsCrossOriginQuoteByDefault(t *testing.T) {
	t.Setenv("ALLOWED_ORIGINS", "")

	req := httptest.NewRequest(http.MethodGet, "/quote", nil)
	req.Header.Set("Origin", "https://vaultproof.xyz")
	rec := httptest.NewRecorder()

	withCORS(okHandler()).ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, "*")
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

// POST /sealed carries content-type: application/json, so the browser
// preflights it. A preflight that is not answered means the blob never moves.
func TestCORSAnswersPreflightForSealed(t *testing.T) {
	t.Setenv("ALLOWED_ORIGINS", "")

	req := httptest.NewRequest(http.MethodOptions, "/sealed", nil)
	req.Header.Set("Origin", "https://vaultproof.xyz")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "content-type")
	rec := httptest.NewRecorder()

	withCORS(okHandler()).ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d, want %d", rec.Code, http.StatusNoContent)
	}
	if got := rec.Header().Get("Access-Control-Allow-Headers"); got != "Content-Type" {
		t.Fatalf("Access-Control-Allow-Headers = %q, want Content-Type", got)
	}
}

func TestCORSAllowlistEchoesOnlyListedOrigins(t *testing.T) {
	t.Setenv("ALLOWED_ORIGINS", "https://vaultproof.xyz, http://localhost:3000")

	t.Run("listed origin is echoed", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/quote", nil)
		req.Header.Set("Origin", "http://localhost:3000")
		rec := httptest.NewRecorder()

		withCORS(okHandler()).ServeHTTP(rec, req)

		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
			t.Fatalf("Access-Control-Allow-Origin = %q, want the caller's origin", got)
		}
		// A response that varies by Origin must not be cached under one key.
		if got := rec.Header().Get("Vary"); got != "Origin" {
			t.Fatalf("Vary = %q, want Origin", got)
		}
	})

	t.Run("unlisted origin gets no allow header", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/quote", nil)
		req.Header.Set("Origin", "https://evil.example")
		rec := httptest.NewRecorder()

		withCORS(okHandler()).ServeHTTP(rec, req)

		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Fatalf("Access-Control-Allow-Origin = %q, want empty for an unlisted origin", got)
		}
	})

	t.Run("unlisted preflight is refused", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodOptions, "/sealed", nil)
		req.Header.Set("Origin", "https://evil.example")
		rec := httptest.NewRecorder()

		withCORS(okHandler()).ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("preflight status = %d, want %d", rec.Code, http.StatusForbidden)
		}
	})
}

// Same-origin and non-browser callers send no Origin at all; they must pass
// straight through rather than being treated as a rejected cross-origin read.
func TestCORSIgnoresRequestsWithNoOrigin(t *testing.T) {
	t.Setenv("ALLOWED_ORIGINS", "https://vaultproof.xyz")

	req := httptest.NewRequest(http.MethodGet, "/state", nil)
	rec := httptest.NewRecorder()

	withCORS(okHandler()).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want empty when no Origin was sent", got)
	}
}
