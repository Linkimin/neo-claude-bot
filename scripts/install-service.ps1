$ErrorActionPreference = 'Stop'
$proj = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$wrapper = Join-Path $proj 'scripts\run-supervised.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File "' + $wrapper + '"') -WorkingDirectory $proj
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'NeoClaudeBot' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host 'NeoClaudeBot service installed (supervisor restarts the bot within ~5s on crash; starts at boot).'
Write-Host 'Start now:  Start-ScheduledTask -TaskName NeoClaudeBot'
Write-Host 'Log file:   data\bot.log'
