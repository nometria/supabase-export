import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl } from '../src/rest.js';

test('normalizeUrl adds https:// when missing', () => {
  assert.equal(normalizeUrl('xyz.supabase.co'), 'https://xyz.supabase.co');
});

test('normalizeUrl strips trailing slashes', () => {
  assert.equal(normalizeUrl('https://xyz.supabase.co///'), 'https://xyz.supabase.co');
});

test('normalizeUrl trims whitespace', () => {
  assert.equal(normalizeUrl('  https://xyz.supabase.co  '), 'https://xyz.supabase.co');
});

test('normalizeUrl preserves http://', () => {
  assert.equal(normalizeUrl('http://localhost:54321'), 'http://localhost:54321');
});
