package vaultproof

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"extension-scaffold/internal/config"
)

// Binance's spot account endpoint. Read-only ("Enable Reading") permissions
// are all VaultProof needs, and the UI says so where the key is pasted.
const binanceAccountPth = "/api/v3/account"

// binanceAccount is the subset of the account response we read. The endpoint
// also returns commission rates and permissions, which are ignored.
type binanceAccount struct {
	Balances []struct {
		Asset  string `json:"asset"`
		Free   string `json:"free"`
		Locked string `json:"locked"`
	} `json:"balances"`
}

// binanceError is the error envelope Binance returns instead of balances.
type binanceError struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
}

// FetchBinanceBalances calls the signed spot account endpoint with a read-only
// key.
//
// Same discipline as the Kraken path: nothing here logs, and no error echoes
// the response body, the key, or the signature — Binance error strings can
// quote request parameters back.
func FetchBinanceBalances(ctx context.Context, apiKey, apiSecret string) (Balances, error) {
	// Checked before the credential is touched, so a hardware enclave with a
	// tampered endpoint never reaches the network.
	if err := CheckExchangeOverride(); err != nil {
		return nil, err
	}

	base := config.ExchangeBaseURL("binance")
	if base == "" {
		return nil, errors.New("no endpoint configured for binance")
	}

	// Binance signs the query string exactly as sent, so the string that is
	// signed and the string that is transmitted must be built once and shared.
	// Rebuilding it — via url.Values.Encode, which sorts — is how signature
	// mismatches get introduced.
	query := "timestamp=" + strconv.FormatInt(time.Now().UnixMilli(), 10) + "&recvWindow=5000"

	mac := hmac.New(sha256.New, []byte(apiSecret))
	mac.Write([]byte(query))
	sig := mac.Sum(nil)
	defer Zeroize(sig)

	url := base + binanceAccountPth + "?" + query + "&signature=" + hex.EncodeToString(sig)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("building exchange request: %w", err)
	}
	req.Header.Set("X-MBX-APIKEY", apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("exchange request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	// Bounded read: an account with many assets is still small, and a hostile
	// upstream must not be able to balloon enclave memory.
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("reading exchange response: %w", err)
	}
	defer Zeroize(raw)

	if resp.StatusCode != http.StatusOK {
		// Binance reports credential problems as 401 with a code in the body.
		// The code is deliberately not interpolated: it reaches an
		// ActionResult, and the body can quote the request back.
		var e binanceError
		if json.Unmarshal(raw, &e) == nil && e.Code != 0 {
			return nil, errors.New("exchange rejected the credential")
		}
		return nil, fmt.Errorf("exchange returned HTTP %d", resp.StatusCode)
	}

	var parsed binanceAccount
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, errors.New("exchange response was not valid JSON")
	}

	balances := make(Balances, len(parsed.Balances))
	for _, b := range parsed.Balances {
		// Locked funds are still the user's holdings — an open order does not
		// make the asset someone else's — so solvency counts free + locked.
		free, freeErr := strconv.ParseFloat(b.Free, 64)
		locked, lockedErr := strconv.ParseFloat(b.Locked, 64)
		if freeErr != nil || lockedErr != nil {
			continue
		}

		total := free + locked
		if total == 0 {
			continue
		}
		balances[normaliseBinanceAsset(b.Asset)] += total
	}
	return balances, nil
}

// normaliseBinanceAsset maps Binance tickers onto FTSO feed symbols.
//
// Binance already uses canonical tickers, so unlike Kraken this is nearly the
// identity. It must NOT reuse normaliseAsset: that one strips a leading X or Z
// for Kraken's legacy scheme, which would turn Binance's "XRP" into "RP" and
// price it at zero.
//
// Staked and wrapped variants are folded onto their underlying, since they are
// the same exposure under a different ticker. Anything unrecognised is passed
// through untouched and priced only if FTSO has a feed for it — an asset with
// no feed is skipped, which understates the portfolio and so fails safe.
func normaliseBinanceAsset(asset string) string {
	upper := strings.ToUpper(asset)

	switch upper {
	case "BETH", "WBETH":
		return "ETH"
	case "WBTC", "BTCB":
		return "BTC"
	}

	// Binance Earn positions are the underlying prefixed with LD, e.g. LDBTC.
	if strings.HasPrefix(upper, "LD") && len(upper) > 2 {
		return upper[2:]
	}
	return upper
}
