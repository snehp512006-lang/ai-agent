param(
    [string]$BackupFile,
    [string]$EnvFile = ".\scripts\backup.env"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($BackupFile)) {
    throw "Provide backup file path: -BackupFile C:\\path\\file.sql"
}

if (-not (Test-Path $BackupFile)) {
    throw "Backup file not found: $BackupFile"
}

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
Require-Env -Names @("MYSQL_HOST", "MYSQL_PORT", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD")

$mysql = [Environment]::GetEnvironmentVariable("MYSQL_BIN")
if ([string]::IsNullOrWhiteSpace($mysql)) {
    $mysql = "mysql"
}

$dbName = [Environment]::GetEnvironmentVariable("MYSQL_DATABASE")
$env:MYSQL_PWD = [Environment]::GetEnvironmentVariable("MYSQL_PASSWORD")

Write-Host "WARNING: This will overwrite data in database '$dbName'."
$confirmation = Read-Host "Type RESTORE to continue"
if ($confirmation -ne "RESTORE") {
    throw "Restore cancelled."
}

$mysqlArgs = @(
    "--host=$([Environment]::GetEnvironmentVariable('MYSQL_HOST'))",
    "--port=$([Environment]::GetEnvironmentVariable('MYSQL_PORT'))",
    "--user=$([Environment]::GetEnvironmentVariable('MYSQL_USER'))",
    $dbName
)

Write-Host "Restoring from: $BackupFile"
$process = Start-Process -FilePath $mysql -ArgumentList $mysqlArgs -NoNewWindow -RedirectStandardInput $BackupFile -RedirectStandardError "$BackupFile.restore.err" -PassThru -Wait

if ($process.ExitCode -ne 0) {
    throw "Restore failed. See: $BackupFile.restore.err"
}

if (Test-Path "$BackupFile.restore.err") {
    $errContent = Get-Content "$BackupFile.restore.err" -Raw
    if ([string]::IsNullOrWhiteSpace($errContent)) {
        Remove-Item "$BackupFile.restore.err" -Force
    }
}

Write-Host "Restore completed successfully from: $BackupFile"
