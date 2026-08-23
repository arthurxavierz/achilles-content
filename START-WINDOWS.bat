@echo off
cd /d "%~dp0"
echo.
echo ACHILLES CONTENT V4
echo Instalando dependencias...
call npm install
if errorlevel 1 (
  echo.
  echo Falha no npm install. Verifique se Node.js 20 ou superior esta instalado e sua conexao com o npm.
  pause
  exit /b 1
)
echo.
echo Iniciando modo demonstracao...
call npm run dev
pause
