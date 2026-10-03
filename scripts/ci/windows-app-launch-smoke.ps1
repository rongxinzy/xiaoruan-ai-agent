param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$ExePath = '',
  [string]$AppDataDirName = 'XiaoruanAgent',
  [int]$WindowTimeoutSeconds = 300,
  [int]$SettleSeconds = 10
)

$ErrorActionPreference = 'Stop'

# Launch the packaged Electron app and require it to reach a visible main
# window. This catches startup regressions that Authenticode and the runtime
# smoke cannot see, e.g. an IPC handler registered twice aborting initApp and
# leaving a windowless process that holds the single-instance lock.

if (-not $ExePath) {
  $builderConfigPath = Join-Path $ProjectRoot 'electron-builder.json'
  if (-not (Test-Path -LiteralPath $builderConfigPath)) {
    throw "Missing electron-builder configuration: $builderConfigPath"
  }
  $builderConfig = Get-Content -LiteralPath $builderConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $appExecutableName = $builderConfig.executableName
  if (-not $appExecutableName) {
    $appExecutableName = $builderConfig.productName
  }
  if (-not $appExecutableName) {
    throw 'electron-builder.json must define executableName or productName'
  }
  $ExePath = Join-Path $ProjectRoot ("release\win-unpacked\{0}.exe" -f $appExecutableName)
}
if (-not (Test-Path -LiteralPath $ExePath)) {
  throw "Missing packaged app executable: $ExePath"
}

$logFile = Join-Path $env:APPDATA (Join-Path $AppDataDirName ('logs\main-{0}.log' -f (Get-Date -Format 'yyyy-MM-dd')))
$logOffset = 0
if (Test-Path -LiteralPath $logFile) {
  $logOffset = @((Get-Content -LiteralPath $logFile)).Count
}

function Write-LogExcerpt {
  if (-not (Test-Path -LiteralPath $logFile)) {
    Write-Host 'No main-process log file was produced.'
    return
  }
  $lines = @((Get-Content -LiteralPath $logFile))
  if ($lines.Count -eq 0) {
    Write-Host 'Main-process log file is empty.'
    return
  }
  $start = [Math]::Max(0, $lines.Count - 40)
  Write-Host "--- main-process log tail ($logFile) ---"
  $lines[$start..($lines.Count - 1)] | ForEach-Object { Write-Host $_ }
}

Write-Host "Launching packaged app: $ExePath"
$process = Start-Process -FilePath $ExePath -WorkingDirectory (Split-Path -Parent $ExePath) -PassThru
$deadline = (Get-Date).AddSeconds($WindowTimeoutSeconds)
$windowReady = $false
$processGone = $false
try {
  while ((Get-Date) -lt $deadline) {
    $alive = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
    if (-not $alive) {
      $processGone = $true
      break
    }
    if ($alive.MainWindowHandle -ne 0) {
      $windowReady = $true
      break
    }
    Start-Sleep -Seconds 3
  }
  if ($windowReady) {
    Start-Sleep -Seconds $SettleSeconds
    if (-not (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) {
      $processGone = $true
    }
  }

  $errorLines = @()
  if (Test-Path -LiteralPath $logFile) {
    $errorLines = @(
      Get-Content -LiteralPath $logFile |
        Select-Object -Skip $logOffset |
        Where-Object { $_ -match '\[error\]' }
    )
  } else {
    Write-Host "Warning: no main-process log file found at $logFile"
  }

  if ($processGone) {
    Write-LogExcerpt
    throw 'Packaged app exited before presenting a stable main window.'
  }
  if (-not $windowReady) {
    Write-LogExcerpt
    throw "Packaged app did not create a main window within $WindowTimeoutSeconds seconds."
  }
  if ($errorLines.Count -gt 0) {
    Write-Host '--- startup log errors ---'
    $errorLines | ForEach-Object { Write-Host $_ }
    throw "Packaged app logged $($errorLines.Count) error line(s) during launch."
  }
  Write-Host 'Packaged app launch smoke passed.'
} finally {
  if (Get-Process -Id $process.Id -ErrorAction SilentlyContinue) {
    & taskkill.exe /PID $process.Id /T /F | Out-Null
  }
}
