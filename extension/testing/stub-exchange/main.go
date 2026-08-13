// Command stub-exchange stands in for a real exchange so the full VaultProof
// pipeline can be driven without an exchange account.
//
// It speaks the Binance spot shape the enclave's adapter expects:
//
//	GET /api/v3/account?timestamp=…&signature=…  ->  {"balances":[…]}
//
// The signature is NOT verified. That is the point: there is no account behind
// this, so any API key and secret typed into the UI will do.
//
// The enclave only talks to this when VAULTPROOF_EXCHANGE_BASE_URL is set, and
// it refuses that override outright on real Confidential Space hardware — see
// vaultproof.CheckExchangeOverride. A tier produced against this server is a
// demonstration of the pipeline, not evidence of anyone's holdings, and /quote
// reports the endpoint so that is visible rather than inferred.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
)

type balance struct {
	Asset  string `json:"asset"`
	Free   string `json:"free"`
	Locked string `json:"locked"`
}

func main() {
	addr := flag.String("addr", "0.0.0.0:8899", "listen address")
	flag.Parse()

	// Priced by FTSO inside the enclave, so these quantities decide the tier.
	// Roughly $50k at mid-2026 prices, which lands in an interesting band
	// rather than at either extreme.
	balances := []balance{
		{Asset: "BTC", Free: "0.35", Locked: "0.05"},
		{Asset: "ETH", Free: "4.0", Locked: "0.0"},
		{Asset: "XRP", Free: "2500.0", Locked: "0.0"},
		{Asset: "USDT", Free: "3000.0", Locked: "0.0"},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/v3/account", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("account query from %s (key=%q)", r.RemoteAddr, r.Header.Get("X-MBX-APIKEY"))
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"accountType": "SPOT",
			"balances":    balances,
		})
	})

	// Kraken's shape too, so the stub works whichever exchange is selected.
	mux.HandleFunc("/0/private/Balance", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("kraken balance query from %s", r.RemoteAddr)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": []string{},
			"result": map[string]string{
				"XXBT": "0.40", "XETH": "4.0", "XXRP": "2500.0", "ZUSD": "3000.0",
			},
		})
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "stub exchange: no such endpoint", http.StatusNotFound)
	})

	fmt.Fprintf(os.Stderr, "stub exchange listening on %s\n", *addr)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatal(err)
	}
}
