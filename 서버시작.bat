@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  ╔══════════════════════════════════════╗
echo  ║      LinguaLive 서버 시작 중...      ║
echo  ╚══════════════════════════════════════╝
echo.

:: node_modules 없으면 설치
if not exist "node_modules" (
  echo  📦 패키지 설치 중... (처음 1회만)
  npm install
  echo.
)

:: 서버 시작
echo  🚀 서버 시작 중... http://localhost:3100
echo.
node server.js
pause
