param([int]$Port = 5173)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Install Node.js 24 LTS, reopen PowerShell and run start.ps1 again.'
}
$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) { throw 'Node.js 22.12+ is required; Node.js 24 LTS is recommended.' }
if (-not (Test-Path -LiteralPath 'node_modules')) {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Check the network connection.' }
}
Write-Host "BuildScope: http://127.0.0.1:$Port (Ctrl+C to stop)"
& npm.cmd run dev -- --port $Port --strictPort
if ($LASTEXITCODE -ne 0) { throw 'Vite failed to start. Check the output above.' }
