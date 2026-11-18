# Cài đặt một lần app rà soát KSK chạy offline trên máy Windows (PowerShell "Run as administrator").
# Chạy lại nhiều lần không hỏng: bước nào đã xong thì bỏ qua; KHÔNG BAO GIỜ ghi đè CSDL đã có dữ liệu.
#
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\cai-dat.ps1 -FileDump D:\...\neon-public-<thời gian>.dump -FileDemSo D:\...\dem-so.txt
#
# Kết quả: D:\vibe-coding\ksk-ra-soat\{app,pgsql,pgdata,sao-luu,nhat-ky,khoa,dieu-khien,...}, 2 tác vụ LOCAL SERVICE
# "KSK Ra soat Ung dung" + "KSK Ra soat Bao tri", ứng dụng ở http://127.0.0.1:8028 (chỉ máy này mở được).
[CmdletBinding()]
param(
    [string]$ThuMuc = 'D:\vibe-coding\ksk-ra-soat',
    [string]$Repo = 'https://github.com/khoibmtn/kham-suc-khoe-bvtn.git',
    [string]$ThuMucConApp = 'bc-ksk\app-nhapsl',
    [int]$Cong = 8028,
    [int]$CongPg = 5433,
    [string]$FilePostgresZip = '',
    [string]$FileDump = '',
    [string]$FileDemSo = '',
    [string]$NguoiXemNhatKy = ''
)

Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }

function Buoc { param([string]$m) Write-Host ''; Write-Host $m -ForegroundColor Cyan }

function Chay {
    param([Parameter(Mandatory = $true)][string]$FilePath, [Parameter(Mandatory = $true)][string[]]$ThamSo, [switch]$ChoPhepLoi)
    $eap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $raw = @(& $FilePath @ThamSo 2>&1); $ma = [int]$LASTEXITCODE } finally { $ErrorActionPreference = $eap }
    $out = [string[]]@($raw | ForEach-Object { $_.ToString() })
    if (-not $ChoPhepLoi -and $ma -ne 0) {
        throw ("{0} {1} thất bại (mã {2}):`n{3}" -f (Split-Path -Leaf $FilePath), ($ThamSo -join ' '), $ma, (($out | Select-Object -Last 20) -join "`n"))
    }
    return [pscustomobject]@{ ExitCode = $ma; Output = $out }
}

function Ghi-Utf8 {
    param([string]$DuongDan, [string]$NoiDung)
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($DuongDan, (($NoiDung -replace "`r`n", "`n") -replace "`n", "`r`n"), $enc)
}

function Mat-Khau-Ngau-Nhien {
    $b = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    return (($b | ForEach-Object { $_.ToString('x2') }) -join '')
}

function Psql-Postgres {
    # -AnLenh: câu SQL chứa bí mật -> lỗi chỉ báo chung, không in câu lệnh.
    param([string]$Db, [string]$Sql, [switch]$AnLenh)
    $env:PGPASSWORD = $script:MatKhauPostgres
    try {
        $kq = Chay -FilePath $psql -ThamSo @('-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', [string]$CongPg, '-U', 'postgres', '-d', $Db, '-c', $Sql) -ChoPhepLoi
    } finally { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue }
    if ($kq.ExitCode -ne 0) {
        if ($AnLenh) { throw ("Lệnh psql (ẩn nội dung) trên CSDL {0} thất bại (mã {1})." -f $Db, $kq.ExitCode) }
        throw ("psql trên {0} thất bại: {1}`n{2}" -f $Db, $Sql, (($kq.Output | Select-Object -Last 10) -join "`n"))
    }
    return $kq
}

function Cho-Cong-Dong {
    param([int]$CongCho, [int]$Giay)
    $han = (Get-Date).AddSeconds($Giay)
    while ((Get-Date) -lt $han) {
        $c = New-Object System.Net.Sockets.TcpClient
        $mo = $false
        try { $c.Connect('127.0.0.1', $CongCho); $mo = $true } catch { } finally { $c.Close() }
        if (-not $mo) { return $true }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Cho-Cong {
    param([int]$CongCho, [int]$Giay)
    $han = (Get-Date).AddSeconds($Giay)
    while ((Get-Date) -lt $han) {
        $c = New-Object System.Net.Sockets.TcpClient
        try { $c.Connect('127.0.0.1', $CongCho); return $true } catch { } finally { $c.Close() }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Chay-Npm-Cai-Dat {
    param([string[]]$ThamSo, [hashtable]$Bien = @{})
    $cu = @{}
    foreach ($k in $Bien.Keys) { $cu[$k] = [Environment]::GetEnvironmentVariable($k, 'Process'); [Environment]::SetEnvironmentVariable($k, $Bien[$k], 'Process') }
    try {
        $env:npm_config_cache = $thuMucNpmCache
        $env:NEXT_TELEMETRY_DISABLED = '1'
        Push-Location $thuMucApp
        try { $null = Chay -FilePath $npmCmd -ThamSo $ThamSo } finally { Pop-Location }
    } finally {
        foreach ($k in $cu.Keys) { [Environment]::SetEnvironmentVariable($k, $cu[$k], 'Process') }
    }
}

# ---------------------------------------------------------------------------------------------------------------
Buoc '[1/12] Kiểm tra quyền quản trị và phần mềm...'
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Cần chạy bằng PowerShell quyền quản trị (Run as administrator).'
}
$nodeExe = (Get-Command node -ErrorAction Stop).Source
$npmCmd = (Get-Command npm.cmd -ErrorAction Stop).Source
$gitExe = (Get-Command git -ErrorAction Stop).Source
$nodeVer = (Chay -FilePath $nodeExe -ThamSo @('-v')).Output[0].Trim()
if ($nodeVer -notmatch '^v24\.') { Write-Warning ("App khai báo Node 24.x; máy đang có {0}." -f $nodeVer) }
foreach ($p in @($nodeExe, $npmCmd, $gitExe)) {
    if ($p -like 'C:\Users\*') { throw ("{0} cài theo tài khoản người dùng; LOCAL SERVICE không chạy được. Cài Node/Git cho toàn máy (Program Files)." -f $p) }
}
Write-Host ("  node {0} | git {1}" -f $nodeVer, $gitExe)

$thuMucRepo = Join-Path $ThuMuc 'app'
$thuMucApp = Join-Path $thuMucRepo $ThuMucConApp
$thuMucKhoa = Join-Path $ThuMuc 'khoa'
$thuMucNhatKy = Join-Path $ThuMuc 'nhat-ky'
$thuMucNpmCache = Join-Path $ThuMuc 'npm-cache'
$thuMucPg = Join-Path $ThuMuc 'pgsql'
$pgBin = Join-Path $thuMucPg 'bin'
$pgData = Join-Path $ThuMuc 'pgdata'
$psql = Join-Path $pgBin 'psql.exe'
$tepMkPostgres = Join-Path $thuMucKhoa 'pg-postgres.txt'
$tepEnv = Join-Path $thuMucKhoa 'app.env'
$gitConfig = Join-Path $ThuMuc 'gitconfig'
if ([string]::IsNullOrWhiteSpace($FilePostgresZip)) { $FilePostgresZip = Join-Path (Join-Path $ThuMuc 'tai-ve') 'pg18.zip' }

# ---------------------------------------------------------------------------------------------------------------
Buoc ("[2/12] Tạo thư mục {0} và phân quyền (Administrators, SYSTEM: toàn quyền; LOCAL SERVICE: sửa; khoa: LOCAL SERVICE chỉ đọc)..." -f $ThuMuc)
foreach ($d in @($ThuMuc, $thuMucKhoa, $thuMucNhatKy, $thuMucNpmCache, (Join-Path $ThuMuc 'sao-luu'), (Join-Path $ThuMuc 'dieu-khien'))) {
    if (-not (Test-Path -LiteralPath $d -PathType Container)) { $null = New-Item -ItemType Directory -Path $d -Force }
}
$null = Chay -FilePath 'icacls.exe' -ThamSo @($ThuMuc, '/inheritance:r', '/grant:r', '*S-1-5-32-544:(OI)(CI)F', '*S-1-5-18:(OI)(CI)F', '*S-1-5-19:(OI)(CI)M', '/Q')
# tai-ve do tài khoản thường tạo (tải PostgreSQL) bỏ quyền riêng, kế thừa từ gốc. Không dùng /T với (OI)(CI).
$taiVe = Join-Path $ThuMuc 'tai-ve'
if (Test-Path -LiteralPath $taiVe) { $null = Chay -FilePath 'icacls.exe' -ThamSo @($taiVe, '/reset', '/T', '/C', '/Q') -ChoPhepLoi }
$null = Chay -FilePath 'icacls.exe' -ThamSo @($thuMucKhoa, '/inheritance:r', '/grant:r', '*S-1-5-32-544:(OI)(CI)F', '*S-1-5-18:(OI)(CI)F', '*S-1-5-19:(OI)(CI)R', '/Q')
if (@(Get-ChildItem -LiteralPath $thuMucKhoa -Force).Count -gt 0) {
    $null = Chay -FilePath 'icacls.exe' -ThamSo @((Join-Path $thuMucKhoa '*'), '/reset', '/T', '/Q')
}
Ghi-Utf8 -DuongDan (Join-Path $ThuMuc 'cau-hinh.psd1') -NoiDung (@"
@{
    ThuMuc       = '$ThuMuc'
    Cong         = $Cong
    CongPg       = $CongPg
    NodeExe      = '$nodeExe'
    NpmCmd       = '$npmCmd'
    GitExe       = '$gitExe'
    ThuMucConApp = '$ThuMucConApp'
}
"@)

# Chạy lại trên máy đã cài: tạm tắt tự cập nhật và dừng app (CSDL vẫn chạy) trong lúc cài; finally ở cuối bước 11 bật lại.
$tepTamDung = Join-Path (Join-Path $ThuMuc 'dieu-khien') 'tam-dung'
$null = New-Item -ItemType File -Path $tepTamDung -Force
if ($null -ne (Get-ScheduledTask -TaskName 'KSK Ra soat Bao tri' -ErrorAction SilentlyContinue)) {
    $null = Disable-ScheduledTask -TaskName 'KSK Ra soat Bao tri'
    Write-Host '  Đã tạm tắt tác vụ bảo trì và đặt cờ tạm dừng ứng dụng trong lúc cài.'
}
if (-not (Cho-Cong-Dong -CongCho $Cong -Giay 90)) {
    Remove-Item -LiteralPath $tepTamDung -Force -ErrorAction SilentlyContinue
    throw ("Cổng {0} vẫn đang mở sau 90 giây (ứng dụng chưa dừng hoặc chương trình khác dùng cổng); dừng cài đặt." -f $Cong)
}
try {

# ---------------------------------------------------------------------------------------------------------------
Buoc '[3/12] PostgreSQL 18 (bản zip chính thức EDB)...'
if (-not (Test-Path -LiteralPath (Join-Path $pgBin 'postgres.exe') -PathType Leaf)) {
    if (-not (Test-Path -LiteralPath $FilePostgresZip -PathType Leaf)) { throw ("Không thấy {0}." -f $FilePostgresZip) }
    Write-Host '  Đang giải nén (vài phút)...'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($FilePostgresZip)
    try {
        foreach ($e in $zip.Entries) {
            # Chỉ cần bin, lib, share của máy chủ; bỏ pgAdmin 4, StackBuilder, symbols, doc, include.
            if ($e.FullName -notmatch '^pgsql/(bin|lib|share)/') { continue }
            $dich = Join-Path $ThuMuc ($e.FullName -replace '/', '\')
            if ($e.FullName.EndsWith('/')) { $null = New-Item -ItemType Directory -Path $dich -Force; continue }
            $cha = Split-Path -Parent $dich
            if (-not (Test-Path -LiteralPath $cha)) { $null = New-Item -ItemType Directory -Path $cha -Force }
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, $dich, $true)
        }
    } finally { $zip.Dispose() }
}
foreach ($exe in @('postgres.exe', 'pg_ctl.exe', 'psql.exe', 'pg_dump.exe', 'pg_restore.exe', 'initdb.exe')) {
    $sig = Get-AuthenticodeSignature -LiteralPath (Join-Path $pgBin $exe)
    if ($sig.Status -ne 'Valid') { throw ("Chữ ký số của {0} không hợp lệ ({1}); dừng." -f $exe, $sig.Status) }
}
$pgVer = (Chay -FilePath (Join-Path $pgBin 'postgres.exe') -ThamSo @('--version')).Output[0]
Write-Host ("  {0} (chữ ký số: {1})" -f $pgVer, (Get-AuthenticodeSignature -LiteralPath (Join-Path $pgBin 'postgres.exe')).SignerCertificate.Subject)

# ---------------------------------------------------------------------------------------------------------------
Buoc '[4/12] Lấy mã nguồn từ GitHub (repo công khai, không cần khoá)...'
Ghi-Utf8 -DuongDan $gitConfig -NoiDung "[safe]`n`tdirectory = *`n[core]`n`tlongpaths = true`n`tautocrlf = false`n"
$env:GIT_CONFIG_GLOBAL = $gitConfig
$env:GIT_TERMINAL_PROMPT = '0'
if (-not (Test-Path -LiteralPath (Join-Path $thuMucRepo '.git'))) {
    $null = Chay -FilePath $gitExe -ThamSo @('clone', '--branch', 'main', $Repo, $thuMucRepo)
} else {
    $null = Chay -FilePath $gitExe -ThamSo @('-C', $thuMucRepo, 'fetch', '--quiet', 'origin', 'main')
    $null = Chay -FilePath $gitExe -ThamSo @('-C', $thuMucRepo, 'merge', '--ff-only', '--quiet', 'origin/main') -ChoPhepLoi
}
Write-Host ("  HEAD: {0}" -f (Chay -FilePath $gitExe -ThamSo @('-C', $thuMucRepo, 'log', '-1', '--format=%h %s')).Output[0])
if (-not (Test-Path -LiteralPath (Join-Path $thuMucApp 'package.json'))) { throw ("Không thấy {0}\package.json." -f $thuMucApp) }

# ---------------------------------------------------------------------------------------------------------------
Buoc '[5/12] Mật khẩu CSDL và khoá phiên (sinh ngẫu nhiên, chỉ lưu trong khoa\, không in ra)...'
if (-not (Test-Path -LiteralPath $tepMkPostgres -PathType Leaf)) { [System.IO.File]::WriteAllText($tepMkPostgres, (Mat-Khau-Ngau-Nhien), (New-Object System.Text.UTF8Encoding($false))) }
$script:MatKhauPostgres = ([System.IO.File]::ReadAllText($tepMkPostgres)).Trim()
if (-not (Test-Path -LiteralPath $tepEnv -PathType Leaf)) {
    $mkApp = Mat-Khau-Ngau-Nhien
    $b = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    Ghi-Utf8 -DuongDan $tepEnv -NoiDung (@(
        "DATABASE_URL=postgres://ksk:$mkApp@127.0.0.1:$CongPg/ksk",
        "TEST_DATABASE_URL=postgres://ksk:$mkApp@127.0.0.1:$CongPg/ksk_test",
        ("SESSION_SECRET=" + [Convert]::ToBase64String($b)),
        ''
    ) -join "`n")
}
$null = Chay -FilePath 'icacls.exe' -ThamSo @((Join-Path $thuMucKhoa '*'), '/reset', '/T', '/Q')
$envApp = @{}
foreach ($d in [System.IO.File]::ReadAllLines($tepEnv)) { if ($d -match '^([A-Z0-9_]+)=(.*)$') { $envApp[$matches[1]] = $matches[2] } }
$mkKsk = ([System.Uri]$envApp['DATABASE_URL']).UserInfo.Split(':', 2)[1]

# ---------------------------------------------------------------------------------------------------------------
Buoc '[6/12] Khởi tạo cụm CSDL (initdb, UTF8, collation C.UTF-8 giống Neon, chỉ nghe 127.0.0.1)...'
if (-not (Test-Path -LiteralPath (Join-Path $pgData 'PG_VERSION') -PathType Leaf)) {
    $null = Chay -FilePath (Join-Path $pgBin 'initdb.exe') -ThamSo @('-D', $pgData, '-U', 'postgres', "--pwfile=$tepMkPostgres",
        '--auth=scram-sha-256', '-E', 'UTF8', '--locale=C', '--locale-provider=builtin', '--builtin-locale=C.UTF-8')
    Add-Content -LiteralPath (Join-Path $pgData 'postgresql.conf') -Encoding ASCII -Value @(
        '', '# --- KSK ra soat (cai-dat.ps1) ---',
        "port = $CongPg",
        "listen_addresses = '127.0.0.1'",
        'max_connections = 40',
        'shared_buffers = 256MB',
        "timezone = 'GMT'",
        "log_timezone = 'Asia/Ho_Chi_Minh'",
        'logging_collector = on',
        "log_directory = 'log'",
        "log_filename = 'postgresql-%a.log'",
        'log_truncate_on_rotation = on',
        'log_rotation_age = 1d',
        'log_rotation_size = 0'
    )
    $null = Chay -FilePath 'icacls.exe' -ThamSo @($pgData, '/reset', '/T', '/C', '/Q')
    Write-Host '  Đã tạo pgdata.'
} else { Write-Host '  pgdata đã có, giữ nguyên.' }

# ---------------------------------------------------------------------------------------------------------------
Buoc '[7/12] Cài thư viện Node (npm ci)...'
$lockHash = (Get-FileHash -LiteralPath (Join-Path $thuMucApp 'package-lock.json') -Algorithm SHA256).Hash.ToLowerInvariant()
$tepAppLock = Join-Path (Join-Path $ThuMuc 'dieu-khien') 'app-lock.sha'
$daCai = (Test-Path -LiteralPath (Join-Path $thuMucApp 'node_modules\next\dist\bin\next')) -and
    (Test-Path -LiteralPath $tepAppLock) -and (([System.IO.File]::ReadAllText($tepAppLock)).Trim() -eq $lockHash)
if (-not $daCai) {
    Chay-Npm-Cai-Dat -ThamSo @('ci', '--include=dev', '--no-audit', '--no-fund')
    Ghi-Utf8 -DuongDan $tepAppLock -NoiDung $lockHash
}
Write-Host '  Xong.'

# ---------------------------------------------------------------------------------------------------------------
Buoc '[8/12] Đăng ký 2 tác vụ chạy bằng LOCAL SERVICE (khi bật máy + mỗi 5 phút)...'
$psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$thuMucScript = Join-Path $thuMucApp 'deploy\windows'
$tenLs = (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-19')).Translate([System.Security.Principal.NTAccount]).Value
$principal = New-ScheduledTaskPrincipal -UserId $tenLs -LogonType ServiceAccount -RunLevel Limited
$tacVu = @(
    @{ Ten = 'KSK Ra soat Ung dung'; Script = 'giam-sat.ps1'; Tre = 1; GioiHan = [TimeSpan]::Zero },
    @{ Ten = 'KSK Ra soat Bao tri'; Script = 'bao-tri.ps1'; Tre = 3; GioiHan = (New-TimeSpan -Hours 3) }
)
foreach ($t in $tacVu) {
    $trigStart = New-ScheduledTaskTrigger -AtStartup
    $trigLap = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes($t.Tre) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit $t.GioiHan -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    $action = New-ScheduledTaskAction -Execute $psExe -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f (Join-Path $thuMucScript $t.Script))
    $null = Register-ScheduledTask -TaskName $t.Ten -Action $action -Trigger @($trigStart, $trigLap) -Principal $principal -Settings $settings -Force
    Write-Host ("  {0}" -f $t.Ten)
}
$null = Disable-ScheduledTask -TaskName 'KSK Ra soat Bao tri'   # bật lại ở cuối (finally)
Start-ScheduledTask -TaskName 'KSK Ra soat Ung dung'

# ---------------------------------------------------------------------------------------------------------------
Buoc '[9/12] Chờ PostgreSQL (do tác vụ khởi động) rồi tạo vai trò ksk, CSDL ksk và ksk_test...'
if (-not (Cho-Cong -CongCho $CongPg -Giay 150)) {
    throw ("PostgreSQL chưa lên ở cổng {0}. Xem {1}\postgres-khoi-dong.log và giam-sat-*.log." -f $CongPg, $thuMucNhatKy)
}
if ((Psql-Postgres -Db 'postgres' -Sql "SELECT 1 FROM pg_roles WHERE rolname = 'ksk'").Output -notcontains '1') {
    $null = Psql-Postgres -Db 'postgres' -Sql "CREATE ROLE ksk LOGIN"
}
# Luôn đặt lại mật khẩu theo khoa\app.env (app.env sinh lại vẫn khớp). Mật khẩu chỉ gồm 0-9a-f.
$null = Psql-Postgres -Db 'postgres' -Sql "SET log_min_error_statement = panic; ALTER ROLE ksk WITH LOGIN PASSWORD '$mkKsk'" -AnLenh
foreach ($db in @('ksk', 'ksk_test')) {
    if ((Psql-Postgres -Db 'postgres' -Sql "SELECT 1 FROM pg_database WHERE datname = '$db'").Output -notcontains '1') {
        $null = Psql-Postgres -Db 'postgres' -Sql "CREATE DATABASE $db OWNER ksk"
    }
    $null = Psql-Postgres -Db $db -Sql 'CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS pg_trgm;'
}
Write-Host '  Xong.'

# ---------------------------------------------------------------------------------------------------------------
Buoc '[10/12] Nạp dữ liệu từ bản dump Neon (chỉ khi CSDL ksk còn trống)...'
$coBang = (Psql-Postgres -Db 'ksk' -Sql "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ho_so'").Output[0].Trim()
if ($coBang -eq '0') {
    if ([string]::IsNullOrWhiteSpace($FileDump)) { throw 'CSDL ksk đang trống: cần -FileDump <tệp .dump> để nạp dữ liệu.' }
    $tepDs = Join-Path $thuMucKhoa 'restore-list.txt'
    $ds = (Chay -FilePath (Join-Path $pgBin 'pg_restore.exe') -ThamSo @('-l', $FileDump)).Output |
        Where-Object { $_ -notmatch ' SCHEMA - public ' -and $_ -notmatch 'COMMENT - SCHEMA public' -and $_ -notmatch ' EXTENSION ' }
    [System.IO.File]::WriteAllLines($tepDs, [string[]]$ds)
    $env:PGPASSWORD = $mkKsk
    try {
        $null = Chay -FilePath (Join-Path $pgBin 'pg_restore.exe') -ThamSo @('-h', '127.0.0.1', '-p', [string]$CongPg, '-U', 'ksk', '-d', 'ksk',
            '--no-owner', '--no-acl', '--single-transaction', '--exit-on-error', '-L', $tepDs, $FileDump)
    } finally { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue; Remove-Item -LiteralPath $tepDs -Force -ErrorAction SilentlyContinue }
    Write-Host '  Đã nạp dump.'
} else { Write-Host '  CSDL ksk đã có dữ liệu, KHÔNG nạp lại.' }
if (-not [string]::IsNullOrWhiteSpace($FileDemSo)) {
    $sai = 0
    foreach ($d in [System.IO.File]::ReadAllLines($FileDemSo)) {
        if ($d -notmatch '^([a-z_]+)=(\d+)$') { continue }
        $bang = $matches[1]; $mong = [int]$matches[2]
        $thuc = [int](Psql-Postgres -Db 'ksk' -Sql ("SELECT count(*) FROM public.{0}" -f $bang)).Output[0].Trim()
        $dau = if ($thuc -eq $mong) { 'OK ' } else { $sai++; 'SAI' }
        Write-Host ("  {0} {1,-20} {2,7} (Neon: {3})" -f $dau, $bang, $thuc, $mong)
    }
    if ($sai -gt 0) { Write-Warning ("{0} bảng lệch số dòng so với Neon (nếu đã có người dùng app trên máy này thì là bình thường)." -f $sai) }
}

# ---------------------------------------------------------------------------------------------------------------
Buoc '[11/12] Migrate (CSDL thật + test) và build bản production...'
$bienBuild = @{ DATABASE_URL = $envApp['DATABASE_URL']; SESSION_SECRET = $envApp['SESSION_SECRET']; NODE_ENV = 'production' }
Chay-Npm-Cai-Dat -ThamSo @('run', 'db:migrate') -Bien $bienBuild
Chay-Npm-Cai-Dat -ThamSo @('run', 'db:migrate') -Bien @{ DATABASE_URL = $envApp['TEST_DATABASE_URL'] }
Chay-Npm-Cai-Dat -ThamSo @('run', 'build') -Bien $bienBuild
Write-Host '  Xong.'

} finally {
    Remove-Item -LiteralPath $tepTamDung -Force -ErrorAction SilentlyContinue
    if ($null -ne (Get-ScheduledTask -TaskName 'KSK Ra soat Bao tri' -ErrorAction SilentlyContinue)) {
        $null = Enable-ScheduledTask -TaskName 'KSK Ra soat Bao tri'
    }
    Write-Host '  Đã gỡ cờ tạm dừng ứng dụng và bật lại tác vụ bảo trì.'
}

# ---------------------------------------------------------------------------------------------------------------
Buoc '[12/12] Chờ ứng dụng lên, tạo lối tắt trên Desktop...'
$url = "http://127.0.0.1:$Cong"
$len = $false
$han = (Get-Date).AddSeconds(150)
while (-not $len -and (Get-Date) -lt $han) {
    try { $r = Invoke-WebRequest -UseBasicParsing -Uri "$url/dang-nhap" -TimeoutSec 10; $len = ($r.StatusCode -eq 200) } catch { Start-Sleep -Seconds 3 }
}
if (-not $len) { Write-Warning ("Ứng dụng chưa trả lời {0}/dang-nhap; xem {1}\giam-sat-*.log và ung-dung-*.err.log." -f $url, $thuMucNhatKy) }
else { Write-Host ("  Ứng dụng chạy: {0}" -f $url) -ForegroundColor Green }

if ([string]::IsNullOrWhiteSpace($NguoiXemNhatKy)) { $NguoiXemNhatKy = [string](Get-CimInstance Win32_ComputerSystem).UserName }
if (-not [string]::IsNullOrWhiteSpace($NguoiXemNhatKy)) {
    $null = Chay -FilePath 'icacls.exe' -ThamSo @($thuMucNhatKy, '/grant', ("{0}:(OI)(CI)RX" -f $NguoiXemNhatKy), '/Q')
    $tenNgan = $NguoiXemNhatKy.Split('\')[-1]
    $desktop = Join-Path (Join-Path (Split-Path -Parent $env:PUBLIC) $tenNgan) 'Desktop'
    if (Test-Path -LiteralPath $desktop) {
        Ghi-Utf8 -DuongDan (Join-Path $desktop 'KSK ra soat - ung dung.url') -NoiDung "[InternetShortcut]`nURL=$url/`n"
        $ws = New-Object -ComObject WScript.Shell
        $lnk = $ws.CreateShortcut((Join-Path $desktop 'KSK ra soat - nhat ky.lnk'))
        $lnk.TargetPath = $thuMucNhatKy
        $lnk.Save()
        Write-Host ("  Lối tắt trên Desktop của {0}: 'KSK ra soat - ung dung', 'KSK ra soat - nhat ky'." -f $NguoiXemNhatKy)
    }
}
Write-Host ''
Write-Host 'HOÀN TẤT. Không bấm "Continue" nếu Explorer hỏi quyền vào thư mục ksk-ra-soat (sẽ cấp toàn quyền CSDL cho tài khoản thường).' -ForegroundColor Green
