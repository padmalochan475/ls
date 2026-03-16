# LAMS 2.0 - Source File Backup Script
# Run BEFORE any major git operation (reset, rebase, stash pop, etc.)
# Usage: .\backup-src.ps1

param()

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Timestamp   = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$BackupDir   = Join-Path $ProjectRoot "__backups"
$BackupFile  = Join-Path $BackupDir "src_backup_$Timestamp.zip"

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

Write-Host ""
Write-Host "LAMS Backup - Creating snapshot..." -ForegroundColor Cyan
Write-Host "  Timestamp : $Timestamp"
Write-Host "  Output    : $BackupFile"
Write-Host ""

Add-Type -Assembly "System.IO.Compression.FileSystem"
$archive = [System.IO.Compression.ZipFile]::Open($BackupFile, 'Create')

$foldersToBackup = @("src", "api")
$filesToBackup   = @("vite.config.js", "vercel.json", "firestore.rules", "package.json")

foreach ($folder in $foldersToBackup) {
    $fullFolder = Join-Path $ProjectRoot $folder
    if (Test-Path $fullFolder) {
        Get-ChildItem -Path $fullFolder -Recurse -File | ForEach-Object {
            $rel = $_.FullName.Substring($ProjectRoot.Length + 1)
            $entry = $archive.CreateEntry($rel)
            $outStream = $entry.Open()
            $inStream  = [System.IO.File]::OpenRead($_.FullName)
            $inStream.CopyTo($outStream)
            $inStream.Close()
            $outStream.Close()
        }
    }
}

foreach ($f in $filesToBackup) {
    $full = Join-Path $ProjectRoot $f
    if (Test-Path $full) {
        $entry = $archive.CreateEntry($f)
        $outStream = $entry.Open()
        $inStream  = [System.IO.File]::OpenRead($full)
        $inStream.CopyTo($outStream)
        $inStream.Close()
        $outStream.Close()
    }
}

$archive.Dispose()

$sizeMB = [math]::Round((Get-Item $BackupFile).Length / 1MB, 2)
Write-Host "Backup complete! Size: $sizeMB MB" -ForegroundColor Green
Write-Host "Location: $BackupFile" -ForegroundColor Yellow
Write-Host ""

# Auto-clean backups older than 7 days
Get-ChildItem -Path $BackupDir -Filter "*.zip" | Where-Object {
    $_.LastWriteTime -lt (Get-Date).AddDays(-7)
} | ForEach-Object {
    Remove-Item $_.FullName -Force
    Write-Host "Cleaned old backup: $($_.Name)" -ForegroundColor DarkGray
}
