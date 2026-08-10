// Cosmos DB account (free tier) plus its database and containers.
//
// Split into two modules — cosmos-account.bicep (the account itself) and
// cosmos-database.bicep (database + containers) — so a second environment
// (staging) can reuse this account for a second database without
// provisioning, and paying for, a second free-tier account. See
// main-staging.bicep for that reuse.

@description('Name of the Cosmos DB account (must be globally unique)')
param accountName string

@description('Azure region for the account')
param location string = resourceGroup().location

@description('Database name shared by all services')
param databaseName string = 'shorinji'

module account 'cosmos-account.bicep' = {
  name: 'cosmos-account'
  params: {
    accountName: accountName
    location: location
  }
}

module database 'cosmos-database.bicep' = {
  name: 'cosmos-database'
  params: {
    accountName: account.outputs.accountName
    databaseName: databaseName
  }
}

// Outputs consumed by the container app modules.
// NOTE: The primary key is intentionally NOT output here — module outputs are
// stored in plain text in the deployment history. The caller (main.bicep) should
// obtain the key via an `existing` resource reference and listKeys() directly.
output accountName string = account.outputs.accountName
output endpoint string = account.outputs.endpoint
output databaseName string = database.outputs.databaseName
