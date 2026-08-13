package vaultproof

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"extension-scaffold/internal/config"
)

// setExchangeBaseURL points every exchange at u for the duration of one test.
func setExchangeBaseURL(t *testing.T, u string) {
	t.Helper()
	prev := config.ExchangeBaseURLOverride
	config.ExchangeBaseURLOverride = u
	t.Cleanup(func() { config.ExchangeBaseURLOverride = prev })
}

func TestExchangeBaseURLsDefaultToTheRealExchanges(t *testing.T) {
	if got := config.ExchangeBaseURL("kraken"); got != config.DefaultKrakenBaseURL {
		t.Errorf("kraken base URL = %q, want %q", got, config.DefaultKrakenBaseURL)
	}
	if got := config.ExchangeBaseURL("binance"); got != config.DefaultBinanceBaseURL {
		t.Errorf("binance base URL = %q, want %q", got, config.DefaultBinanceBaseURL)
	}
	if config.ExchangeBaseURLOverridden() {
		t.Error("unset environment reported as an override")
	}
	// An unknown exchange must not fall back to some other exchange's host.
	if got := config.ExchangeBaseURL("my-own-server"); got != "" {
		t.Errorf("unknown exchange resolved to %q, want empty", got)
	}
}

func TestUnsupportedExchangeIsRefusedBeforeAnyRequest(t *testing.T) {
	_, err := FetchBalances(context.Background(), "my-own-server", "k", "s")
	if !errors.Is(err, ErrUnsupportedExchange) {
		t.Fatalf("got %v, want ErrUnsupportedExchange", err)
	}
}

// The override must be refused on hardware and permitted nowhere else that
// matters. Testing the pure decision covers the combination that cannot be
// reached on a dev machine: a launcher socket that is actually present.
func TestExchangeOverrideRefusedOnlyOnHardware(t *testing.T) {
	cases := []struct {
		name       string
		overridden bool
		onHardware bool
		wantErr    bool
	}{
		{"canonical endpoint, simulated", false, false, false},
		{"canonical endpoint, hardware", false, true, false},
		{"override, simulated", true, false, false},
		{"override, hardware", true, true, true},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := exchangeOverrideError(c.overridden, c.onHardware)
			if c.wantErr {
				if !errors.Is(err, ErrExchangeOverrideOnHardware) {
					t.Fatalf("got %v, want ErrExchangeOverrideOnHardware", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("got %v, want nil", err)
			}
		})
	}
}

// A stub standing in for the exchange is the whole point of the override, so
// check the request actually lands on it and is parsed as a balance response.
func TestFetchBalancesHonoursOverrideInSimulatedMode(t *testing.T) {
	if AttestationAvailable() {
		t.Skip("launcher socket present; this test asserts simulated-mode behaviour")
	}

	var gotPath string
	stub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"error":[],"result":{"XXBT":"1.5","ZUSD":"2000.0"}}`))
	}))
	defer stub.Close()

	setExchangeBaseURL(t, stub.URL)

	// The secret must be valid base64; its value is irrelevant to the stub.
	balances, err := FetchKrakenBalances(context.Background(), "key", "c2VjcmV0")
	if err != nil {
		t.Fatalf("fetching balances from stub: %v", err)
	}

	if gotPath != krakenBalancePth {
		t.Errorf("stub saw path %q, want %q", gotPath, krakenBalancePth)
	}
	if got := balances["BTC"]; got != 1.5 {
		t.Errorf("BTC = %v, want 1.5", got)
	}
	if got := balances["USD"]; got != 2000.0 {
		t.Errorf("USD = %v, want 2000", got)
	}
}

// Zero quantities are dropped, and the override path must not change that.
func TestFetchBalancesDropsZeroQuantities(t *testing.T) {
	if AttestationAvailable() {
		t.Skip("launcher socket present; this test asserts simulated-mode behaviour")
	}

	stub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"error":[],"result":{"XXBT":"0.0","ZUSD":"10.0"}}`))
	}))
	defer stub.Close()

	setExchangeBaseURL(t, stub.URL)

	balances, err := FetchKrakenBalances(context.Background(), "key", "c2VjcmV0")
	if err != nil {
		t.Fatalf("fetching balances: %v", err)
	}
	if _, present := balances["BTC"]; present {
		t.Error("zero-quantity asset was kept")
	}
	if len(balances) != 1 {
		t.Errorf("got %d balances, want 1", len(balances))
	}
}
