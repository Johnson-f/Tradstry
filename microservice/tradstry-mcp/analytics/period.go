package analytics

import (
	"errors"
	"fmt"
	"time"
)

type preset string

type periodInput struct {
	Period preset `json:"period,omitempty" jsonschema:"a named period; last_month is the previous calendar month"`
	Month  string `json:"month,omitempty" jsonschema:"a calendar month as YYYY-MM, instead of period"`
	From   string `json:"from,omitempty" jsonschema:"first day as YYYY-MM-DD, with to, instead of period"`
	To     string `json:"to,omitempty" jsonschema:"last day as YYYY-MM-DD, with from"`
}

var presets = []any{
	"today", "this_week", "last_7_days", "this_month", "last_month", "last_30_days",
	"last_3_months", "year_to_date", "last_12_months", "all",
}

// window is a resolved period: whole days in the journal's time zone. all
// means every trade, with no bounds.
type window struct {
	all      bool
	first    time.Time // midnight starting the first day
	last     time.Time // midnight starting the last day
	location *time.Location
	label    string
}

func (w window) days() int {
	return int(w.last.Sub(w.first).Hours()/24+0.5) + 1
}

// filter is the backend time filter for the window. Bounds are sent as exact
// local times, because the backend reads bare dates as UTC.
func (w window) filter() map[string]any {
	if w.all {
		return map[string]any{"range": "ALL"}
	}
	end := w.last.AddDate(0, 0, 1).Add(-time.Nanosecond)
	return map[string]any{
		"range":     "CUSTOM",
		"startDate": w.first.Format(time.RFC3339Nano),
		"endDate":   end.Format(time.RFC3339Nano),
	}
}

func resolvePeriod(in periodInput, now time.Time, location *time.Location) (window, error) {
	given := 0
	for _, set := range []bool{in.Period != "", in.Month != "", in.From != "" || in.To != ""} {
		if set {
			given++
		}
	}
	if given > 1 {
		return window{}, errors.New("give one of period, month, or from and to")
	}
	local := now.In(location)
	today := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, location)
	w := window{location: location, last: today}

	switch {
	case in.Month != "":
		month, err := time.ParseInLocation("2006-01", in.Month, location)
		if err != nil {
			return window{}, errors.New("month must be YYYY-MM")
		}
		w.first, w.last, w.label = month, month.AddDate(0, 1, -1), month.Format("January 2006")
	case in.From != "" || in.To != "":
		from, err1 := time.ParseInLocation(time.DateOnly, in.From, location)
		to, err2 := time.ParseInLocation(time.DateOnly, in.To, location)
		if err1 != nil || err2 != nil {
			return window{}, errors.New("from and to must both be YYYY-MM-DD")
		}
		if to.Before(from) {
			return window{}, errors.New("to must not be before from")
		}
		w.first, w.last, w.label = from, to, in.From+" to "+in.To
	default:
		period := in.Period
		if period == "" {
			period = "last_30_days"
		}
		w.label = string(period)
		switch period {
		case "today":
			w.first = today
		case "this_week":
			w.first = today.AddDate(0, 0, -((int(today.Weekday()) + 6) % 7))
		case "last_7_days":
			w.first = today.AddDate(0, 0, -6)
		case "this_month":
			w.first = time.Date(today.Year(), today.Month(), 1, 0, 0, 0, 0, location)
		case "last_month":
			w.first = time.Date(today.Year(), today.Month()-1, 1, 0, 0, 0, 0, location)
			w.last = w.first.AddDate(0, 1, -1)
		case "last_30_days":
			w.first = today.AddDate(0, 0, -29)
		case "last_3_months":
			w.first = today.AddDate(0, -3, 1)
		case "year_to_date":
			w.first = time.Date(today.Year(), 1, 1, 0, 0, 0, 0, location)
		case "last_12_months":
			w.first = today.AddDate(-1, 0, 1)
		case "all":
			return window{all: true, location: location, label: "all time"}, nil
		default:
			return window{}, fmt.Errorf("unknown period %q", period)
		}
	}
	return w, nil
}
