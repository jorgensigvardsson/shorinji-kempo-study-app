// Container App for the persistence service (backend/persistence).
// Consumption plan, min-replicas=1 so the service stays warm.

@description('Name of the Container App')
param name string

@description('Azure region')
param location string = resourceGroup().location

@description('Resource ID of the Container Apps Environment')
param environmentId string

@description('Full container image reference, e.g. myregistry.azurecr.io/persistence:latest')
param image string

@description('Auth service public URL, used to fetch JWKS for offline token verification')
param authServiceUrl string

@description('Expected JWT issuer URL (must match SERVICE_ISSUER on the auth service)')
param authIssuerUrl string

@description('Cosmos DB endpoint')
param cosmosEndpoint string

@description('Cosmos DB primary key')
@secure()
param cosmosKey string

@description('Cosmos DB database name')
param cosmosDatabase string

resource persistenceApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: name
  location: location
  properties: {
    environmentId: environmentId
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'http'
      }
      secrets: [
        { name: 'cosmos-key', value: cosmosKey }
      ]
    }
    template: {
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
      containers: [
        {
          name: 'persistence'
          image: image
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'SERVICE_LISTEN_ADDRESS', value: ':8080' }
            { name: 'SERVICE_STORAGE',         value: 'cosmosdb' }
            { name: 'AUTH_JWKS_URL',           value: '${authServiceUrl}/.well-known/jwks.json' }
            { name: 'AUTH_ISSUER_URL',         value: authIssuerUrl }
            { name: 'COSMOS_DB_ENDPOINT',      value: cosmosEndpoint }
            { name: 'COSMOS_DB_KEY',           secretRef: 'cosmos-key' }
            { name: 'COSMOS_DB_DATABASE',      value: cosmosDatabase }
            { name: 'COSMOS_DB_CONTAINER',     value: 'documents' }
          ]
        }
      ]
    }
  }
}

output fqdn string = persistenceApp.properties.configuration.ingress.fqdn
