// Container Apps Environment (consumption plan, no Log Analytics to avoid ingestion costs).

@description('Unique name prefix used for all resources in this module')
param name string

@description('Azure region')
param location string = resourceGroup().location

resource env 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: '${name}-env'
  location: location
  properties: {}
}

output environmentId string = env.id
output environmentName string = env.name
output defaultDomain string = env.properties.defaultDomain
