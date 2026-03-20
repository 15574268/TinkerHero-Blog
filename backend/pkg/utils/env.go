package utils

import (
	"os"
	"strconv"
	"time"
)

// GetEnv returns the value of the environment variable named by the key,
// or defaultValue if the variable is not present.
func GetEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// GetEnvInt returns the integer value of the environment variable,
// or defaultValue if the variable is not set or not a valid integer.
func GetEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}

// GetEnvDuration returns the time.Duration value of the environment variable,
// or defaultValue if the variable is not set or not a valid duration.
func GetEnvDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}
