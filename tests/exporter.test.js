import { test } from 'node:test';
import assert from 'node:assert/strict';

// Test the SQL serialisation helpers inline (extracted logic, no Supabase needed)

function toSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

function toSqlInsert(table, row) {
  const cols = Object.keys(row).map((c) => `"${c}"`).join(', ');
  const vals = Object.values(row).map(toSqlValue).join(', ');
  return `INSERT INTO "${table}" (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;`;
}

test('toSqlValue handles null', () => {
  assert.equal(toSqlValue(null), 'NULL');
});

test('toSqlValue handles numbers', () => {
  assert.equal(toSqlValue(42), '42');
  assert.equal(toSqlValue(3.14), '3.14');
});

test('toSqlValue handles booleans', () => {
  assert.equal(toSqlValue(true), 'TRUE');
  assert.equal(toSqlValue(false), 'FALSE');
});

test('toSqlValue escapes single quotes in strings', () => {
  assert.equal(toSqlValue("it's"), "'it''s'");
});

test('toSqlValue serialises objects as JSON', () => {
  const result = toSqlValue({ key: 'val' });
  assert.ok(result.startsWith("'"));
  assert.ok(result.includes('key'));
});

test('toSqlInsert produces valid INSERT statement', () => {
  const sql = toSqlInsert('users', { id: 1, name: "Alice", active: true });
  assert.match(sql, /^INSERT INTO "users"/);
  assert.match(sql, /ON CONFLICT DO NOTHING/);
  assert.match(sql, /'Alice'/);
  assert.match(sql, /TRUE/);
});
