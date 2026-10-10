package analytics

import (
	"testing"
	"time"
)

func TestPeriodsAreWholeLocalDays(t *testing.T) {
	newYork, _ := time.LoadLocation("America/New_York")
	// 01:30 UTC on 2026-10-09 is still the 8th in New York.
	now := time.Date(2026, 10, 9, 1, 30, 0, 0, time.UTC)

	cases := map[string]struct {
		in         periodInput
		start, end string
	}{
		"last month is the previous calendar month": {periodInput{Period: "last_month"}, "2026-09-01T00:00:00-04:00", "2026-09-30T23:59:59.999999999-04:00"},
		"today is the local day":                    {periodInput{Period: "today"}, "2026-10-08T00:00:00-04:00", "2026-10-08T23:59:59.999999999-04:00"},
		"this week starts on Monday":                {periodInput{Period: "this_week"}, "2026-10-05T00:00:00-04:00", "2026-10-08T23:59:59.999999999-04:00"},
		"a month":                                   {periodInput{Month: "2026-02"}, "2026-02-01T00:00:00-05:00", "2026-02-28T23:59:59.999999999-05:00"},
		"explicit days":                             {periodInput{From: "2026-03-07", To: "2026-03-09"}, "2026-03-07T00:00:00-05:00", "2026-03-09T23:59:59.999999999-04:00"},
		"the default is the last 30 days":           {periodInput{}, "2026-09-09T00:00:00-04:00", "2026-10-08T23:59:59.999999999-04:00"},
	}
	for name, tc := range cases {
		w, err := resolvePeriod(tc.in, now, newYork)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		f := w.filter()
		if f["range"] != "CUSTOM" || f["startDate"] != tc.start || f["endDate"] != tc.end {
			t.Errorf("%s: %v", name, f)
		}
	}

	if w, _ := resolvePeriod(periodInput{Period: "all"}, now, newYork); w.filter()["range"] != "ALL" {
		t.Error("all time must be unbounded")
	}
	for _, in := range []periodInput{
		{Period: "last_month", Month: "2026-09"},
		{Month: "September"},
		{From: "2026-09-01"},
		{From: "2026-09-10", To: "2026-09-01"},
		{Period: "fortnight"},
	} {
		if _, err := resolvePeriod(in, now, newYork); err == nil {
			t.Errorf("%+v was accepted", in)
		}
	}
}
