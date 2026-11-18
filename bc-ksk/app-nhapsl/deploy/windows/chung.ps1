# Thư viện dùng chung cho các script Windows PowerShell 5.1 của app rà soát KSK (dot-source bởi giam-sat.ps1, bao-tri.ps1).
# Mô hình giống nvqs (D:\my-app): tác vụ Task Scheduler chạy bằng LOCAL SERVICE, ứng dụng chỉ nghe 127.0.0.1.
Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'
# node/git/psql in ra UTF-8; PowerShell 5.1 mặc định giải mã theo bảng mã OEM. Tác vụ không có console thì bỏ qua lỗi.
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }

function Bo-Sung-Path {
    param([Parameter(Mandatory = $true)][string[]]$ThuMucThem)
    $hienCo = @()
    if (-not [string]::IsNullOrEmpty($env:PATH)) {
        $hienCo = @($env:PATH -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    }
    $daCo = @{}
    foreach ($p in $hienCo) { $daCo[$p.TrimEnd('\').ToLowerInvariant()] = $true }
    $moi = New-Object System.Collections.Generic.List[string]
    foreach ($dir in $ThuMucThem) {
        if ([string]::IsNullOrWhiteSpace($dir)) { continue }
        $chuan = $dir.TrimEnd('\')
        if ((Test-Path -LiteralPath $chuan -PathType Container) -and (-not $daCo.ContainsKey($chuan.ToLowerInvariant()))) {
            $moi.Add($chuan)
            $daCo[$chuan.ToLowerInvariant()] = $true
        }
    }
    foreach ($p in $hienCo) { $moi.Add($p) }
    $env:PATH = ($moi -join ';')
}

function Ghi-Van-Ban-Utf8 {
    param(
        [Parameter(Mandatory = $true)][string]$DuongDan,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$NoiDung
    )
    $cha = Split-Path -Parent $DuongDan
    if (-not [string]::IsNullOrWhiteSpace($cha) -and -not (Test-Path -LiteralPath $cha -PathType Container)) {
        $null = New-Item -ItemType Directory -Path $cha -Force
    }
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($DuongDan, (($NoiDung -replace "`r`n", "`n") -replace "`n", "`r`n"), $enc)
}

function Doc-Van-Ban {
    param([Parameter(Mandatory = $true)][string]$DuongDan)
    if (-not (Test-Path -LiteralPath $DuongDan -PathType Leaf)) { return '' }
    try { return ([System.IO.File]::ReadAllText($DuongDan, [System.Text.Encoding]::UTF8)).Trim() } catch { return '' }
}

# cau-hinh.psd1 nằm ở thư mục gốc cài đặt (vd D:\vibe-coding\ksk-ra-soat). Script nằm ở
# <gốc>\app\bc-ksk\app-nhapsl\deploy\windows -> lùi 5 cấp là gốc.
function Doc-Cau-Hinh {
    $ungVien = New-Object System.Collections.Generic.List[string]
    if (-not [string]::IsNullOrWhiteSpace($env:KSKRS_CAU_HINH)) { $ungVien.Add($env:KSKRS_CAU_HINH) }
    if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
        $p = $PSScriptRoot
        for ($i = 0; $i -lt 5; $i++) { $p = Split-Path -Parent $p }
        if (-not [string]::IsNullOrWhiteSpace($p)) { $ungVien.Add((Join-Path $p 'cau-hinh.psd1')) }
    }
    $ungVien.Add('D:\vibe-coding\ksk-ra-soat\cau-hinh.psd1')

    $chon = ''
    foreach ($p in $ungVien) { if (Test-Path -LiteralPath $p -PathType Leaf) { $chon = $p; break } }
    if ([string]::IsNullOrWhiteSpace($chon)) {
        throw ("Không tìm thấy cau-hinh.psd1 (đã thử: {0})." -f ($ungVien -join '; '))
    }
    $raw = Import-PowerShellDataFile -LiteralPath $chon
    foreach ($khoa in @('ThuMuc', 'Cong', 'CongPg', 'NodeExe', 'NpmCmd', 'GitExe', 'ThuMucConApp')) {
        if (-not $raw.ContainsKey($khoa) -or [string]::IsNullOrWhiteSpace([string]$raw[$khoa])) {
            throw ("File cấu hình {0} thiếu khoá '{1}'." -f $chon, $khoa)
        }
    }
    $thuMuc = ([string]$raw['ThuMuc']).TrimEnd('\')
    $repo = Join-Path $thuMuc 'app'
    $kiemTraRepo = Join-Path $thuMuc 'kiem-tra'
    $dk = Join-Path $thuMuc 'dieu-khien'
    $pgBin = Join-Path (Join-Path $thuMuc 'pgsql') 'bin'
    $cfg = @{
        TepCauHinh        = $chon
        ThuMuc            = $thuMuc
        Cong              = [int]$raw['Cong']
        CongPg            = [int]$raw['CongPg']
        NodeExe           = [string]$raw['NodeExe']
        NpmCmd            = [string]$raw['NpmCmd']
        GitExe            = [string]$raw['GitExe']
        ThuMucConApp      = [string]$raw['ThuMucConApp']
        ThuMucRepo        = $repo
        ThuMucApp         = (Join-Path $repo ([string]$raw['ThuMucConApp']))
        ThuMucRepoKiemTra = $kiemTraRepo
        ThuMucKiemTra     = (Join-Path $kiemTraRepo ([string]$raw['ThuMucConApp']))
        PgBin             = $pgBin
        PgCtl             = (Join-Path $pgBin 'pg_ctl.exe')
        PgDump            = (Join-Path $pgBin 'pg_dump.exe')
        Psql              = (Join-Path $pgBin 'psql.exe')
        PgData            = (Join-Path $thuMuc 'pgdata')
        ThuMucSaoLuu      = (Join-Path $thuMuc 'sao-luu')
        ThuMucNhatKy      = (Join-Path $thuMuc 'nhat-ky')
        ThuMucKhoa        = (Join-Path $thuMuc 'khoa')
        TepMoiTruong      = (Join-Path (Join-Path $thuMuc 'khoa') 'app.env')
        ThuMucDieuKhien   = $dk
        ThuMucNpmCache    = (Join-Path $thuMuc 'npm-cache')
        GitConfig         = (Join-Path $thuMuc 'gitconfig')
        TepNodePid        = (Join-Path $dk 'node.pid')
        TepTamDung        = (Join-Path $dk 'tam-dung')
        TepTamDungCapNhat = (Join-Path $dk 'tam-dung-cap-nhat')
        TepDangCapNhat    = (Join-Path $dk 'dang-cap-nhat.txt')
        TepCommitLoi      = (Join-Path $dk 'commit-loi.txt')
        TepKiemTraLock    = (Join-Path $dk 'kiem-tra-lock.sha')
        TepAppLock        = (Join-Path $dk 'app-lock.sha')
        TepVanTay         = (Join-Path $dk 'van-tay-sao-luu.txt')
        TepGioSaoLuu      = (Join-Path $dk 'sao-luu-gio-cuoi.txt')
    }
    $gitCmdDir = Split-Path -Parent $cfg.GitExe
    Bo-Sung-Path -ThuMucThem @(
        (Split-Path -Parent $cfg.NodeExe),
        (Split-Path -Parent $cfg.NpmCmd),
        $gitCmdDir,
        (Join-Path (Join-Path (Split-Path -Parent $gitCmdDir) 'usr') 'bin'),
        $pgBin
    )
    return $cfg
}

# khoa\app.env: KEY=VALUE mỗi dòng (DATABASE_URL, TEST_DATABASE_URL, SESSION_SECRET, ...). Chỉ quản trị viên ghi,
# LOCAL SERVICE đọc. Không bao giờ ghi giá trị ra log.
function Doc-Moi-Truong-App {
    param([hashtable]$CauHinhHienTai = $null)
    $cfg = if ($null -ne $CauHinhHienTai) { $CauHinhHienTai } else { $script:CauHinh }
    $kq = @{}
    if (-not (Test-Path -LiteralPath $cfg.TepMoiTruong -PathType Leaf)) {
        throw ("Thiếu tệp môi trường {0}." -f $cfg.TepMoiTruong)
    }
    foreach ($dong in [System.IO.File]::ReadAllLines($cfg.TepMoiTruong, [System.Text.Encoding]::UTF8)) {
        if ($dong -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$') { $kq[$matches[1]] = $matches[2] }
    }
    foreach ($k in @('DATABASE_URL', 'TEST_DATABASE_URL', 'SESSION_SECRET')) {
        if (-not $kq.ContainsKey($k) -or [string]::IsNullOrWhiteSpace($kq[$k])) { throw ("app.env thiếu {0}." -f $k) }
    }
    return $kq
}

# Tách postgres://user:pass@host:port/db thành biến PG* cho pg_dump/psql (mật khẩu không nằm trên dòng lệnh).
function Dat-Bien-Pg {
    param([Parameter(Mandatory = $true)][string]$Url)
    $u = [System.Uri]$Url
    $phan = $u.UserInfo.Split(':', 2)
    $env:PGHOST = $u.Host
    $env:PGPORT = [string]$u.Port
    $env:PGUSER = [System.Uri]::UnescapeDataString($phan[0])
    $env:PGPASSWORD = if ($phan.Count -gt 1) { [System.Uri]::UnescapeDataString($phan[1]) } else { '' }
    $env:PGDATABASE = $u.AbsolutePath.TrimStart('/')
    $env:PGCONNECT_TIMEOUT = '10'
    $env:PGCLIENTENCODING = 'UTF8'
}

function Xoa-Bien-Pg {
    foreach ($k in @('PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGCONNECT_TIMEOUT', 'PGCLIENTENCODING')) {
        Remove-Item -Path ("Env:\{0}" -f $k) -ErrorAction SilentlyContinue
    }
}

function Ghi-Log {
    param(
        [Parameter(Mandatory = $true)][string]$Tep,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$ThongDiep,
        [hashtable]$CauHinhHienTai = $null
    )
    $cfg = if ($null -ne $CauHinhHienTai) { $CauHinhHienTai } else { $script:CauHinh }
    if (-not (Test-Path -LiteralPath $cfg.ThuMucNhatKy -PathType Container)) {
        $null = New-Item -ItemType Directory -Path $cfg.ThuMucNhatKy -Force
    }
    $duongDan = Join-Path $cfg.ThuMucNhatKy ("{0}-{1}.log" -f ($Tep -replace '\.log$', ''), (Get-Date -Format 'yyyyMM'))
    $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes(("[{0}] {1}`r`n" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $ThongDiep))
    $fs = New-Object System.IO.FileStream($duongDan, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
    try {
        if ($fs.Length -eq 0) { $fs.Write([byte[]]@(0xEF, 0xBB, 0xBF), 0, 3) }
        $fs.Write($bytes, 0, $bytes.Length)
    } finally { $fs.Dispose() }
}

function Mo-Khoa-Mutex {
    param([Parameter(Mandatory = $true)][string]$TenMutex)
    $taoMoi = $false
    $mutex = $null
    try {
        $mutex = New-Object System.Threading.Mutex($false, $TenMutex, [ref]$taoMoi)
        $daGiu = $false
        try { $daGiu = $mutex.WaitOne(0, $false) } catch [System.Threading.AbandonedMutexException] { $daGiu = $true }
        if (-not $daGiu) { $mutex.Dispose(); return $null }
        return $mutex
    } catch [System.UnauthorizedAccessException] {
        if ($null -ne $mutex) { $mutex.Dispose() }
        return $null
    }
}

# Chạy một exe, gom stdout+stderr thành mảng dòng. Không ném lỗi theo mã thoát (người gọi tự xét).
function Chay-Exe {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$ThamSo
    )
    $eapCu = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $raw = @()
    $ma = 1
    try {
        $raw = @(& $FilePath @ThamSo 2>&1)
        $ma = [int]$LASTEXITCODE
    } finally { $ErrorActionPreference = $eapCu }
    return [pscustomobject]@{ ExitCode = $ma; Output = [string[]]@($raw | ForEach-Object { $_.ToString() }) }
}

function Chay-Git {
    param(
        [Parameter(Mandatory = $true)][string[]]$ThamSo,
        [string]$ThuMucLamViec = '',
        [switch]$ChoPhepLoi,
        [hashtable]$CauHinhHienTai = $null
    )
    $cfg = if ($null -ne $CauHinhHienTai) { $CauHinhHienTai } else { $script:CauHinh }
    $env:GIT_CONFIG_GLOBAL = $cfg.GitConfig
    $env:GIT_TERMINAL_PROMPT = '0'
    $a = New-Object System.Collections.Generic.List[string]
    if (-not [string]::IsNullOrWhiteSpace($ThuMucLamViec)) { $a.Add('-C'); $a.Add($ThuMucLamViec) }
    foreach ($t in $ThamSo) { $a.Add($t) }
    $kq = Chay-Exe -FilePath $cfg.GitExe -ThamSo $a.ToArray()
    if ((-not $ChoPhepLoi) -and ($kq.ExitCode -ne 0)) {
        throw ("git {0} thất bại (mã {1}): {2}" -f ($a -join ' '), $kq.ExitCode, ($kq.Output -join ' | '))
    }
    return $kq
}

function Lay-Git-Sha {
    param(
        [Parameter(Mandatory = $true)][string]$ThamChieu,
        [string]$ThuMucLamViec = '',
        [hashtable]$CauHinhHienTai = $null
    )
    $kq = Chay-Git -ThuMucLamViec $ThuMucLamViec -ThamSo @('rev-parse', $ThamChieu) -CauHinhHienTai $CauHinhHienTai
    foreach ($d in @($kq.Output)) {
        $t = ([string]$d).Trim().ToLowerInvariant()
        if ($t -match '^[0-9a-f]{40}$') { return $t }
    }
    throw ("Không lấy được SHA cho '{0}'." -f $ThamChieu)
}

# Chạy "npm <tham số>" (qua cmd.exe vì npm là .cmd) với biến môi trường bổ sung, có giới hạn thời gian.
# Trả về mã thoát; $DongCuoi nhận toàn bộ dòng đầu ra (người gọi chỉ ghi vài dòng cuối vào log).
function Chay-Npm {
    param(
        [Parameter(Mandatory = $true)][string[]]$ThamSo,
        [Parameter(Mandatory = $true)][string]$ThuMucLamViec,
        [hashtable]$BienMoiTruong = @{},
        [int]$GioiHanGiay = 0,
        [ref]$DongCuoi = $null,
        [hashtable]$CauHinhHienTai = $null
    )
    $cfg = if ($null -ne $CauHinhHienTai) { $CauHinhHienTai } else { $script:CauHinh }
    $phan = New-Object System.Collections.Generic.List[string]
    $phan.Add(('"{0}"' -f $cfg.NpmCmd))
    foreach ($t in $ThamSo) {
        if ($t -match '[\s"&|<>^()]') { $phan.Add(('"{0}"' -f ($t -replace '"', '\"'))) } else { $phan.Add($t) }
    }
    $lenhCmd = '/d /s /c "' + ($phan -join ' ') + '"'
    if (-not (Test-Path -LiteralPath $cfg.ThuMucNpmCache -PathType Container)) {
        $null = New-Item -ItemType Directory -Path $cfg.ThuMucNpmCache -Force
    }
    $tamId = "{0}-{1}" -f $PID, ([System.Guid]::NewGuid().ToString('N').Substring(0, 8))
    $tepOut = Join-Path $cfg.ThuMucDieuKhien ("npm-{0}.out.tmp" -f $tamId)
    $tepErr = Join-Path $cfg.ThuMucDieuKhien ("npm-{0}.err.tmp" -f $tamId)

    $bien = @{
        npm_config_cache       = $cfg.ThuMucNpmCache
        npm_config_audit       = 'false'
        npm_config_fund        = 'false'
        npm_config_update_notifier = 'false'
        NEXT_TELEMETRY_DISABLED = '1'
    }
    foreach ($k in $BienMoiTruong.Keys) { $bien[$k] = [string]$BienMoiTruong[$k] }
    $cu = @{}
    foreach ($k in $bien.Keys) {
        $cu[$k] = [System.Environment]::GetEnvironmentVariable($k, 'Process')
        [System.Environment]::SetEnvironmentVariable($k, $bien[$k], 'Process')
    }
    $proc = $null
    $ma = 1
    try {
        $proc = Start-Process -FilePath 'cmd.exe' -ArgumentList $lenhCmd -WorkingDirectory $ThuMucLamViec `
            -RedirectStandardOutput $tepOut -RedirectStandardError $tepErr -WindowStyle Hidden -PassThru
        $null = $proc.Handle
        $xong = $true
        if ($GioiHanGiay -gt 0) { $xong = $proc.WaitForExit($GioiHanGiay * 1000) } else { $proc.WaitForExit() }
        if (-not $xong) {
            $null = Chay-Exe -FilePath 'taskkill.exe' -ThamSo @('/PID', [string]$proc.Id, '/T', '/F')
            $ma = 124
        } else {
            $proc.Refresh()
            if ($null -ne $proc.ExitCode) { $ma = [int]$proc.ExitCode }
        }
        if ($null -ne $DongCuoi) {
            $tat = New-Object System.Collections.Generic.List[string]
            foreach ($f in @($tepOut, $tepErr)) {
                if (Test-Path -LiteralPath $f -PathType Leaf) {
                    foreach ($line in @(Get-Content -LiteralPath $f -Encoding UTF8 -ErrorAction SilentlyContinue)) { $tat.Add([string]$line) }
                }
            }
            if (-not $xong) { $tat.Add(("npm quá {0} giây, đã dừng." -f $GioiHanGiay)) }
            $DongCuoi.Value = [string[]]$tat.ToArray()
        }
    } finally {
        foreach ($k in $cu.Keys) { [System.Environment]::SetEnvironmentVariable($k, $cu[$k], 'Process') }
        if ($null -ne $proc) { $proc.Dispose() }
        Remove-Item -LiteralPath $tepOut, $tepErr -Force -ErrorAction SilentlyContinue
    }
    return [int]$ma
}

function Cong-Dang-Nghe {
    param([Parameter(Mandatory = $true)][int]$Cong)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $ar = $client.BeginConnect('127.0.0.1', $Cong, $null, $null)
        if (-not $ar.AsyncWaitHandle.WaitOne(1500, $false)) { return $false }
        $client.EndConnect($ar)
        return $true
    } catch { return $false } finally { $client.Close() }
}

# 200 ở /dang-nhap = Next.js đã lên và đọc được CSDL (trang đăng nhập không cần phiên).
function Kiem-Tra-Suc-Khoe {
    param([int]$ChoToiDaGiay = 120, [hashtable]$CauHinhHienTai = $null)
    $cfg = if ($null -ne $CauHinhHienTai) { $CauHinhHienTai } else { $script:CauHinh }
    $url = "http://127.0.0.1:{0}/dang-nhap" -f $cfg.Cong
    $han = (Get-Date).AddSeconds($ChoToiDaGiay)
    while ($true) {
        $resp = $null
        try {
            $req = [System.Net.HttpWebRequest]([System.Net.WebRequest]::Create($url))
            $req.Timeout = 10000
            $req.AllowAutoRedirect = $false
            $req.Proxy = $null
            $req.KeepAlive = $false
            $resp = [System.Net.HttpWebResponse]$req.GetResponse()
            if ([int]$resp.StatusCode -eq 200) { return $true }
        } catch [System.Net.WebException] {
            if ($null -ne $_.Exception.Response) { $_.Exception.Response.Close() }
        } catch {
        } finally { if ($null -ne $resp) { $resp.Close() } }
        if ((Get-Date) -ge $han) { return $false }
        Start-Sleep -Seconds 3
    }
}

$coBoQua = Get-Variable -Name 'BoQuaTuDongCauHinh' -ErrorAction SilentlyContinue
if (($null -eq $coBoQua) -or (-not [bool]$coBoQua.Value)) {
    $script:CauHinh = Doc-Cau-Hinh
}
