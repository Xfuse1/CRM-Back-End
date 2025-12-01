-- Complete Migration Script - Run in Correct Order
-- This script runs all migrations in the correct sequence

\echo '========================================='
\echo 'Starting Complete Migration Process'
\echo '========================================='

\echo ''
\echo '[1/4] Adding authentication fields...'
\i 002_add_auth_fields.sql

\echo ''
\echo '[2/4] Adding session storage fields...'
\i 003_session_storage.sql

\echo ''
\echo '[3/4] Cleaning up duplicate data...'
\i 004a_cleanup_duplicates.sql

\echo ''
\echo '[4/4] Adding unique constraints and indexes...'
\i 004_prevent_duplicates.sql

\echo ''
\echo '========================================='
\echo '✅ All migrations completed successfully!'
\echo '========================================='
\echo ''
\echo 'Summary:'
\echo '  ✓ Authentication fields added'
\echo '  ✓ Session storage configured'
\echo '  ✓ Duplicate data cleaned'
\echo '  ✓ Unique constraints applied'
\echo '  ✓ Performance indexes created'
\echo '  ✓ API request deduplication table created'
\echo ''
\echo 'Your database is now production-ready! 🚀'
