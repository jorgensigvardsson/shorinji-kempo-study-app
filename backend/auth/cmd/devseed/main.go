// Command devseed resets a local file-based data directory to the smallest
// organization the app can actually be used in: one federation, one branch
// inside it, and one global admin who trains there.
//
// All three are needed together. An admin with no branches to look at cannot
// admit anybody, and the registration screen's branch picker is empty without
// them — so seeding only the account leaves the app unusable in a way that
// looks like a bug rather than an empty database.
//
// It signs the admin in through the passwordless email-code provider rather
// than a real OIDC one: that provider's "sub" is the address itself (see
// backend/auth/internal/api/handlers.go, emailProviderName), so it can be
// written here without ever driving a real login. An OIDC provider's sub is
// issued by the provider and cannot be known in advance, which is precisely
// why the first account has to come from outside the login flow. Note that
// the service only offers the code flow for domains it does not map to an
// OIDC provider — see GOOGLE_DOMAINS in docker-compose.yml, which is emptied
// there so that a gmail.com address reaches this seeded identity.
//
// Google or Microsoft can be attached afterwards from inside the app, through
// the normal account-linking flow, which records the real sub.
//
// This is a dev tool, not a migration: it always starts from nothing, so it
// refuses to run against Cosmos, where "nothing" would mean production data.
// It only ever touches a local --data-dir. Dry run unless --apply, as
// cmd/orgmigrate also does.
package main

import (
	"flag"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/authz"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/auth/internal/store"
	"github.com/jorgensigvardsson/shorinji-kempo-study-app/backend/shared/envutil"
)

// emailProviderName mirrors the unexported constant of the same name in
// internal/api/handlers.go. It can't be imported (api depends on store, not
// the other way around), and it is small and stable enough that keeping the
// two in sync by eye is simpler than restructuring the package layout for it.
const emailProviderName = "email"

func main() {
	log.SetFlags(0)

	dataDir := flag.String("data-dir", envutil.String("SERVICE_DATA_DIR", "data"), "directory for file-based storage — everything in it is deleted")
	email := flag.String("email", "jorgen.sigvardsson@gmail.com", "email address for the seeded admin account")
	name := flag.String("name", "Jörgen Sigvardsson", "display name for the seeded admin account")
	federationID := flag.String("federation-id", "SE", "ISO 3166-1 alpha-2 country code for the seeded federation")
	federationName := flag.String("federation-name", "Svenska Shorinji Kempoförbundet", "the federation's own name, in its own language")
	branchName := flag.String("branch-name", "Shorinji Kempo Karlstad Shibu", "the branch seeded inside the federation, and the one the admin trains in")
	apply := flag.Bool("apply", false, "actually wipe and write; without it the tool reports what it would do and changes nothing")
	flag.Parse()

	if envutil.String("COSMOS_ENDPOINT", "") != "" || envutil.String("COSMOS_KEY", "") != "" {
		log.Fatal("COSMOS_ENDPOINT/COSMOS_KEY are set — devseed only ever touches a local data directory, and refuses to run so it can't be pointed at Cosmos by an inherited environment.")
	}

	addr := store.NormalizeEmail(*email)
	if addr == "" {
		log.Fatal("--email is required")
	}
	if *name == "" {
		log.Fatal("--name is required")
	}
	fedID := strings.ToUpper(strings.TrimSpace(*federationID))
	if !store.ValidFederationID(fedID) {
		log.Fatalf("federation id %q is not an ISO 3166-1 alpha-2 country code", *federationID)
	}
	if *federationName == "" || *branchName == "" {
		log.Fatal("--federation-name and --branch-name are both required")
	}

	if !*apply {
		log.Print("DRY RUN — nothing will be written. Pass --apply to perform the reset.")
	}
	log.Print("")

	if existing, err := countUsers(*dataDir); err != nil {
		log.Fatalf("read %s: %v", *dataDir, err)
	} else if existing > 0 {
		log.Printf("%s currently holds %d user(s); all of it will be deleted.", *dataDir, existing)
	} else {
		log.Printf("%s: nothing there yet.", *dataDir)
	}

	if !*apply {
		log.Printf("would clear %s, then create:", *dataDir)
		log.Printf("  federation %s %q", fedID, *federationName)
		log.Printf("  branch %q in %s", *branchName, fedID)
		log.Printf("  user %s, an %s, training in %q", addr, authz.RoleAdmin, *branchName)
		log.Print("")
		log.Print("nothing was written. Re-run with --apply to perform the reset.")
		return
	}

	if err := clearDir(*dataDir); err != nil {
		log.Fatalf("clear %s: %v", *dataDir, err)
	}
	log.Printf("cleared %s", *dataDir)

	now := time.Now().UTC().Format(time.RFC3339)
	orgs := store.NewFileOrgStore(*dataDir)

	federation := &store.OrgNode{
		ID: fedID, Type: store.NodeFederation, Name: *federationName,
		CreatedAt: now, UpdatedAt: now,
	}
	if err := orgs.Save(federation); err != nil {
		log.Fatalf("create federation %s: %v", fedID, err)
	}
	log.Printf("created federation %s %q", federation.ID, federation.Name)

	branchID, err := store.NewUUID()
	if err != nil {
		log.Fatalf("generate a branch id: %v", err)
	}
	branch := &store.OrgNode{
		ID: branchID, Type: store.NodeBranch, Name: *branchName, FederationID: federation.ID,
		CreatedAt: now, UpdatedAt: now,
	}
	if err := orgs.Save(branch); err != nil {
		log.Fatalf("create branch %q: %v", branch.Name, err)
	}
	log.Printf("created branch %q in %s (%s)", branch.Name, federation.ID, branch.ID)

	id, err := store.NewUUID()
	if err != nil {
		log.Fatalf("generate a user id: %v", err)
	}
	// The admin trains somewhere like anybody else. A branchless account is a
	// state the admission gate no longer produces, so seeding one would be
	// testing against a shape the app is not meant to reach.
	user := &store.User{
		ID:          id,
		Email:       addr,
		DisplayName: *name,
		BranchID:    branch.ID,
		LinkedIdentities: map[string]store.LinkedIdentity{
			emailProviderName: {Sub: addr, Email: addr},
		},
		CreatedAt: now,
	}

	users := store.NewFileUserStore(*dataDir)
	if err := users.Save(user); err != nil {
		log.Fatalf("create user %s: %v", addr, err)
	}
	log.Printf("created user %s (%s), training in %q", addr, id, branch.Name)

	roles := store.NewFileRoleStore(*dataDir)
	if err := roles.SetRoles(addr, []string{authz.RoleAdmin}); err != nil {
		log.Fatalf("grant admin to %s: %v", addr, err)
	}
	log.Printf("granted %q to %s", authz.RoleAdmin, addr)

	log.Print("")
	log.Printf("done. Sign in as %s: the service emails a code, which with no SMTP", addr)
	log.Print("configured means it prints one to its own stdout instead. Restart the auth")
	log.Print("service so it reloads the organization tree it read at startup.")
}

// clearDir deletes every file under dataDir and no directories at all — not
// dataDir, and not the store subdirectories inside it.
//
// Removing directories here is not worth the trouble it causes. Under Docker
// Compose dataDir is a bind-mount point, and the kernel will not unlink a
// directory something is mounted onto ("device or resource busy"); the
// directories beneath it sit on a Windows host filesystem reached through
// Docker Desktop, which refuses to unlink them too ("operation not permitted")
// even as it deletes the files inside them perfectly happily.
//
// Nothing needs them gone. State lives entirely in files, and every store
// creates its directory on demand and reads an absent file as "empty", so a
// leftover empty roles/ or organizations/ is indistinguishable from never
// having existed.
func clearDir(dataDir string) error {
	if _, err := os.Stat(dataDir); os.IsNotExist(err) {
		return nil
	} else if err != nil {
		return err
	}
	return filepath.WalkDir(dataDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		return os.Remove(path)
	})
}

// countUsers reports how many user records --data-dir currently holds, purely
// so the dry run and the confirmation before a real wipe have a number to show
// rather than an unqualified warning.
func countUsers(dataDir string) (int, error) {
	if _, err := os.Stat(dataDir); os.IsNotExist(err) {
		return 0, nil
	} else if err != nil {
		return 0, err
	}
	users, err := store.NewFileUserStore(dataDir).List()
	if err != nil {
		return 0, fmt.Errorf("list users: %w", err)
	}
	return len(users), nil
}
