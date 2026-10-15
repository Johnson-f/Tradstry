package calculator

import (
	"fmt"
	"math"
)

// The sizing rules mirror the web calculator (app-ui position-calculator-risk.ts)
// so a plan sized in chat matches one sized on tradstry.com.

type entrySize struct {
	Price         float64
	RiskPercent   float64 // share of the risk budget this entry carries
	AllocatedRisk float64
	RiskPerShare  float64
	Shares        float64
	ActualRisk    float64
	PositionValue float64
	StopDistance  float64 // percent of the entry price
}

type sizing struct {
	Direction     string
	Stop          float64
	Balance       float64
	RiskPercent   float64
	RiskBudget    float64
	Entries       []entrySize
	TotalShares   float64
	TotalRisk     float64
	PositionValue float64
	AverageEntry  float64
}

func floorTo(value float64, decimals int) float64 {
	factor := math.Pow(10, float64(decimals))
	return math.Floor((value+1e-9)*factor) / factor
}

type plannedEntry struct {
	Price       float64
	RiskPercent float64
}

// size splits balance × riskPercent across entries. Shares round down, so the
// planned loss never exceeds the budget; wholeShares rounds to whole shares.
func size(direction string, stop, balance, riskPercent float64, entries []plannedEntry, wholeShares bool) (sizing, error) {
	if direction != "long" && direction != "short" {
		return sizing{}, fmt.Errorf("direction must be long or short")
	}
	if balance <= 0 || riskPercent <= 0 || stop <= 0 {
		return sizing{}, fmt.Errorf("the account balance, risk percent and stop must all be above zero")
	}
	if len(entries) == 0 {
		return sizing{}, fmt.Errorf("give at least one entry price")
	}
	total := 0.0
	for _, e := range entries {
		total += e.RiskPercent
	}
	if math.Abs(total-100) > 0.01 {
		return sizing{}, fmt.Errorf("the entries' shares of the risk must add up to 100%%, not %g%%", total)
	}

	s := sizing{Direction: direction, Stop: stop, Balance: balance, RiskPercent: riskPercent, RiskBudget: balance * riskPercent / 100}
	decimals := 2
	if wholeShares {
		decimals = 0
	}
	for _, e := range entries {
		if e.Price <= 0 {
			return sizing{}, fmt.Errorf("entry prices must be above zero")
		}
		riskPerShare := e.Price - stop
		if direction == "short" {
			riskPerShare = stop - e.Price
		}
		if riskPerShare <= 0 {
			side := "below"
			if direction == "short" {
				side = "above"
			}
			return sizing{}, fmt.Errorf("for a %s, the stop (%g) must be %s every entry price (%g)", direction, stop, side, e.Price)
		}
		allocated := s.RiskBudget * e.RiskPercent / 100
		shares := floorTo(allocated/riskPerShare, decimals)
		if shares <= 0 {
			return sizing{}, fmt.Errorf("the risk for the entry at %g buys no shares; widen the risk or narrow the stop", e.Price)
		}
		es := entrySize{
			Price: e.Price, RiskPercent: e.RiskPercent, AllocatedRisk: allocated, RiskPerShare: riskPerShare,
			Shares: shares, ActualRisk: shares * riskPerShare, PositionValue: shares * e.Price,
			StopDistance: riskPerShare / e.Price * 100,
		}
		s.Entries = append(s.Entries, es)
		s.TotalShares += es.Shares
		s.TotalRisk += es.ActualRisk
		s.PositionValue += es.PositionValue
	}
	s.AverageEntry = s.PositionValue / s.TotalShares
	return s, nil
}

// stopDistance is how far the stop sits from price, as a percent of price.
func stopDistance(price, stop float64) float64 {
	return math.Abs(price-stop) / price * 100
}
