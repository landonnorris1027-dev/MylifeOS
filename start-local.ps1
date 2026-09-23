$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot
$logPath = Join-Path $projectRoot 'start-local.log'

function Show-StartupError($message) {
  Add-Type -AssemblyName System.Windows.Forms
  $title = 'MyLifeOS startup failed'
  $buttons = [System.Windows.Forms.MessageBoxButtons]::OK
  $icon = [System.Windows.Forms.MessageBoxIcon]::Error
  [System.Windows.Forms.MessageBox]::Show($message, $title, $buttons, $icon) | Out-Null
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [string[]]$ArgumentList = @()
  )

  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath $($ArgumentList -join ' ') failed with exit code $LASTEXITCODE"
  }
}

try {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCommand) {
    Show-StartupError 'Node.js was not found. Please install Node.js, then start MyLifeOS again.'
    exit 1
  }

  if (-not (Test-Path (Join-Path $projectRoot 'node_modules'))) {
    Invoke-Checked -FilePath 'npm.cmd' -ArgumentList @('install')
  }

  $electronCli = Join-Path $projectRoot 'node_modules\electron\cli.js'
  if (-not (Test-Path $electronCli)) {
    Invoke-Checked -FilePath 'npm.cmd' -ArgumentList @('install')
  }

  $buildIndex = Join-Path $projectRoot 'build\index.html'
  if (-not (Test-Path $buildIndex)) {
    Invoke-Checked -FilePath 'npm.cmd' -ArgumentList @('run', 'build')
  }

  # Always refresh the gitignored dist-main/ output so a pull or branch switch
  # cannot launch stale Electron main-process code.
  Invoke-Checked -FilePath 'npm.cmd' -ArgumentList @('run', 'build:main')

  $env:ELECTRON_START_URL = ''
  $env:NODE_ENV = 'production'

  Start-Process `
    -FilePath $nodeCommand.Source `
    -ArgumentList '.\scripts\start-electron.js' `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden
} catch {
  $errorMessage = $_.Exception.Message
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  "[$timestamp] $errorMessage" | Out-File -FilePath $logPath -Encoding utf8 -Append
  Show-StartupError "MyLifeOS could not start. Details were written to: $logPath"
  exit 1
}
