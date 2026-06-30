$ErrorActionPreference = 'Stop'
Stop-ScheduledTask -TaskName 'NeoClaudeBot' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'NeoClaudeBot' -Confirm:$false
Write-Host 'NeoClaudeBot service removed.'
