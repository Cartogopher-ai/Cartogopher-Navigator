// @cartogopher/navigator — GraphQL query/formatting
// Port of internal/gqlnav/query.go

import { loadGqlManifest, loadSchema, loadAllSchemas } from './store.js';

/**
 * List all fetched GraphQL schemas.
 */
export async function list() {
  const manifest = await loadGqlManifest();
  if (!manifest.specs.length) {
    return 'No GraphQL schemas fetched.\nUse gqlnav_fetch to add one.';
  }

  const lines = [`graphql_schemas: ${manifest.specs.length}\n`];
  for (const entry of manifest.specs) {
    lines.push(`  ${entry.name}  types=${entry.types} queries=${entry.queries} mutations=${entry.mutations}  fetched=${entry.fetched_at?.slice(0, 10) || '?'}`);
    lines.push(`    url: ${entry.url}`);
  }
  return lines.join('\n');
}

/**
 * Get high-level overview of a specific schema.
 */
export async function summary(specName) {
  let schema;
  try {
    schema = await loadSchema(specName);
  } catch (e) {
    return e.message;
  }

  const lines = [];
  lines.push(`=== ${schema.name} ===`);
  lines.push(`url: ${schema.source_url}`);
  lines.push(`method: ${schema.method} | fetched: ${schema.fetched_at?.slice(0, 16) || '?'}\n`);

  lines.push(`types: ${schema.type_count}  inputs: ${schema.input_count}  enums: ${schema.enum_count}  interfaces: ${(schema.ifaces || []).length}  unions: ${(schema.unions || []).length}  scalars: ${(schema.scalars || []).length}`);
  lines.push(`queries: ${schema.query_count}  mutations: ${schema.mutation_count}  subscriptions: ${schema.subscription_count}\n`);

  // Main entity types (types with 3+ fields, sorted by field count descending)
  const types = schema.types || [];
  if (types.length > 0) {
    const stats = types
      .filter(t => (t.f || []).length >= 3)
      .map(t => ({ name: t.n, fields: (t.f || []).length }))
      .sort((a, b) => b.fields - a.fields);

    if (stats.length > 0) {
      lines.push('main types:');
      const limit = Math.min(15, stats.length);
      for (let i = 0; i < limit; i++) {
        lines.push(`  ${stats[i].name} (${stats[i].fields} fields)`);
      }
      if (stats.length > limit) {
        lines.push(`  ... and ${stats.length - limit} more`);
      }
      lines.push('');
    }
  }

  // Queries
  if (schema.queries?.length) {
    lines.push('queries:');
    for (const q of schema.queries) {
      const argInfo = q.a?.length ? ` (${q.a.length} args)` : '';
      lines.push(`  ${q.n}: ${q.t}${argInfo}`);
    }
    lines.push('');
  }

  // Mutations
  if (schema.mutations?.length) {
    lines.push('mutations:');
    for (const m of schema.mutations) {
      const argInfo = m.a?.length ? ` (${m.a.length} args)` : '';
      lines.push(`  ${m.n}: ${m.t}${argInfo}`);
    }
    lines.push('');
  }

  // Subscriptions
  if (schema.subscriptions?.length) {
    lines.push('subscriptions:');
    for (const s of schema.subscriptions) {
      lines.push(`  ${s.n}: ${s.t}`);
    }
    lines.push('');
  }

  // Enums
  if (schema.enums?.length) {
    lines.push('enums:');
    for (const e of schema.enums) {
      lines.push(`  ${e.n} [${(e.v || []).join(', ')}]`);
    }
  }

  return lines.join('\n');
}

/**
 * Search across all fetched schemas.
 */
export async function search({ query, spec: specName, kind = 'all', limit = 20 }) {
  let schemas;
  if (specName) {
    try {
      schemas = [await loadSchema(specName)];
    } catch (e) {
      return e.message;
    }
  } else {
    schemas = await loadAllSchemas();
    if (!schemas.length) {
      return 'No GraphQL schemas fetched.\nUse gqlnav_fetch to add one.';
    }
  }

  const q = query.toLowerCase();
  kind = kind.toLowerCase();
  const lines = [];
  let count = 0;

  for (const s of schemas) {
    const prefix = schemas.length > 1 ? `[${s.name}] ` : '';

    // Search types
    if ((kind === 'all' || kind === 'type') && count < limit) {
      for (const t of (s.types || [])) {
        if (count >= limit) break;
        if (matchesQuery(q, t.n, t.d, fieldsToString(t.f))) {
          let line = `${prefix}type ${t.n} (${(t.f || []).length} fields)`;
          if (t.impl?.length) line += ' implements ' + t.impl.join(' & ');
          if (t.d) line += ' | ' + t.d;
          lines.push(line);
          count++;
        }
      }
    }

    // Search input types
    if ((kind === 'all' || kind === 'input') && count < limit) {
      for (const t of (s.inputs || [])) {
        if (count >= limit) break;
        if (matchesQuery(q, t.n, t.d, fieldsToString(t.f))) {
          let line = `${prefix}input ${t.n} (${(t.f || []).length} fields)`;
          if (t.d) line += ' | ' + t.d;
          lines.push(line);
          count++;
        }
      }
    }

    // Search enums
    if ((kind === 'all' || kind === 'enum') && count < limit) {
      for (const e of (s.enums || [])) {
        if (count >= limit) break;
        if (matchesQuery(q, e.n, e.d, (e.v || []).join(' '))) {
          let line = `${prefix}enum ${e.n} [${(e.v || []).join(', ')}]`;
          if (e.d) line += ' | ' + e.d;
          lines.push(line);
          count++;
        }
      }
    }

    // Search interfaces
    if ((kind === 'all' || kind === 'interface') && count < limit) {
      for (const t of (s.ifaces || [])) {
        if (count >= limit) break;
        if (matchesQuery(q, t.n, t.d, fieldsToString(t.f))) {
          lines.push(`${prefix}interface ${t.n} (${(t.f || []).length} fields)`);
          count++;
        }
      }
    }

    // Search unions
    if ((kind === 'all' || kind === 'union') && count < limit) {
      for (const u of (s.unions || [])) {
        if (count >= limit) break;
        if (matchesQuery(q, u.n, u.d, (u.t || []).join(' '))) {
          lines.push(`${prefix}union ${u.n} = ${(u.t || []).join(' | ')}`);
          count++;
        }
      }
    }

    // Search queries
    if ((kind === 'all' || kind === 'query') && count < limit) {
      for (const op of (s.queries || [])) {
        if (count >= limit) break;
        if (matchesQuery(q, op.n, op.d, op.t)) {
          let line = `${prefix}query ${op.n}: ${op.t}`;
          if (op.a?.length) line += ` (${op.a.length} args)`;
          if (op.d) line += ' | ' + op.d;
          lines.push(line);
          count++;
        }
      }
    }

    // Search mutations
    if ((kind === 'all' || kind === 'mutation') && count < limit) {
      for (const op of (s.mutations || [])) {
        if (count >= limit) break;
        if (matchesQuery(q, op.n, op.d, op.t)) {
          let line = `${prefix}mutation ${op.n}: ${op.t}`;
          if (op.a?.length) line += ` (${op.a.length} args)`;
          if (op.d) line += ' | ' + op.d;
          lines.push(line);
          count++;
        }
      }
    }

    // Search subscriptions
    if ((kind === 'all' || kind === 'subscription') && count < limit) {
      for (const op of (s.subscriptions || [])) {
        if (count >= limit) break;
        if (matchesQuery(q, op.n, op.d, op.t)) {
          let line = `${prefix}subscription ${op.n}: ${op.t}`;
          if (op.a?.length) line += ` (${op.a.length} args)`;
          lines.push(line);
          count++;
        }
      }
    }
  }

  if (count === 0) return `No results for '${query}'`;
  if (count >= limit) lines.push(`\n(showing first ${limit} results, use limit param to see more)`);
  return lines.join('\n');
}

/**
 * Get detailed view of a specific type/input/enum/query/mutation.
 */
export async function typeDetail({ spec: specName, name }) {
  let schema;
  try {
    schema = await loadSchema(specName);
  } catch (e) {
    return e.message;
  }

  const nameLower = name.toLowerCase();
  const lines = [];

  // Search types
  for (const t of (schema.types || [])) {
    if (t.n.toLowerCase() === nameLower) {
      let header = `type ${t.n}`;
      if (t.impl?.length) header += ' implements ' + t.impl.join(' & ');
      lines.push(header);
      if (t.d) lines.push(`  # ${t.d}`);
      writeFields(lines, t.f, schema);
      return lines.join('\n');
    }
  }

  // Search input types
  for (const t of (schema.inputs || [])) {
    if (t.n.toLowerCase() === nameLower) {
      lines.push(`input ${t.n}`);
      if (t.d) lines.push(`  # ${t.d}`);
      writeInputFields(lines, t.f, schema);
      return lines.join('\n');
    }
  }

  // Search interfaces
  for (const t of (schema.ifaces || [])) {
    if (t.n.toLowerCase() === nameLower) {
      let header = `interface ${t.n}`;
      if (t.impl?.length) header += ' implements ' + t.impl.join(' & ');
      lines.push(header);
      if (t.d) lines.push(`  # ${t.d}`);
      writeFields(lines, t.f, schema);

      // Show implementing types
      const implementors = (schema.types || [])
        .filter(impl => impl.impl?.some(i => i.toLowerCase() === nameLower))
        .map(impl => impl.n);
      if (implementors.length) {
        lines.push(`\n  implemented by: ${implementors.join(', ')}`);
      }
      return lines.join('\n');
    }
  }

  // Search enums
  for (const e of (schema.enums || [])) {
    if (e.n.toLowerCase() === nameLower) {
      lines.push(`enum ${e.n}`);
      if (e.d) lines.push(`  # ${e.d}`);
      for (const v of (e.v || [])) lines.push(`  ${v}`);
      return lines.join('\n');
    }
  }

  // Search unions
  for (const u of (schema.unions || [])) {
    if (u.n.toLowerCase() === nameLower) {
      lines.push(`union ${u.n} = ${(u.t || []).join(' | ')}`);
      if (u.d) lines.push(`  # ${u.d}`);
      // Inline each variant type's fields
      for (const memberName of (u.t || [])) {
        const t = findType(schema, memberName);
        if (t) {
          lines.push(`\n  --- ${t.n} ---`);
          for (const f of (t.f || [])) {
            lines.push(`    ${f.n}: ${f.t}`);
          }
        }
      }
      return lines.join('\n');
    }
  }

  // Search queries
  for (const q of (schema.queries || [])) {
    if (q.n.toLowerCase() === nameLower) {
      writeOperationDetail(lines, 'query', q, schema);
      return lines.join('\n');
    }
  }

  // Search mutations
  for (const m of (schema.mutations || [])) {
    if (m.n.toLowerCase() === nameLower) {
      writeOperationDetail(lines, 'mutation', m, schema);
      return lines.join('\n');
    }
  }

  // Search subscriptions
  for (const sub of (schema.subscriptions || [])) {
    if (sub.n.toLowerCase() === nameLower) {
      writeOperationDetail(lines, 'subscription', sub, schema);
      return lines.join('\n');
    }
  }

  return `Type '${name}' not found in schema '${specName}'.\nUse gqlnav_search to find available types.`;
}

// ─── Output helpers ──────────────────────────────────────────────

function writeFields(lines, fields, schema) {
  for (const f of (fields || [])) {
    let line = `  ${f.n}`;
    if (f.a?.length) line += writeArgsInline(f.a);
    line += `: ${f.t}`;
    if (f.def) line += ` = ${f.def}`;
    if (f.dep) line += ' @deprecated';
    if (f.d) line += `  # ${f.d}`;
    lines.push(line);
  }
}

function writeInputFields(lines, fields, schema) {
  for (const f of (fields || [])) {
    let line = `  ${f.n}: ${f.t}`;
    if (f.def) line += ` = ${f.def}`;
    if (f.d) line += `  # ${f.d}`;
    lines.push(line);
  }
}

function writeOperationDetail(lines, opKind, op, schema) {
  let header = `${opKind} ${op.n}`;
  if (op.a?.length) header += writeArgsInline(op.a);
  header += `: ${op.t}`;
  lines.push(header);
  if (op.d) lines.push(`  # ${op.d}`);

  // Write arg details
  if (op.a?.length) {
    lines.push('  args:');
    for (const a of op.a) {
      let line = `    ${a.n}: ${a.t}`;
      if (a.def) line += ` = ${a.def}`;
      lines.push(line);
    }

    // Inline input types used as args
    const inlined = new Set();
    for (const a of op.a) {
      const typeName = extractTypeName(a.t);
      if (!typeName || inlined.has(typeName)) continue;

      const inputType = findInputType(schema, typeName);
      if (inputType) {
        inlined.add(typeName);
        lines.push(`\n  --- input ${inputType.n} ---`);
        for (const f of (inputType.f || [])) {
          let line = `    ${f.n}: ${f.t}`;
          if (f.def) line += ` = ${f.def}`;
          lines.push(line);
        }
      }

      const enumType = findEnum(schema, typeName);
      if (enumType) {
        inlined.add(typeName);
        lines.push(`\n  --- enum ${enumType.n} ---`);
        lines.push(`    [${(enumType.v || []).join(', ')}]`);
      }
    }
  }

  // Inline return type
  writeInlinedType(lines, op.t, schema);
}

function writeArgsInline(args) {
  if (!args?.length) return '';
  const parts = args.map(a => {
    let s = `${a.n}: ${a.t}`;
    if (a.def) s += ` = ${a.def}`;
    return s;
  });
  return '(' + parts.join(', ') + ')';
}

function writeInlinedType(lines, typeStr, schema) {
  const typeName = extractTypeName(typeStr);
  if (!typeName) return;

  const t = findType(schema, typeName);
  if (t) {
    lines.push(`\n  --- ${t.n} fields ---`);
    for (const f of (t.f || [])) {
      lines.push(`    ${f.n}: ${f.t}`);
    }
    return;
  }

  const inputType = findInputType(schema, typeName);
  if (inputType) {
    lines.push(`\n  --- input ${inputType.n} ---`);
    for (const f of (inputType.f || [])) {
      let line = `    ${f.n}: ${f.t}`;
      if (f.def) line += ` = ${f.def}`;
      lines.push(line);
    }
  }
}

// ─── Lookup helpers ──────────────────────────────────────────────

function findType(schema, name) {
  return (schema.types || []).find(t => t.n === name) || null;
}

function findInputType(schema, name) {
  return (schema.inputs || []).find(t => t.n === name) || null;
}

function findEnum(schema, name) {
  return (schema.enums || []).find(e => e.n === name) || null;
}

function extractTypeName(typeStr) {
  let s = typeStr.replace(/!$/g, '').replace(/^\[/, '').replace(/]$/, '').replace(/!$/g, '').trim();
  if (['String', 'Int', 'Float', 'Boolean', 'ID'].includes(s)) return '';
  return s;
}

function matchesQuery(query, ...searchable) {
  for (const s of searchable) {
    if (s && s.toLowerCase().includes(query)) return true;
  }
  return false;
}

function fieldsToString(fields) {
  return (fields || []).map(f => `${f.n} ${f.t}`).join(' ');
}
