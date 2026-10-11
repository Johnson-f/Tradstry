package client

import (
	"encoding/json"
	"testing"

	snaptrade "github.com/passiv/snaptrade-sdks/sdks/go"

	"snaptrade-service/contract"
)

// Orders and activities pass through the SDK's models before we re-read them as
// JSON, so a field an SDK upgrade stops carrying would vanish without a compile error.

func TestOrdersKeepTheirSymbolsThroughTheSDKModel(t *testing.T) {
	var orders []snaptrade.AccountOrderRecord
	if err := json.Unmarshal([]byte(`[
		{"brokerage_order_id": "o1", "status": "EXECUTED", "action": "BUY", "order_type": "Limit",
		 "total_quantity": "10", "execution_price": 12.5, "time_placed": "2026-09-01T14:30:00Z",
		 "universal_symbol": {"id": "u1", "symbol": "AAPL", "raw_symbol": "AAPL", "description": "Apple",
		   "currency": {"id": "c1", "code": "USD", "name": "US Dollar"}, "exchange": null,
		   "type": {"id": "t1", "code": "cs", "description": "Common Stock"}, "currencies": []}},
		{"brokerage_order_id": "o2", "status": "EXECUTED", "action": "SELL_TO_OPEN",
		 "option_symbol": {"id": "op1", "ticker": "AAPL  261218C00200000", "option_type": "CALL",
		   "strike_price": 200, "expiration_date": "2026-12-18",
		   "underlying_symbol": {"id": "u1", "symbol": "AAPL"}}}
	]`), &orders); err != nil {
		t.Fatal(err)
	}

	normalized, err := normalizeOrders(orders)
	if err != nil {
		t.Fatal(err)
	}
	if len(normalized) != 2 || normalized[0].Symbol == nil || *normalized[0].Symbol != "AAPL" ||
		normalized[0].Status == nil || *normalized[0].Status != "EXECUTED" {
		t.Fatalf("stock order = %#v", normalized[0])
	}
	if normalized[1].OptionSymbol == nil || *normalized[1].OptionSymbol != "AAPL  261218C00200000" {
		t.Fatalf("option order = %#v", normalized[1])
	}
}

func TestActivitiesKeepTheirFieldsThroughTheSDKModel(t *testing.T) {
	var page snaptrade.PaginatedUniversalActivity
	if err := json.Unmarshal([]byte(`{
		"data": [{
			"id": "a1", "type": "BUY", "price": 12.5, "units": 10, "amount": -125, "fee": 1,
			"trade_date": "2026-09-01T00:00:00Z", "institution": "Schwab", "external_reference_id": "x1",
			"currency": {"id": "c1", "code": "USD", "name": "US Dollar"},
			"symbol": {"id": "u1", "symbol": "AAPL", "raw_symbol": "AAPL", "description": "Apple",
			  "currency": {"id": "c1", "code": "USD", "name": "US Dollar"}},
			"option_symbol": {"id": "op1", "ticker": "AAPL  261218C00200000", "option_type": "CALL",
			  "strike_price": 200, "expiration_date": "2026-12-18", "is_mini_option": false,
			  "underlying_symbol": {"id": "u1", "symbol": "AAPL"}}
		}],
		"pagination": {"offset": 0, "limit": 1000, "total": 1}
	}`), &page); err != nil {
		t.Fatal(err)
	}

	var raw struct {
		Data []contract.Activity `json:"data"`
	}
	if err := decodeViaJSON(page, &raw); err != nil {
		t.Fatal(err)
	}
	if len(raw.Data) != 1 {
		t.Fatalf("activities = %#v", raw.Data)
	}
	a := raw.Data[0]
	if a.Symbol == nil || a.Symbol.Symbol == nil || *a.Symbol.Symbol != "AAPL" ||
		a.Symbol.Currency == nil || *a.Symbol.Currency.Code != "USD" {
		t.Errorf("symbol = %#v", a.Symbol)
	}
	if a.Currency == nil || a.Currency.Code == nil || *a.Currency.Code != "USD" {
		t.Errorf("currency = %#v", a.Currency)
	}
	if a.OptionSymbol == nil || a.OptionSymbol.Ticker == nil || *a.OptionSymbol.Ticker != "AAPL  261218C00200000" ||
		a.OptionSymbol.StrikePrice == nil || *a.OptionSymbol.StrikePrice != 200 ||
		a.OptionSymbol.UnderlyingSymbol == nil || *a.OptionSymbol.UnderlyingSymbol.Symbol != "AAPL" {
		t.Errorf("option symbol = %#v", a.OptionSymbol)
	}
	if a.Fee == nil || *a.Fee != 1 || a.ExternalReferenceID == nil || *a.ExternalReferenceID != "x1" {
		t.Errorf("activity = %#v", a)
	}
}
