param location string = 'westeurope'
param siteName string
param storageName string
param automationName string
param collectorId string = 'varta-home'
@secure()
param uploadKey string

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
  }
}
resource site 'Microsoft.Web/staticSites@2023-12-01' = {
  name: siteName
  location: location
  sku: { name: 'Free', tier: 'Free' }
  properties: { allowConfigFileUpdates: true }
}
resource settings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: site
  name: 'appsettings'
  properties: {
    VARTA_STORAGE_CONNECTION: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
    VARTA_UPLOAD_KEY: uploadKey
    VARTA_COLLECTOR_ID: collectorId
  }
}
resource automation 'Microsoft.Automation/automationAccounts@2023-11-01' = {
  name: automationName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: { sku: { name: 'Basic' }, publicNetworkAccess: true }
}
resource role 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, automation.id, 'table-data-contributor')
  scope: storage
  properties: {
    principalId: automation.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3')
  }
}
resource runbook 'Microsoft.Automation/automationAccounts/runbooks@2023-11-01' = {
  parent: automation
  name: 'VartaRetention'
  location: location
  properties: { runbookType: 'PowerShell', logVerbose: false, logProgress: false, description: 'Delete expired VARTA daily tables; keep 365 UTC calendar days.' }
}
output website string = 'https://${site.properties.defaultHostname}'
output storageAccount string = storage.name
output automationAccount string = automation.name
output runbookResourceId string = runbook.id
