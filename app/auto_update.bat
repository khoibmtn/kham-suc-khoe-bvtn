@echo off
REM ============================================================
REM  auto_update.bat - Chay o CUA SO RIENG tren may SERVER (Windows),
REM  song song voi run.bat + tunnel.bat. Lap vo han:
REM    1) Doc bat/tat + so phut tu trang "Cai dat" trong app.
REM    2) git fetch -> co ban moi tren GitHub thi git pull.
REM    3) Neu code BACKEND (app/backend/**, app/requirements.txt) doi, HOAC
REM       day la LAN CHAY DAU TIEN (chua biet server dang chay co dung ban
REM       moi nhat khong - vd vua git pull tay truoc do) -> TU DONG khoi
REM       dong lai server (dong tien trinh cu tren cong 8000, mo tien trinh
REM       moi). Neu CHI doi giao dien (JS/CSS/HTML) -> KHONG can lam gi
REM       them, trinh duyet nhan vien tu tai lai trong <=30s.
REM
REM  Dung: dong cua so nay (hoac Ctrl+C).
REM ============================================================
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
set APP_DIR=%cd%
set MARKER=%APP_DIR%\.auto_update_last_head
set TMP1=%TEMP%\ksk_au_head.txt
set TMP2=%TEMP%\ksk_au_remote.txt
set TMP3=%TEMP%\ksk_au_diff.txt
set TMP4=%TEMP%\ksk_au_port.txt
set TMP5=%TEMP%\ksk_au_cfg.txt

if not exist ".venv\Scripts\python.exe" (
  echo [!] Chua thay .venv - hay chay run.bat truoc it nhat 1 lan.
  pause
  exit /b 1
)

:LOOP
set cap_nhat_bat=True
set cap_nhat_phut=5
".venv\Scripts\python.exe" "backend\scripts\doc_cai_dat_tu_dong.py" > "%TMP5%" 2>nul
for /f "tokens=1,2 delims==" %%a in (%TMP5%) do set %%a=%%b

if /i "%cap_nhat_bat%"=="False" (
  echo [%date% %time%] Tu dong cap nhat dang TAT ^(trang Cai dat^). Cho 60s...
  timeout /t 60 /nobreak >nul
  goto LOOP
)

git rev-parse HEAD > "%TMP1%" 2>nul
set /p OLDHEAD=<"%TMP1%"

REM Lan chay DAU TIEN cua script nay (chua co file danh dau) -> KHONG BIET
REM server dang chay co dung ban HEAD hien tai khong (vd anh vua git pull
REM tay truoc do ma chua bao gio bam auto_update.bat). De an toan, force
REM khoi dong lai 1 lan luon o day.
set FORCE_RESTART=0
if not exist "%MARKER%" set FORCE_RESTART=1

git fetch origin main >"%TMP1%" 2>&1
if errorlevel 1 (
  echo [%date% %time%] Khong ket noi duoc GitHub - thu lai sau.
  goto WAIT
)
git rev-parse origin/main > "%TMP2%" 2>nul
set /p REMOTEHEAD=<"%TMP2%"

if "%OLDHEAD%"=="%REMOTEHEAD%" (
  if "%FORCE_RESTART%"=="0" (
    echo [%date% %time%] Da la ban moi nhat.
    goto WAIT
  )
  echo [%date% %time%] Da la ban moi nhat tren dia, nhung day la lan dau
  echo   chay auto_update.bat - dong bo lai server cho chac...
  set NEWHEAD=%OLDHEAD%
  goto RESTART_CHECK
)

echo [%date% %time%] Co ban moi - dang cap nhat...
git pull origin main
if errorlevel 1 (
  echo [%date% %time%] [!] git pull loi - thu lai vong sau.
  goto WAIT
)
git rev-parse HEAD > "%TMP1%" 2>nul
set /p NEWHEAD=<"%TMP1%"

:RESTART_CHECK
if "%FORCE_RESTART%"=="1" (
  set NEED_RESTART=1
) else (
  git diff --name-only %OLDHEAD% %NEWHEAD% > "%TMP3%" 2>nul
  findstr /i /c:"app/backend" /c:"app/requirements.txt" "%TMP3%" >nul
  if errorlevel 1 (set NEED_RESTART=0) else (set NEED_RESTART=1)
)

if "%NEED_RESTART%"=="1" (
  echo [%date% %time%] Dang khoi dong lai server...
  netstat -ano | findstr :8000 | findstr LISTENING > "%TMP4%" 2>nul
  for /f "tokens=5" %%p in (%TMP4%) do (
    echo   dong tien trinh cu PID=%%p
    taskkill /F /PID %%p >nul 2>&1
  )
  timeout /t 2 /nobreak >nul
  call ".venv\Scripts\pip.exe" install -q -r requirements.txt
  REM Dong HAN moi cua so cu con tieu de "KSK Server" (taskkill /PID o tren
  REM chi tat tien trinh python BEN TRONG, cua so cmd cha /k van con dung
  REM hinh - "cua so ma"). Tieu de nay CHI duoc dat boi chinh dong start ben
  REM duoi nen khong bao gio dong nham cua so run.bat chay tay lan dau.
  taskkill /F /T /FI "WINDOWTITLE eq KSK Server" >nul 2>&1
  start "KSK Server" cmd /k "cd /d %APP_DIR% && .venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8000"
  echo [%date% %time%] Da khoi dong lai server o cua so moi "KSK Server".
) else (
  echo [%date% %time%] Chi doi giao dien - khong can khoi dong lai ^(trinh duyet tu tai lai^).
)

echo %NEWHEAD%> "%MARKER%"

:WAIT
set /a WAIT_SEC=%cap_nhat_phut%*60
timeout /t %WAIT_SEC% /nobreak >nul
goto LOOP
