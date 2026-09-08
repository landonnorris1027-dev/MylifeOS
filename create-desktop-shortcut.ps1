$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'MyLifeOS.lnk'
$launcherPath = Join-Path $projectRoot 'start-local.ps1'
$iconPath = Join-Path $projectRoot 'assets\icon.ico'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = 'powershell.exe'
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcherPath`""
$shortcut.WorkingDirectory = $projectRoot

if (Test-Path $iconPath) {
  $shortcut.IconLocation = $iconPath
}

$shortcut.Description = 'Start MyLifeOS locally without packaging'
$shortcut.WindowStyle = 7
$shortcut.Save()

Write-Host "Created desktop shortcut: $shortcutPath"
