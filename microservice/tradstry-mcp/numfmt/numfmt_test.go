package numfmt

import (
	"math"
	"testing"
)

func TestMoneyRoundsToCents(t *testing.T) {
	cases := map[string]string{
		"-3.0299999999999411": "-3.03",
		"125.5":               "125.50",
		"0.005":               "0.01",
		"-0.005":              "-0.01",
		"-0.004":              "0.00",
		"0":                   "0.00",
		"1e-9":                "0.00",
		"":                    "",
		"n/a":                 "n/a",
	}
	for in, want := range cases {
		if got := Money(in); got != want {
			t.Errorf("Money(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestIsZero(t *testing.T) {
	for _, zero := range []string{"0", "0.00", "-0"} {
		if !IsZero(zero) {
			t.Errorf("IsZero(%q) = false", zero)
		}
	}
	for _, other := range []string{"", "0.01", "x"} {
		if IsZero(other) {
			t.Errorf("IsZero(%q) = true", other)
		}
	}
}

func TestRatio(t *testing.T) {
	if got := Ratio(math.Copysign(0, -1)); got == nil || math.Signbit(*got) {
		t.Errorf("Ratio(-0) = %v, want 0", got)
	}
	if got := Ratio(1.23456); got == nil || *got != 1.23 {
		t.Errorf("Ratio(1.23456) = %v", got)
	}
	if Ratio(math.Inf(1)) != nil || Ratio(math.NaN()) != nil {
		t.Error("non-finite ratios must be nil")
	}
}
