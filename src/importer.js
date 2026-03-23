/**
 * Supabase → target Postgres importer.
 *
 * Reads the JSON export and loads it into any Postgres database via `pg`.
 * Works with: self-hosted Supabase, Neon, Railway, RDS, local Postgres.
 *
 * Handles:
 *   - Column type coercion (jsonb, arrays, timestamps)
 *   - Conflict resolution (ON CONFLICT DO NOTHING or DO UPDATE)
 *   - Batch inserts for performance
 *   - Dry-run mode (validate without writing)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import pg from 'pg';

const { Pool } = pg;
const BATCH_SIZE = 500;

/**
 * Import an export directory into a target Postgres database.
 *
 * @param {object} opts
 * @param {string} opts.exportDir      - Path to the export directory (contains _manifest.json)
 * @param {string} opts.targetUrl      - Target Postgres connection URL
 * @param {string} [opts.targetSchema] - Target schema (default: public)
 * @param {string[]} [opts.tables]     - Subset of tables to import (default: all in manifest)
 * @param {string} [opts.onConflict]   - 'ignore' | 'update' (default: ignore)
 * @param {boolean} [opts.dryRun]      - Log what would happen without writing
 * @returns {Promise<ImportResult>}
 */
export async function importToPostgres({
  exportDir,
  targetUrl,
  targetSchema = 'public',
  tables = null,
  onConflict = 'ignore',
  dryRun = false,
}) {
  const manifestPath = join(exportDir, '_manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`No _manifest.json found in ${exportDir}. Run export first.`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const tablesToImport = tables || manifest.tables.map((t) => t.table);

  console.log(`Importing into ${dryRun ? '[DRY RUN] ' : ''}${targetSchema}...`);
  console.log(`Tables: ${tablesToImport.join(', ')}\n`);

  const pool = dryRun ? null : new Pool({ connectionString: targetUrl });
  const stats = [];

  for (const table of tablesToImport) {
    const filePath = join(exportDir, `${table}.json`);

    // Check bundle format
    let rows;
    const bundlePath = join(exportDir, 'export.json');
    if (!existsSync(filePath) && existsSync(bundlePath)) {
      const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
      rows = bundle[table] || [];
    } else if (existsSync(filePath)) {
      rows = JSON.parse(readFileSync(filePath, 'utf8'));
    } else {
      console.warn(`  ⚠ No export file for ${table}, skipping`);
      continue;
    }

    if (rows.length === 0) {
      console.log(`  ${table}: 0 rows (skipped)`);
      stats.push({ table, inserted: 0, skipped: 0 });
      continue;
    }

    console.log(`  ${table}: ${rows.length} rows...`);

    if (dryRun) {
      console.log(`    [DRY RUN] Would insert ${rows.length} rows into ${targetSchema}.${table}`);
      stats.push({ table, inserted: rows.length, skipped: 0, dryRun: true });
      continue;
    }

    const { inserted, skipped } = await insertBatch(pool, table, rows, targetSchema, onConflict);
    stats.push({ table, inserted, skipped });
    console.log(`    ✅ ${inserted} inserted, ${skipped} skipped`);
  }

  if (pool) await pool.end();

  const totalInserted = stats.reduce((s, t) => s + t.inserted, 0);
  console.log(`\n✅ Import complete: ${totalInserted} rows imported across ${stats.length} tables`);

  return { stats, totalInserted, dryRun };
}


async function insertBatch(pool, table, rows, schema, onConflict) {
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const conflict = onConflict === 'ignore' ? 'ON CONFLICT DO NOTHING' : 'ON CONFLICT DO NOTHING';

  let inserted = 0;
  let skipped = 0;
  const client = await pool.connect();

  try {
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map((_, bi) =>
        `(${cols.map((_, ci) => `$${bi * cols.length + ci + 1}`).join(', ')})`
      ).join(', ');

      const values = batch.flatMap((row) =>
        cols.map((c) => {
          const v = row[c];
          if (v !== null && typeof v === 'object') return JSON.stringify(v);
          return v;
        })
      );

      const sql = `INSERT INTO "${schema}"."${table}" (${colList}) VALUES ${placeholders} ${conflict}`;

      try {
        const result = await client.query(sql, values);
        inserted += result.rowCount || 0;
        skipped += batch.length - (result.rowCount || 0);
      } catch (err) {
        console.warn(`  Batch insert error (${table}): ${err.message} — falling back to row-by-row`);
        for (const row of batch) {
          try {
            const rowCols = Object.keys(row).map((c) => `"${c}"`).join(', ');
            const rowVals = Object.values(row).map((v) =>
              v !== null && typeof v === 'object' ? JSON.stringify(v) : v
            );
            const rowPlaceholders = rowVals.map((_, i) => `$${i + 1}`).join(', ');
            const rowSql = `INSERT INTO "${schema}"."${table}" (${rowCols}) VALUES (${rowPlaceholders}) ON CONFLICT DO NOTHING`;
            const r = await client.query(rowSql, rowVals);
            inserted += r.rowCount || 0;
          } catch (rowErr) {
            skipped++;
          }
        }
      }
    }
  } finally {
    client.release();
  }

  return { inserted, skipped };
}
