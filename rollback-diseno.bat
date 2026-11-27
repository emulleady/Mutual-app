@echo off
setlocal
cd /d "%~dp0"
title Volver al diseno anterior

if not exist "frontend\src\components\Layout.tsx" (
  echo No encuentro frontend\src\components\Layout.tsx
  echo Copia este archivo en la carpeta principal del proyecto, donde estan backend y frontend.
  pause
  exit /b 1
)

echo ============================================
echo   Volver al diseno anterior (menu y panel)
echo ============================================
echo Restaura 3 archivos del frontend:
echo   Layout.tsx, App.tsx y styles.css
echo.
echo   1 - Desde la copia guardada con guardar-diseno.bat (_backup_diseno)
echo   2 - Descartar los cambios que todavia NO subiste (vuelve al ultimo commit)
echo   3 - Desde un commit anterior (ya subiste el diseno nuevo)
echo   0 - Cancelar
echo.
set /p OP=Elegi una opcion: 
if "%OP%"=="1" goto backup
if "%OP%"=="2" goto descartar
if "%OP%"=="3" goto commit
goto fin

:backup
if not exist "_backup_diseno\App.tsx" (
  echo No hay copia guardada en _backup_diseno. Proba con la opcion 2 o 3.
  goto fin
)
copy /Y "_backup_diseno\components\Layout.tsx" "frontend\src\components\Layout.tsx" >nul
copy /Y "_backup_diseno\App.tsx" "frontend\src\App.tsx" >nul
copy /Y "_backup_diseno\styles.css" "frontend\src\styles.css" >nul
goto listo

:descartar
git checkout -- frontend/src/components/Layout.tsx frontend/src/App.tsx frontend/src/styles.css
if errorlevel 1 goto error
goto listo

:commit
echo.
echo Ultimos cambios en esos archivos:
git log --oneline -n 15 -- frontend/src/components/Layout.tsx frontend/src/App.tsx frontend/src/styles.css
echo.
echo Copia el codigo (la primera palabra) del commit ANTERIOR al diseno nuevo.
set /p H=Codigo del commit: 
if "%H%"=="" goto fin
git checkout %H% -- frontend/src/components/Layout.tsx frontend/src/App.tsx frontend/src/styles.css
if errorlevel 1 goto error
goto listo

:listo
echo.
echo Listo: se restauraron Layout.tsx, App.tsx y styles.css.
echo Para ver el cambio en local, reinicia el frontend (npm run dev).
echo Para llevarlo a produccion, ejecuta subir-a-produccion.bat.
echo.
echo Nota: el Resumen solo para administradores tambien usa el backend
echo (dashboard.routes.ts); ese cambio no se revierte con este archivo.
goto fin

:error
echo.
echo Hubo un error al restaurar. No se modifico nada mas.

:fin
pause