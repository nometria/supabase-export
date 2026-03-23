# supabase-export

[![npm version](https://img.shields.io/npm/v/supabase-export.svg)](https://www.npmjs.com/package/supabase-export)
[![npm downloads](https://img.shields.io/npm/dm/supabase-export.svg)](https://www.npmjs.com/package/supabase-export)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Export all your Supabase data to JSON or SQL — and import into any Postgres. The definitive escape hatch.

"How do I export all my Supabase data?" is one of the most searched Supabase questions. This is the definitive answer: paginated export of every table, with a direct importer into any Postgres target — self-hosted Supabase, Neon, Railway, RDS, or local.

---

## Install

```bash
# Run without installing
npx supabase-export export --url https://your-project.supabase.co --key eyJ...

# Install globally
npm install -g supabase-export

# Or as a dev dependency
npm install --save-dev supabase-export
```

---

## Export from Supabase

```bash
# Export all tables to ./supabase-export/ as JSON
supabase-export export \
  --url https://your-project.supabase.co \
  --key eyJ...service-role-key...

# Export specific tables only
supabase-export export --url ... --key ... --tables users,posts,comments

# Export as SQL INSERT statements (ready to run on any Postgres)
supabase-export export --url ... --key ... --format sql

# Bundle all tables into a single file
supabase-export export --url ... --key ... --bundle

# Use environment variables instead of flags
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_KEY=eyJ...
supabase-export export
```

**Output structure:**

```
supabase-export/
├── _manifest.json    ← table list, row counts, export timestamp
├── users.json
├── posts.json
├── comments.json
└── ...
```

`_manifest.json` always contains:

```json
{
  "exportedAt": "2025-03-22T10:00:00.000Z",
  "supabaseUrl": "https://your-project.supabase.co",
  "schema": "public",
  "format": "json",
  "tables": [
    { "table": "users", "rows": 1250 },
    { "table": "posts", "rows": 4832 }
  ],
  "totalRows": 6082
}
```

---

## Import to any Postgres

```bash
# Import into any Postgres (Neon, Railway, RDS, self-hosted Supabase, local)
supabase-export import \
  --dir ./supabase-export \
  --target postgresql://user:pass@host:5432/db

# Dry run first — validates data without writing anything
supabase-export import --dir ... --target ... --dry-run

# Import only specific tables
supabase-export import --dir ... --target ... --tables users,posts

# Use environment variable
export TARGET_DATABASE_URL=postgresql://...
supabase-export import --dir ./supabase-export
```

---

## List tables

```bash
supabase-export list --url https://your-project.supabase.co --key eyJ...
```

---

## CLI reference

```
supabase-export <command> [options]

Commands:
  export    Export data from Supabase to local files
  import    Import exported data into any Postgres database
  list      List all tables in a Supabase project

Export options:
  --url      Supabase project URL  [env: SUPABASE_URL]
  --key      Service role key      [env: SUPABASE_SERVICE_KEY]
  --tables   Comma-separated table names (default: all)
  --schema   Schema to export (default: public)
  --format   json | sql (default: json)
  --dir      Output directory (default: ./supabase-export)
  --bundle   Write all tables into one export.json

Import options:
  --dir      Export directory to read from (default: ./supabase-export)
  --target   Target Postgres connection URL  [env: TARGET_DATABASE_URL]
  --tables   Comma-separated table names (default: all from manifest)
  --dry-run  Validate without writing
```

---

## Use as a library

```js
import { exportSupabase } from 'supabase-export/exporter';
import { importToPostgres } from 'supabase-export/importer';

// ── Export ─────────────────────────────────────────────────────────────────

const result = await exportSupabase({
  supabaseUrl:  process.env.SUPABASE_URL,
  supabaseKey:  process.env.SUPABASE_SERVICE_KEY,

  // Optional:
  tables:    ['users', 'posts'],  // omit to export all tables
  schema:    'public',
  format:    'json',              // 'json' | 'sql'
  outDir:    './backup',
  bundle:    false,               // true = single export.json
  onProgress: (table, fetched) => console.log(`${table}: ${fetched} rows fetched`),
});

console.log(result.manifest.totalRows); // total rows exported
console.log(result.stats);              // [{ table: 'users', rows: 1250 }, ...]

// ── Import ─────────────────────────────────────────────────────────────────

await importToPostgres({
  exportDir:  './backup',
  targetUrl:  process.env.TARGET_DATABASE_URL,

  // Optional:
  tables:  ['users', 'posts'],   // omit to import all tables in manifest
  dryRun:  false,
});
```

### `exportSupabase(opts)` options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `supabaseUrl` | string | **required** | Supabase project URL |
| `supabaseKey` | string | **required** | Service role key |
| `tables` | string[] | all | Tables to export |
| `schema` | string | `'public'` | Schema to read from |
| `format` | `'json'` \| `'sql'` | `'json'` | Output format |
| `outDir` | string | `'./supabase-export'` | Output directory |
| `bundle` | boolean | `false` | Write all tables to one file |
| `onProgress` | function | — | `(table, fetched, total) => void` |

### `importToPostgres(opts)` options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `exportDir` | string | `'./supabase-export'` | Directory with exported files |
| `targetUrl` | string | **required** | Postgres connection URL |
| `tables` | string[] | from manifest | Tables to import |
| `dryRun` | boolean | `false` | Validate without writing |

---

## Important: use the service role key

The `anon` key cannot bypass Row Level Security and won't be able to read all rows. You need the **service role key**:

Supabase Dashboard → Project Settings → API → **Service role key (secret)**

> ⚠️ Never expose the service role key in client-side code or commit it to your repository. Use environment variables.

---

## Common use cases

### Backup before a destructive migration

```bash
supabase-export export --url ... --key ...
# → runs your migration
# supabase-export import --dir ./supabase-export --target ... (rollback if needed)
```

### Migrate to a self-hosted Supabase instance

```bash
# 1. Export from Supabase Cloud
supabase-export export --url https://xyz.supabase.co --key eyJ...

# 2. Import to self-hosted (or Neon, Railway, etc.)
supabase-export import --dir ./supabase-export \
  --target postgresql://postgres:password@localhost:5432/postgres
```

### Seed a development database

```bash
# Export production data
supabase-export export --url $PROD_URL --key $PROD_KEY --dir ./seed

# Import to local dev
supabase-export import --dir ./seed --target postgresql://localhost/myapp_dev
```

### Scheduled backups (cron / GitHub Actions)

```yaml
# .github/workflows/backup.yml
on:
  schedule:
    - cron: '0 2 * * *'   # daily at 2am

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx supabase-export export --dir ./backup
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
      - run: |
          git config user.email "backup@nometria.com"
          git add backup/
          git commit -m "chore: daily backup $(date -u +%Y-%m-%d)"
          git push
```

---

## Technical details

- **Pagination**: fetches 1,000 rows per request using Supabase's `.range()` — handles tables with millions of rows
- **Ordering**: tries `order by id` for stable pagination; falls back to unordered fetch for tables without `id`
- **SQL output**: produces `INSERT INTO "schema"."table" (...) VALUES (...) ON CONFLICT DO NOTHING;`
- **Import batching**: inserts 500 rows per batch; falls back to row-by-row on conflict
- **Manifest**: `_manifest.json` written on every export for import validation

---

## Contributing

PRs welcome. Run tests with `npm test`.

---

## License

MIT © [Nometria](https://nometria.com)
