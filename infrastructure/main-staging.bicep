// Shorinji Kempo App — staging Azure infrastructure
//
// Mirrors main.bicep (Container Apps Environment + auth + persistence
// services) but does NOT provision its own Cosmos DB account. Azure allows
// only one free-tier Cosmos account per subscription, and main.bicep already
// uses it, so this deploys a second database (named by the cosmosDatabase
// parameter) into that *same* account via modules/cosmos-database.bicep,
// cross-resource-group into the account's own resource group. Everything
// else — Container Apps environment, auth app, persistence app — lives in
// this deployment's own resource group, fully isolated from prod.
//
// Usage:
//   az deployment group create \
//     --resource-group sk-study-app-staging \
//     --template-file infrastructure/main-staging.bicep \
//     --parameters @infrastructure/main-staging.parameters.json

@description('Short name prefix for all resources in this resource group (e.g. "sk-study-app-staging")')
param namePrefix string

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Name of the existing Cosmos DB account to share with prod')
param cosmosAccountName string

@description('Resource group the existing Cosmos DB account lives in')
param cosmosResourceGroup string

@description('Cosmos DB database name for this environment (must differ from prod\'s to keep data isolated)')
param cosmosDatabase string = 'shorinji-staging'

// ── Container images ──────────────────────────────────────────────────────────

@description('Auth service container image reference')
param authImage string

@description('Persistence service container image reference')
param persistenceImage string

// ── Auth service: OIDC provider credentials ───────────────────────────────────

@description('Google OAuth client ID')
param googleClientId string = ''

@description('Google OAuth client secret')
@secure()
param googleClientSecret string = ''

@description('Microsoft OAuth client ID')
param microsoftClientId string = ''

@description('Microsoft OAuth client secret')
@secure()
param microsoftClientSecret string = ''

@description('RSA private key for JWT signing (PEM-encoded; generate with openssl genrsa 2048). Kept separate from prod\'s key.')
@secure()
param signingKeyPem string

@description('Public URL of the frontend app, used as the OAuth post-login redirect target')
param frontendUrl string

@description('Custom hostname for the auth service (e.g. auth.app-staging.shorinjikempo.net)')
param authCustomDomain string = ''

@description('Custom hostname for the persistence service (e.g. persistence.app-staging.shorinjikempo.net)')
param persistenceCustomDomain string = ''

@description('Cookie Domain attribute for cross-subdomain sharing (e.g. .app-staging.shorinjikempo.net). Must be a parent of both the frontend origin and the service hostnames, or SameSite=Lax cookies will not be sent.')
param cookieDomain string = ''

// ── Web Push (VAPID) ──────────────────────────────────────────────────────────

@description('VAPID public key (base64url). Empty disables Web Push.')
param vapidPublicKey string = ''

@description('VAPID private key (base64url)')
@secure()
param vapidPrivateKey string = ''

@description('VAPID subject (mailto: or site URL) required by the Web Push protocol')
param vapidSubject string = ''

@description('Bearer token authorizing POST /push/broadcast. Empty disables broadcast.')
@secure()
param pushAdminToken string = ''

// ── Email (SMTP) ──────────────────────────────────────────────────────────────

@description('SMTP relay hostname. Empty disables email (codes are logged instead).')
param smtpHost string = ''

@description('SMTP relay port: 587 for STARTTLS, 465 for implicit TLS')
param smtpPort string = '587'

@description('SMTP username. Empty disables authentication.')
param smtpUsername string = ''

@description('SMTP password')
@secure()
param smtpPassword string = ''

@description('Sender address, optionally with a display name: "Shorinji Kempo <noreply@example.com>"')
param smtpFrom string = ''

@description('Connection security: starttls (explicit, port 587), implicit (SMTPS, port 465), or none')
@allowed([
  'starttls'
  'implicit'
  'none'
])
param smtpTls string = 'starttls'

// ── Feedback ────────────────────────────────────────────────────────────────
// In-app feedback submissions (POST /auth/feedback) are relayed by the auth
// service over the SMTP relay configured above. Empty disables the endpoint.

@description('Comma-separated recipient(s) for feedback submissions.')
param feedbackEmail string = ''

// ── Modules ───────────────────────────────────────────────────────────────────

// Adds this environment's database to prod's existing free-tier Cosmos
// account instead of provisioning a second account. Deployed into the
// account's own resource group even though the rest of this template targets
// sk-study-app-staging — the deploy principal needs write access there too.
module cosmosDatabaseModule 'modules/cosmos-database.bicep' = {
  name: 'cosmos-database-staging'
  scope: resourceGroup(cosmosResourceGroup)
  params: {
    accountName: cosmosAccountName
    databaseName: cosmosDatabase
  }
}

// Obtain the Cosmos primary key via listKeys() on an existing reference,
// scoped to the account's own resource group — same approach as main.bicep,
// just cross-resource-group. Keeps the key out of deployment history (module
// outputs are plain text).
resource cosmosAccountRef 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' existing = {
  name: cosmosAccountName
  scope: resourceGroup(cosmosResourceGroup)
}

module containerEnv 'modules/container-apps-env.bicep' = {
  name: 'container-apps-env'
  params: {
    name: namePrefix
    location: location
  }
}

var authBaseUrl        = empty(authCustomDomain)        ? 'https://${namePrefix}-auth.${containerEnv.outputs.defaultDomain}'        : 'https://${authCustomDomain}'
var persistenceBaseUrl = empty(persistenceCustomDomain) ? 'https://${namePrefix}-persistence.${containerEnv.outputs.defaultDomain}' : 'https://${persistenceCustomDomain}'

module authApp 'modules/auth-app.bicep' = {
  name: 'auth-app'
  params: {
    name: '${namePrefix}-auth'
    location: location
    environmentId: containerEnv.outputs.environmentId
    image: authImage
    issuerUrl: authBaseUrl
    frontendUrl: frontendUrl
    cosmosEndpoint: cosmosAccountRef.properties.documentEndpoint
    cosmosKey: cosmosAccountRef.listKeys().primaryMasterKey
    cosmosDatabase: cosmosDatabase
    googleClientId: googleClientId
    googleClientSecret: googleClientSecret
    googleRedirectUri: '${authBaseUrl}/auth/callback'
    microsoftClientId: microsoftClientId
    microsoftClientSecret: microsoftClientSecret
    microsoftRedirectUri: '${authBaseUrl}/auth/callback'
    signingKeyPem: signingKeyPem
    customDomain: authCustomDomain
    cookieDomain: cookieDomain
    smtpHost: smtpHost
    smtpPort: smtpPort
    smtpUsername: smtpUsername
    smtpPassword: smtpPassword
    smtpFrom: smtpFrom
    smtpTls: smtpTls
    feedbackEmail: feedbackEmail
  }
  dependsOn: [
    cosmosDatabaseModule
  ]
}

module persistenceApp 'modules/persistence-app.bicep' = {
  name: 'persistence-app'
  params: {
    name: '${namePrefix}-persistence'
    location: location
    environmentId: containerEnv.outputs.environmentId
    image: persistenceImage
    authServiceUrl: authBaseUrl
    authIssuerUrl: authBaseUrl
    cosmosEndpoint: cosmosAccountRef.properties.documentEndpoint
    cosmosKey: cosmosAccountRef.listKeys().primaryMasterKey
    cosmosDatabase: cosmosDatabase
    customDomain: persistenceCustomDomain
    frontendUrl: frontendUrl
    vapidPublicKey: vapidPublicKey
    vapidPrivateKey: vapidPrivateKey
    vapidSubject: vapidSubject
    pushAdminToken: pushAdminToken
  }
  // authApp is in here purely to keep the two custom-domain bindings apart. Both apps
  // bind a domain to the same Container Apps environment, and Azure allows only one
  // such modification at a time per environment — so deploying them in parallel is a
  // coin flip, and the loser fails the whole deployment with CustomDomainLockConflict.
  // Costs a little deploy time; removes a random failure that has needed a manual
  // re-run more than once.
  dependsOn: [
    cosmosDatabaseModule
    authApp
  ]
}

// ── Outputs ───────────────────────────────────────────────────────────────────

output authServiceUrl string = authBaseUrl
output persistenceServiceUrl string = persistenceBaseUrl
output cosmosEndpoint string = cosmosAccountRef.properties.documentEndpoint
