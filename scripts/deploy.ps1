$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path ".env")) {
  Write-Error "Missing .env — copy .env.example to .env and fill JWT_SECRET, GEMINI_API_KEY, and N8N_API_KEY."
}

Write-Host "Building and starting backend + MySQL..."
docker compose up --build -d

Write-Host "Waiting for API health..."
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $res = Invoke-RestMethod -Uri "http://localhost:3001/api/health" -TimeoutSec 3
    if ($res.status -eq "ok") { $ok = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}

if (-not $ok) {
  Write-Error "Backend did not become healthy. Check: docker compose logs backend"
}

Write-Host "Deployed. API: http://localhost:3001/api"
Write-Host "Docs: http://localhost:3001/api/docs"
