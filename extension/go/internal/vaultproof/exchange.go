package vaultproof

import (
	"context"
	"errors"

	"extension-scaffold/internal/config"
)

// The exchange endpoint is the one input to a tier that the enclave cannot
// verify cryptographically. Pricing is done here with FTSO precisely so that
// the exchange's own dollar figure is never trusted — but the quantities still
// come from whatever server answers at the configured address.
//
// So an operator who can choose that address can mint themselves any tier,
// which is the same attack the FTSO pricing exists to prevent, arriving one
// layer lower down. The override is therefore allowed only where there is no
// hardware claim to undermine: a simulated run, which the browser already
// renders as SIMULATED and which produces no hardware-attested record.
//
// The signal used is the presence of the Confidential Space launcher socket.
// That file is mounted by the launcher, which sits outside the container's
// control, so a workload cannot make it disappear to unlock the override.

// ErrExchangeOverrideOnHardware is returned when an exchange endpoint override
// is in effect on real Confidential Space hardware.
var ErrExchangeOverrideOnHardware = errors.New(
	"VAULTPROOF_EXCHANGE_BASE_URL is set while running on Confidential Space; " +
		"refusing to attest holdings read from a non-canonical exchange endpoint",
)

// CheckExchangeOverride fails closed when an operator-supplied exchange
// endpoint would be used on real hardware.
//
// It is called at the point of use rather than only at startup, so that no
// later change of state can leave a hardware enclave querying a stub.
func CheckExchangeOverride() error {
	return exchangeOverrideError(config.ExchangeBaseURLOverridden(), AttestationAvailable())
}

// exchangeOverrideError holds the decision as a pure function so the four
// combinations can be tested without a launcher socket to stat.
func exchangeOverrideError(overridden, onHardware bool) error {
	if overridden && onHardware {
		return ErrExchangeOverrideOnHardware
	}
	return nil
}

// ErrUnsupportedExchange is returned for any exchange the enclave has no
// adapter for.
//
// Named exchanges only, deliberately: accepting an arbitrary endpoint from the
// sealed payload would let a user point the enclave at a server they control
// and mint their own tier. The set below is the whole trust surface.
var ErrUnsupportedExchange = errors.New("unsupported exchange")

// FetchBalances routes a credential to the adapter for its exchange.
func FetchBalances(ctx context.Context, exchange, apiKey, apiSecret string) (Balances, error) {
	switch exchange {
	case "kraken":
		return FetchKrakenBalances(ctx, apiKey, apiSecret)
	case "binance":
		return FetchBinanceBalances(ctx, apiKey, apiSecret)
	default:
		return nil, ErrUnsupportedExchange
	}
}

// SupportedExchanges lists the adapters this build carries. It exists so the
// set is stated in one place; the frontend's selector must agree with it.
func SupportedExchanges() []string {
	return []string{"kraken", "binance"}
}
