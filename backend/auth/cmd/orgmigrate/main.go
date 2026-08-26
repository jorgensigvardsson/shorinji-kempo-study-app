// Command orgmigrate seeds the organization tree and gives every existing user
// a branch.
//
// It is written against the store interfaces rather than against Cosmos, so the
// same binary seeds a local data directory and migrates production, choosing
// between them exactly as the service does: Cosmos when an endpoint and key are
// configured, files otherwise. That is deliberate — by the time this runs
// against production it should be the most exercised code on the branch, not a
// script nobody has run twice.
//
// It is safe to run repeatedly. Nothing is created that already exists, and a
// user who already has a branch is left alone, so a re-run after the admission
// gate exists cannot reassign somebody who has since moved.
//
// Without --apply it writes nothing and reports what it would do.
package main

import (
	"flag"
	"fmt"
	"log"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/envutil"
)

func main() {
	log.SetFlags(0)

	dataDir := flag.String("data-dir", envutil.String("SERVICE_DATA_DIR", "data"), "directory for file-based storage")

	cosmosEndpoint := flag.String("cosmos-endpoint", envutil.String("COSMOS_ENDPOINT", ""), "Cosmos DB account endpoint (uses Cosmos stores when set)")
	cosmosKey := flag.String("cosmos-key", envutil.String("COSMOS_KEY", ""), "Cosmos DB account key")
	cosmosDatabase := flag.String("cosmos-database", envutil.String("COSMOS_DATABASE", "shorinji"), "Cosmos DB database name")
	cosmosUsers := flag.String("cosmos-users-container", envutil.String("COSMOS_USERS_CONTAINER", "users"), "Cosmos container for user records")
	cosmosIdentity := flag.String("cosmos-identity-index-container", envutil.String("COSMOS_IDENTITY_INDEX_CONTAINER", "identity_index"), "Cosmos container for identity index")
	cosmosTokens := flag.String("cosmos-tokens-container", envutil.String("COSMOS_TOKENS_CONTAINER", "refresh_tokens"), "Cosmos container for refresh tokens")
	cosmosRoles := flag.String("cosmos-roles-container", envutil.String("COSMOS_ROLES_CONTAINER", "roles"), "Cosmos container for role assignments")
	cosmosOrgs := flag.String("cosmos-orgs-container", envutil.String("COSMOS_ORGS_CONTAINER", "organizations"), "Cosmos container for the organization tree")
	cosmosJoin := flag.String("cosmos-join-requests-container", envutil.String("COSMOS_JOIN_REQUESTS_CONTAINER", "joinrequests"), "Cosmos container for pending join requests")

	federationID := flag.String("federation-id", "SE", "ISO 3166-1 alpha-2 country code for the federation to seed")
	federationName := flag.String("federation-name", "Svenska Shorinji Kempoförbundet", "the federation's own name, in its own language")
	branchName := flag.String("branch-name", "Shorinji Kempo Karlstad Branch", "the branch every existing user is placed in")
	apply := flag.Bool("apply", false, "actually write; without it the tool reports what it would do and changes nothing")

	flag.Parse()

	var users store.UserStore
	var orgs store.OrgStore

	if *cosmosEndpoint != "" && *cosmosKey != "" {
		if *apply {
			if err := store.ProvisionCosmos(*cosmosEndpoint, *cosmosKey, *cosmosDatabase,
				*cosmosUsers, *cosmosIdentity, *cosmosTokens, *cosmosRoles, *cosmosOrgs, *cosmosJoin); err != nil {
				log.Fatalf("cosmos provisioning: %v", err)
			}
		}
		us, err := store.NewCosmosUserStore(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *cosmosUsers, *cosmosIdentity)
		if err != nil {
			log.Fatalf("init Cosmos user store: %v", err)
		}
		ostore, err := store.NewCosmosOrgStore(*cosmosEndpoint, *cosmosKey, *cosmosDatabase, *cosmosOrgs)
		if err != nil {
			log.Fatalf("init Cosmos org store: %v", err)
		}
		users, orgs = us, ostore
		log.Printf("store: Cosmos DB (endpoint %s, database %s)", *cosmosEndpoint, *cosmosDatabase)
	} else {
		users = store.NewFileUserStore(*dataDir)
		orgs = store.NewFileOrgStore(*dataDir)
		log.Printf("store: files (data-dir %s)", *dataDir)
	}

	if !store.ValidFederationID(*federationID) {
		log.Fatalf("federation id %q is not an ISO 3166-1 alpha-2 country code", *federationID)
	}
	if *federationName == "" || *branchName == "" {
		log.Fatal("federation name and branch name are both required")
	}

	if !*apply {
		log.Print("DRY RUN — nothing will be written. Pass --apply to perform the migration.")
	}
	log.Print("")

	m := &migration{
		users: users, orgs: orgs, apply: *apply,
		federationID: *federationID, federationName: *federationName, branchName: *branchName,
	}
	if err := m.run(); err != nil {
		log.Printf("")
		log.Fatalf("migration failed: %v", err)
	}
}

type migration struct {
	users store.UserStore
	orgs  store.OrgStore
	apply bool

	federationID   string
	federationName string
	branchName     string
}

func (m *migration) run() error {
	nodes, err := m.orgs.List()
	if err != nil {
		return fmt.Errorf("read the organization tree: %w", err)
	}

	federation, err := m.ensureFederation(nodes)
	if err != nil {
		return err
	}
	branch, err := m.ensureBranch(nodes, federation)
	if err != nil {
		return err
	}
	return m.assignUsers(branch)
}

// ensureFederation creates the federation if it is absent. An existing one is
// left exactly as it is, name included: renaming somebody's federation is not
// this tool's business, and a mismatch is worth reporting rather than fixing.
func (m *migration) ensureFederation(nodes []*store.OrgNode) (*store.OrgNode, error) {
	for _, n := range nodes {
		if n.ID != m.federationID {
			continue
		}
		if !n.IsFederation() {
			return nil, fmt.Errorf("%q already exists and is a %s, not a federation", n.ID, n.Type)
		}
		log.Printf("federation %s: exists, %q", n.ID, n.Name)
		if n.Name != m.federationName {
			log.Printf("  note: its name differs from --federation-name (%q); leaving it alone", m.federationName)
		}
		return n, nil
	}

	node := &store.OrgNode{
		ID: m.federationID, Type: store.NodeFederation, Name: m.federationName,
		CreatedAt: now(), UpdatedAt: now(),
	}
	if !m.apply {
		log.Printf("federation %s: would create, %q", node.ID, node.Name)
		return node, nil
	}
	if err := m.orgs.Save(node); err != nil {
		return nil, fmt.Errorf("create federation %s: %w", node.ID, err)
	}
	log.Printf("federation %s: created, %q", node.ID, node.Name)
	return node, nil
}

// ensureBranch finds the branch by name within the federation, since its id is a
// UUID and a second run would otherwise mint a second branch with the same name
// and quietly split the club in two.
func (m *migration) ensureBranch(nodes []*store.OrgNode, federation *store.OrgNode) (*store.OrgNode, error) {
	var found []*store.OrgNode
	for _, n := range nodes {
		if n.IsBranch() && n.FederationID == federation.ID && n.Name == m.branchName {
			found = append(found, n)
		}
	}
	if len(found) > 1 {
		return nil, fmt.Errorf("%d branches in %s are named %q; resolve that by hand before migrating",
			len(found), federation.ID, m.branchName)
	}
	if len(found) == 1 {
		log.Printf("branch %q: exists, id %s", found[0].Name, found[0].ID)
		return found[0], nil
	}

	id, err := store.NewUUID()
	if err != nil {
		return nil, fmt.Errorf("generate a branch id: %w", err)
	}
	node := &store.OrgNode{
		ID: id, Type: store.NodeBranch, Name: m.branchName, FederationID: federation.ID,
		CreatedAt: now(), UpdatedAt: now(),
	}
	if !m.apply {
		log.Printf("branch %q: would create in %s", node.Name, federation.ID)
		return node, nil
	}
	if err := m.orgs.Save(node); err != nil {
		return nil, fmt.Errorf("create branch %q: %w", node.Name, err)
	}
	log.Printf("branch %q: created in %s, id %s", node.Name, federation.ID, node.ID)
	return node, nil
}

// assignUsers gives a branch to every user who has none. Users who already have
// one are counted and left alone — including any who have since been placed
// somewhere else, which is why this is safe to run again later.
func (m *migration) assignUsers(branch *store.OrgNode) error {
	all, err := m.users.List()
	if err != nil {
		return fmt.Errorf("list users: %w", err)
	}

	var assigned, alreadyHere, elsewhere int
	for _, u := range all {
		switch {
		case u.BranchID == branch.ID:
			alreadyHere++
			continue
		case u.BranchID != "":
			elsewhere++
			log.Printf("  user %s (%s): already in branch %s; leaving alone", u.ID, u.Email, u.BranchID)
			continue
		}

		if !m.apply {
			assigned++
			continue
		}
		u.BranchID = branch.ID
		if err := m.users.Save(u); err != nil {
			return fmt.Errorf("assign branch to user %s: %w", u.ID, err)
		}
		assigned++
	}

	log.Print("")
	log.Printf("users: %d total", len(all))
	if m.apply {
		log.Printf("  %d assigned to %q", assigned, branch.Name)
	} else {
		log.Printf("  %d would be assigned to %q", assigned, branch.Name)
	}
	if alreadyHere > 0 {
		log.Printf("  %d already there", alreadyHere)
	}
	if elsewhere > 0 {
		log.Printf("  %d already in another branch, untouched", elsewhere)
	}

	log.Print("")
	if m.apply {
		log.Print("done.")
	} else {
		log.Print("nothing was written. Re-run with --apply to perform the migration.")
	}
	return nil
}

func now() string { return time.Now().UTC().Format(time.RFC3339) }
