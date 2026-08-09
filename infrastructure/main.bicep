// Shorinji Kempo App — Azure infrastructure
//
// Deploys:
//   • Cosmos DB account (free tier) with all required containers
//   • Container Apps Environment (consumption plan)
//   • auth service Container App        (backend/auth)
//   • persistence service Container App (backend/persistence)
//
// Custom domain TLS certificates are NOT managed here. After each Bicep deploy,
// the workflow runs `az containerapp hostname bind` to (re-)issue managed certs
// and switch the binding from Disabled to SniEnabled.
//
// Usage:
//   az deployment group create \
//     --resource-group <rg> \
//     --template-file infrastructure/main.bicep \
//     --parameters @infrastructure/main.parameters.json

@description('Short name prefix for all resources (e.g. "skempo")')
param namePrefix string

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Cosmos DB account name (must be globally unique; defaults to namePrefix + "-cosmos")')
param cosmosAccountName string = '${namePrefix}-cosmos'

@description('Cosmos DB database name')
param cosmosDatabase string = 'shorinji'

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

@description('RSA private key for JWT signing (PEM-encoded; generate with openssl genrsa 2048)')
@secure()
param signingKeyPem string

@description('Public URL of the frontend app, used as the OAuth post-login redirect target')
param frontendUrl string

@description('Custom hostname for the auth service (e.g. auth.app.shorinjikempo.net)')
param authCustomDomain string = ''

@description('Custom hostname for the persistence service (e.g. persistence.app.shorinjikempo.net)')
param persistenceCustomDomain string = ''

@description('Cookie Domain attribute for cross-subdomain sharing (e.g. .app.shorinjikempo.net). Must be a parent of both the frontend origin and the service hostnames, or SameSite=Lax cookies will not be sent.')
param cookieDomain string = ''

// ── Web Push (VAPID) ──────────────────────────────────────────────────────────

@description('VAPID public key (base64url). Empty disables Web Push. Generate with `npx web-push generate-vapid-keys`.')
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
// Verification codes go out through an ordinary SMTP relay. The pipeline feeds
// the host, port, username and sender in as repo variables and the password as a
// repo secret. Empty smtpHost disables sending (codes are logged instead).

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

// ── Modules ───────────────────────────────────────────────────────────────────

module cosmos 'modules/cosmos.bicep' = {
  name: 'cosmos'
  params: {
    accountName: cosmosAccountName
    location: location
    databaseName: cosmosDatabase
  }
}

// Obtain the Cosmos primary key via listKeys() on an existing reference.
// This keeps the key out of deployment history (module outputs are plain text).
resource cosmosAccountRef 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' existing = {
  name: cosmosAccountName
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
    cosmosEndpoint: cosmos.outputs.endpoint
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
  }
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
    cosmosEndpoint: cosmos.outputs.endpoint
    cosmosKey: cosmosAccountRef.listKeys().primaryMasterKey
    cosmosDatabase: cosmosDatabase
    customDomain: persistenceCustomDomain
    frontendUrl: frontendUrl
    vapidPublicKey: vapidPublicKey
    vapidPrivateKey: vapidPrivateKey
    vapidSubject: vapidSubject
    pushAdminToken: pushAdminToken
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────

output authServiceUrl string = authBaseUrl
output persistenceServiceUrl string = persistenceBaseUrl
output cosmosEndpoint string = cosmos.outputs.endpoint
