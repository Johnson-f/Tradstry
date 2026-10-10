package calculator

import (
	"strings"
	"testing"
)

func TestSizingMatchesTheWebCalculator(t *testing.T) {
	// $10,000 at 1% risk is a $100 budget; a $2 stop buys 50 shares.
	s, err := size("long", 48, 10000, 1, []plannedEntry{{Price: 50, RiskPercent: 100}}, false)
	if err != nil {
		t.Fatal(err)
	}
	if s.RiskBudget != 100 || s.TotalShares != 50 || s.TotalRisk != 100 || s.PositionValue != 2500 || s.Entries[0].StopDistance != 4 {
		t.Errorf("sizing = %+v", s)
	}

	// Shares round down so the loss never exceeds the budget: 100 / 3 = 33.333 → 33.33.
	s, _ = size("short", 53, 10000, 1, []plannedEntry{{Price: 50, RiskPercent: 100}}, false)
	if s.TotalShares != 33.33 || s.TotalRisk > 100 {
		t.Errorf("short = %+v", s)
	}
	s, _ = size("short", 53, 10000, 1, []plannedEntry{{Price: 50, RiskPercent: 100}}, true)
	if s.TotalShares != 33 {
		t.Errorf("whole shares = %v", s.TotalShares)
	}
}

func TestScaleInsSplitTheRisk(t *testing.T) {
	s, err := size("long", 90, 20000, 1, []plannedEntry{{Price: 100, RiskPercent: 50}, {Price: 95, RiskPercent: 50}}, false)
	if err != nil {
		t.Fatal(err)
	}
	if s.Entries[0].Shares != 10 || s.Entries[1].Shares != 20 || s.TotalShares != 30 || round2(s.AverageEntry) != 96.67 {
		t.Errorf("scale-in = %+v", s)
	}
}

func TestSizingRefusesImpossiblePlans(t *testing.T) {
	cases := map[string]struct {
		direction string
		stop      float64
		entries   []plannedEntry
		want      string
	}{
		"stop above a long":  {"long", 55, []plannedEntry{{50, 100}}, "must be below"},
		"stop below a short": {"short", 45, []plannedEntry{{50, 100}}, "must be above"},
		"split not 100%":     {"long", 45, []plannedEntry{{50, 60}, {49, 30}}, "add up to 100%"},
		"no entries":         {"long", 45, nil, "at least one entry"},
	}
	for name, c := range cases {
		if _, err := size(c.direction, c.stop, 10000, 1, c.entries, false); err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: %v", name, err)
		}
	}
}
