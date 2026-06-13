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

@description('Custom hostname for the auth service (e.g. auth-shorinjikempo.cash-it.se)')
param authCustomDomain string = ''

@description('Custom hostname for the persistence service (e.g. persistence-shorinjikempo.cash-it.se)')
param persistenceCustomDomain string = ''

@description('Cookie Domain attribute for cross-subdomain sharing (e.g. .cash-it.se)')
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

// ── Email (Azure Communication Services) ──────────────────────────────────────
// The ACS resource and its (managed) email domain are provisioned out-of-band;
// the pipeline feeds these two values in. Auth authenticates to ACS with its
// user-assigned managed identity, so no access key is ever stored.

@description('ACS data-plane endpoint, e.g. https://skempo-acs.europe.communication.azure.com. Empty disables email (codes are logged instead).')
param acsEndpoint string = ''

@description('Verified MailFrom address, e.g. donotreply@<guid>.azurecomm.net')
param acsSenderAddress string = ''

// ── User-assigned managed identities (one per backend service) ─────────────────

resource authIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-auth-id'
  location: location
}

resource persistenceIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-persistence-id'
  location: location
}

// Grant the auth identity permission to send email on the existing ACS resource.
// The resource name is the first DNS label of the endpoint. Only the auth service
// needs ACS access; persistence never sends email.
var acsResourceName = empty(acsEndpoint) ? 'unused' : first(split(replace(replace(acsEndpoint, 'https://', ''), 'http://', ''), '.'))

resource acs 'Microsoft.Communication/communicationServices@2023-04-01' existing = {
  name: acsResourceName
}

// "Communication and Email Service Owner" — the built-in role that permits Email send.
var acsEmailRoleId = '09976791-48a7-449e-bb21-39d1a415f350'

resource acsAuthRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(acsEndpoint)) {
  name: guid(acs.id, authIdentity.id, acsEmailRoleId)
  scope: acs
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acsEmailRoleId)
    principalId: authIdentity.properties.principalId
    principalType: 'ServicePrincipal' // avoids "principal not found" while Entra replicates the new identity
  }
}

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
    userAssignedIdentityId: authIdentity.id
    acsEndpoint: acsEndpoint
    acsSenderAddress: acsSenderAddress
    acsIdentityClientId: authIdentity.properties.clientId
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
    userAssignedIdentityId: persistenceIdentity.id
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────

output authServiceUrl string = authBaseUrl
output persistenceServiceUrl string = persistenceBaseUrl
output cosmosEndpoint string = cosmos.outputs.endpoint
