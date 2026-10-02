@echo off
cd /d %~dp0

echo ======================================
echo   Subiendo cambios a GitHub / Render
echo ======================================
echo.

git add .

set /p MENSAJE="Escribi un breve comentario de que cambiaste (o apreta Enter para uno automatico): "
if "%MENSAJE%"=="" set MENSAJE=Actualizacion %date% %time%

git commit -m "%MENSAJE%"
echo.
echo Subiendo a GitHub...
git push

echo.
echo ======================================
echo  Listo. Si hubo cambios, Render va a
echo  redeployar solo en unos minutos.
echo  Podes revisar el progreso en:
echo  https://dashboard.render.com
echo ======================================
pause
