# Tác vụ "KSK Ra soat Ung dung" (LOCAL SERVICE, khi bật máy + mỗi 5 phút, không chạy chồng):
# giữ PostgreSQL (127.0.0.1:CongPg) và Next.js (next start, 127.0.0.1:Cong) luôn chạy.
# Cờ dieu-khien\tam-dung hoặc tam-dung-cap-nhat -> dừng Next.js (PostgreSQL vẫn chạy để sao lưu/khôi phục/migrate).
# Khi giam-sat.ps1/chung.ps1 đổi (do cập nhật) -> thoát êm, không dừng tiến trình; lượt 5 phút sau nhận lại.
Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'chung.ps1')

function Nhan-Lai-Node {
    param([Parameter(Mandatory = $true)][hashtable]$Cfg)
    $noiDung = Doc-Van-Ban -DuongDan $Cfg.TepNodePid
    if ($noiDung -notmatch '^(\d+);(\d+)$') {
        Remove-Item -LiteralPath $Cfg.TepNodePid -Force -ErrorAction SilentlyContinue
        return $null
    }
    $proc = Get-Process -Id ([int]$matches[1]) -ErrorAction SilentlyContinue
    $ticks = [int64]$matches[2]
    try {
        if (($null -ne $proc) -and ($proc.ProcessName -ieq 'node') -and (-not $proc.HasExited) -and ($proc.StartTime.Ticks -eq $ticks)) {
            $null = $proc.Handle
            return $proc
        }
    } catch { }
    Remove-Item -LiteralPath $Cfg.TepNodePid -Force -ErrorAction SilentlyContinue
    return $null
}

function Dung-Node {
    param([Parameter(Mandatory = $true)][System.Diagnostics.Process]$Proc, [Parameter(Mandatory = $true)][hashtable]$Cfg)
    try {
        if (-not $Proc.HasExited) {
            # next start chạy node con; dừng cả cây tiến trình.
            $null = Chay-Exe -FilePath 'taskkill.exe' -ThamSo @('/PID', [string]$Proc.Id, '/T', '/F')
            $null = $Proc.WaitForExit(15000)
        }
    } catch { } finally {
        $Proc.Dispose()
        Remove-Item -LiteralPath $Cfg.TepNodePid -Force -ErrorAction SilentlyContinue
    }
}

# PostgreSQL có chạy (theo pg_ctl status) không.
function Pg-Dang-Chay {
    param([Parameter(Mandatory = $true)][hashtable]$Cfg)
    $kq = Chay-Exe -FilePath $Cfg.PgCtl -ThamSo @('status', '-D', $Cfg.PgData)
    return ($kq.ExitCode -eq 0)
}

# Lần đầu: tạo cụm CSDL bằng chính LOCAL SERVICE. (initdb chạy bằng tài khoản quản trị sẽ tự chạy lại với token hạn chế,
# mất quyền nhóm Administrators -> không đọc được DLL/khoá trong thư mục cài -> lỗi 0xC0000135.)
function Khoi-Tao-Pg {
    param([Parameter(Mandatory = $true)][hashtable]$Cfg)
    if (Test-Path -LiteralPath (Join-Path $Cfg.PgData 'PG_VERSION') -PathType Leaf) { return $true }
    $tepMk = Join-Path $Cfg.ThuMucKhoa 'pg-postgres.txt'
    if (-not (Test-Path -LiteralPath $tepMk -PathType Leaf)) {
        Ghi-Log -Tep 'giam-sat' -ThongDiep 'Chưa có khoa\pg-postgres.txt; chờ cai-dat.ps1.'
        return $false
    }
    if (Test-Path -LiteralPath $Cfg.PgData) {
        if (@(Get-ChildItem -LiteralPath $Cfg.PgData -Force -ErrorAction SilentlyContinue).Count -gt 0) {
            $doiTen = '{0}-hong-{1}' -f $Cfg.PgData, (Get-Date -Format 'yyyyMMdd-HHmmss')
            Rename-Item -LiteralPath $Cfg.PgData -NewName (Split-Path -Leaf $doiTen)
            Ghi-Log -Tep 'giam-sat' -ThongDiep ("pgdata có tệp nhưng thiếu PG_VERSION (initdb dở); đã đổi tên thành {0}." -f $doiTen)
        } else {
            Remove-Item -LiteralPath $Cfg.PgData -Force
        }
    }
    $kq = Chay-Exe -FilePath (Join-Path $Cfg.PgBin 'initdb.exe') -ThamSo @('-D', $Cfg.PgData, '-U', 'postgres', ('--pwfile=' + $tepMk),
        '--auth=scram-sha-256', '-E', 'UTF8', '--locale=C', '--locale-provider=builtin', '--builtin-locale=C.UTF-8')
    if ($kq.ExitCode -ne 0) {
        Ghi-Log -Tep 'giam-sat' -ThongDiep ("LỖI initdb (mã {0}): {1}" -f $kq.ExitCode, (($kq.Output | Select-Object -Last 8) -join ' | '))
        return $false
    }
    Add-Content -LiteralPath (Join-Path $Cfg.PgData 'postgresql.conf') -Encoding ASCII -Value @(
        '', '# --- KSK ra soat (giam-sat.ps1) ---',
        ("port = {0}" -f $Cfg.CongPg),
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
    Ghi-Log -Tep 'giam-sat' -ThongDiep 'Đã khởi tạo cụm CSDL (initdb, UTF8, builtin C.UTF-8, timezone GMT, chỉ nghe 127.0.0.1).'
    return $true
}

function Khoi-Dong-Pg {
    param([Parameter(Mandatory = $true)][hashtable]$Cfg)
    # Sau mất điện, postmaster.pid cũ có thể trỏ tới PID đã bị tiến trình khác dùng lại -> postgres từ chối khởi động.
    # Chỉ xoá khi chắc chắn không có postgres.exe nào của bản cài này đang chạy.
    $tepPid = Join-Path $Cfg.PgData 'postmaster.pid'
    if (Test-Path -LiteralPath $tepPid -PathType Leaf) {
        $exe = (Join-Path $Cfg.PgBin 'postgres.exe').ToLowerInvariant()
        $dangChay = @(Get-Process -Name 'postgres' -ErrorAction SilentlyContinue | Where-Object {
            try { $_.Path -and ($_.Path.ToLowerInvariant() -eq $exe) } catch { $false }
        })
        if ($dangChay.Count -eq 0 -and -not (Cong-Dang-Nghe -Cong $Cfg.CongPg)) {
            Remove-Item -LiteralPath $tepPid -Force -ErrorAction SilentlyContinue
            Ghi-Log -Tep 'giam-sat' -ThongDiep 'Đã xoá postmaster.pid cũ (không có PostgreSQL nào đang chạy).'
        }
    }
    $tepLogPg = Join-Path $Cfg.ThuMucNhatKy 'postgres-khoi-dong.log'
    # KHÔNG chạy pg_ctl qua "& exe 2>&1": postgres.exe thừa kế đầu ghi của pipe nên PowerShell chờ EOF mãi (treo vòng
    # giám sát). Chạy qua cmd với đầu ra về nul và chờ chính tiến trình cmd thoát (pg_ctl -w trả về khi máy chủ đã lên).
    $lenh = '/d /c ""{0}" start -D "{1}" -l "{2}" -w -t 90 >nul 2>&1"' -f $Cfg.PgCtl, $Cfg.PgData, $tepLogPg
    $p = Start-Process -FilePath 'cmd.exe' -ArgumentList $lenh -WindowStyle Hidden -PassThru
    $null = $p.Handle
    $xong = $p.WaitForExit(120000)
    $ma = if ($xong) { $p.Refresh(); [int]$p.ExitCode } else { 124 }
    $p.Dispose()
    if ($ma -eq 0 -or (Cong-Dang-Nghe -Cong $Cfg.CongPg)) {
        Ghi-Log -Tep 'giam-sat' -ThongDiep ("Đã khởi động PostgreSQL (cổng {0})." -f $Cfg.CongPg)
        return $true
    }
    Ghi-Log -Tep 'giam-sat' -ThongDiep ("LỖI khởi động PostgreSQL (mã {0}); xem nhat-ky\postgres-khoi-dong.log và pgdata\log\." -f $ma)
    return $false
}

function Don-Nhat-Ky-Cu {
    param([Parameter(Mandatory = $true)][hashtable]$Cfg, [string[]]$GiuLai = @())
    $moc = (Get-Date).AddDays(-30)
    foreach ($f in @(Get-ChildItem -LiteralPath $Cfg.ThuMucNhatKy -Filter 'ung-dung-*.log' -File -ErrorAction SilentlyContinue)) {
        if ($GiuLai -contains $f.FullName) { continue }
        if ($f.LastWriteTime -lt $moc) { Remove-Item -LiteralPath $f.FullName -Force -ErrorAction SilentlyContinue }
    }
}

$mutex = Mo-Khoa-Mutex -TenMutex 'Global\KSKRS-GiamSat'
if ($null -eq $mutex) { exit 0 }

$tepGiamSat = Join-Path $PSScriptRoot 'giam-sat.ps1'
$tepChung = Join-Path $PSScriptRoot 'chung.ps1'
$mocGiamSat = (Get-Item -LiteralPath $tepGiamSat).LastWriteTimeUtc
$mocChung = (Get-Item -LiteralPath $tepChung).LastWriteTimeUtc

$procNode = $null
$batDauUtc = [datetime]::MinValue
$tepOutHT = ''
$tepErrHT = ''
$daGhiTamDung = $false
$daGhiChoBuild = $false
$soLanChetNhanh = 0
$choDen = [datetime]::MinValue
$lanDonLog = [datetime]::MinValue
$lanKiemPg = [datetime]::MinValue
$pgSan = $false
$choPgDen = [datetime]::MinValue

try {
    Ghi-Log -Tep 'giam-sat' -ThongDiep ("Bắt đầu vòng giám sát (PID script: {0})." -f $PID)
    $procNode = Nhan-Lai-Node -Cfg $CauHinh
    if ($null -ne $procNode) {
        $batDauUtc = $procNode.StartTime.ToUniversalTime()
        Ghi-Log -Tep 'giam-sat' -ThongDiep ("Đã nhận lại tiến trình ứng dụng đang chạy (PID: {0})." -f $procNode.Id)
    }

    while ($true) {
        if (((Get-Date) - $lanDonLog).TotalHours -ge 6) {
            Don-Nhat-Ky-Cu -Cfg $CauHinh -GiuLai @($tepOutHT, $tepErrHT)
            $lanDonLog = Get-Date
        }

        # PostgreSQL: kiểm mỗi 10 giây (cổng mở là đủ; không mở thì hỏi pg_ctl rồi khởi động).
        if (((Get-Date) - $lanKiemPg).TotalSeconds -ge 10) {
            $lanKiemPg = Get-Date
            $pgSan = Cong-Dang-Nghe -Cong $CauHinh.CongPg
            if (-not $pgSan -and (Get-Date) -ge $choPgDen) {
                if (-not (Khoi-Tao-Pg -Cfg $CauHinh)) {
                    $choPgDen = (Get-Date).AddSeconds(60)
                } elseif (-not (Pg-Dang-Chay -Cfg $CauHinh)) {
                    $pgSan = Khoi-Dong-Pg -Cfg $CauHinh
                    if (-not $pgSan) { $choPgDen = (Get-Date).AddSeconds(60) }
                }
            }
        }

        $tamDung = (Test-Path -LiteralPath $CauHinh.TepTamDung -PathType Leaf) -or (Test-Path -LiteralPath $CauHinh.TepTamDungCapNhat -PathType Leaf)
        if ($tamDung) {
            if ($null -ne $procNode) {
                $pidCu = $procNode.Id
                Dung-Node -Proc $procNode -Cfg $CauHinh
                $procNode = $null
                Ghi-Log -Tep 'giam-sat' -ThongDiep ("Đã dừng ứng dụng (PID: {0}) do có cờ tạm dừng." -f $pidCu)
            }
            if (-not $daGhiTamDung) {
                Ghi-Log -Tep 'giam-sat' -ThongDiep 'Đang tạm dừng ứng dụng theo cờ trong dieu-khien\.'
                $daGhiTamDung = $true
            }
            $soLanChetNhanh = 0
            $choDen = [datetime]::MinValue
            Start-Sleep -Seconds 2
            continue
        }
        if ($daGhiTamDung) {
            Ghi-Log -Tep 'giam-sat' -ThongDiep 'Đã gỡ cờ tạm dừng; tiếp tục chạy ứng dụng.'
            $daGhiTamDung = $false
        }

        if ($null -ne $procNode) {
            $daThoat = $true
            try { $procNode.Refresh(); $daThoat = $procNode.HasExited } catch { $daThoat = $true }
            if ($daThoat) {
                $song = ([datetime]::UtcNow - $batDauUtc).TotalSeconds
                $ma = 'không rõ'
                try { if ($null -ne $procNode.ExitCode) { $ma = [string]$procNode.ExitCode } } catch { }
                Ghi-Log -Tep 'giam-sat' -ThongDiep ("Ứng dụng (PID: {0}) đã dừng, mã thoát {1}, sau {2} giây." -f $procNode.Id, $ma, [math]::Round($song, 1))
                $procNode.Dispose()
                $procNode = $null
                Remove-Item -LiteralPath $CauHinh.TepNodePid -Force -ErrorAction SilentlyContinue
                if ($song -le 30) {
                    $soLanChetNhanh++
                    if ($soLanChetNhanh -ge 5) {
                        Ghi-Log -Tep 'giam-sat' -ThongDiep 'Cảnh báo: ứng dụng chết liên tiếp 5 lần trong 30 giây; chờ 60 giây rồi thử lại.'
                        $choDen = (Get-Date).AddSeconds(60)
                        $soLanChetNhanh = 0
                    }
                } else { $soLanChetNhanh = 0 }
            }
        }

        if (($null -eq $procNode) -and $pgSan -and ((Get-Date) -ge $choDen)) {
            $buildId = Join-Path (Join-Path $CauHinh.ThuMucApp '.next') 'BUILD_ID'
            $nextBin = Join-Path $CauHinh.ThuMucApp 'node_modules\next\dist\bin\next'
            if (-not (Test-Path -LiteralPath $buildId -PathType Leaf) -or -not (Test-Path -LiteralPath $nextBin -PathType Leaf)) {
                if (-not $daGhiChoBuild) {
                    Ghi-Log -Tep 'giam-sat' -ThongDiep 'Chưa có bản build (.next\BUILD_ID) hoặc node_modules; chờ cài đặt/bảo trì build xong.'
                    $daGhiChoBuild = $true
                }
            } else {
                $daGhiChoBuild = $false
                $moiTruong = Doc-Moi-Truong-App -CauHinhHienTai $CauHinh
                $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
                $tepOut = Join-Path $CauHinh.ThuMucNhatKy ("ung-dung-{0}.out.log" -f $stamp)
                $tepErr = Join-Path $CauHinh.ThuMucNhatKy ("ung-dung-{0}.err.log" -f $stamp)
                $bien = @{
                    NODE_ENV                = 'production'
                    NEXT_TELEMETRY_DISABLED = '1'
                    DATABASE_URL            = $moiTruong['DATABASE_URL']
                    SESSION_SECRET          = $moiTruong['SESSION_SECRET']
                    SESSION_COOKIE_SECURE   = '0'
                    DB_POOL_MAX             = '5'
                }
                foreach ($k in @('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT')) {
                    if ($moiTruong.ContainsKey($k)) { $bien[$k] = $moiTruong[$k] }
                }
                foreach ($k in $bien.Keys) { [System.Environment]::SetEnvironmentVariable($k, $bien[$k], 'Process') }
                try {
                    $procNode = Start-Process -FilePath $CauHinh.NodeExe `
                        -ArgumentList @('node_modules\next\dist\bin\next', 'start', '-H', '127.0.0.1', '-p', [string]$CauHinh.Cong) `
                        -WorkingDirectory $CauHinh.ThuMucApp -RedirectStandardOutput $tepOut -RedirectStandardError $tepErr `
                        -WindowStyle Hidden -PassThru
                } finally {
                    foreach ($k in @('DATABASE_URL', 'SESSION_SECRET', 'VAPID_PRIVATE_KEY')) {
                        [System.Environment]::SetEnvironmentVariable($k, $null, 'Process')
                    }
                }
                $null = $procNode.Handle
                $batDauUtc = $procNode.StartTime.ToUniversalTime()
                $tepOutHT = $tepOut
                $tepErrHT = $tepErr
                Ghi-Van-Ban-Utf8 -DuongDan $CauHinh.TepNodePid -NoiDung ("{0};{1}" -f $procNode.Id, $procNode.StartTime.Ticks)
                Ghi-Log -Tep 'giam-sat' -ThongDiep ("Đã khởi động ứng dụng (PID: {0}, http://127.0.0.1:{1})." -f $procNode.Id, $CauHinh.Cong)
            }
        }

        if (((Get-Item -LiteralPath $tepGiamSat).LastWriteTimeUtc -ne $mocGiamSat) -or ((Get-Item -LiteralPath $tepChung).LastWriteTimeUtc -ne $mocChung)) {
            Ghi-Log -Tep 'giam-sat' -ThongDiep 'giam-sat.ps1 hoặc chung.ps1 đã đổi; thoát êm (không dừng ứng dụng) để bản mới nhận lại.'
            break
        }
        Start-Sleep -Seconds 2
    }
} catch {
    Ghi-Log -Tep 'giam-sat' -ThongDiep ("LỖI không mong muốn trong vòng giám sát: {0}" -f $_.Exception.Message)
    throw
} finally {
    if ($null -ne $procNode) { $procNode.Dispose() }
    try { $mutex.ReleaseMutex() } catch { }
    $mutex.Dispose()
}
