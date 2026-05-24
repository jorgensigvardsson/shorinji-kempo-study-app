// Shorinji Kempo App — Azure infrastructure
//
// Deploys:
//   • Cosmos DB account (free tier) with all required containers
//   • Container Apps Environment (consumption plan, Log Analytics)
//   • auth service Container App        (backend/auth)
//   • persistence service Container App (backend/persistence)
//
// The frontend is hosted elsewhere and is NOT deployed here.
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
// cosmosAccountName is a known parameter — using it directly avoids a module-output
// dependency that Bicep can't resolve at deployment start.
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

module authApp 'modules/auth-app.bicep' = {
  name: 'auth-app'
  params: {
    name: '${namePrefix}-auth'
    location: location
    environmentId: containerEnv.outputs.environmentId
    image: authImage
    issuerUrl: 'https://${namePrefix}-auth.${containerEnv.outputs.defaultDomain}'
    frontendUrl: 'https://app.shorinji.se'  // update to your actual frontend URL
    cosmosEndpoint: cosmos.outputs.endpoint
    cosmosKey: cosmosAccountRef.listKeys().primaryMasterKey
    cosmosDatabase: cosmosDatabase
    googleClientId: googleClientId
    googleClientSecret: googleClientSecret
    googleRedirectUri: 'https://${namePrefix}-auth.${containerEnv.outputs.defaultDomain}/auth/callback'
    microsoftClientId: microsoftClientId
    microsoftClientSecret: microsoftClientSecret
    microsoftRedirectUri: 'https://${namePrefix}-auth.${containerEnv.outputs.defaultDomain}/auth/callback'
    signingKeyPem: signingKeyPem
  }
}

module persistenceApp 'modules/persistence-app.bicep' = {
  name: 'persistence-app'
  params: {
    name: '${namePrefix}-persistence'
    location: location
    environmentId: containerEnv.outputs.environmentId
    image: persistenceImage
    authServiceUrl: 'https://${authApp.outputs.fqdn}'
    authIssuerUrl: 'https://${authApp.outputs.fqdn}'
    cosmosEndpoint: cosmos.outputs.endpoint
    cosmosKey: cosmosAccountRef.listKeys().primaryMasterKey
    cosmosDatabase: cosmosDatabase
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────

output authServiceUrl string = 'https://${authApp.outputs.fqdn}'
output persistenceServiceUrl string = 'https://${persistenceApp.outputs.fqdn}'
output cosmosEndpoint string = cosmos.outputs.endpoint
