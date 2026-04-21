param(
    [string]$EnvFile = ".\scripts\backup.env"
)

$ErrorActionPreference = "Stop"

function Load-EnvFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        throw "Env file not found: $Path"
    }

    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $parts = $line.Split("=", 2)
        if ($parts.Count -ne 2) { return }
        $name = $parts[0].Trim()
        $value = $parts[1].Trim()
        [Environment]::SetEnvironmentVariable($name, $value)
    }
}

function Require-Env {
    param([string[]]$Names)
    foreach ($name in $Names) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if ([string]::IsNullOrWhiteSpace($value)) {
            throw "Missing required env var: $name"
        }
    }
}

Load-EnvFile -Path $EnvFile

Require-Env -Names @(
    "MYSQL_HOST", "MYSQL_PORT", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD", "BACKUP_DIR"
)

$retention = [Environment]::GetEnvironmentVariable("RETENTION_DAYS")
if ([string]::IsNullOrWhiteSpace($retention)) {
    $retention = "30"
}
$RetentionDays = [int]$retention

$mysqldump = [Environment]::GetEnvironmentVariable("MYSQLDUMP_BIN")
if ([string]::IsNullOrWhiteSpace($mysqldump)) {
    $mysqldump = "mysqldump"
}

$dbName = [Environment]::GetEnvironmentVariable("MYSQL_DATABASE")
$backupDir = [Environment]::GetEnvironmentVariable("BACKUP_DIR")

if (-not (Test-Path $backupDir)) {
    New-Item -Path $backupDir -ItemType Directory -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path $backupDir ("$dbName" + "_" + "$timestamp.sql")

$env:MYSQL_PWD = [Environment]::GetEnvironmentVariable("MYSQL_PASSWORD")

$dumpArgs = @(
    "--host=$([Environment]::GetEnvironmentVariable('MYSQL_HOST'))",
    "--port=$([Environment]::GetEnvironmentVariable('MYSQL_PORT'))",
    "--user=$([Environment]::GetEnvironmentVariable('MYSQL_USER'))",
    "--single-transaction",
    "--quick",
    "--routines",
    "--events",
    "--triggers",
    "--set-gtid-purged=OFF",
    $dbName
)

Write-Host "Creating backup: $backupFile"
$process = Start-Process -FilePath $mysqldump -ArgumentList $dumpArgs -NoNewWindow -RedirectStandardOutput $backupFile -RedirectStandardError "$backupFile.err" -PassThru -Wait

if ($process.ExitCode -ne 0) {
    throw "Backup failed. See: $backupFile.err"
}

if (Test-Path "$backupFile.err") {
    $errContent = Get-Content "$backupFile.err" -Raw
    if ([string]::IsNullOrWhiteSpace($errContent)) {
        Remove-Item "$backupFile.err" -Force
    }
}

# retention cleanup
$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $backupDir -Filter "*.sql" -File |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    Remove-Item -Force

Write-Host "Backup completed successfully: $backupFile"
