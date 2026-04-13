@echo off
chcp 65001 >nul
echo LinguaLive 서버를 종료합니다...
taskkill /f /im node.exe >nul 2>&1
echo 완료!
timeout /t 1 /nobreak >nul
