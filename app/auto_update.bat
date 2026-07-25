@echo off
REM ============================================================
REM  auto_update.bat - Chay o CUA SO RIENG tren may SERVER (Windows),
REM  song song voi run.bat + tunnel.bat. Lap vo han:
REM    1) Doc bat/tat + so phut tu trang "Cai dat" trong app.
REM    2) git fetch -> co ban moi tren GitHub thi git pull.
REM    3) Neu code BACKEND (app/backend/**, app/requirements.txt) doi ->
REM       TU DONG khoi dong lai server (dong tien trinh cu tren cong 8000,
REM       mo tien trinh moi). Neu CHI doi giao dien (JS/CSS/HTML) -> KHONG
REM       can lam gi them, trinh duyet cua nhan vien tu tai lai trong
REM       <=30s (co che co san, xem /api/app-version).
REM
REM  Dung: dong cua so nay (hoac Ctrl+C).
REM ============================================================
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
set APP_DIR=%cd%

if not exist ".venv\Scripts\python.exe" (
  echo [!] Chua thay .venv - hay chay run.bat truoc it nhat 1 lan.
  pause
  exit /b 1
)

:LOOP
set cap_nhat_bat=True
set cap_nhat_phut=5
for /f "tokens=1,2 delims==" %%a in ('".venv\Scripts\python.exe" "backend\scripts\doc_cai_dat_tu_dong.py"') do set %%a=%%b

if /i "%cap_nhat_bat%"=="False" (
  echo [%date% %time%] Tu dong cap nhat dang TAT ^(trang Cai dat^). Cho 60s...
  timeout /t 60 /nobreak >nul
  goto LOOP
)

for /f %%h in ('git rev-parse HEAD 2^>nul') do set OLDHEAD=%%h
git fetch origin main >nul 2>&1
if errorlevel 1 (
  echo [%date% %time%] Khong ket noi duoc GitHub - thu lai sau.
  goto WAIT
)
for /f %%h in ('git rev-parse origin/main 2^>nul') do set REMOTEHEAD=%%h

if "%OLDHEAD%"=="%REMOTEHEAD%" (
  echo [%date% %time%] Da la ban moi nhat.
  goto WAIT
)

echo [%date% %time%] Co ban moi ^(%OLDHEAD:~0,7% -^> %REMOTEHEAD:~0,7%^) - dang cap nhat...
git pull origin main
if errorlevel 1 (
  echo [%date% %time%] [!] git pull loi - thu lai vong sau.
  goto WAIT
)
for /f %%h in ('git rev-parse HEAD') do set NEWHEAD=%%h

git diff --name-only %OLDHEAD% %NEWHEAD% > "%TEMP%\ksk_diff.txt"
findstr /i /c:"app/backend" /c:"app/requirements.txt" "%TEMP%\ksk_diff.txt" >nul
if %errorlevel% == 0 (
  echo [%date% %time%] Backend doi - dang khoi dong lai server...
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    echo   dong tien trinh cu PID=%%p
    taskkill /F /PID %%p >nul 2>&1
  )
  timeout /t 2 /nobreak >nul
  call ".venv\Scripts\pip.exe" install -q -r requirements.txt
  start "KSK Server" cmd /k "cd /d %APP_DIR% && .venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8000"
  echo [%date% %time%] Da khoi dong lai server o cua so moi "KSK Server".
) else (
  echo [%date% %time%] Chi doi giao dien - khong can khoi dong lai ^(trinh duyet tu tai lai^).
)

:WAIT
set /a WAIT_SEC=%cap_nhat_phut%*60
timeout /t %WAIT_SEC% /nobreak >nul
goto LOOP
