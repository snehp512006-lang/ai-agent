# Database Backup Runbook

This project stores critical business history in MySQL tables:
- ingestion_datacleanerrun
- ingestion_datacleanerrunpayload
- inventory_stockalert

Use this runbook to prevent data loss and recover after accidental cleanup.

## 1) Configure backup environment
1. Copy [scripts/backup.env.example](scripts/backup.env.example) to `scripts/backup.env`.
2. Fill MySQL credentials and backup directory.

## 2) Create backup manually (Windows)
Run from backend root:

```powershell
./scripts/db_backup.ps1 -EnvFile .\scripts\backup.env
```

## 3) Restore backup (Windows)
Run from backend root:

```powershell
./scripts/db_restore.ps1 -BackupFile "C:\backup\ai_ops\ai_agent21_20260417_101500.sql" -EnvFile .\scripts\backup.env
```

The restore script asks for explicit confirmation (`RESTORE`) before running.

## 4) Schedule automatic backup (Windows Task Scheduler)
- Program/script: `powershell.exe`
- Arguments:
  `-ExecutionPolicy Bypass -File "C:\Users\krish\Desktop\P(2028)\149351\backend\scripts\db_backup.ps1" -EnvFile "C:\Users\krish\Desktop\P(2028)\149351\backend\scripts\backup.env"`
- Trigger: Daily (recommended every 6-12 hours for active usage)

## 5) Linux/macOS backup command

```bash
chmod +x ./scripts/db_backup.sh
./scripts/db_backup.sh ./scripts/backup.env
```

## 6) Professional policy recommendation
- Full backup at least daily
- Retention at least 30 days
- Run restore drill once per month
- Keep backup files on separate disk/server

## 7) Quick verification SQL
After restore, verify critical row counts:

```sql
SELECT COUNT(*) FROM ingestion_datacleanerrun;
SELECT COUNT(*) FROM ingestion_datacleanerrunpayload;
SELECT COUNT(*) FROM inventory_stockalert;
```
