package vaultproof

import (
	"context"
	"fmt"
	"math"
	"math/big"
	"strings"

	ethereum "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
)

// ethereumCall builds a read-only call to a contract.
func ethereumCall(to common.Address, data []byte) ethereum.CallMsg {
	return ethereum.CallMsg{To: &to, Data: data}
}

// FTSO pricing, done inside the enclave.
//
// This is the step that makes the valuation adversarially safe. If the enclave
// trusted the exchange's own USD figure, anyone who can run a server that
// speaks the Kraken wire format could mint themselves a T4 attestation. Taking
// the price from Flare's own feeds — on the same chain the loan settles on —
// removes that.

// FtsoV2 feed IDs are 21 bytes: category (0x01 = crypto) ‖ ASCII name ‖ zero pad.
// Published at dev.flare.network under the FTSOv2 feed reference.
func feedID(symbol string) [21]byte {
	var id [21]byte
	id[0] = 0x01
	copy(id[1:], symbol+"/USD")
	return id
}

// The FtsoV2 surface the enclave needs. Transcribed rather than imported so
// the enclave image does not pull the whole periphery package.
const ftsoV2ABI = `[{
  "type":"function","name":"getFeedById","stateMutability":"payable",
  "inputs":[{"name":"_feedId","type":"bytes21"}],
  "outputs":[
    {"name":"_value","type":"uint256"},
    {"name":"_decimals","type":"int8"},
    {"name":"_timestamp","type":"uint64"}]
}]`

// FlareContractRegistry is at the same address on every Flare network.
const flareContractRegistry = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019"

const registryABI = `[{
  "type":"function","name":"getContractAddressByName","stateMutability":"view",
  "inputs":[{"name":"_name","type":"string"}],
  "outputs":[{"name":"","type":"address"}]
}]`

// PriceFeed reads USD prices for a set of symbols from FTSOv2.
type PriceFeed struct {
	client *ethclient.Client
	ftso   common.Address
	ftsoAB abi.ABI
}

// NewPriceFeed dials the chain and resolves FtsoV2 through the contract
// registry, so the address is never hardcoded per network.
func NewPriceFeed(ctx context.Context, rpcURL string) (*PriceFeed, error) {
	client, err := ethclient.DialContext(ctx, rpcURL)
	if err != nil {
		return nil, fmt.Errorf("dialling chain: %w", err)
	}

	regAB, err := abi.JSON(strings.NewReader(registryABI))
	if err != nil {
		return nil, fmt.Errorf("parsing registry ABI: %w", err)
	}
	ftsoAB, err := abi.JSON(strings.NewReader(ftsoV2ABI))
	if err != nil {
		return nil, fmt.Errorf("parsing FtsoV2 ABI: %w", err)
	}

	packed, err := regAB.Pack("getContractAddressByName", "FtsoV2")
	if err != nil {
		return nil, fmt.Errorf("packing registry call: %w", err)
	}

	registry := common.HexToAddress(flareContractRegistry)
	out, err := client.CallContract(ctx, ethereumCall(registry, packed), nil)
	if err != nil {
		return nil, fmt.Errorf("resolving FtsoV2 address: %w", err)
	}

	var ftso common.Address
	if err := regAB.UnpackIntoInterface(&ftso, "getContractAddressByName", out); err != nil {
		return nil, fmt.Errorf("decoding FtsoV2 address: %w", err)
	}
	if ftso == (common.Address{}) {
		return nil, fmt.Errorf("contract registry has no FtsoV2 entry")
	}

	return &PriceFeed{client: client, ftso: ftso, ftsoAB: ftsoAB}, nil
}

// Close releases the RPC connection.
func (p *PriceFeed) Close() {
	if p.client != nil {
		p.client.Close()
	}
}

// PriceUSD returns the USD price for one symbol, e.g. "BTC".
func (p *PriceFeed) PriceUSD(ctx context.Context, symbol string) (float64, error) {
	if symbol == "USD" {
		return 1, nil
	}

	id := feedID(symbol)
	packed, err := p.ftsoAB.Pack("getFeedById", id)
	if err != nil {
		return 0, fmt.Errorf("packing feed call for %s: %w", symbol, err)
	}

	out, err := p.client.CallContract(ctx, ethereumCall(p.ftso, packed), nil)
	if err != nil {
		return 0, fmt.Errorf("reading feed %s: %w", symbol, err)
	}

	values, err := p.ftsoAB.Unpack("getFeedById", out)
	if err != nil || len(values) < 2 {
		return 0, fmt.Errorf("decoding feed %s", symbol)
	}

	raw, ok := values[0].(*big.Int)
	if !ok {
		return 0, fmt.Errorf("unexpected value type for feed %s", symbol)
	}
	decimals, ok := values[1].(int8)
	if !ok {
		return 0, fmt.Errorf("unexpected decimals type for feed %s", symbol)
	}

	return float64(raw.Int64()) / math.Pow(10, float64(decimals)), nil
}

// ValueUSD prices a whole balance sheet.
//
// An asset with no FTSO feed is skipped rather than guessed. Skipping can only
// ever understate a portfolio, which fails safe: the user gets a lower tier
// than they deserve, never a higher one.
func (p *PriceFeed) ValueUSD(ctx context.Context, balances Balances) (float64, error) {
	var total float64
	for asset, qty := range balances {
		price, err := p.PriceUSD(ctx, asset)
		if err != nil {
			continue
		}
		total += qty * price
	}
	return total, nil
}
