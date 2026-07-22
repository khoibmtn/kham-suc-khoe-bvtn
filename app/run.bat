@echo off
REM ============================================================
REM  run.bat - Khoi dong server KSK NCT tren may WINDOWS,
REM  phuc vu toan mang LAN. Chay lai nhieu lan van an toan.
REM  Yeu cau: da cai Python 3 (tick "Add to PATH") + Git.
REM ============================================================
chcp 65001 >nul
cd /d "%~dp0"

if not exist ".venv" (
  echo Tao virtualenv...
  python -m venv .venv
  call .venv\Scripts\python -m pip install --upgrade pip
  call .venv\Scripts\pip install -r requirements.txt
)

REM Chi nap du lieu khi CHUA co DB. Tren may nay DB duoc CHEP sang san,
REM nen buoc nay thuong bi bo qua.
if not exist "data\ksk.db" (
  echo Chua co data\ksk.db - thu nap tu file nguon...
  call .venv\Scripts\python backend\import_data.py
  if not exist "data\ksk.db" (
    echo.
    echo [!] Khong nap duoc. Hay CHEP file app\data\ksk.db tu may co du lieu
    echo     sang thu muc nay roi chay lai run.bat.
    pause
    exit /b 1
  )
)

echo.
echo ================================================================
echo   Server KSK NCT dang chay. Cac may khac trong mang truy cap:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo        http://%%b:8000
)
echo   (mo ngay tren may nay: http://127.0.0.1:8000). Ctrl+C de dung.
echo ================================================================
echo.
.venv\Scripts\python -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8000
pause
