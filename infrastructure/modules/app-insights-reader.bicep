// Lets one identity read one Application Insights component's telemetry, and
// nothing else.
//
// It exists for the auth service's usage page (backend/auth/internal/usage). The
// assignment is scoped to the component rather than to the Log Analytics
// workspace behind it, because the workspace also holds both containers' logs:
// a resource-scoped query sees the app's telemetry and nothing beside it, and the
// permission is cut to the same shape. The workspace allows that kind of query —
// see enableLogAccessUsingOnlyResourcePermissions in log-analytics.bicep.
//
// The deploy principal can create this. It holds Role Based Access Control
// Administrator on the resource group, whose condition excludes only the roles
// that hand out roles; Monitoring Reader is not one of them.

@description('Name of the Application Insights component')
param componentName string

@description('Object id of the identity that may read it')
param principalId string

// Monitoring Reader: read access to monitoring data, which for a component
// includes querying its logs. Built in, so the id is the same in every tenant.
var monitoringReaderRoleId = '43d0d8ad-25c7-4714-9337-8ba259a9fe05'

resource component 'Microsoft.Insights/components@2020-02-02' existing = {
  name: componentName
}

resource readTelemetry 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  // Deterministic, so a redeploy updates this assignment rather than failing on
  // a duplicate of it.
  name: guid(component.id, principalId, monitoringReaderRoleId)
  scope: component
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', monitoringReaderRoleId)
    principalId: principalId
    // Stated so ARM does not try to look a freshly created identity up in the
    // directory before replication has caught up with it, which fails the deploy.
    principalType: 'ServicePrincipal'
  }
}
