@echo off
REM ============================================================
REM  update.bat - Cap nhat CODE moi nhat tu GitHub (tren may
REM  Windows chay server). KHONG dung toi du lieu (data\ksk.db
REM  duoc .gitignore, luon giu nguyen tren may nay).
REM
REM  Luong: MacBook code -> git push  ==>  chay update.bat o day
REM         -> tat run.bat cu (Ctrl+C) roi chay lai run.bat.
REM ============================================================
chcp 65001 >nul
cd /d "%~dp0\.."

echo Keo code moi nhat tu GitHub...
git pull origin main
if errorlevel 1 (
  echo [!] git pull loi. Kiem tra ket noi mang / dang nhap Git.
  pause
  exit /b 1
)

echo Cap nhat thu vien (neu co thay doi)...
call app\.venv\Scripts\pip install -r app\requirements.txt

echo.
echo ================================================================
echo   Da cap nhat code moi nhat. Bay gio:
echo     1) Neu server dang chay: bam Ctrl+C o cua so run.bat de dung.
echo     2) Chay lai run.bat de khoi dong ban moi.
echo ================================================================
pause
