$ErrorActionPreference = 'Stop'
$proj = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$node = (Get-Command node).Source
$action = New-ScheduledTaskAction -Execute $node -Argument '--import tsx src/index.ts' -WorkingDirectory $proj
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'ClaudBot' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host 'ClaudBot service installed (starts at boot, restarts every 1 min on failure).'
Write-Host 'Start now:  Start-ScheduledTask -TaskName ClaudBot'
Write-Host 'Log file:   data\bot.log'
