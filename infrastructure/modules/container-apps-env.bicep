// Container Apps Environment (consumption plan).
//
// The environment is where container stdout is routed, and for a long time it was
// routed nowhere at all — deliberately, to avoid ingestion costs. That saved a few
// cents a month and cost an afternoon the first time something went wrong in
// production and there was nothing to read. It now points at a Log Analytics
// workspace with a daily cap; see modules/log-analytics.bicep for the arithmetic.

@description('Unique name prefix used for all resources in this module')
param name string

@description('Azure region')
param location string = resourceGroup().location

@description('Resource id of the Log Analytics workspace that receives container stdout')
param logAnalyticsWorkspaceId string

// Read rather than created, so the shared key is fetched at deployment time and
// never becomes a module output — outputs are stored in the deployment history in
// plain text. Taking the workspace id as a parameter is also what orders this
// module after the one that creates it.
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: last(split(logAnalyticsWorkspaceId, '/'))
}

resource env 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: '${name}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

output environmentId string = env.id
output environmentName string = env.name
output defaultDomain string = env.properties.defaultDomain
