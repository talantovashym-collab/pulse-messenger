# ==============================================================================
# ⚡ Pulse Messenger — Windows PowerShell Deployment Script
# ==============================================================================

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "🚀 Starting Pulse Messenger Local / Windows Deployment" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# 1. Check Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Docker Desktop: https://www.docker.com/products/docker-desktop/"
    exit 1
}

# 2. Check .env
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.production") {
        Copy-Item ".env.production" ".env"
    } else {
        Copy-Item ".env.example" ".env"
    }
    Write-Host "✓ Initialized .env configuration." -ForegroundColor Green
}

# 3. Build & Run
Write-Host "🔨 Building and launching containers..." -ForegroundColor Cyan
docker compose down --remove-orphans
docker compose up -d --build

Write-Host "`n⏳ Verifying application health..." -ForegroundColor Yellow
$healthy = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 2
    try {
        $res = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 2 -ErrorAction Stop
        if ($res.status -eq "online") {
            $healthy = $true
            break
        }
    } catch {}
}

if ($healthy) {
    Write-Host "✓ Pulse Application is live and healthy!" -ForegroundColor Green
} else {
    Write-Host "⚠️ Application taking longer to boot. Check logs with: docker compose logs" -ForegroundColor Yellow
}

docker compose ps

Write-Host "`n======================================================" -ForegroundColor Green
Write-Host "🎉 Pulse Messenger is running!" -ForegroundColor Green
Write-Host "📱 Web App URL:      http://localhost" -ForegroundColor Cyan
Write-Host "🚀 Direct Node:     http://localhost:3000" -ForegroundColor Cyan
Write-Host "📜 View live logs:   docker compose logs -f" -ForegroundColor Yellow
Write-Host "======================================================" -ForegroundColor Green
