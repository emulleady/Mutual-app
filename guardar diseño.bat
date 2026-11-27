@echo off
setlocal
cd /d "%~dp0"
title Guardar copia del diseno actual

if not exist "frontend\src\components\Layout.tsx" (
  echo No encuentro frontend\src\components\Layout.tsx
  echo Copia este archivo en la carpeta principal del proyecto, donde estan backend y frontend.
  pause
  exit /b 1
)

if exist "_backup_diseno" goto existe
goto copiar

:existe
echo Ya existe una copia guardada en la carpeta _backup_diseno.
set /p R=Reemplazarla por los archivos actuales? (S/N): 
if /i not "%R%"=="S" goto fin

:copiar
if not exist "_backup_diseno\components" mkdir "_backup_diseno\components"
copy /Y "frontend\src\components\Layout.tsx" "_backup_diseno\components\Layout.tsx" >nul
copy /Y "frontend\src\App.tsx" "_backup_diseno\App.tsx" >nul
copy /Y "frontend\src\styles.css" "_backup_diseno\styles.css" >nul
echo.
echo Copia guardada en la carpeta _backup_diseno:
echo   Layout.tsx, App.tsx y styles.css
echo.
echo Ahora si podes copiar los archivos nuevos del zip sobre el proyecto.

:fin
pause