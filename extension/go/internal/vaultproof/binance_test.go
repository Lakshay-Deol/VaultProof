package vaultproof

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Binance signs the query string exactly as transmitted. Recomputing the HMAC
// server-side is the only check that catches a signature built over a
// different string than the one sent — the failure this test exists for.
func TestBinanceSignsTheQueryStringItSends(t *testing.T) {
	if AttestationAvailable() {
		t.Skip("launcher socket present; this test asserts simulated-mode behaviour")
	}

	const secret = "topsecret"
	var (
		sawAPIKey string
		sigValid  bool
		sawPath   string
	)

	stub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawAPIKey = r.Header.Get("X-MBX-APIKEY")
		sawPath = r.URL.Path

		// Split the raw query at the signature, exactly as Binance does.
		raw := r.URL.RawQuery
		idx := strings.Index(raw, "&signature=")
		if idx < 0 {
			http.Error(w, `{"code":-1022,"msg":"missing signature"}`, http.StatusUnauthorized)
			return
		}
		signed, provided := raw[:idx], raw[idx+len("&signature="):]

		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write([]byte(signed))
		sigValid = hmac.Equal([]byte(hex.EncodeToString(mac.Sum(nil))), []byte(provided))

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"balances":[
			{"asset":"BTC","free":"1.0","locked":"0.5"},
			{"asset":"XRP","free":"100.0","locked":"0.0"},
			{"asset":"DUST","free":"0.0","locked":"0.0"}]}`))
	}))
	defer stub.Close()

	setExchangeBaseURL(t, stub.URL)

	balances, err := FetchBinanceBalances(context.Background(), "my-key", secret)
	if err != nil {
		t.Fatalf("fetching balances: %v", err)
	}

	if !sigValid {
		t.Error("server could not reproduce the signature over the query string it received")
	}
	if sawAPIKey != "my-key" {
		t.Errorf("X-MBX-APIKEY = %q, want %q", sawAPIKey, "my-key")
	}
	if sawPath != binanceAccountPth {
		t.Errorf("path = %q, want %q", sawPath, binanceAccountPth)
	}

	// free + locked: an open order does not make the asset someone else's.
	if got := balances["BTC"]; got != 1.5 {
		t.Errorf("BTC = %v, want 1.5 (free 1.0 + locked 0.5)", got)
	}
	// XRP must survive intact — Kraken's normaliser would leave "RP".
	if got := balances["XRP"]; got != 100 {
		t.Errorf("XRP = %v, want 100", got)
	}
	if _, present := balances["DUST"]; present {
		t.Error("zero-balance asset was kept")
	}
}

func TestBinanceRejectedCredentialSaysNothingRevealing(t *testing.T) {
	if AttestationAvailable() {
		t.Skip("launcher socket present; this test asserts simulated-mode behaviour")
	}

	stub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"code":-2015,"msg":"Invalid API-key, IP, or permissions for action, request ip: 1.2.3.4"}`))
	}))
	defer stub.Close()

	setExchangeBaseURL(t, stub.URL)

	_, err := FetchBinanceBalances(context.Background(), "bad-key", "secret")
	if err == nil {
		t.Fatal("expected an error for a rejected credential")
	}
	// This string reaches a published ActionResult, so it must not carry the
	// upstream message, which quotes request details back.
	if got := err.Error(); got != "exchange rejected the credential" {
		t.Errorf("error = %q, want the non-revealing form", got)
	}
}

// Binance tickers must not go through Kraken's legacy X/Z stripping.
func TestBinanceAssetNormalisation(t *testing.T) {
	cases := map[string]string{
		"XRP":   "XRP", // would be "RP" under the Kraken normaliser
		"BTC":   "BTC",
		"ETH":   "ETH",
		"BETH":  "ETH",
		"WBTC":  "BTC",
		"LDBTC": "BTC",
		"USDT":  "USDT",
	}
	for in, want := range cases {
		if got := normaliseBinanceAsset(in); got != want {
			t.Errorf("normaliseBinanceAsset(%q) = %q, want %q", in, got, want)
		}
	}
}
