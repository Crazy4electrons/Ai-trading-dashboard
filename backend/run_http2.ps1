#!/usr/bin/env pwsh
# Run TradeMatrix backend with HTTP/2 support using Hypercorn

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "TradeMatrix Backend - HTTP/2 Enabled (Hypercorn)" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting server with:" -ForegroundColor Green
Write-Host "  • Protocol: HTTP/2 (cleartext h2c) + WebSocket" -ForegroundColor Gray
Write-Host "  • Host: 0.0.0.0" -ForegroundColor Gray
Write-Host "  • Port: 8000" -ForegroundColor Gray
Write-Host "  • Auto-reload: Enabled" -ForegroundColor Gray
Write-Host ""
Write-Host "Verify HTTP/2 is active:" -ForegroundColor Yellow
Write-Host "  1. Open browser DevTools (F12)" -ForegroundColor Gray
Write-Host "  2. Go to Network tab" -ForegroundColor Gray
Write-Host "  3. Check 'Protocol' column for 'h2' or 'h2c'" -ForegroundColor Gray
Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

uv run hypercorn main:app --bind 0.0.0.0:8000 --reload
