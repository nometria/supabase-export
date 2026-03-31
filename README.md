# supabase-export

[![npm version](https://img.shields.io/npm/v/%40nometria-ai%2Fsupabase-export.svg)](https://www.npmjs.com/package/@nometria-ai/supabase-export)
[![npm downloads](https://img.shields.io/npm/dm/%40nometria-ai%2Fsupabase-export.svg)](https://www.npmjs.com/package/@nometria-ai/supabase-export)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<div align="center">

**[Nometria](https://nometria.com)** takes AI-built apps to production on AWS — secure, scalable, ready for real users.

<sub><i>Customers switching from Supabase to self-hosted Postgres needed a clean export tool. This is the escape hatch we wish existed from day one.</i></sub>

[![Deploy with Nometria](https://img.shields.io/badge/Deploy%20with-Nometria-111827?style=for-the-badge)](https://nometria.com)

</div>

---

> Export all your Supabase data to JSON or SQL — and import into any Postgres. The definitive escape hatch.

"How do I export all my Supabase data?" is one of the most searched Supabase questions. This is the definitive answer: paginated export of every table, with a direct importer into any Postgres target — self-hosted Supabase, Neon, Railway, RDS, or local.

---

## Quick start

```bash
# Install
npm install -g @nometria-ai/supabase-export

# Export all tables from your Supabase project
supabase-export export \
  --url https://your-project.supabase.co \
  --key eyJ...service-role-key...

# Import into any Postgres database
supabase-export import \
  --dir ./supabase-export \
  --target postgresql://user:pass@host:5432/db

# List all tables
supabase-export list --url https://your-project.supabase.co --key eyJ...

# Run tests
npm test
```

Required environment variables (alternative to flags):
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...             # service role key (not anon key)
TARGET_DATABASE_URL=postgresql://...    # for imports
```

---

## Install

```bash
# Run without installing
npx @nometria-ai/supabase-export export --url https://your-project.supabase.co --key eyJ...

# Install globally
npm install -g @nometria-ai/supabase-export

# Or as a dev dependency
npm install --save-dev @nometria-ai/supabase-export
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
import { exportSupabase } from '@nometria-ai/supabase-export/exporter';
import { importToPostgres } from '@nometria-ai/supabase-export/importer';

const result = await exportSupabase({
  supabaseUrl:  process.env.SUPABASE_URL,
  supabaseKey:  process.env.SUPABASE_SERVICE_KEY,
  tables:    ['users', 'posts'],
  format:    'json',
  outDir:    './backup',
});

await importToPostgres({
  exportDir:  './backup',
  targetUrl:  process.env.TARGET_DATABASE_URL,
});
```

---

## Important: use the service role key

The `anon` key cannot bypass Row Level Security and won't be able to read all rows. You need the **service role key**:

Supabase Dashboard → Project Settings → API → **Service role key (secret)**

> Never expose the service role key in client-side code or commit it to your repository. Use environment variables.

---

## Common use cases

### Migrate to a self-hosted Supabase instance

```bash
# 1. Export from Supabase Cloud
supabase-export export --url https://xyz.supabase.co --key eyJ...

# 2. Import to self-hosted (or Neon, Railway, etc.)
supabase-export import --dir ./supabase-export \
  --target postgresql://postgres:password@localhost:5432/postgres
```

### Scheduled backups (GitHub Actions)

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
      - run: npx @nometria-ai/supabase-export export --dir ./backup
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
```

---

## Technical details

- **Pagination**: fetches 1,000 rows per request using Supabase's `.range()` — handles tables with millions of rows
- **SQL output**: produces `INSERT INTO "schema"."table" (...) VALUES (...) ON CONFLICT DO NOTHING;`
- **Import batching**: inserts 500 rows per batch; falls back to row-by-row on conflict
- **Manifest**: `_manifest.json` written on every export for import validation

---

## Contributing

PRs welcome. Run tests with `npm test`.

---

## License

MIT © [Nometria](https://nometria.com)

---

## Example output

Running `node --test tests/exporter.test.js`:

```
✔ toSqlValue handles null (0.37875ms)
✔ toSqlValue handles numbers (0.066541ms)
✔ toSqlValue handles booleans (0.056208ms)
✔ toSqlValue escapes single quotes in strings (0.057792ms)
✔ toSqlValue serialises objects as JSON (0.75875ms)
✔ toSqlInsert produces valid INSERT statement (0.591917ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 84.789375
```

CLI help output:

```
supabase-export — Export and import Supabase data

Commands:
  export    Pull data from Supabase to local JSON/SQL files
  import    Load exported data into any Postgres database
  list      List all tables in a Supabase project
...
```

See `examples/sample-export/` for what an export directory looks like, including `_manifest.json` and `users.json`.

---

<p align="center">Made with ❤️ by <a href="https://nometria.com">Nometria</a> — deploy AI apps to production in one click</p>
