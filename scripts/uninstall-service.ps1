$ErrorActionPreference = 'Stop'
Stop-ScheduledTask -TaskName 'ClaudBot' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'ClaudBot' -Confirm:$false
Write-Host 'ClaudBot service removed.'
