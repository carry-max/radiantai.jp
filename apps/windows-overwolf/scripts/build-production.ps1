$ErrorActionPreference = "Stop"

$required = @("OW_CLI_EMAIL", "OW_CLI_API_KEY", "OW_BUILD_KEY", "CSC_LINK", "CSC_KEY_PASSWORD")
$missing = $required | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) }
if ($missing.Count -gt 0) {
  throw "Missing production signing variables: $($missing -join ', ')"
}

$appRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
Push-Location $appRoot
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "RadiantAI Windows build failed." }

  npm run build:ow-electron
  if ($LASTEXITCODE -ne 0) { throw "Overwolf production packaging failed." }

  $installer = Get-ChildItem -LiteralPath (Join-Path $appRoot "release") -Filter "RadiantAI-Windows-Setup-*.exe" -File |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
  if (-not $installer) { throw "The signed installer was not generated." }

  $signature = Get-AuthenticodeSignature -LiteralPath $installer.FullName
  if ($signature.Status -ne "Valid") {
    throw "Windows signature validation failed: $($signature.Status)"
  }

  Write-Output "Production installer: $($installer.FullName)"
  Write-Output "Signer: $($signature.SignerCertificate.Subject)"
} finally {
  Pop-Location
}
