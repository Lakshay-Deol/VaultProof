package extension

import (
	"net/http"
	"os"
	"strings"
)

// CORS for the two endpoints the browser talks to directly.
//
// The frontend fetches /quote and posts to /sealed from the user's own tab —
// that is the whole point, since verification performed anywhere but the user's
// machine proves nothing to the user (spec §6). Without these headers the
// browser refuses the cross-origin request and stage 2 never gets a quote.
//
// Note what this is NOT. CORS is not a security boundary here and is not
// treated as one: curl ignores it entirely, and nothing on these paths carries
// ambient authority for a browser to leak. There are no cookies, no session, no
// Authorization header — `Access-Control-Allow-Credentials` is deliberately
// never sent. The real defences are elsewhere: /quote serves public data, and a
// blob posted to /sealed is inert until an on-chain ATTEST_SOLVENCY instruction
// quotes a request hash that was anchored first.
//
// ALLOWED_ORIGINS is a comma-separated allowlist ("https://vaultproof.xyz,
// http://localhost:3000"). Unset means any origin, which is the honest default
// for endpoints with nothing to steal.

func allowedOrigins() []string {
	raw := strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS"))
	if raw == "" {
		return nil
	}
	var out []string
	for _, part := range strings.Split(raw, ",") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

// resolveOrigin returns the value to echo in Access-Control-Allow-Origin, or ""
// when this origin is not permitted.
func resolveOrigin(origin string, allowed []string) string {
	if len(allowed) == 0 {
		return "*"
	}
	for _, candidate := range allowed {
		if candidate == "*" {
			return "*"
		}
		if strings.EqualFold(candidate, origin) {
			// Echo the caller's origin rather than the configured spelling, so
			// the browser's own string comparison matches.
			return origin
		}
	}
	return ""
}

// withCORS wraps the mux. Preflights are answered here and never reach a
// handler, so no handler has to know CORS exists.
func withCORS(next http.Handler) http.Handler {
	allowed := allowedOrigins()

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		if origin != "" {
			if value := resolveOrigin(origin, allowed); value != "" {
				w.Header().Set("Access-Control-Allow-Origin", value)
				// An allowlisted deploy varies its response by Origin, so any
				// cache in front of it must key on that header.
				if value != "*" {
					w.Header().Add("Vary", "Origin")
				}
			} else if r.Method == http.MethodOptions {
				// Refuse the preflight without the allow header. The browser
				// blocks the real request and reports why.
				w.WriteHeader(http.StatusForbidden)
				return
			}
		}

		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
