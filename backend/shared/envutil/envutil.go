package envutil

import (
	"os"
	"strconv"
)

// String returns the value of the environment variable key, or fallback if unset.
func String(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}

// Bool returns the environment variable key parsed as a bool, or fallback if unset or
// unparseable. Accepts the forms strconv.ParseBool does: 1/t/T/true/TRUE, 0/f/F/false.
func Bool(key string, fallback bool) bool {
	if v, ok := os.LookupEnv(key); ok {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

// Float64 returns the environment variable key parsed as float64, or fallback if
// unset or unparseable.
func Float64(key string, fallback float64) float64 {
	if v, ok := os.LookupEnv(key); ok {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return fallback
}
