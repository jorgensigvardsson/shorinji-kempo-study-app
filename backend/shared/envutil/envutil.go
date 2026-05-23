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
