// Container App for the auth service (backend/auth).
// Consumption plan, min-replicas=1 so the service stays warm.

@description('Name of the Container App')
param name string

@description('Azure region')
param location string = resourceGroup().location

@description('Resource ID of the Container Apps Environment')
param environmentId string

@description('Full container image reference, e.g. myregistry.azurecr.io/auth:latest')
param image string

@description('JWT issuer URL (public URL of this app)')
param issuerUrl string

@description('Frontend origin to redirect to after login')
param frontendUrl string

@description('Cosmos DB endpoint')
param cosmosEndpoint string

@description('Cosmos DB primary key')
@secure()
param cosmosKey string

@description('Cosmos DB database name')
param cosmosDatabase string

@description('Google OAuth client ID')
param googleClientId string = ''

@description('Google OAuth client secret')
@secure()
param googleClientSecret string = ''

@description('Google OAuth redirect URI')
param googleRedirectUri string = ''

@description('Microsoft OAuth client ID')
param microsoftClientId string = ''

@description('Microsoft OAuth client secret')
@secure()
param microsoftClientSecret string = ''

@description('Microsoft OAuth redirect URI')
param microsoftRedirectUri string = ''

@description('RSA private key PEM (injected as a secret; use SERVICE_KEY_PEM env var)')
@secure()
param signingKeyPem string

resource authApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: name
  location: location
  properties: {
    environmentId: environmentId
    configuration: {
      ingress: {
        external: true
        targetPort: 8081
        transport: 'http'
      }
      secrets: [
        { name: 'cosmos-key',             value: cosmosKey }
        { name: 'google-client-secret',   value: googleClientSecret }
        { name: 'microsoft-client-secret', value: microsoftClientSecret }
        { name: 'signing-key-pem',        value: signingKeyPem }
      ]
    }
    template: {
      scale: {
        minReplicas: 1
        maxReplicas: 1 // auth service has in-process OIDC pending state; single replica required
      }
      containers: [
        {
          name: 'auth'
          image: image
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'SERVICE_LISTEN_ADDRESS',        value: ':8081' }
            { name: 'SERVICE_ISSUER',                value: issuerUrl }
            { name: 'SERVICE_FRONTEND_URL',          value: frontendUrl }
            { name: 'SERVICE_KEY_PEM',               secretRef: 'signing-key-pem' }
            { name: 'COSMOS_ENDPOINT',               value: cosmosEndpoint }
            { name: 'COSMOS_KEY',                    secretRef: 'cosmos-key' }
            { name: 'COSMOS_DATABASE',               value: cosmosDatabase }
            { name: 'COSMOS_USERS_CONTAINER',        value: 'users' }
            { name: 'COSMOS_IDENTITY_INDEX_CONTAINER', value: 'identity_index' }
            { name: 'COSMOS_TOKENS_CONTAINER',       value: 'refresh_tokens' }
            { name: 'GOOGLE_CLIENT_ID',              value: googleClientId }
            { name: 'GOOGLE_CLIENT_SECRET',          secretRef: 'google-client-secret' }
            { name: 'GOOGLE_REDIRECT_URI',           value: googleRedirectUri }
            { name: 'MICROSOFT_CLIENT_ID',           value: microsoftClientId }
            { name: 'MICROSOFT_CLIENT_SECRET',       secretRef: 'microsoft-client-secret' }
            { name: 'MICROSOFT_REDIRECT_URI',        value: microsoftRedirectUri }
          ]
        }
      ]
    }
  }
}

output fqdn string = authApp.properties.configuration.ingress.fqdn
