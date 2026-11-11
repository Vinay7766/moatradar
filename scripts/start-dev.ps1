# Start both backend (FastAPI) and frontend (Next.js) in separate PowerShell windows
$Root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path (Join-Path $Root ".env"))) {
    Write-Warning ".env file not found in project root. Copy .env.example to .env and add an LLM API key before running missions."
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\backend'; uv run uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\frontend'; npm run dev"
Write-Host "Launched CMI Desk backend (http://localhost:8000) and frontend (http://localhost:3000)."
