package store

import (
	"encoding/json"
	"errors"
	"time"
)

// Cosmos maintains a system timestamp on every document (`_ts`, Unix seconds)
// and honours an optional per-item `ttl` in seconds, dropping the item once
// `_ts + ttl` has passed. The file stores stand in for Cosmos during local
// development, so they simulate the same contract: writes stamp `_ts`, and
// reads and scans skip documents that have outlived their `ttl`.
//
// Keeping the two stores identical here is the whole point. A record that
// expires in production but lingers forever locally makes local development lie
// about the one behaviour it exists to reproduce — and expiry is exactly the
// kind of rule that is only ever exercised long after the code was written.
const tsField = "_ts"

// ttlMeta is the part of a stored document that governs its lifetime. Decoding
// only these two fields keeps reads cheap: the document itself is unmarshalled
// by the caller, and only once it has survived.
type ttlMeta struct {
	TS  int64 `json:"_ts"`
	TTL int64 `json:"ttl"`
}

// stampTimestamp injects `_ts` into an already-marshalled document, mirroring
// the system timestamp Cosmos maintains. Any existing `_ts` is overwritten, so
// the stamp always reflects the most recent write, as it does in Cosmos.
//
// Values are carried through as json.RawMessage rather than decoded, so numbers
// keep their exact representation instead of round-tripping via float64.
func stampTimestamp(data []byte, now time.Time) ([]byte, error) {
	var doc map[string]json.RawMessage
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, err
	}
	if doc == nil {
		return nil, errors.New("stampTimestamp: document is null")
	}
	ts, err := json.Marshal(now.UTC().Unix())
	if err != nil {
		return nil, err
	}
	doc[tsField] = ts
	return json.Marshal(doc)
}

// expired reports whether a stored document has outlived its ttl. Documents
// govern their own lifetime:
//
//   - No `ttl`, or a non-positive one: never expires. Cosmos reads -1 as
//     "never" and anything absent as "use the container default"; a directory of
//     files has no container default, so both simply mean keep.
//   - A positive `ttl`: expires once `_ts + ttl` seconds have passed.
//
// A document carrying a `ttl` but no `_ts` is kept. It was written before the
// store stamped timestamps, and reading a missing stamp as the epoch would
// expire it on the spot — destroying data to honour a deadline nobody recorded.
// An undecodable document is likewise kept: whatever is wrong with it, expiry is
// not the layer that should be deciding its fate.
//
// Callers delete what they find expired, rather than sweeping separately: by
// the time this returns true the document has already been read and judged, so
// removing it costs one syscall, while a sweeper would re-read files nobody
// asked about. FileRefreshTokenStore.Find has done the same since long before
// this existed. The consequence is that reads mutate, best-effort — nothing may
// depend on an expired file still being on disk.
func expired(data []byte, now time.Time) bool {
	var meta ttlMeta
	if err := json.Unmarshal(data, &meta); err != nil {
		return false
	}
	if meta.TTL <= 0 || meta.TS <= 0 {
		return false
	}
	expiresAt := time.Unix(meta.TS, 0).Add(time.Duration(meta.TTL) * time.Second)
	return !now.Before(expiresAt)
}
