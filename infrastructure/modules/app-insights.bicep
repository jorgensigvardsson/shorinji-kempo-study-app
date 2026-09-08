// Application Insights for browser usage telemetry.
//
// EXPERIMENT (see frontend/src/telemetry.ts). This exists to answer one question
// with a number instead of a guess: how much does Application Insights actually
// ingest for an app this size, once every automatic collector is switched off and
// the browser sends at most one event an hour? Deploy it to staging, use the app
// normally for a while, and the answer is a KQL query away.
//
// Workspace-based, attached to whichever workspace the caller passes. In staging
// that is staging's own, so the experiment cannot disturb production's logs — nor
// compete for production's ingestion cap, which is what protects the container
// logs that were only just given somewhere to go.
//
// Nothing in the backend talks to this. The browser posts straight to the
// ingestion endpoint, which is the entire reason it was chosen over recording
// sessions in a service: neither container is woken by any of it.
//
// ONE-TIME SUBSCRIPTION STEP. This is the first resource here in the
// microsoft.insights namespace, and a namespace has to be registered on the
// subscription before anything in it can be created:
//
//     az provider register --namespace Microsoft.Insights
//
// The deploy principal is resource-group-scoped and cannot do this itself, so the
// pipeline cannot fix it for you — a fresh subscription fails the deployment with
// MissingSubscriptionRegistration until somebody runs the line above by hand.
// Registration is asynchronous and takes a few minutes; the deploy will keep
// failing the same way until `az provider show -n Microsoft.Insights` reports
// Registered, after which it needs no further attention, ever.

@description('Resource name')
param name string

@description('Azure region')
param location string = resourceGroup().location

@description('Resource id of the Log Analytics workspace that stores the telemetry')
param logAnalyticsWorkspaceId string

@description('Hard ceiling on ingestion per day, in GB. Its own cap, separate from the workspace ceiling, so telemetry cannot crowd out container logs. -1 disables the cap; do not.')
param dailyQuotaGb int = 1

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: name
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    // Workspace-based rather than classic: classic components are retired, and
    // this way the data lands in the same workspace as everything else and can be
    // joined against it in one query.
    WorkspaceResourceId: logAnalyticsWorkspaceId
    // The connection string is built into the frontend bundle and therefore public
    // to anybody who opens developer tools. That is how browser telemetry works —
    // it is a write-only ingestion address, not a credential — but it does mean a
    // stranger could post rubbish to it, which is the other reason for the cap
    // below. Local auth stays on because the browser has no identity to use.
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
    // Off: sampling would make the counts approximate, and the point of the
    // exercise is exact counts of a deliberately tiny number of events. Volume is
    // controlled at the source instead — see the hourly gate in telemetry.ts.
    SamplingPercentage: 100
    DisableIpMasking: false
  }
}

// The cap is a backstop, not a budget. It is here so that a mistake — a loop that
// reports an exception on every render, or somebody pointing a script at the
// public ingestion address — costs a day of missing telemetry rather than a bill.
resource cap 'Microsoft.Insights/components/pricingPlans@2017-10-01' = {
  parent: insights
  name: 'current'
  properties: {
    cap: dailyQuotaGb
    planType: 'Basic'
    // Warn rather than only stopping silently at the ceiling.
    stopSendNotificationWhenHitCap: true
  }
}

output connectionString string = insights.properties.ConnectionString
output appId string = insights.properties.AppId
output resourceId string = insights.id
