param([Parameter(Mandatory = $true)][string]$StorageAccount)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
if ($StorageAccount -notmatch '^[a-z0-9]{3,24}$') { throw 'Invalid storage account.' }
$resource = [Uri]::EscapeDataString('https://storage.azure.com/')
$identityUri = $env:IDENTITY_ENDPOINT + '?resource=' + $resource + '&api-version=2019-08-01'
$token = (Invoke-RestMethod -Uri $identityUri -Headers @{ 'X-IDENTITY-HEADER' = $env:IDENTITY_HEADER; Metadata = 'True' }).access_token
if (-not $token) { throw 'Managed Identity token unavailable.' }
$base = "https://$StorageAccount.table.core.windows.net"
$headers = @{ Authorization = "Bearer $token"; 'x-ms-version' = '2020-12-06'; Accept = 'application/json;odata=nometadata' }
$oldest = [DateTime]::UtcNow.Date.AddDays(-364).ToString('yyyyMMdd')
$deleted = 0
$failure = $null
try {
  $next = $null
  do {
    $uri = "$base/Tables"
    if ($next) { $uri += '?NextTableName=' + [Uri]::EscapeDataString($next) }
    $page = Invoke-WebRequest -UseBasicParsing -Uri $uri -Headers $headers
    $next = $page.Headers['x-ms-continuation-NextTableName']
    foreach ($table in ($page.Content | ConvertFrom-Json).value) {
      if ($table.TableName -match '^Varta(\d{8})$' -and $Matches[1] -lt $oldest) {
        Invoke-WebRequest -UseBasicParsing -Method Delete -Uri "$base/Tables('$($table.TableName)')" -Headers $headers | Out-Null
        $deleted++
      }
    }
  } while ($next)
} catch { $failure = 'Bereinigung fehlgeschlagen (' + $_.Exception.GetType().Name + '). Azure-Automation-Auftrag prüfen.' }
$status = @{ at = [DateTime]::UtcNow.ToString('o'); deletedTables = $deleted; oldestDay = $oldest; error = $failure } | ConvertTo-Json -Compress
$entity = @{ PartitionKey = 'system'; RowKey = 'cleanup'; payload = $status } | ConvertTo-Json -Compress
try { Invoke-WebRequest -UseBasicParsing -Method Put -Uri "$base/VartaMeta(PartitionKey='system',RowKey='cleanup')" -Headers $headers -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($entity)) | Out-Null }
catch { throw 'Bereinigungsstatus konnte nicht gespeichert werden. Berechtigungen und VartaMeta-Tabelle prüfen.' }
if ($failure) { throw $failure }
Write-Output "Retention complete: $deleted tables deleted; oldest retained UTC day: $oldest."
