// @cartogopher/navigator — OpenAPI query/formatting
// Port of internal/navigator/query.go

import { loadApiManifest, loadSpec, loadAllSpecs } from './store.js';

/**
 * List all fetched OpenAPI specs.
 */
export async function list() {
  const specs = await loadAllSpecs();
  if (specs.length === 0) {
    return 'No specs fetched yet. Use navigator_fetch to add one.';
  }

  const lines = [`Fetched specs (${specs.length}):`];
  for (const spec of specs) {
    const ver = spec.version || '?';
    let line = `  ${spec.name} (v${ver}) ${spec.endpoint_count}ep ${spec.schema_count}schemas`;
    if (spec.auth?.length) {
      line += ` auth:${spec.auth.map(a => a.type).join(',')}`;
    }
    line += ` fetched:${spec.fetched_at?.slice(0, 10) || '?'}`;
    lines.push(line);
  }
  return lines.join('\n');
}

/**
 * Search endpoints across fetched specs.
 */
export async function search({ query, spec: specName, method, limit = 20 }) {
  let specs;
  if (specName) {
    try {
      specs = [await loadSpec(specName)];
    } catch (e) {
      return `Error: ${e.message}`;
    }
  } else {
    specs = await loadAllSpecs();
  }

  if (specs.length === 0) {
    return 'No specs fetched yet. Use navigator_fetch to add one.';
  }

  const q = query.toLowerCase();
  const lines = [];
  let count = 0;

  for (const spec of specs) {
    for (const ep of spec.endpoints) {
      if (count >= limit) break;
      if (method && ep.m.toUpperCase() !== method.toUpperCase()) continue;
      if (!matchesQuery(q, ep)) continue;
      lines.push(formatEndpointLine(spec.name, ep));
      count++;
    }
    if (count >= limit) break;
  }

  if (count === 0) {
    return `No endpoints matching '${query}'`;
  }
  return `Found ${count} endpoints:\n${lines.join('\n')}`;
}

/**
 * Get detailed view of one endpoint with inlined schema fields.
 */
export async function endpointDetail({ spec: specName, path, method }) {
  let spec;
  try {
    spec = await loadSpec(specName);
  } catch (e) {
    return `Error: ${e.message}`;
  }

  const methodFilter = method ? method.toUpperCase() : '';
  const pathLower = path.toLowerCase();

  // Exact path match
  for (const ep of spec.endpoints) {
    if (methodFilter && ep.m !== methodFilter) continue;
    if (ep.p.toLowerCase() === pathLower) {
      return formatEndpointDetail(spec, ep);
    }
  }

  // Partial path match fallback
  for (const ep of spec.endpoints) {
    if (methodFilter && ep.m !== methodFilter) continue;
    if (ep.p.toLowerCase().includes(pathLower)) {
      return formatEndpointDetail(spec, ep);
    }
  }

  return `No endpoint found: ${method || '*'} ${path} in spec '${specName}'`;
}

// ─── Matching ────────────────────────────────────────────────────

function matchesQuery(query, ep) {
  if (ep.p.toLowerCase().includes(query)) return true;
  if (ep.id && ep.id.toLowerCase().includes(query)) return true;
  if (ep.s && ep.s.toLowerCase().includes(query)) return true;
  if (ep.t) {
    for (const tag of ep.t) {
      if (tag.toLowerCase().includes(query)) return true;
    }
  }
  return false;
}

// ─── Formatting ──────────────────────────────────────────────────

function formatEndpointLine(specName, ep) {
  let line = `[${specName}] ${ep.m} ${ep.p}`;
  if (ep.id) line += ` [${ep.id}]`;
  if (ep.s) line += ` ${ep.s}`;

  if (ep.params?.length) {
    line += ' | params:';
    for (let i = 0; i < ep.params.length; i++) {
      const p = ep.params[i];
      if (i > 0) line += ',';
      const pType = p.e ? `str(${p.e})` : p.t;
      line += ` ${p.n}(${p.in},${pType})`;
    }
  }

  if (ep.req) line += ` | req: ${ep.req}`;
  if (ep.res) line += ` | res: ${ep.res}`;

  return line;
}

function formatEndpointDetail(spec, ep) {
  const lines = [];
  lines.push(`${ep.m} ${ep.p}`);
  if (ep.id) lines.push(`  operationId: ${ep.id}`);
  if (ep.s) lines.push(`  summary: ${ep.s}`);
  if (ep.t?.length) lines.push(`  tags: ${ep.t.join(', ')}`);

  // Auth
  if (spec.auth?.length) {
    let authLine = '  auth:';
    for (const a of spec.auth) {
      authLine += ` ${a.name}(${a.type}`;
      if (a.scheme) authLine += `,${a.scheme}`;
      if (a.in) authLine += `,in:${a.in}`;
      authLine += ')';
    }
    lines.push(authLine);
  }

  // Parameters
  if (ep.params?.length) {
    lines.push('  params:');
    for (const p of ep.params) {
      let paramLine = `    ${p.n} (${expandIn(p.in)}, ${p.t})`;
      if (p.r) paramLine += ' *required';
      if (p.e) paramLine += ` enum:[${p.e}]`;
      lines.push(paramLine);
    }
  }

  // Request body with inlined schema
  if (ep.req) {
    lines.push(`  request: ${ep.req}`);
    const schemaName = unwrapArrayType(ep.req);
    if (spec.schemas?.[schemaName]) {
      lines.push(...writeSchemaFields(spec.schemas[schemaName]));
    }
  }

  // Response with inlined schema
  if (ep.res) {
    lines.push(`  response: ${ep.res}`);
    const schemaName = unwrapArrayType(ep.res);
    if (spec.schemas?.[schemaName]) {
      lines.push(...writeSchemaFields(spec.schemas[schemaName]));
    }
  }

  // Error responses
  if (ep.err?.length) {
    lines.push(`  errors: ${ep.err.join(', ')}`);
  }

  return lines.join('\n');
}

function writeSchemaFields(schema) {
  const lines = ['    fields:'];
  for (const [field, typ] of Object.entries(schema)) {
    lines.push(`      ${field}: ${typ}`);
  }
  return lines;
}

function unwrapArrayType(typeName) {
  if (typeName.startsWith('arr[') && typeName.endsWith(']')) {
    return typeName.slice(4, -1);
  }
  return typeName;
}

function expandIn(abbr) {
  switch (abbr) {
    case 'q': return 'query';
    case 'p': return 'path';
    case 'h': return 'header';
    case 'c': return 'cookie';
    default: return abbr;
  }
}
