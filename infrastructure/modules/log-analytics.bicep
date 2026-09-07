// Log Analytics workspace: somewhere for the two services' stdout to land.
//
// Container Apps throws console output away unless its environment names a
// destination, and both apps scale to zero when idle — so without this, every
// line the backend wrote was gone the moment the container stopped. A failure in
// production could be described by whoever hit it, and investigated by nobody.
//
// Ingestion is the entire cost; an idle workspace is free. The services log
// events rather than requests — errors, admin decisions, and about twenty
// startup lines per cold start — which comes to single-digit megabytes a month.
// The cap below is not that budget. It is the backstop for the day a crash loop
// writes at line speed, and it is the only ceiling Azure offers.

@description('Workspace name')
param name string

@description('Azure region')
param location string = resourceGroup().location

@description('Days to keep log data. 30 is both the minimum and the amount included in the ingestion price; beyond it, retention is charged per GB per month.')
@minValue(30)
@maxValue(730)
param retentionDays int = 30

@description('Hard ceiling on ingestion per day, in GB. A string because ARM has no decimal parameter type — see json() below. Azure refuses anything under 0.023 (~23 MB/day).')
param dailyQuotaGb string = '0.023'

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: name
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionDays
    workspaceCapping: {
      // json() is the standard way round ARM having no float: the value travels
      // as a string and is parsed into the number the API wants. Ingestion stops
      // for the rest of the UTC day once the cap is reached — with some overshoot,
      // since the check is not instantaneous — and resumes the next day.
      dailyQuotaGb: json(dailyQuotaGb)
    }
    features: {
      // Reading logs requires permission on this workspace, not merely somewhere
      // above it. Nothing else in the subscription needs to see them.
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

output workspaceId string = workspace.id
output workspaceName string = workspace.name
