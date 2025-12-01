# Run All Migrations Script for Windows
# Usage: .\run_migrations.ps1

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "AWFAR CRM - Database Migration Script" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check if SUPABASE_URL is set
if (-not $env:SUPABASE_URL) {
    Write-Host "❌ Error: SUPABASE_URL environment variable not set" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please set it first:" -ForegroundColor Yellow
    Write-Host '  $env:SUPABASE_URL = "postgresql://user:pass@host:port/database"' -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or add it to your .env file and run:" -ForegroundColor Yellow
    Write-Host "  Get-Content .env | ForEach-Object { `$key, `$value = `$_ -split '='; [Environment]::SetEnvironmentVariable(`$key, `$value) }" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Database URL found" -ForegroundColor Green
Write-Host "  URL: $($env:SUPABASE_URL.Substring(0, 30))..." -ForegroundColor Gray
Write-Host ""

# Change to migrations directory
$migrationsDir = Join-Path $PSScriptRoot "migrations"
if (-not (Test-Path $migrationsDir)) {
    Write-Host "❌ Error: migrations directory not found" -ForegroundColor Red
    exit 1
}

Set-Location $migrationsDir

# Array of migration files in order
$migrations = @(
    "002_add_auth_fields.sql",
    "003_session_storage.sql",
    "004a_cleanup_duplicates.sql",
    "004_prevent_duplicates.sql"
)

$completed = 0
$failed = 0

foreach ($migration in $migrations) {
    Write-Host "Running: $migration" -ForegroundColor Cyan
    
    if (-not (Test-Path $migration)) {
        Write-Host "  ❌ File not found: $migration" -ForegroundColor Red
        $failed++
        continue
    }
    
    # Run migration using psql
    try {
        $output = psql $env:SUPABASE_URL -f $migration 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✅ Success" -ForegroundColor Green
            $completed++
        } else {
            Write-Host "  ❌ Failed" -ForegroundColor Red
            Write-Host "  Error: $output" -ForegroundColor Red
            $failed++
        }
    } catch {
        Write-Host "  ❌ Error running migration: $_" -ForegroundColor Red
        $failed++
    }
    
    Write-Host ""
}

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Migration Summary" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Completed: $completed / $($migrations.Count)" -ForegroundColor $(if ($completed -eq $migrations.Count) { "Green" } else { "Yellow" })
Write-Host "Failed:    $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host ""

if ($failed -eq 0) {
    Write-Host "🎉 All migrations completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your database is now production-ready with:" -ForegroundColor Green
    Write-Host "  ✓ Authentication fields" -ForegroundColor Gray
    Write-Host "  ✓ Session storage" -ForegroundColor Gray
    Write-Host "  ✓ Duplicate data cleaned" -ForegroundColor Gray
    Write-Host "  ✓ Unique constraints" -ForegroundColor Gray
    Write-Host "  ✓ Performance indexes" -ForegroundColor Gray
    Write-Host "  ✓ API request deduplication" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Next step: npm start" -ForegroundColor Cyan
} else {
    Write-Host "⚠️  Some migrations failed. Please check the errors above." -ForegroundColor Yellow
    exit 1
}
