// Package numfmt rounds the numbers tools return, so a model reads -3.03 rather
// than the -3.0299999999999411 that float arithmetic upstream can produce.
package numfmt

import (
	"math"
	"math/big"
)

// Money rounds a decimal string to cents, half away from zero. Empty stays
// empty (unknown is not zero), and anything unparseable is returned unchanged.
func Money(value string) string {
	if value == "" {
		return ""
	}
	r, ok := new(big.Rat).SetString(value)
	if !ok {
		return value
	}
	cents := new(big.Rat).Mul(r, big.NewRat(100, 1))
	n := new(big.Int).Quo(cents.Num(), cents.Denom())
	rem := new(big.Rat).Sub(cents, new(big.Rat).SetInt(n))
	if rem.Abs(rem).Cmp(big.NewRat(1, 2)) >= 0 {
		n.Add(n, big.NewInt(int64(cents.Sign())))
	}
	return new(big.Rat).SetFrac(n, big.NewInt(100)).FloatString(2)
}

// IsZero reports whether a decimal string is zero, such as "0" or "0.00".
func IsZero(value string) bool {
	r, ok := new(big.Rat).SetString(value)
	return ok && r.Sign() == 0
}

// Round2 rounds to two decimal places, as for money.
func Round2(value float64) float64 { return round(value, 2) }

// Round1 rounds to one decimal place, as for percentages.
func Round1(value float64) float64 { return round(value, 1) }

// round never returns -0, which JSON would print as "-0".
func round(value float64, places int) float64 {
	scale := math.Pow10(places)
	rounded := math.Round(value*scale) / scale
	if rounded == 0 {
		return 0
	}
	return rounded
}

// Ratio rounds to two decimals. It returns nil for NaN and infinities, which
// JSON can't carry.
func Ratio(value float64) *float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return nil
	}
	rounded := round(value, 2)
	return &rounded
}
