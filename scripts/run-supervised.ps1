$ErrorActionPreference = 'Continue'
$proj = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $proj
$node = (Get-Command node).Source
while ($true) {
  & $node --import tsx src/index.ts
  Start-Sleep -Seconds 5
}
