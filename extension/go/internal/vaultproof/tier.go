package vaultproof

// TierForUSD reduces a portfolio valuation to a coarse band.
//
// This is the whole privacy argument in one function. Publishing an exact
// balance would let anyone watching the chain fingerprint a user by their
// number; publishing a band publishes roughly 2.5 bits instead. The bands are
// wide on purpose — wide enough that many users share one, narrow enough that
// a lender can still price risk.
//
// Bands must match web/lib/config/tiers.ts and LendingPool.tierCap. All three
// change together or the UI promises a cap the chain rejects.
func TierForUSD(usd float64) uint8 {
	switch {
	case usd < 1_000:
		return 0
	case usd < 10_000:
		return 1
	case usd < 50_000:
		return 2
	case usd < 250_000:
		return 3
	default:
		return 4
	}
}
