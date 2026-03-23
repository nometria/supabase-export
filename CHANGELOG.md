# Changelog

All notable changes to `supabase-export` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.0.0] - 2025-03-22

### Added
- `export` command: paginated export of all tables from any Supabase project
- `import` command: batch insert into any Postgres database (Neon, Railway, RDS, self-hosted)
- `list` command: list all tables in a Supabase project
- JSON and SQL INSERT output formats
- `--bundle` flag: write all tables into a single `export.json`
- `--tables` flag: selective export/import of specific tables
- `--dry-run` flag: validate import without writing
- `_manifest.json`: table list, row counts, and export timestamp written automatically
- Paginated fetch (1000 rows/page) — handles tables with millions of rows
- Fallback ordering for tables without an `id` column
- Batch inserts (500 rows/batch) with row-by-row fallback on conflict
- `ON CONFLICT DO NOTHING` in all SQL output
- Library API: `exportSupabase()` and `importToPostgres()` with `onProgress` callback
- Supports `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `TARGET_DATABASE_URL` env vars
