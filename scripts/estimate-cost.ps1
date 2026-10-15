#requires -Version 7.2
param([string]$Location = 'westeurope', [string]$PacketSamplePath)
$ErrorActionPreference = 'Stop'
$packets = 30 * 8640
$bytes = 4096
$origin = 'Annahme: 4 KiB gespeicherte Paketdaten (UTF-16)'
if ($PacketSamplePath) {
  $sample = Get-Content -LiteralPath $PacketSamplePath -TotalCount 100 | Where-Object { $_.Trim() }
  if ($sample.Count) { $bytes = [Math]::Ceiling((($sample | ForEach-Object { $_.Length * 2 }) | Measure-Object -Average).Average); $origin = 'Gemessen aus bis zu 100 Paket-/JSONL-Zeilen (UTF-16)' }
}
$gb = $bytes * 8640 * 365 * 1.6 / 1GB
Write-Host "Kostenmodell: $packets Pakete/30 Tage; $origin; ca. $([Math]::Round($gb,2)) GiB nach einem Jahr einschließlich pauschal 60% für Aggregate und Metadaten."
Write-Host 'Transaktionsannahme: 20 Speicheroperationen je Paket, zusätzlich 25% für wenig Website-Nutzung und Wartung. Ausfälle/Nachlieferungen können den Aufwand erhöhen.'
try {
  $filter = [Uri]::EscapeDataString("serviceName eq 'Storage' and armRegionName eq '$Location' and priceType eq 'Consumption'")
  $uri = "https://prices.azure.com/api/retail/prices?currencyCode='EUR'&`$filter=$filter"
  $rates = @()
  do { $page = Invoke-RestMethod -Uri $uri; $rates += @($page.Items | Where-Object { $_.productName -match 'Tables' -and $_.skuName -match 'LRS' }); $uri = $page.NextPageLink } while ($uri)
  $capacity = $rates | Where-Object { $_.unitOfMeasure -eq '1 GB/Month' -and $_.meterName -match 'Data Stored' -and $_.tierMinimumUnits -eq 0 } | Select-Object -First 1
  $operation = $rates | Where-Object { $_.unitOfMeasure -match '10K' -and $_.meterName -match 'Operation|Transaction' -and $_.tierMinimumUnits -eq 0 } | Select-Object -First 1
  $rates | Select-Object meterName,retailPrice,unitOfMeasure,currencyCode | Format-Table | Out-Host
  if ($capacity -and $operation) { Write-Host "Grobe monatliche Speicherschätzung bei vollem Jahr: $([Math]::Round($gb * $capacity.retailPrice + $packets * 20 * 1.25 / 10000 * $operation.retailPrice,2)) EUR. Tarifmeter/Einheiten oben prüfen; ohne Steuer, sonstige Dienste und zusätzlichen Datenverkehr." }
  else { Write-Host 'Tarifmeter nicht eindeutig zuordenbar: keine belastbare Euro-Summe. Azure-Preisrechner verwenden.' }
} catch { Write-Warning 'Aktuelle Retail-Preise nicht abrufbar. Keine Euro-Summe berechnet; Azure-Preisrechner verwenden.' }
Write-Host 'Static Web Apps: Free-Tarif. Automation: 500 Laufzeitminuten/Monat je Abonnement frei, sonst laufzeitabhängige Kosten. Freikontingente werden mit anderen Apps geteilt.'
