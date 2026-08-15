package store

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// The document, stored as several items per user instead of one.
//
// The split is structural, not semantic: one item per top-level field of `data`, plus
// a meta item for the envelope. The server does not need to know what any field means,
// which is the point — a field-aware split would have to be taught every schema change
// the client makes, in Go, in lockstep, and drift the moment that slipped. The
// structural split handles fields nobody has invented yet for free.
//
// It is also not the final shape. Splitting `notes` into one item per note, and
// bucketing the big maps, needs the key formats and belongs in the client, which
// already knows them. That comes with the granular API. This split is what gets the
// data into the new container safely, and it already lifts the ceiling from one item
// per user to one per field.
const (
	metaItemID = "meta"

	// The prefix a field item's id is built from, per scheme. See ItemScheme.
	fieldItemPrefix       = "field_"
	legacyFieldItemPrefix = "field/"
)

// How a document's field items name themselves. Recorded on the meta item so a
// reader never has to guess which scheme the items beside it are in.
//
// SchemeLegacy built ids as "field/" + name. Cosmos documents "/" as illegal in an
// id and enforces that asymmetrically: it accepts the write, then refuses every
// delete of what it just accepted. So a field could be added but never removed, and
// nothing noticed until the first field was retired from the document — at which
// point every write for that user began failing, because the whole transactional
// batch is rejected when one operation in it is. Items already stored this way
// cannot be deleted at all; they are expired with a TTL instead.
//
// SchemeEscaped uses "field_" and percent-escapes the characters Cosmos rejects, so
// a field name arriving from a client can no longer produce an id the store cannot
// manage.
const (
	SchemeLegacy  = 0
	SchemeEscaped = 1

	currentScheme = SchemeEscaped
)

// Cosmos rejects these four characters in an item id. Field names are the top-level
// keys of the client's `data`, so nothing guarantees they avoid them — "%" is escaped
// too, which is what keeps the encoding reversible.
var fieldNameEscaper = strings.NewReplacer(
	"%", "%25",
	"/", "%2F",
	"\\", "%5C",
	"?", "%3F",
	"#", "%23",
)

var fieldNameUnescaper = strings.NewReplacer(
	"%2F", "/",
	"%5C", "\\",
	"%3F", "?",
	"%23", "#",
	"%25", "%",
)

func fieldItemID(field string, scheme int) string {
	if scheme == SchemeLegacy {
		return legacyFieldItemPrefix + field
	}
	return fieldItemPrefix + fieldNameEscaper.Replace(field)
}

// fieldNameFromID is the inverse of fieldItemID: the field name, and whether the id
// belonged to a field item of that scheme at all.
func fieldNameFromID(id string, scheme int) (string, bool) {
	if scheme == SchemeLegacy {
		return strings.CutPrefix(id, legacyFieldItemPrefix)
	}
	escaped, ok := strings.CutPrefix(id, fieldItemPrefix)
	if !ok {
		return "", false
	}
	return fieldNameUnescaper.Replace(escaped), true
}

// DocumentMeta is the envelope, minus the data itself.
type DocumentMeta struct {
	Version       int    `json:"version"`
	UpdatedAt     string `json:"updatedAt"`
	DeviceID      string `json:"deviceId"`
	SchemaVersion int    `json:"schemaVersion,omitempty"`
	ClientCompat  int    `json:"clientCompat,omitempty"`

	// Fields names the field items that make up this document, so reassembling it is
	// a series of point reads rather than a query. That keeps the container free of
	// any indexing requirement, like the one it is replacing.
	Fields []string `json:"fields"`

	// RawData holds `data` whole when it is not a JSON object and so cannot be split
	// by field — null, or anything else a client might send. Splitting has to round
	// trip exactly, including inputs nothing is supposed to produce.
	RawData json.RawMessage `json:"rawData,omitempty"`

	// Which scheme the field items beside this one name themselves with. Absent on
	// everything written before the scheme changed, which is exactly what SchemeLegacy
	// being the zero value means.
	ItemScheme int `json:"itemScheme,omitempty"`
}

// UserDataItem is one stored item: the meta envelope or a single field of `data`.
// UserID is the partition key, so everything belonging to a user shares a partition
// and can be written in one transaction.
type UserDataItem struct {
	ID     string          `json:"id"`
	UserID string          `json:"userId"`
	Value  json.RawMessage `json:"value"`
}

// SplitDocument turns a document into the items it is stored as. The returned items
// always start with the meta item, and always use the current scheme — a document is
// migrated off the legacy one by being written.
func SplitDocument(userID string, doc *Document) ([]UserDataItem, error) {
	meta := DocumentMeta{
		Version:       doc.Version,
		UpdatedAt:     doc.UpdatedAt,
		DeviceID:      doc.DeviceID,
		SchemaVersion: doc.SchemaVersion,
		ClientCompat:  doc.ClientCompat,
		ItemScheme:    currentScheme,
	}

	var fields map[string]json.RawMessage
	if len(doc.Data) > 0 {
		if err := json.Unmarshal(doc.Data, &fields); err != nil || fields == nil {
			// Not a JSON object: keep it whole rather than lose or reshape it.
			// `null` lands here too, unmarshalling to a nil map without an error.
			meta.RawData = doc.Data
			fields = nil
		} else {
			// Allocated even when empty, because nil and empty mean different things
			// on the way back: no data at all versus an empty object. JSON keeps them
			// apart as null and [], so the distinction survives being stored.
			meta.Fields = make([]string, 0, len(fields))
			for name := range fields {
				meta.Fields = append(meta.Fields, name)
			}
			// Sorted so the same document always produces the same items in the same
			// order, which makes writes and their tests deterministic.
			sort.Strings(meta.Fields)
		}
	}

	items := make([]UserDataItem, 0, len(fields)+1)

	encodedMeta, err := json.Marshal(meta)
	if err != nil {
		return nil, fmt.Errorf("marshal document meta: %w", err)
	}
	items = append(items, UserDataItem{ID: metaItemID, UserID: userID, Value: encodedMeta})

	for _, name := range meta.Fields {
		items = append(items, UserDataItem{ID: fieldItemID(name, currentScheme), UserID: userID, Value: fields[name]})
	}
	return items, nil
}

// AssembleDocument rebuilds a document from its items. Reassembling what SplitDocument
// produced must give back exactly the document that went in — that equivalence is the
// whole safety argument for writing to both containers before trusting either.
func AssembleDocument(items []UserDataItem) (*Document, error) {
	var meta DocumentMeta
	foundMeta := false
	for _, item := range items {
		if item.ID != metaItemID {
			continue
		}
		if err := json.Unmarshal(item.Value, &meta); err != nil {
			return nil, fmt.Errorf("unmarshal document meta: %w", err)
		}
		foundMeta = true
		break
	}

	if !foundMeta {
		return nil, fmt.Errorf("no %q item among %d items", metaItemID, len(items))
	}

	// Read in a second pass, because which ids count as field items depends on the
	// scheme the meta item just named.
	fields := make(map[string]json.RawMessage, len(items))
	for _, item := range items {
		if item.ID == metaItemID {
			continue
		}
		if name, ok := fieldNameFromID(item.ID, meta.ItemScheme); ok {
			fields[name] = item.Value
		}
	}

	doc := &Document{
		Version:       meta.Version,
		UpdatedAt:     meta.UpdatedAt,
		DeviceID:      meta.DeviceID,
		SchemaVersion: meta.SchemaVersion,
		ClientCompat:  meta.ClientCompat,
	}

	if meta.RawData != nil {
		doc.Data = meta.RawData
		return doc, nil
	}
	if meta.Fields == nil {
		return doc, nil // no data at all, as opposed to an empty object
	}

	// Rebuilt key by key in the recorded order, so a document that round-trips is
	// byte-identical rather than merely equivalent.
	var b strings.Builder
	b.WriteByte('{')
	for i, name := range meta.Fields {
		value, ok := fields[name]
		if !ok {
			return nil, fmt.Errorf("meta names field %q but no item holds it", name)
		}
		if i > 0 {
			b.WriteByte(',')
		}
		key, err := json.Marshal(name)
		if err != nil {
			return nil, fmt.Errorf("marshal field name %q: %w", name, err)
		}
		b.Write(key)
		b.WriteByte(':')
		b.Write(value)
	}
	b.WriteByte('}')
	doc.Data = json.RawMessage(b.String())
	return doc, nil
}

// UserDataStore is the split-item store that will eventually replace Store.
//
// Concurrency rides on the meta item. Every write rewrites it — it carries updatedAt
// and the field list — so its ETag identifies the document as a whole, and guarding it
// inside the batch means a write based on a stale read is refused in full rather than
// landing over someone else's. There is no need to hash the parts together: the item
// they all move with already answers the question.
//
// Save is the checked write, for once reads are served from here. SaveUnconditional is
// for shadow writes and the backfill, which are copies of a write the old store has
// already accepted and ordered — adding a second concurrency check there would reject
// writes that were never in conflict.
type UserDataStore interface {
	// Load returns the document and the ETag naming that exact version, or
	// (nil, "", nil) when the user has nothing stored.
	Load(userID string) (*Document, string, error)

	// Save writes doc if the stored version still matches ifMatch. An empty ifMatch
	// asserts nothing is stored yet. Either way a wrong assertion is
	// ErrPreconditionFailed, as with Store.
	Save(userID string, doc *Document, ifMatch string) (string, error)

	// SaveUnconditional writes doc with no concurrency check.
	SaveUnconditional(userID string, doc *Document) (string, error)

	Delete(userID string) error
}
