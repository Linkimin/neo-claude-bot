$ErrorActionPreference = 'Continue'
$proj = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $proj
$node = (Get-Command node).Source
$superLog = Join-Path $proj 'data\supervisor.log'
while ($true) {
  ('[' + (Get-Date -Format o) + '] supervisor: launching bot') | Out-File -FilePath $superLog -Append -Encoding utf8
  & $node --import tsx src/index.ts *>> $superLog
  ('[' + (Get-Date -Format o) + '] supervisor: bot exited (code ' + $LASTEXITCODE + '), restart in 5s') | Out-File -FilePath $superLog -Append -Encoding utf8
  Start-Sleep -Seconds 5
}
