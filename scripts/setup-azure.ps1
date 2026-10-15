#requires -Version 7.2
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$SubscriptionId,
  [string]$ResourceGroup = 'varta-iq',
  [string]$Location = 'westeurope',
  [string]$SiteName,
  [string]$StorageName,
  [string]$AutomationName = 'varta-retention',
  [ValidatePattern('^[a-zA-Z0-9_-]{1,64}$')][string]$CollectorId = 'varta-home',
  [string]$PacketSamplePath,
  [switch]$RotateUploadKey
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
foreach ($tool in @('az', 'node', 'npm', 'npx')) { if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool fehlt. Azure CLI und Node.js 22 einschließlich npm installieren." } }
function AzJson([string[]]$Arguments) {
  $output = & az @Arguments --only-show-errors --output json
  if ($LASTEXITCODE -ne 0) { throw "Azure CLI fehlgeschlagen: $($Arguments[0..([Math]::Min(2,$Arguments.Length-1))] -join ' ')" }
  if ($output) { return ($output -join "`n" | ConvertFrom-Json) }
}
function AzRest([string]$Method, [string]$Uri, $Body, [string]$ContentType = 'application/json') {
  $temporary = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString() + '.json')
  try {
    $arguments = @('rest','--method',$Method,'--uri',$Uri)
    if ($null -ne $Body) { [IO.File]::WriteAllText($temporary, [string]$Body); $arguments += @('--body', "@$temporary", '--headers', "Content-Type=$ContentType") }
    return AzJson $arguments
  } finally { Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue }
}
# Use the user's explicit CLI login; never collect subscription credentials in the web UI.
AzJson @('account','set','--subscription',$SubscriptionId) | Out-Null
$account = AzJson @('account','show')
if ($account.id -ne $SubscriptionId -and $account.name -ne $SubscriptionId) { throw 'Unerwartetes Azure-Abonnement.' }
$SubscriptionId = $account.id
$suffix = ([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes("$SubscriptionId/$ResourceGroup")))).Substring(0,10).ToLowerInvariant()
if (-not $SiteName) { $SiteName = "varta-$suffix" }
if (-not $StorageName) { $StorageName = "varta$suffix" }
AzJson @('group','create','--name',$ResourceGroup,'--location',$Location) | Out-Null
$siteId = "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.Web/staticSites/$SiteName"
$existing = AzJson @('resource','list','--resource-group',$ResourceGroup,'--resource-type','Microsoft.Web/staticSites')
$key = $null
if (-not $RotateUploadKey -and @($existing | Where-Object name -eq $SiteName).Count) {
  $saved = AzRest 'POST' "https://management.azure.com$siteId/listAppSettings?api-version=2023-12-01" $null
  $key = $saved.properties.VARTA_UPLOAD_KEY
}
if (-not $key) { $key = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant() }
$temporary = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString() + '.json')
try {
  $parameters = @{ '$schema' = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'; contentVersion = '1.0.0.0'; parameters = @{} }
  foreach ($pair in @{ location=$Location; siteName=$SiteName; storageName=$StorageName; automationName=$AutomationName; collectorId=$CollectorId; uploadKey=$key }.GetEnumerator()) { $parameters.parameters[$pair.Key] = @{ value=$pair.Value } }
  [IO.File]::WriteAllText($temporary, ($parameters | ConvertTo-Json -Depth 8))
  $deployment = AzJson @('deployment','group','create','--resource-group',$ResourceGroup,'--name','varta-infrastructure','--template-file',(Join-Path $root 'cloud/infra/main.bicep'),'--parameters',"@$temporary")
} finally { Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue }
$website = $deployment.properties.outputs.website.value
$runbookId = $deployment.properties.outputs.runbookResourceId.value
# Initialize the metadata table before the first independent cleanup run.
$connection = (AzRest 'POST' "https://management.azure.com$siteId/listAppSettings?api-version=2023-12-01" $null).properties.VARTA_STORAGE_CONNECTION
$oldConnection = $env:AZURE_STORAGE_CONNECTION_STRING
try { $env:AZURE_STORAGE_CONNECTION_STRING = $connection; AzJson @('storage','table','create','--name','VartaMeta') | Out-Null }
finally { $env:AZURE_STORAGE_CONNECTION_STRING = $oldConnection; $connection = $null }
Push-Location $root
try {
  & node cloud/prepare.mjs; if ($LASTEXITCODE) { throw 'Website-Vorbereitung fehlgeschlagen.' }
  & npm ci --prefix cloud/api --omit=dev; if ($LASTEXITCODE) { throw 'API-Abhängigkeiten fehlen.' }
  $deployToken = (AzRest 'POST' "https://management.azure.com$siteId/listSecrets?api-version=2023-12-01" $null).properties.apiKey
  $oldDeployToken = $env:SWA_CLI_DEPLOYMENT_TOKEN
  try {
    $env:SWA_CLI_DEPLOYMENT_TOKEN = $deployToken
    & npx --yes '@azure/static-web-apps-cli@2.0.8' deploy cloud/site --api-location cloud/api --api-language node --api-version 22 --env production
    if ($LASTEXITCODE) { throw 'Website-Deployment fehlgeschlagen.' }
  } finally { $env:SWA_CLI_DEPLOYMENT_TOKEN = $oldDeployToken; $deployToken = $null }
} finally { Pop-Location }
$content = [IO.File]::ReadAllText((Join-Path $root 'cloud/infra/retention.ps1'))
AzRest 'PUT' "https://management.azure.com$runbookId/draft/content?api-version=2023-11-01" $content 'text/powershell' | Out-Null
AzRest 'POST' "https://management.azure.com$runbookId/publish?api-version=2023-11-01" $null | Out-Null
$automationId = "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.Automation/automationAccounts/$AutomationName"
$scheduleUri = "https://management.azure.com$automationId/schedules/VartaDaily?api-version=2023-11-01"
$schedules = AzRest 'GET' "https://management.azure.com$automationId/schedules?api-version=2023-11-01" $null
if (-not @($schedules.value | Where-Object name -eq 'VartaDaily').Count) {
  $start = [DateTime]::UtcNow.Date.AddDays(1).AddHours(3).ToString('o')
  AzRest 'PUT' $scheduleUri (@{ properties=@{ startTime=$start; frequency='Day'; interval=1; timeZone='UTC' } } | ConvertTo-Json -Depth 5) | Out-Null
}
$scheduleHash = [Security.Cryptography.MD5]::HashData([Text.Encoding]::UTF8.GetBytes($automationId + '/VartaDaily'))
$jobScheduleId = [Guid]::new($scheduleHash).ToString()
AzRest 'PUT' "https://management.azure.com$automationId/jobSchedules/$jobScheduleId`?api-version=2023-11-01" (@{ properties=@{ runbook=@{name='VartaRetention'}; schedule=@{name='VartaDaily'}; parameters=@{StorageAccount=$StorageName} } } | ConvertTo-Json -Depth 6) | Out-Null
Write-Host "Website: $website"
Write-Host "Upload-Adresse: $website/api/ingest"
Write-Host "Collector-ID: $CollectorId"
Write-Host "Upload-Schlüssel (nur im Collector eintragen): $key"
Write-Host 'Nutzer im Azure-Portal unter Static Web App > Role management mit Rolle viewer einladen. Bis 25 Einladungen.'
Write-Host 'Tägliche Bereinigung: 03:00 UTC. Die Managed-Identity-Rollenzuweisung kann einige Minuten benötigen.'
& (Join-Path $PSScriptRoot 'estimate-cost.ps1') -Location $Location -PacketSamplePath $PacketSamplePath
