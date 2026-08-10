// Cosmos DB account only (free tier). Databases and containers are provisioned
// separately by cosmos-database.bicep, so the same account can host more than
// one database — see infrastructure/main-staging.bicep, which reuses this
// account for a `shorinji-staging` database instead of paying for a second
// free-tier account (Azure allows only one free-tier account per subscription).

@description('Name of the Cosmos DB account (must be globally unique)')
param accountName string

@description('Azure region for the account')
param location string = resourceGroup().location

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' = {
  name: accountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    enableFreeTier: true
    databaseAccountOfferType: 'Standard'

    // Keep TLS 1.2 as the minimum — matches the portal's security baseline.
    minimalTlsVersion: 'Tls12'

    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
      maxIntervalInSeconds: 5
      maxStalenessPrefix: 100
    }

    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]

    // Automatic failover was enabled in the portal; keep it here so a redeploy
    // doesn't silently disable it.
    enableAutomaticFailover: true
    enableMultipleWriteLocations: false

    capabilities: []

    // Continuous backup (7-day retention) — this is a one-way upgrade; once set
    // it cannot be downgraded via ARM. Must be declared here so the pipeline
    // doesn't try to revert to periodic backup and fail.
    backupPolicy: {
      type: 'Continuous'
      continuousModeProperties: {
        tier: 'Continuous7Days'
      }
    }

    // Free-tier hard cap: 1 000 RU/s total across all containers, in every
    // database this account holds — prod and staging share this budget.
    // Without this the cap could be lifted on redeploy.
    capacity: {
      totalThroughputLimit: 1000
    }

  }
}

output accountName string = cosmosAccount.name
output endpoint string = cosmosAccount.properties.documentEndpoint
