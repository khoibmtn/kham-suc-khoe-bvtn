# Tác vụ "KSK Ra soat Bao tri" (LOCAL SERVICE, khi bật máy + mỗi 5 phút, không chạy chồng). Chỉ làm việc 7h–17h:
#   1. Sao lưu theo giờ: mỗi khung giờ xét một lần; chỉ sao lưu (pg_dump) khi dữ liệu đổi kể từ bản trước.
#   2. Tự cập nhật từ GitHub (repo công khai khoibmtn/kham-suc-khoe-bvtn, nhánh main):
#      commit mới không đụng bc-ksk/app-nhapsl -> chỉ fast-forward, không khởi động lại;
#      có đụng -> build + test trong bản riêng (kiem-tra, CSDL ksk_test) -> sao lưu -> dừng app -> merge -> npm ci (nếu
#      lockfile đổi) -> migrate -> build -> chạy lại -> kiểm sức khoẻ -> lỗi thì quay về commit cũ.
# Ngoài giờ chỉ phục hồi một lần cập nhật dở dang (mất điện giữa chừng).
# Lưu ý: commit mới được kiểm và cài bởi bao-tri.ps1 ĐANG CHẠY (bản cũ).
Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'chung.ps1')

$GioBatDau = 7
$GioKetThuc = 17
$GiuBanSaoLuuGio = 48
$GiuBanTruocCapNhat = 10
$NhanhTheoDoi = 'main'

function Log { param([string]$m) Ghi-Log -Tep 'bao-tri' -ThongDiep $m }

function Log-Duoi {
    param([string]$TieuDe, [string[]]$Dong, [int]$SoDong = 15)
    $duoi = @($Dong | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last $SoDong)
    Log ("{0}`r`n    {1}" -f $TieuDe, ($duoi -join "`r`n    "))
}

function Bam-Tep {
    param([string]$DuongDan)
    if (-not (Test-Path -LiteralPath $DuongDan -PathType Leaf)) { return '' }
    return (Get-FileHash -LiteralPath $DuongDan -Algorithm SHA256).Hash.ToLowerInvariant()
}

# Tổng số dòng đã thêm/sửa/xoá của CSDL ứng dụng (pg_stat_user_tables). Đổi = có ghi dữ liệu.
function Lay-Van-Tay {
    param([hashtable]$MoiTruong)
    Dat-Bien-Pg -Url $MoiTruong['DATABASE_URL']
    try {
        $kq = Chay-Exe -FilePath $CauHinh.Psql -ThamSo @('-X', '-A', '-t', '-c',
            "SELECT coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0) || ':' || coalesce((SELECT stats_reset::text FROM pg_stat_database WHERE datname = current_database()), '') FROM pg_stat_user_tables")
        if ($kq.ExitCode -ne 0) { throw ("psql lỗi: {0}" -f (($kq.Output | Select-Object -Last 3) -join ' | ')) }
        return (($kq.Output | Where-Object { $_ -match '\S' } | Select-Object -First 1) -as [string]).Trim()
    } finally { Xoa-Bien-Pg }
}

function Sao-Luu {
    param([hashtable]$MoiTruong, [string]$Nhan, [int]$Giu)
    if (-not (Test-Path -LiteralPath $CauHinh.ThuMucSaoLuu -PathType Container)) {
        $null = New-Item -ItemType Directory -Path $CauHinh.ThuMucSaoLuu -Force
    }
    $tep = Join-Path $CauHinh.ThuMucSaoLuu ("tu-dong-{0}-{1}.dump" -f $Nhan, (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Dat-Bien-Pg -Url $MoiTruong['DATABASE_URL']
    try {
        $kq = Chay-Exe -FilePath $CauHinh.PgDump -ThamSo @('-Fc', '--no-owner', '--no-acl', '-f', $tep)
    } finally { Xoa-Bien-Pg }
    if ($kq.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $tep -PathType Leaf) -or (Get-Item -LiteralPath $tep).Length -lt 1024) {
        Remove-Item -LiteralPath $tep -Force -ErrorAction SilentlyContinue
        throw ("pg_dump thất bại (mã {0}): {1}" -f $kq.ExitCode, (($kq.Output | Select-Object -Last 3) -join ' | '))
    }
    $cu = @(Get-ChildItem -LiteralPath $CauHinh.ThuMucSaoLuu -Filter ("tu-dong-{0}-*.dump" -f $Nhan) -File | Sort-Object Name -Descending)
    if ($cu.Count -gt $Giu) { $cu | Select-Object -Skip $Giu | Remove-Item -Force -ErrorAction SilentlyContinue }
    return $tep
}

function Sao-Luu-Theo-Gio {
    param([hashtable]$MoiTruong)
    $khung = Get-Date -Format 'yyyyMMddHH'
    if ((Doc-Van-Ban -DuongDan $CauHinh.TepGioSaoLuu) -eq $khung) { return }
    $vanTay = Lay-Van-Tay -MoiTruong $MoiTruong
    if ($vanTay -ne (Doc-Van-Ban -DuongDan $CauHinh.TepVanTay)) {
        $tep = Sao-Luu -MoiTruong $MoiTruong -Nhan 'gio' -Giu $GiuBanSaoLuuGio
        Ghi-Van-Ban-Utf8 -DuongDan $CauHinh.TepVanTay -NoiDung $vanTay
        Log ("Sao lưu theo giờ thành công: {0}" -f $tep)
    }
    Ghi-Van-Ban-Utf8 -DuongDan $CauHinh.TepGioSaoLuu -NoiDung $khung
}

function Bien-Moi-Truong-Build {
    param([hashtable]$MoiTruong, [string]$DbUrl)
    return @{ DATABASE_URL = $DbUrl; SESSION_SECRET = $MoiTruong['SESSION_SECRET']; NODE_ENV = 'production' }
}

# npm ci nếu package-lock.json khác lần cài trước (theo SHA-256 lưu trong $TepLock).
function Cai-Goi-Neu-Can {
    param([string]$ThuMuc, [string]$TepLock)
    $hash = Bam-Tep -DuongDan (Join-Path $ThuMuc 'package-lock.json')
    $nextBin = Join-Path $ThuMuc 'node_modules\next\dist\bin\next'
    if (($hash -eq (Doc-Van-Ban -DuongDan $TepLock)) -and (Test-Path -LiteralPath $nextBin -PathType Leaf)) { return }
    $dong = @()
    $ma = Chay-Npm -ThamSo @('ci', '--include=dev') -ThuMucLamViec $ThuMuc -GioiHanGiay 1800 -DongCuoi ([ref]$dong)
    if ($ma -ne 0) { Log-Duoi -TieuDe ("npm ci lỗi (mã {0}) tại {1}:" -f $ma, $ThuMuc) -Dong $dong; throw 'npm ci thất bại.' }
    Ghi-Van-Ban-Utf8 -DuongDan $TepLock -NoiDung $hash
}

# $script:LoiDoCode = $true khi build/test/migrate trả mã lỗi thật (commit hỏng -> ghi commit-loi.txt).
# Lỗi hạ tầng (npm ci mạng, quá giờ, git, đĩa) để nguyên $false -> lượt sau thử lại.
$script:LoiDoCode = $false

function Chay-Buoc-Npm {
    param([string[]]$ThamSo, [string]$ThuMuc, [hashtable]$Bien, [int]$GioiHan, [string]$Ten, [switch]$LoiLaDoCode)
    $dong = @()
    $ma = Chay-Npm -ThamSo $ThamSo -ThuMucLamViec $ThuMuc -BienMoiTruong $Bien -GioiHanGiay $GioiHan -DongCuoi ([ref]$dong)
    if ($ma -ne 0) {
        Log-Duoi -TieuDe ("{0} lỗi (mã {1}):" -f $Ten, $ma) -Dong $dong
        if ($LoiLaDoCode -and $ma -ne 124) { $script:LoiDoCode = $true }
        throw ("{0} thất bại." -f $Ten)
    }
}

function Kiem-Tra-Commit {
    param([string]$Sha, [hashtable]$MoiTruong)
    $r = $CauHinh.ThuMucRepoKiemTra
    if (-not (Test-Path -LiteralPath (Join-Path $r '.git'))) {
        Chay-Git -ThuMucLamViec $CauHinh.ThuMucRepo -ThamSo @('worktree', 'prune') -ChoPhepLoi | Out-Null
        if (Test-Path -LiteralPath $r) { Remove-Item -LiteralPath $r -Recurse -Force }
        Chay-Git -ThuMucLamViec $CauHinh.ThuMucRepo -ThamSo @('worktree', 'add', '--detach', '--force', $r, $Sha) | Out-Null
    } else {
        Chay-Git -ThuMucLamViec $r -ThamSo @('checkout', '--detach', '--force', $Sha) | Out-Null
        Chay-Git -ThuMucLamViec $r -ThamSo @('clean', '-fdx', '-e', 'node_modules', '-e', '.next') | Out-Null
    }
    $kt = $CauHinh.ThuMucKiemTra
    Cai-Goi-Neu-Can -ThuMuc $kt -TepLock $CauHinh.TepKiemTraLock
    $test = $MoiTruong['TEST_DATABASE_URL']
    $bien = Bien-Moi-Truong-Build -MoiTruong $MoiTruong -DbUrl $test
    Chay-Buoc-Npm -ThamSo @('run', 'db:migrate') -ThuMuc $kt -Bien $bien -GioiHan 300 -Ten 'migrate CSDL test' -LoiLaDoCode
    Chay-Buoc-Npm -ThamSo @('run', 'build') -ThuMuc $kt -Bien $bien -GioiHan 1800 -Ten 'build (bản kiểm tra)' -LoiLaDoCode
    # vitest đọc TEST_DATABASE_URL; NODE_ENV phải là test.
    $bienTest = @{ DATABASE_URL = $test; TEST_DATABASE_URL = $test; SESSION_SECRET = $MoiTruong['SESSION_SECRET']; NODE_ENV = 'test' }
    Chay-Buoc-Npm -ThamSo @('test') -ThuMuc $kt -Bien $bienTest -GioiHan 1800 -Ten 'npm test' -LoiLaDoCode
}

function Cho-Ung-Dung-Dung {
    param([int]$Giay = 90)
    $han = (Get-Date).AddSeconds($Giay)
    while ((Get-Date) -lt $han) {
        if (-not (Test-Path -LiteralPath $CauHinh.TepNodePid -PathType Leaf) -and -not (Cong-Dang-Nghe -Cong $CauHinh.Cong)) { return $true }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Dung-Va-Cai-Ban {
    param([string]$Sha, [hashtable]$MoiTruong)
    Chay-Git -ThuMucLamViec $CauHinh.ThuMucRepo -ThamSo @('reset', '--hard', $Sha) | Out-Null
    Cai-Goi-Neu-Can -ThuMuc $CauHinh.ThuMucApp -TepLock $CauHinh.TepAppLock
    $bien = Bien-Moi-Truong-Build -MoiTruong $MoiTruong -DbUrl $MoiTruong['DATABASE_URL']
    Chay-Buoc-Npm -ThamSo @('run', 'db:migrate') -ThuMuc $CauHinh.ThuMucApp -Bien $bien -GioiHan 300 -Ten 'migrate CSDL'
    Chay-Buoc-Npm -ThamSo @('run', 'build') -ThuMuc $CauHinh.ThuMucApp -Bien $bien -GioiHan 1800 -Ten 'build'
}

# Quay về $ShaCu. Cờ dang-cap-nhat.txt chỉ được gỡ khi quay lại xong VÀ ứng dụng trả lời; nếu không, giữ cờ để lượt
# bảo trì 5 phút sau thử lại (kể cả ngoài giờ). Migration đã chạy không được đảo ngược (migration chỉ thêm).
function Quay-Lai {
    param([string]$ShaCu, [string]$ShaLoi, [hashtable]$MoiTruong, [string]$LyDo, [string]$TepSaoLuu = '')
    Log ("Quay lại {0} (lý do: {1})." -f $ShaCu.Substring(0, 7), $LyDo)
    if (-not [string]::IsNullOrWhiteSpace($TepSaoLuu)) { Log ("Bản sao lưu ngay trước cập nhật (app đã dừng): {0}" -f $TepSaoLuu) }
    if (-not [string]::IsNullOrWhiteSpace($ShaLoi)) { Add-Content -LiteralPath $CauHinh.TepCommitLoi -Value $ShaLoi -Encoding ASCII }
    $null = New-Item -ItemType File -Path $CauHinh.TepTamDungCapNhat -Force
    try {
        if (-not (Cho-Ung-Dung-Dung -Giay 60)) { throw 'ứng dụng không dừng trong 60 giây (tác vụ giám sát có chạy không?)' }
        Dung-Va-Cai-Ban -Sha $ShaCu -MoiTruong $MoiTruong
    } catch {
        Log ("LỖI khi quay lại {0}: {1}. Giữ cờ, thử lại lượt sau." -f $ShaCu.Substring(0, 7), $_.Exception.Message)
        Remove-Item -LiteralPath $CauHinh.TepTamDungCapNhat -Force -ErrorAction SilentlyContinue
        return
    }
    Remove-Item -LiteralPath $CauHinh.TepTamDungCapNhat -Force -ErrorAction SilentlyContinue
    if (Kiem-Tra-Suc-Khoe -ChoToiDaGiay 180) {
        Remove-Item -LiteralPath $CauHinh.TepDangCapNhat -Force -ErrorAction SilentlyContinue
        Log ("Đã quay lại {0}; ứng dụng chạy bình thường." -f $ShaCu.Substring(0, 7))
    } else {
        Log ("LỖI: đã quay lại {0} nhưng ứng dụng chưa trả lời; giữ cờ, thử lại lượt sau (xem nhat-ky\ung-dung-*.err.log)." -f $ShaCu.Substring(0, 7))
    }
}

function Cap-Nhat {
    param([hashtable]$MoiTruong)
    Chay-Git -ThuMucLamViec $CauHinh.ThuMucRepo -ThamSo @('fetch', '--quiet', 'origin', $NhanhTheoDoi) | Out-Null
    $head = Lay-Git-Sha -ThamChieu 'HEAD' -ThuMucLamViec $CauHinh.ThuMucRepo
    $moi = Lay-Git-Sha -ThamChieu ("origin/{0}" -f $NhanhTheoDoi) -ThuMucLamViec $CauHinh.ThuMucRepo
    if ($head -eq $moi) { return }
    $loi = @()
    if (Test-Path -LiteralPath $CauHinh.TepCommitLoi -PathType Leaf) { $loi = @(Get-Content -LiteralPath $CauHinh.TepCommitLoi) }
    if ($loi -contains $moi) { return }
    $ff = Chay-Git -ThuMucLamViec $CauHinh.ThuMucRepo -ThamSo @('merge-base', '--is-ancestor', $head, $moi) -ChoPhepLoi
    if ($ff.ExitCode -ne 0) {
        Log ("origin/{0} ({1}) không nối tiếp HEAD ({2}) (force-push?); bỏ qua, cần xử lý tay." -f $NhanhTheoDoi, $moi.Substring(0, 7), $head.Substring(0, 7))
        Add-Content -LiteralPath $CauHinh.TepCommitLoi -Value $moi -Encoding ASCII
        return
    }
    $doi = Chay-Git -ThuMucLamViec $CauHinh.ThuMucRepo -ThamSo @('diff', '--name-only', $head, $moi, '--', ($CauHinh.ThuMucConApp -replace '\\', '/'))
    if (@($doi.Output | Where-Object { $_ -match '\S' }).Count -eq 0) {
        Chay-Git -ThuMucLamViec $CauHinh.ThuMucRepo -ThamSo @('merge', '--ff-only', '--quiet', $moi) | Out-Null
        Log ("Cập nhật {0} -> {1}: không đổi app-nhapsl, không cần khởi động lại." -f $head.Substring(0, 7), $moi.Substring(0, 7))
        return
    }

    Log ("Phát hiện commit mới {0} -> {1}; kiểm tra (build + test) trong bản riêng..." -f $head.Substring(0, 7), $moi.Substring(0, 7))
    $script:LoiDoCode = $false
    try {
        Kiem-Tra-Commit -Sha $moi -MoiTruong $MoiTruong
    } catch {
        if ($script:LoiDoCode) {
            Log ("Commit {0} KHÔNG qua kiểm tra: {1}. Giữ bản đang chạy, không thử lại commit này." -f $moi.Substring(0, 7), $_.Exception.Message)
            Add-Content -LiteralPath $CauHinh.TepCommitLoi -Value $moi -Encoding ASCII
        } else {
            Log ("Chưa kiểm tra được commit {0} (lỗi tạm thời: {1}); thử lại lượt sau." -f $moi.Substring(0, 7), $_.Exception.Message)
        }
        return
    }
    Log ("Commit {0} qua build + test." -f $moi.Substring(0, 7))

    # Dừng app trước rồi mới sao lưu: bản sao lưu là đúng trạng thái CSDL lúc bắt đầu cập nhật.
    $null = New-Item -ItemType File -Path $CauHinh.TepTamDungCapNhat -Force
    if (-not (Cho-Ung-Dung-Dung -Giay 90)) {
        Remove-Item -LiteralPath $CauHinh.TepTamDungCapNhat -Force -ErrorAction SilentlyContinue
        Log 'Ứng dụng không dừng trong 90 giây; hoãn cập nhật sang lượt sau.'
        return
    }
    try {
        $tepSaoLuu = Sao-Luu -MoiTruong $MoiTruong -Nhan 'truoc-cap-nhat' -Giu $GiuBanTruocCapNhat
    } catch {
        Remove-Item -LiteralPath $CauHinh.TepTamDungCapNhat -Force -ErrorAction SilentlyContinue
        Log ("Sao lưu trước cập nhật lỗi ({0}); hoãn cập nhật sang lượt sau." -f $_.Exception.Message)
        return
    }
    Log ("Đã sao lưu trước cập nhật: {0}" -f $tepSaoLuu)

    Ghi-Van-Ban-Utf8 -DuongDan $CauHinh.TepDangCapNhat -NoiDung ("{0};{1}" -f $head, $moi)
    try {
        Dung-Va-Cai-Ban -Sha $moi -MoiTruong $MoiTruong
    } catch {
        Quay-Lai -ShaCu $head -ShaLoi $moi -MoiTruong $MoiTruong -LyDo $_.Exception.Message -TepSaoLuu $tepSaoLuu
        return
    }
    Remove-Item -LiteralPath $CauHinh.TepTamDungCapNhat -Force -ErrorAction SilentlyContinue
    if (Kiem-Tra-Suc-Khoe -ChoToiDaGiay 180) {
        Remove-Item -LiteralPath $CauHinh.TepDangCapNhat -Force -ErrorAction SilentlyContinue
        Log ("ĐÃ CẬP NHẬT {0} -> {1}." -f $head.Substring(0, 7), $moi.Substring(0, 7))
    } else {
        Quay-Lai -ShaCu $head -ShaLoi $moi -MoiTruong $MoiTruong -LyDo 'ứng dụng không trả lời /dang-nhap trong 180 giây' -TepSaoLuu $tepSaoLuu
    }
}

$mutex = Mo-Khoa-Mutex -TenMutex 'Global\KSKRS-BaoTri'
if ($null -eq $mutex) { exit 0 }
try {
    $moiTruong = Doc-Moi-Truong-App -CauHinhHienTai $CauHinh
    if (-not (Cong-Dang-Nghe -Cong $CauHinh.CongPg)) { exit 0 }  # PostgreSQL chưa lên (vd vừa bật máy): lượt sau làm

    # Cập nhật dở dang (mất điện/tắt máy giữa chừng, hoặc lần quay lại trước lỗi) -> quay về commit cũ, bất kể giờ nào.
    $dang = Doc-Van-Ban -DuongDan $CauHinh.TepDangCapNhat
    if ($dang -match '^([0-9a-f]{40});([0-9a-f]{40})$') {
        Quay-Lai -ShaCu $matches[1] -ShaLoi '' -MoiTruong $moiTruong -LyDo 'phát hiện cập nhật dở dang'
        exit 0
    } elseif ($dang -ne '') {
        Remove-Item -LiteralPath $CauHinh.TepDangCapNhat -Force -ErrorAction SilentlyContinue
    }
    # Cờ dừng do một lượt bảo trì trước bị cắt ngang (trước khi kịp ghi dang-cap-nhat.txt) -> gỡ để app chạy lại.
    # (Mutex bảo đảm không có lượt bảo trì nào khác đang giữ cờ này.)
    if (Test-Path -LiteralPath $CauHinh.TepTamDungCapNhat -PathType Leaf) {
        Remove-Item -LiteralPath $CauHinh.TepTamDungCapNhat -Force -ErrorAction SilentlyContinue
        Log 'Gỡ cờ tam-dung-cap-nhat còn sót từ lượt bảo trì trước.'
    }

    $gio = (Get-Date).Hour
    if ($gio -lt $GioBatDau -or $gio -ge $GioKetThuc) { exit 0 }

    try { Sao-Luu-Theo-Gio -MoiTruong $moiTruong }
    catch { Log ("LỖI sao lưu theo giờ (thử lại lượt 5 phút sau): {0}" -f $_.Exception.Message) }

    try { Cap-Nhat -MoiTruong $moiTruong }
    catch { Log ("LỖI khi kiểm tra/cập nhật: {0}" -f $_.Exception.Message) }
} catch {
    Log ("LỖI không mong muốn: {0}" -f $_.Exception.Message)
    throw
} finally {
    try { $mutex.ReleaseMutex() } catch { }
    $mutex.Dispose()
}
