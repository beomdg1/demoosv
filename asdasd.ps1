# send_metadata_to_central.ps1
# Dành cho Bệnh viện Sản Nhi Nghệ An

param(
    [string]$ConfigFile = "C:\Users\Administrator\Downloads\nerrr\hospital_config.json" 
)

$API_URL = "https://demoosv.onrender.com/api/backup"
# $API_TOKEN = "ZTc2YzM3NjYtZmE2My00MTU2LWIxYzAtNzgyYjNlNGZhNDI3"
$LOG_FILE = "C:\Users\Administrator\Downloads\nerrr\send_metadata_to_central.ps1"

# Tạo thư mục log nếu chưa có
$logDir = Split-Path $LOG_FILE -Parent
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    Add-Content -Path $LOG_FILE -Value $logMessage
    Write-Host $logMessage
}


function Load-Config {
    param([string]$ConfigPath)
    
    if (-not (Test-Path $ConfigPath)) {
        Write-Log "Config file not found: $ConfigPath" "ERROR"
        exit 1
    }
    
    $config = Get-Content $ConfigPath -Encoding UTF8 | ConvertFrom-Json
    Write-Log "Loaded config for $($config.hospitals.Count) hospitals"
    return $config
}

function Get-DiskInfo {

    $path = "E:\BUDL"

    # Lấy drive từ path
    $drive = (Get-Item $path).PSDrive.Name

    $disk = Get-WmiObject Win32_LogicalDisk `
        -Filter "DeviceID='$($drive):'"

    return @{
        free    = [math]::Round($disk.FreeSpace / 1GB, 2)
        total   = [math]::Round($disk.Size / 1GB, 2)
        percent = [math]::Round(($disk.Size - $disk.FreeSpace) /  $disk.Size * 100, 2)
    }
}

function Get-LatestBackup {
    param([string]$BackupFolder)

    if (-not (Test-Path $BackupFolder)) {
        Write-Log "Backup folder not found: $BackupFolder" "WARN"
        return $null
    }

    Write-Log "Scanning for backups in: $BackupFolder" "INFO"

    # Lấy file backup mới nhất
    $latestBackup = Get-ChildItem -Path $BackupFolder -File |
    Where-Object {
        $_.Extension -in ".dump", ".backup", ".sql", ".bak"
    } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

    if (-not $latestBackup) {
        Write-Log "No backup file found in: $BackupFolder" "WARN"
        return $null
    }

    Write-Log "Found latest backup: $($latestBackup.Name)" "INFO"

    # Tính size
    $sizeGB = [math]::Round($latestBackup.Length / 1GB, 4)

    Write-Log "File size: $sizeGB " "INFO"

    return @{
        name     = $latestBackup.Name
        path     = $latestBackup.FullName
        date     = $latestBackup.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
        size     = $sizeGB
        sizeUnit = "GB"
    }
}
function Send-Metadata {
    param(
        [string]$HospitalName,
        [string]$HospitalCode,
        [string]$DBName,
        [string]$BackupName,
        [string]$BackupDate,
        [double]$BackupSize,
        [double]$DiskFree,
        [double]$DiskTotal,
        [double]$DiskPercent,
        [string]$ServerHost = $env:COMPUTERNAME
    )

    $metadata = @{
        FileName     = $BackupName
        BackupDate   = $BackupDate
        BackupSize   = $BackupSize
        DiskFree     = $DiskFree
        DiskTotal    = $DiskTotal
        DiskPercent  = $DiskPercent
        Source       = $DBName
        Host         = $ServerHost
        Port         = 2002
        ProjectName  = $HospitalName
        HospitalCode = $HospitalCode
    }
    
    $body = $metadata | ConvertTo-Json -Depth 10
    Write-Host ($metadata | ConvertTo-Json -Depth 3)
    try {
        $response = Invoke-RestMethod `
            -Uri $API_URL `
            -Method POST `
            -Body $body `
            -ContentType "application/json" `
            -TimeoutSec 60

        Write-Host "Send success: $($response.message)"
        return $true
    }
    catch {
        Write-Host "Send failed: $($_.Exception.Message)"
        return $false
    }
}
# ==================== MAIN ====================

Write-Log "========================================"
Write-Log "Starting Metadata Sender Service"
Write-Log "========================================"

$config = Load-Config -ConfigPath $ConfigFile

$diskInfo = Get-DiskInfo
Write-Log "Disk Info - Free: $($diskInfo.free) GB, Total: $($diskInfo.total) GB, Percent: $($diskInfo.percent)%"

$successCount = 0
$totalCount = $config.hospitals.Count

foreach ($hospital in $config.hospitals) {
    Write-Log "`nProcessing: $($hospital.name)" "INFO"
    
    $backup = Get-LatestBackup -BackupFolder $hospital.backupFolder
    
    if ($backup -and $backup.size -gt 0) {
        $result = Send-Metadata `
            -HospitalName $hospital.name `
            -HospitalCode $hospital.code `
            -DBName $hospital.dbName `
            -BackupName $backup.name `
            -BackupDate $backup.date `
            -BackupSize $backup.size `
            -DiskFree $diskInfo.free `
            -DiskTotal $diskInfo.total `
            -DiskPercent $diskInfo.percent `
            -ServerHost $env:COMPUTERNAME
        
        if ($result) { $successCount++ }
    }
    else {
        Write-Log "⚠️ No backup found for $($hospital.name)" "WARN"
        
        Send-Metadata `
            -HospitalName $hospital.name `
            -HospitalCode $hospital.code `
            -DBName $hospital.dbName `
            -BackupName "NO_BACKUP" `
            -BackupDate (Get-Date).ToString("yyyy-MM-dd HH:mm:ss") `
            -BackupSize 0 `
            -DiskFree $diskInfo.free `
            -DiskTotal $diskInfo.total `
            -DiskPercent $diskInfo.percent
    }
}


Write-Log "`n========================================"
Write-Log "Summary: $successCount / $totalCount hospitals reported"
Write-Log "========================================"

exit 0