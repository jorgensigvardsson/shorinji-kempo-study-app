package api

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// Email addresses reached the production logs for months before anybody noticed,
// and nothing about the code said they should not. A reviewer will not catch the
// next one either: it looks exactly like every other log line, and the harm is
// invisible until somebody exports a workspace.
//
// So the rule is checked rather than remembered. Every address written to a log
// goes through logsafe.Email (see backend/shared/logsafe), which turns it into a
// token that still ties lines together and tells a reader nothing about who the
// person is.
//
// If this fails on a line you just wrote, the fix is logsafe.Email(...) around the
// address — or, better, logging the user id instead, which is already there in
// most of the places that were tempted to log an address.
func TestLogLinesCarryNoEmailAddresses(t *testing.T) {
	// Arguments that hold an address. Matched only where they are a whole
	// argument, so `logsafe.Email(addr)` and `user.EmailVerified` both pass.
	suspect := regexp.MustCompile(`,\s*(addr|email|to|recipient|[A-Za-z]+\.Email)\s*[,)]`)
	logCall := regexp.MustCompile(`\blog\.(Printf|Println|Print|Fatalf)\(`)

	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read package directory: %v", err)
	}

	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		source, err := os.ReadFile(filepath.Clean(name))
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		for i, line := range strings.Split(string(source), "\n") {
			if !logCall.MatchString(line) {
				continue
			}
			if match := suspect.FindString(line); match != "" {
				t.Errorf("%s:%d logs an email address (%s):\n    %s\nWrap it in logsafe.Email, or log the user id instead.",
					name, i+1, strings.TrimSpace(match), strings.TrimSpace(line))
			}
		}
	}
}
