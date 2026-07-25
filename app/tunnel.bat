@echo off
REM ============================================================
REM  tunnel.bat - Mo duong truy cap INTERNET cho server KSK NCT
REM  bang cloudflared (quick tunnel). Chay o CUA SO RIENG, song
REM  song voi run.bat.
REM
REM  Chuan bi 1 lan: tai cloudflared.exe tu
REM    https://github.com/cloudflare/cloudflared/releases
REM  (ban windows-amd64.exe), doi ten thanh cloudflared.exe,
REM  dat CUNG thu muc nay (app\) hoac them vao PATH.
REM
REM  URL dang https://xxxx.trycloudflare.com se HIEN o cua so
REM  nay -> gui cho nhan vien. LUU Y: URL nay DOI moi lan chay
REM  lai. Muon URL CO DINH (khong doi) -> dung "named tunnel",
REM  xem WINDOWS_SETUP.md.
REM ============================================================
chcp 65001 >nul
cd /d "%~dp0"
cloudflared tunnel --url http://localhost:8000
