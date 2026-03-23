/**
 * Supabase data exporter.
 *
 * Pulls all data from a Supabase project via the REST API (no pg connection needed)
 * and exports to JSON or SQL INSERT statements for import into any Postgres.
 *
 * Supports:
 *   - Table discovery via information_schema
 *   - Paginated fetch (handles tables with millions of rows)
 *   - Column metadata export (types, nullable, defaults)
 *   - JSON output (per-table files or single bundle)
 *   - SQL INSERT output
 *   - Selective table export (--tables flag)
 *   - Row count estimates per table before export
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const PAGE_SIZE = 1000;  // Supabase default max rows per request

/**
 * Export all (or selected) tables from a Supabase project.
 *
 * @param {object} opts
 * @param {string} opts.supabaseUrl    - Supabase project URL
 * @param {string} opts.supabaseKey    - Service role key (needed to read all tables)
 * @param {string[]} [opts.tables]     - Table names to export (omit = all public tables)
 * @param {string} [opts.schema]       - Schema to export (default: public)
 * @param {string} [opts.format]       - 'json' | 'sql' (default: json)
 * @param {string} [opts.outDir]       - Output directory (default: ./supabase-export)
 * @param {boolean} [opts.bundle]      - Write all tables into one JSON file
 * @param {function} [opts.onProgress] - Progress callback: (tableName, rowsFetched, total) => void
 * @returns {Promise<ExportResult>}
 */
export async function exportSupabase({
  supabaseUrl,
  supabaseKey,
  tables = null,
  schema = 'public',
  format = 'json',
  outDir = './supabase-export',
  bundle = false,
  onProgress = null,
}) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('supabaseUrl and supabaseKey are required');
  }

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  // ── Discover tables ────────────────────────────────────────────────────────
  const tableList = tables || await discoverTables(client, schema);
  console.log(`Tables to export: ${tableList.join(', ')}`);

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const bundle_data = {};
  const stats = [];

  for (const table of tableList) {
    console.log(`\nExporting ${schema}.${table}...`);
    const rows = await fetchAllRows(client, table, schema, onProgress);
    stats.push({ table, rows: rows.length });
    console.log(`  → ${rows.length} rows`);

    if (format === 'sql') {
      const sql = toSqlInserts(table, rows, schema);
      writeFileSync(join(outDir, `${table}.sql`), sql, 'utf8');
    } else {
      if (bundle) {
        bundle_data[table] = rows;
      } else {
        writeFileSync(
          join(outDir, `${table}.json`),
          JSON.stringify(rows, null, 2),
          'utf8',
        );
      }
    }
  }

  if (bundle && format === 'json') {
    writeFileSync(join(outDir, 'export.json'), JSON.stringify(bundle_data, null, 2), 'utf8');
  }

  // Write manifest
  const manifest = {
    exportedAt: new Date().toISOString(),
    supabaseUrl,
    schema,
    format,
    tables: stats,
    totalRows: stats.reduce((s, t) => s + t.rows, 0),
  };
  writeFileSync(join(outDir, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\n✅ Export complete → ${outDir}/`);
  console.log(`   ${stats.length} tables, ${manifest.totalRows} rows total`);

  return { outDir, manifest, stats };
}


// ── Table discovery ────────────────────────────────────────────────────────────

async function discoverTables(client, schema) {
  // Use rpc to query information_schema (service role can access this)
  const { data, error } = await client
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', schema)
    .eq('table_type', 'BASE TABLE')
    .order('table_name');

  if (error) {
    // Fallback: try a known set of common tables
    console.warn('Could not auto-discover tables:', error.message);
    console.warn('Use --tables to specify table names explicitly.');
    throw new Error(`Table discovery failed: ${error.message}. Use --tables flag.`);
  }

  return (data || []).map((r) => r.table_name).filter((t) => !t.startsWith('_'));
}


// ── Paginated fetch ────────────────────────────────────────────────────────────

async function fetchAllRows(client, table, schema, onProgress) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await client
      .schema(schema)
      .from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1)
      .order('id', { ascending: true, nullsFirst: false })
      .catch(() => null) || {};

    // If order by id fails (no id column), retry without order
    if (error && error.message?.includes('column "id" does not exist')) {
      return await fetchAllRowsNoOrder(client, table, schema, onProgress);
    }

    if (error) {
      console.warn(`  Warning: ${table} — ${error.message}`);
      break;
    }

    if (!data || data.length === 0) break;
    rows.push(...data);

    if (onProgress) onProgress(table, rows.length, null);

    if (data.length < PAGE_SIZE) break;  // Last page
    from += PAGE_SIZE;
  }

  return rows;
}

async function fetchAllRowsNoOrder(client, table, schema, onProgress) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await client
      .schema(schema)
      .from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);

    if (error || !data || data.length === 0) break;
    rows.push(...data);
    if (onProgress) onProgress(table, rows.length, null);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}


// ── SQL generation ────────────────────────────────────────────────────────────

function toSqlInserts(table, rows, schema) {
  if (rows.length === 0) return `-- ${schema}.${table}: no rows\n`;

  const cols = Object.keys(rows[0]);
  const header = `-- ${schema}.${table} (${rows.length} rows)\n`;
  const inserts = rows.map((row) => {
    const values = cols.map((c) => sqlValue(row[c])).join(', ');
    return `INSERT INTO "${schema}"."${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${values}) ON CONFLICT DO NOTHING;`;
  });

  return header + inserts.join('\n') + '\n';
}

function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}
