// @cartogopher/navigator — OpenAPI spec fetching
// Port of internal/navigator/fetch.go

const MAX_BODY = 50 * 1024 * 1024; // 50MB
const FETCH_TIMEOUT = 60_000; // 60s
const USER_AGENT = 'CartoGopher-Navigator';

/**
 * Fetch an OpenAPI spec from a URL. Returns { data: string, format: 'json'|'yaml' }
 * @param {string} rawURL
 * @param {{ headers?: string[] }} [opts]
 */
export async function fetchSpec(rawURL, opts = {}) {
  if (!rawURL.includes('://')) {
    rawURL = 'https://' + rawURL;
  }

  const extraHeaders = parseHeaders(opts.headers || []);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const resp = await fetch(rawURL, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json, application/yaml, application/x-yaml, text/yaml, */*',
        ...extraHeaders,
      },
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    const data = await resp.text();
    if (data.length > MAX_BODY) {
      throw new Error(`Response exceeds ${MAX_BODY / (1024 * 1024)}MB limit`);
    }

    const contentType = resp.headers.get('content-type') || '';
    const format = detectFormat(contentType, rawURL, data);
    return { data, format };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Detect if spec is JSON or YAML.
 * Priority: Content-Type header → URL extension → byte inspection.
 */
function detectFormat(contentType, url, data) {
  const ct = contentType.toLowerCase();
  if (ct.includes('json')) return 'json';
  if (ct.includes('yaml') || ct.includes('yml')) return 'yaml';

  const lower = url.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';

  // Byte inspection: JSON starts with { or [
  for (const ch of data) {
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') continue;
    if (ch === '{' || ch === '[') return 'json';
    break;
  }

  return 'yaml';
}

function parseHeaders(headers) {
  const h = {};
  for (const hdr of headers) {
    const idx = hdr.indexOf(':');
    if (idx > 0) {
      h[hdr.slice(0, idx).trim()] = hdr.slice(idx + 1).trim();
    }
  }
  return h;
}
