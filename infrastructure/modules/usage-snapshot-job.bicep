// Container Apps job that keeps a weekly record of usage (backend/auth,
// --job=usage-snapshot; see internal/usage/snapshot.go).
//
// Application Insights forgets after 30 days. Once a week this reads every
// finished week it has not stored yet and appends it, as anonymous counts, to the
// usage_history container in Cosmos, where it is kept for good. It is the auth
// image run in job mode rather than a program of its own, so there is nothing
// extra to build.
//
// Any cadence would do: the job works out what is missing from what is stored,
// so a missed run is caught up by the next one, provided it comes within about
// three weeks — after that the oldest missing week is beyond telemetry's reach.

@description('Name of the job')
param name string

@description('Azure region')
param location string = resourceGroup().location

@description('Resource ID of the Container Apps Environment')
param environmentId string

@description('The auth service image; the job is its --job=usage-snapshot mode')
param image string

@description('Cosmos DB endpoint')
param cosmosEndpoint string

@description('Cosmos DB primary key')
@secure()
param cosmosKey string

@description('Cosmos DB database name')
param cosmosDatabase string

@description('Resource ID of the Application Insights component to read usage from')
param appInsightsResourceId string

// Monday 07:00 UTC. A week ends at midnight between Sunday and Monday UTC, and
// the job waits six hours for Sunday night's last events to be ingested; an hour
// beyond that is margin.
@description('When to run, as a cron expression in UTC')
param schedule string = '0 7 * * 1'

resource job 'Microsoft.App/jobs@2023-05-01' = {
  name: name
  location: location
  // Reads telemetry with its own identity, granted in app-insights-reader.bicep
  // exactly as the auth app's is. No key for Application Insights exists to give
  // it instead.
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: environmentId
    configuration: {
      triggerType: 'Schedule'
      scheduleTriggerConfig: {
        cronExpression: schedule
        parallelism: 1
        replicaCompletionCount: 1
      }
      // A run is a handful of small queries; ten minutes is generous. One retry
      // covers a transient failure, and the next week's run covers anything worse.
      replicaTimeout: 600
      replicaRetryLimit: 1
      secrets: [
        { name: 'cosmos-key', value: cosmosKey }
      ]
    }
    template: {
      containers: [
        {
          name: 'usage-snapshot'
          image: image
          args: [
            '--job=usage-snapshot'
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'COSMOS_ENDPOINT',         value: cosmosEndpoint }
            { name: 'COSMOS_KEY',              secretRef: 'cosmos-key' }
            { name: 'COSMOS_DATABASE',         value: cosmosDatabase }
            { name: 'APPINSIGHTS_RESOURCE_ID', value: appInsightsResourceId }
          ]
        }
      ]
    }
  }
}

output principalId string = job.identity.principalId
