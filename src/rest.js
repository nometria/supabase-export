/**
 * PostgREST helpers — table discovery and ordered, paginated row fetches
 * over plain `fetch`, with no @supabase/supabase-js dependency.
 *
 * These mirror the hosted web engine so the CLI and the web app stay in sync:
 *   - discoverTablesViaRest()  lists public BASE TABLEs from information_schema
 *   - fetchAllRowsViaRest()    pulls every row, ordered by id for stable paging
 *
 * The supabase-js client path in exporter.js remains the default; this module
 * is used as a dependency-free fallback (and by `list --rest`).
 */

const PAGE_SIZE = 1000; // PostgREST default max rows per request
const HARD_PAGE_CAP = 1000; // safety: never loop more than 1,000 pages per table

export function normalizeUrl(url) {
  url = (url || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(url)) url = 'https://' + url;
  return url;
}

function authHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json', ...extra };
}

/**
 * Discover public BASE TABLE names via PostgREST's information_schema view.
 * @param {string} supabaseUrl
 * @param {string} supabaseKey  Service role key.
 * @param {string} [schema='public']
 * @returns {Promise<string[]>}
 */
export async function discoverTablesViaRest(supabaseUrl, supabaseKey, schema = 'public') {
  const baseUrl = normalizeUrl(supabaseUrl);
  const endpoint =
    `${baseUrl}/rest/v1/information_schema.tables` +
    `?select=table_name,table_type&table_schema=eq.${encodeURIComponent(schema)}` +
    `&table_type=eq.BASE%20TABLE&order=table_name.asc`;

  const res = await fetch(endpoint, { headers: authHeaders(supabaseKey) });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `Supabase rejected the key while listing tables (${res.status}). Use the service role key.`,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Table discovery failed (${res.status}). ${body.slice(0, 180)}`.trim());
  }

  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('Unexpected response shape while listing tables.');
  return rows.map((r) => r.table_name).filter((t) => t && !String(t).startsWith('_'));
}

/**
 * Fetch every row for one table over PostgREST, ordered by id for stable
 * pagination. Falls back to unordered if the table has no id column.
 * @param {string} supabaseUrl
 * @param {string} supabaseKey
 * @param {string} table
 * @param {object} [opts]
 * @param {string} [opts.schema='public']
 * @param {function} [opts.onProgress]  (table, rowsSoFar) => void
 * @returns {Promise<object[]>}
 */
export async function fetchAllRowsViaRest(supabaseUrl, supabaseKey, table, opts = {}) {
  const { schema = 'public', onProgress = null } = opts;
  const baseUrl = normalizeUrl(supabaseUrl);
  const rows = [];
  let from = 0;
  let order = true;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const endpoint =
      `${baseUrl}/rest/v1/${encodeURIComponent(table)}?select=*` + (order ? '&order=id.asc' : '');
    const res = await fetch(endpoint, {
      headers: authHeaders(supabaseKey, {
        Range: `${from}-${to}`,
        'Range-Unit': 'items',
        'Accept-Profile': schema,
      }),
    });

    if (res.status === 404) throw new Error(`Table "${table}" not found (404).`);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Supabase rejected the key for "${table}" (${res.status}).`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 400 && order && /id/.test(body)) {
        order = false; // retry unordered: table has no id column
        continue;
      }
      throw new Error(`Failed to read "${table}" (${res.status}). ${body.slice(0, 180)}`.trim());
    }

    const page = await res.json();
    if (!Array.isArray(page)) throw new Error(`Unexpected response shape reading "${table}".`);
    rows.push(...page);
    if (onProgress) onProgress(table, rows.length);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    if (from / PAGE_SIZE >= HARD_PAGE_CAP) break;
  }

  return rows;
}
