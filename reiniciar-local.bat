@echo off
echo ======================================
echo   Reiniciando Backend y Frontend
echo ======================================
echo.

echo Cerrando procesos anteriores en los puertos 4000 y 5173 (si hay)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo.
echo Iniciando Backend (puerto 4000)...
start "Backend - Mutual" cmd /k "cd /d %~dp0backend && npm run dev"

timeout /t 2 /nobreak >nul

echo Iniciando Frontend (puerto 5173)...
start "Frontend - Mutual" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ======================================
echo  Listo. Se abrieron dos ventanas nuevas.
echo  Backend:  http://localhost:4000
echo  Frontend: http://localhost:5173
echo ======================================
pause
