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

@description('Custom domain hostname (e.g. persistence.app.shorinjikempo.net). Leave empty to use the default ACA FQDN.')
param customDomain string = ''

@description('Frontend origin allowed by CORS')
param frontendUrl string

@description('VAPID public key (base64url) for Web Push. Empty disables push endpoints.')
param vapidPublicKey string = ''

@description('VAPID private key (base64url) for Web Push.')
@secure()
param vapidPrivateKey string = ''

@description('VAPID subject (mailto: or site URL) required by the Web Push protocol.')
param vapidSubject string = ''

@description('Bearer token authorizing POST /push/broadcast. Empty disables broadcast.')
@secure()
param pushAdminToken string = ''

var pushEnabled = !empty(vapidPublicKey) && !empty(vapidPrivateKey)

resource persistenceApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: name
  location: location
  // Stated explicitly so a deploy detaches the managed identity this app used to
  // carry. Cosmos is reached with an account key, so nothing here needs an Entra
  // identity; add one back the day something does.
  identity: {
    type: 'None'
  }
  properties: {
    environmentId: environmentId
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'http'
        customDomains: empty(customDomain) ? [] : [
          {
            name: customDomain
            bindingType: 'Disabled'
          }
        ]
      }
      secrets: concat(
        [
          { name: 'cosmos-key', value: cosmosKey }
        ],
        pushEnabled ? [
          { name: 'vapid-private-key', value: vapidPrivateKey }
        ] : [],
        !empty(pushAdminToken) ? [
          { name: 'push-admin-token', value: pushAdminToken }
        ] : []
      )
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
          env: concat(
            [
              { name: 'SERVICE_LISTEN_ADDRESS', value: ':8080' }
              { name: 'SERVICE_FRONTEND_URL',    value: frontendUrl }
              { name: 'SERVICE_STORAGE',         value: 'cosmosdb' }
              { name: 'AUTH_JWKS_URL',           value: '${authServiceUrl}/.well-known/jwks.json' }
              { name: 'AUTH_ISSUER_URL',         value: authIssuerUrl }
              { name: 'COSMOS_DB_ENDPOINT',      value: cosmosEndpoint }
              { name: 'COSMOS_DB_KEY',           secretRef: 'cosmos-key' }
              { name: 'COSMOS_DB_DATABASE',      value: cosmosDatabase }
              { name: 'COSMOS_DB_CONTAINER',     value: 'documents' }
            ],
            pushEnabled ? [
              { name: 'VAPID_PUBLIC_KEY',  value: vapidPublicKey }
              { name: 'VAPID_PRIVATE_KEY', secretRef: 'vapid-private-key' }
              { name: 'VAPID_SUBJECT',     value: vapidSubject }
            ] : [],
            !empty(pushAdminToken) ? [
              { name: 'PUSH_ADMIN_TOKEN', secretRef: 'push-admin-token' }
            ] : []
          )
        }
      ]
    }
  }
}

output fqdn string = persistenceApp.properties.configuration.ingress.fqdn
