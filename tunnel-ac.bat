:: hafriyatcim.com - Tunnel Başlatıcı
:: Bu bat dosyasını çift tıkla, tunnel sürekli açık kalır

@echo off
title hafriyatcim.com - Tunnel
color 0A

echo ============================================
echo   hafriyatcim.com - Otomatik Tunnel
echo ============================================
echo.

:loop
echo [%TIME%] Tunnel aciliyor...
call powershell -ExecutionPolicy Bypass -Command "npx localtunnel --port 5050"
echo.
echo [%TIME%] Tunnel kapandi! 3 saniye sonra yeniden basliyor...
timeout /t 3 /nobreak >nul
goto loop
