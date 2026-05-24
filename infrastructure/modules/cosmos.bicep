// Cosmos DB account (free tier) with the containers needed by auth and persistence services.
//
// Containers and their indexing strategies:
//   users            — pk: /id  — indexing: none (all access is point reads)
//   identity_index   — pk: /id  — indexing: none (item id = SHA-256(provider:sub); always a point read)
//   refresh_tokens   — pk: /userId — indexing: consistent, all paths excluded
//                      (point reads + partition-scoped scan for DeleteByUserID; TTL: 30 days)
//   documents        — pk: /id  — indexing: none (all access is point reads)

@description('Name of the Cosmos DB account (must be globally unique)')
param accountName string

@description('Azure region for the account')
param location string = resourceGroup().location

@description('Database name shared by all services')
param databaseName string = 'shorinji'

var noIndexPolicy = {
  automatic: false
  indexingMode: 'none'
  includedPaths: []
  excludedPaths: []
}

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

    // Free-tier hard cap: 1 000 RU/s total across all containers.
    // Without this the cap could be lifted on redeploy.
    capacity: {
      totalThroughputLimit: 1000
    }

  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-04-15' = {
  parent: cosmosAccount
  name: databaseName
  properties: {
    resource: { id: databaseName }
    options: { throughput: 400 } // shared across all containers (free-tier eligible)
  }
}

resource usersContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'users'
  properties: {
    resource: {
      id: 'users'
      partitionKey: { paths: ['/id'], kind: 'Hash' }
      indexingPolicy: noIndexPolicy
    }
  }
}

resource identityIndexContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'identity_index'
  properties: {
    resource: {
      id: 'identity_index'
      partitionKey: { paths: ['/id'], kind: 'Hash' }
      indexingPolicy: noIndexPolicy
    }
  }
}

// refresh_tokens: partition-scoped queries need at least "consistent" mode.
// All property paths excluded → zero write overhead; partition scan still works.
// defaultTtl = 30 days is a server-side safety net for tokens the app fails to delete.
resource refreshTokensContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'refresh_tokens'
  properties: {
    resource: {
      id: 'refresh_tokens'
      partitionKey: { paths: ['/userId'], kind: 'Hash' }
      defaultTtl: 2592000 // 30 days in seconds
      indexingPolicy: {
        automatic: true
        indexingMode: 'consistent'
        includedPaths: []
        excludedPaths: [
          { path: '/*' }
        ]
      }
    }
  }
}

resource documentsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'documents'
  properties: {
    resource: {
      id: 'documents'
      partitionKey: { paths: ['/id'], kind: 'Hash' }
      indexingPolicy: noIndexPolicy
    }
  }
}

// Outputs consumed by the container app modules.
// NOTE: The primary key is intentionally NOT output here — module outputs are
// stored in plain text in the deployment history. The caller (main.bicep) should
// obtain the key via an `existing` resource reference and listKeys() directly.
output accountName string = cosmosAccount.name
output endpoint string = cosmosAccount.properties.documentEndpoint
output databaseName string = databaseName
