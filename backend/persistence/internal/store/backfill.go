package store

import (
	"fmt"
	"log"
)

// BackfillResult reports what a backfill run did, so it can be read as a summary
// rather than reconstructed from logs.
type BackfillResult struct {
	// Users the authoritative store holds a document for.
	Total int `json:"total"`
	// Documents copied into the split store on this run.
	Copied int `json:"copied"`
	// Users whose split copy already matched, so nothing was written.
	AlreadyCurrent int `json:"alreadyCurrent"`
	// Users that could not be copied. The run continues past them.
	Failed int `json:"failed"`
	// Up to a handful of failures, named, so the cause is visible without log access.
	Errors []string `json:"errors,omitempty"`
}

const maxReportedBackfillErrors = 10

// BackfillUserData copies every stored document into the split-item store.
//
// Shadow writes only cover users who sync, so without this the new container holds the
// active and silently omits everyone else — which would look complete right up until
// reads moved across and the quiet accounts came back empty.
//
// Idempotent: a user whose split copy already reports the same updatedAt is skipped,
// so re-running after a failure costs reads rather than rewrites. It is deliberately
// not run at startup — it is a full scan of a container built for point reads, and
// belongs to an operation someone chose to start.
//
// A user that fails is counted and passed over rather than abandoning the run: one bad
// document should not keep everyone else out of the new container.
func BackfillUserData(source Store, target UserDataStore, logf func(string, ...any)) (BackfillResult, error) {
	if logf == nil {
		logf = log.Printf
	}

	lister, ok := source.(UserLister)
	if !ok {
		return BackfillResult{}, fmt.Errorf("the configured store cannot enumerate users")
	}
	userIDs, err := lister.ListUserIDs()
	if err != nil {
		return BackfillResult{}, fmt.Errorf("list users: %w", err)
	}

	result := BackfillResult{Total: len(userIDs)}
	logf("userdata backfill: starting for %d users", result.Total)

	for _, userID := range userIDs {
		doc, _, err := source.Load(userID)
		if err != nil {
			result.note(&result.Failed, fmt.Sprintf("%s: load: %v", userID, err))
			continue
		}
		if doc == nil {
			// Deleted between listing and loading. Nothing to copy, and nothing wrong.
			continue
		}

		existing, err := target.Load(userID)
		if err != nil {
			// Unreadable on the target is not a reason to skip: overwriting it is
			// exactly what a backfill is for.
			logf("userdata backfill: %s: reading existing copy failed, copying anyway: %v", userID, err)
		} else if existing != nil && existing.UpdatedAt == doc.UpdatedAt && existing.UpdatedAt != "" {
			result.AlreadyCurrent++
			continue
		}

		if err := target.Save(userID, doc); err != nil {
			result.note(&result.Failed, fmt.Sprintf("%s: save: %v", userID, err))
			continue
		}
		result.Copied++
	}

	logf("userdata backfill: done — total=%d copied=%d alreadyCurrent=%d failed=%d",
		result.Total, result.Copied, result.AlreadyCurrent, result.Failed)
	return result, nil
}

func (r *BackfillResult) note(counter *int, message string) {
	*counter++
	if len(r.Errors) < maxReportedBackfillErrors {
		r.Errors = append(r.Errors, message)
	}
}
