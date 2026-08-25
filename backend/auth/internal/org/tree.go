// Package org holds the organization tree in memory.
//
// The auth service runs as a single replica — the same constraint that already
// lets OIDC pending state and email verification codes live in-process — so an
// in-process cache of the tree is coherent by construction rather than by
// invalidation. The tree is tens of federations and, at the very most, hundreds
// of branches: a few kilobytes, read on nearly every request (every token issued
// resolves a branch to its federation) and written a handful of times a year.
// Querying the store for that would be paying rent on a room nobody enters.
package org

import (
	"sort"
	"sync"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
)

// Tree is a read-mostly snapshot of the organization, kept in step with the
// store by routing writes through it. Every accessor returns copies: the
// snapshot is shared by every request goroutine, and handing out pointers into
// it would let one caller's edit become another's surprise.
type Tree struct {
	store store.OrgStore

	mu                   sync.RWMutex
	nodes                map[string]store.OrgNode
	branchesByFederation map[string][]string
	wskoBranches         []string // branches attached directly to WSKO
}

// New returns a tree backed by s. It is empty until Reload is called, which the
// service does once at startup.
func New(s store.OrgStore) *Tree {
	return &Tree{
		store:                s,
		nodes:                map[string]store.OrgNode{},
		branchesByFederation: map[string][]string{},
	}
}

// Reload rebuilds the snapshot from the store. On failure the previous snapshot
// is left in place: a tree that is a few seconds stale is worth more than one
// that has been emptied, since an empty tree silently strips every federation
// admin of their branches.
func (t *Tree) Reload() error {
	nodes, err := t.store.List()
	if err != nil {
		return err
	}

	byID := make(map[string]store.OrgNode, len(nodes))
	byFederation := map[string][]string{}
	var wsko []string

	for _, n := range nodes {
		if n == nil {
			continue
		}
		byID[n.ID] = *n
	}
	// Indexed in a second pass so a branch is filed under its federation only
	// when that federation is actually present, rather than depending on the
	// order the store happened to return them in.
	for _, n := range byID {
		if !n.IsBranch() {
			continue
		}
		if n.FederationID == "" {
			wsko = append(wsko, n.ID)
			continue
		}
		byFederation[n.FederationID] = append(byFederation[n.FederationID], n.ID)
	}
	for id := range byFederation {
		sort.Strings(byFederation[id])
	}
	sort.Strings(wsko)

	t.mu.Lock()
	t.nodes, t.branchesByFederation, t.wskoBranches = byID, byFederation, wsko
	t.mu.Unlock()
	return nil
}

// Save writes a node and refreshes the snapshot, so a caller cannot persist a
// change and forget to make it visible. The store is the authority; the reload
// is what makes the cache honest.
func (t *Tree) Save(node *store.OrgNode) error {
	if err := t.store.Save(node); err != nil {
		return err
	}
	return t.Reload()
}

// Node returns any node by id.
func (t *Tree) Node(id string) (store.OrgNode, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	n, ok := t.nodes[id]
	return n, ok
}

// Branch returns the branch with this id, or ok=false if the id is unknown or
// names a federation.
func (t *Tree) Branch(id string) (store.OrgNode, bool) {
	n, ok := t.Node(id)
	if !ok || !n.IsBranch() {
		return store.OrgNode{}, false
	}
	return n, true
}

// Federation returns the federation with this id, or ok=false if the id is
// unknown or names a branch.
func (t *Tree) Federation(id string) (store.OrgNode, bool) {
	n, ok := t.Node(id)
	if !ok || !n.IsFederation() {
		return store.OrgNode{}, false
	}
	return n, true
}

// FederationOf reports which federation a branch belongs to, or "" for a branch
// attached directly to WSKO, an unknown id, or an id that names a federation.
// This is the whole of what authz.Covers needs from the tree.
func (t *Tree) FederationOf(branchID string) string {
	n, ok := t.Branch(branchID)
	if !ok {
		return ""
	}
	return n.FederationID
}

// BranchesIn returns the ids of every branch in a federation. Passing "" returns
// the branches attached directly to WSKO, which is the same question asked of
// the implicit root.
func (t *Tree) BranchesIn(federationID string) []string {
	t.mu.RLock()
	defer t.mu.RUnlock()
	if federationID == "" {
		return append([]string(nil), t.wskoBranches...)
	}
	return append([]string(nil), t.branchesByFederation[federationID]...)
}

// Federations returns every federation, and Branches every branch, both ordered
// by name so a listing is stable between calls. Ordering for a reader is the
// UI's job — it has the locale, and this does not.
func (t *Tree) Federations() []store.OrgNode { return t.nodesOfType(store.NodeFederation) }
func (t *Tree) Branches() []store.OrgNode    { return t.nodesOfType(store.NodeBranch) }

func (t *Tree) nodesOfType(nodeType string) []store.OrgNode {
	t.mu.RLock()
	out := make([]store.OrgNode, 0, len(t.nodes))
	for _, n := range t.nodes {
		if n.Type == nodeType {
			out = append(out, n)
		}
	}
	t.mu.RUnlock()

	sort.Slice(out, func(i, j int) bool {
		if out[i].Name != out[j].Name {
			return out[i].Name < out[j].Name
		}
		return out[i].ID < out[j].ID // ids are unique, so the order is total
	})
	return out
}
