package vaultproof

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Kraken's private API. Read-only key permissions are all VaultProof ever
// needs, and the UI says so at the point the user pastes one in.
const (
	krakenBaseURL    = "https://api.kraken.com"
	krakenBalancePth = "/0/private/Balance"
)

// Balances maps an asset ticker to a quantity. Kraken returns decimal strings.
type Balances map[string]float64

// krakenResponse is the envelope every Kraken endpoint returns.
type krakenResponse struct {
	Error  []string          `json:"error"`
	Result map[string]string `json:"result"`
}

// FetchKrakenBalances calls the private Balance endpoint with a read-only key.
//
// Nothing in this function logs. The error paths deliberately describe the
// step that failed and never echo the response body, the key, or the
// signature — a Kraken error string can contain the key prefix.
func FetchKrakenBalances(ctx context.Context, apiKey, apiSecret string) (Balances, error) {
	secret, err := base64.StdEncoding.DecodeString(apiSecret)
	if err != nil {
		return nil, errors.New("API secret is not valid base64")
	}
	defer Zeroize(secret)

	// Kraken requires a strictly increasing nonce per key.
	nonce := strconv.FormatInt(time.Now().UnixMilli(), 10)
	form := url.Values{"nonce": {nonce}}
	body := form.Encode()

	sig, err := krakenSignature(krakenBalancePth, nonce, body, secret)
	if err != nil {
		return nil, err
	}
	defer Zeroize(sig)

	req, err := http.NewRequestWithContext(
		ctx, http.MethodPost, krakenBaseURL+krakenBalancePth, strings.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("building exchange request: %w", err)
	}
	req.Header.Set("API-Key", apiKey)
	req.Header.Set("API-Sign", base64.StdEncoding.EncodeToString(sig))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("exchange request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	// Bounded read: a hostile or broken upstream must not be able to balloon
	// enclave memory with an unbounded body.
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("reading exchange response: %w", err)
	}
	defer Zeroize(raw)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("exchange returned HTTP %d", resp.StatusCode)
	}

	var parsed krakenResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, errors.New("exchange response was not valid JSON")
	}
	if len(parsed.Error) > 0 {
		// Deliberately not interpolating parsed.Error: Kraken echoes the key
		// prefix in some error strings, and this value reaches an ActionResult.
		return nil, errors.New("exchange rejected the credential")
	}

	balances := make(Balances, len(parsed.Result))
	for asset, qty := range parsed.Result {
		v, err := strconv.ParseFloat(qty, 64)
		if err != nil || v == 0 {
			continue
		}
		balances[normaliseAsset(asset)] = v
	}
	return balances, nil
}

// krakenSignature implements Kraken's scheme:
//
//	HMAC-SHA512(base64decode(secret), path ‖ SHA256(nonce ‖ postdata))
func krakenSignature(path, nonce, body string, secret []byte) ([]byte, error) {
	inner := sha256.New()
	inner.Write([]byte(nonce + body))

	mac := hmac.New(sha512.New, secret)
	mac.Write([]byte(path))
	mac.Write(inner.Sum(nil))
	return mac.Sum(nil), nil
}

// normaliseAsset maps Kraken's legacy tickers onto FTSO feed symbols.
// Kraken still returns XXBT for bitcoin and ZUSD for dollars.
func normaliseAsset(asset string) string {
	switch asset {
	case "XXBT", "XBT":
		return "BTC"
	case "XETH":
		return "ETH"
	case "ZUSD", "USD":
		return "USD"
	case "ZEUR", "EUR":
		return "EUR"
	case "XXRP":
		return "XRP"
	case "XLTC":
		return "LTC"
	default:
		return strings.TrimPrefix(strings.TrimPrefix(asset, "X"), "Z")
	}
}
