#!/usr/bin/env node
/**
 * supabase-export CLI
 *
 * Commands:
 *   supabase-export export   Export data from Supabase
 *   supabase-export import   Import exported data into target Postgres
 *   supabase-export list     List tables in a Supabase project
 *
 * Usage:
 *   supabase-export export --url https://xxx.supabase.co --key eyJ... [--tables users,posts]
 *   supabase-export import --dir ./supabase-export --target postgres://...
 *   supabase-export export --url ... --key ... --format sql
 */

import { parseArgs } from 'util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url:      { type: 'string' },
    key:      { type: 'string' },
    tables:   { type: 'string' },
    schema:   { type: 'string', default: 'public' },
    format:   { type: 'string', default: 'json' },
    dir:      { type: 'string', default: './supabase-export' },
    target:   { type: 'string' },
    bundle:   { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    help:     { type: 'boolean', short: 'h', default: false },
  },
  strict: false,
});

const command = positionals[0];

if (values.help || !command) {
  console.log(`
supabase-export — Export and import Supabase data

Commands:
  export    Pull data from Supabase to local JSON/SQL files
  import    Load exported data into any Postgres database
  list      List all tables in a Supabase project

Export options:
  --url      Supabase project URL (or SUPABASE_URL env var)
  --key      Service role key (or SUPABASE_SERVICE_KEY env var)
  --tables   Comma-separated table list (default: all)
  --schema   Schema to export (default: public)
  --format   json | sql (default: json)
  --dir      Output directory (default: ./supabase-export)
  --bundle   Write all tables into one export.json file

Import options:
  --dir      Export directory to import from
  --target   Target Postgres URL (or TARGET_DATABASE_URL env var)
  --schema   Target schema (default: public)
  --dry-run  Validate without writing

Examples:
  supabase-export export --url https://xxx.supabase.co --key eyJ...
  supabase-export export --url ... --key ... --tables users,posts --format sql
  supabase-export import --dir ./supabase-export --target postgres://user:pass@host:5432/db
  supabase-export list --url ... --key ...
`);
  process.exit(0);
}

// Resolve config from args or env
const supabaseUrl = values.url || process.env.SUPABASE_URL;
const supabaseKey = values.key || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const targetUrl   = values.target || process.env.TARGET_DATABASE_URL;
const tables      = values.tables ? values.tables.split(',').map((t) => t.trim()) : null;

if (command === 'export') {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: --url and --key are required (or set SUPABASE_URL + SUPABASE_SERVICE_KEY)');
    process.exit(1);
  }
  const { exportSupabase } = await import('./exporter.js');
  await exportSupabase({
    supabaseUrl,
    supabaseKey,
    tables,
    schema: values.schema,
    format: values.format,
    outDir: values.dir,
    bundle: values.bundle,
  });

} else if (command === 'import') {
  if (!targetUrl) {
    console.error('Error: --target is required (or set TARGET_DATABASE_URL)');
    process.exit(1);
  }
  const { importToPostgres } = await import('./importer.js');
  await importToPostgres({
    exportDir: values.dir,
    targetUrl,
    targetSchema: values.schema,
    tables,
    dryRun: values['dry-run'],
  });

} else if (command === 'list') {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: --url and --key are required');
    process.exit(1);
  }
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data, error } = await client
    .from('information_schema.tables')
    .select('table_name, table_type')
    .eq('table_schema', values.schema)
    .order('table_name');

  if (error) { console.error('Error:', error.message); process.exit(1); }
  console.log(`\nTables in schema '${values.schema}':`);
  (data || []).forEach((t) => console.log(`  ${t.table_name} (${t.table_type})`));

} else {
  console.error(`Unknown command: ${command}. Use: export | import | list`);
  process.exit(1);
}
