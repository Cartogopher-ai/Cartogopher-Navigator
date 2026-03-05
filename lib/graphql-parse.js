// @cartogopher/navigator — GraphQL schema parsing
// Port of internal/gqlnav/parse.go
// Handles both introspection JSON and SDL text formats

const SLUGIFY_RE = /[^a-zA-Z0-9]+/g;

// SDL block-level regexes
const SDL_SCHEMA_BLOCK_RE = /^schema\s*\{/;
const SDL_TYPE_RE = /^(?:extend\s+)?type\s+(\w+)(?:\s+implements\s+([\w\s&,]+))?\s*\{/;
const SDL_INPUT_RE = /^input\s+(\w+)\s*\{/;
const SDL_IFACE_RE = /^interface\s+(\w+)(?:\s+implements\s+([\w\s&,]+))?\s*\{/;
const SDL_ENUM_RE = /^enum\s+(\w+)\s*\{/;
const SDL_UNION_RE = /^union\s+(\w+)\s*=\s*(.*)/;
const SDL_SCALAR_RE = /^scalar\s+(\w+)/;
const SDL_DIRECTIVE_RE = /^directive\s+@(\w+)(?:\s*\(([^)]*)\))?\s+on\s+(.+)/;
const SDL_ARG_RE = /(\w+)\s*:\s*([\w!\[\]]+)(?:\s*=\s*("[^"]*"|[^\s,)]+))?/g;

/**
 * Parse fetched GraphQL data into a compact ParsedSchema.
 * @param {string} data - Raw data
 * @param {'introspection'|'sdl'} format
 * @param {string} sourceURL
 * @param {string} [nameOverride]
 * @returns {import('./types.js').GqlParsedSchema}
 */
export function parseSchema(data, format, sourceURL, nameOverride) {
  if (format === 'introspection') {
    return parseIntrospection(data, sourceURL, nameOverride);
  }
  if (format === 'sdl') {
    return parseSDL(data, sourceURL, nameOverride);
  }
  throw new Error(`Unknown format: ${format}`);
}

// ─── Introspection JSON parsing ──────────────────────────────────

function parseIntrospection(data, sourceURL, nameOverride) {
  const resp = typeof data === 'string' ? JSON.parse(data) : data;
  const schema = resp.data.__schema;
  const name = nameOverride || slugify(sourceURL);

  const parsed = {
    name,
    source_url: sourceURL,
    fetched_at: new Date().toISOString(),
    method: 'introspection',
    type_count: 0,
    input_count: 0,
    enum_count: 0,
    query_count: 0,
    mutation_count: 0,
    subscription_count: 0,
    types: [],
    inputs: [],
    ifaces: [],
    unions: [],
    enums: [],
    scalars: [],
    queries: [],
    mutations: [],
    subscriptions: [],
    directives: [],
  };

  const queryTypeName = schema.queryType?.name || 'Query';
  const mutationTypeName = schema.mutationType?.name || 'Mutation';
  const subscriptionTypeName = schema.subscriptionType?.name || 'Subscription';

  for (const t of schema.types) {
    // Skip built-in types
    if (t.name.startsWith('__')) continue;

    switch (t.kind) {
      case 'OBJECT':
        if (t.name === queryTypeName) {
          parsed.queries = convertFields(t.fields);
        } else if (t.name === mutationTypeName) {
          parsed.mutations = convertFields(t.fields);
        } else if (t.name === subscriptionTypeName) {
          parsed.subscriptions = convertFields(t.fields);
        } else {
          const ct = { n: t.name, f: convertFields(t.fields) };
          if (t.description) ct.d = truncDesc(t.description);
          if (t.interfaces?.length) ct.impl = t.interfaces.map(i => i.name);
          parsed.types.push(ct);
        }
        break;

      case 'INPUT_OBJECT':
        parsed.inputs.push({
          n: t.name,
          f: convertInputFields(t.inputFields),
          ...(t.description ? { d: truncDesc(t.description) } : {}),
        });
        break;

      case 'INTERFACE':
        parsed.ifaces.push({
          n: t.name,
          f: convertFields(t.fields),
          ...(t.description ? { d: truncDesc(t.description) } : {}),
        });
        break;

      case 'UNION': {
        const types = (t.possibleTypes || []).map(pt => pt.name);
        parsed.unions.push({
          n: t.name,
          t: types,
          ...(t.description ? { d: truncDesc(t.description) } : {}),
        });
        break;
      }

      case 'ENUM':
        // Skip built-in scalars
        if (['Boolean', 'String', 'Int', 'Float', 'ID'].includes(t.name)) continue;
        parsed.enums.push({
          n: t.name,
          v: (t.enumValues || []).map(ev => ev.name),
          ...(t.description ? { d: truncDesc(t.description) } : {}),
        });
        break;

      case 'SCALAR':
        if (['Boolean', 'String', 'Int', 'Float', 'ID'].includes(t.name)) continue;
        parsed.scalars.push(t.name);
        break;
    }
  }

  // Parse directives (skip built-in)
  const builtinDirectives = new Set(['skip', 'include', 'deprecated', 'specifiedBy']);
  for (const d of (schema.directives || [])) {
    if (builtinDirectives.has(d.name)) continue;
    const cd = { n: d.name, loc: d.locations };
    if (d.args?.length) {
      cd.a = d.args.map(a => ({
        n: a.name,
        t: resolveTypeRef(a.type),
      }));
    }
    parsed.directives.push(cd);
  }

  updateCounts(parsed);
  return JSON.parse(JSON.stringify(parsed)); // clean undefineds
}

function convertFields(fields) {
  if (!fields) return [];
  return fields.map(f => {
    const cf = { n: f.name, t: resolveTypeRef(f.type) };
    if (f.description) cf.d = truncDesc(f.description);
    if (f.isDeprecated) cf.dep = true;
    if (f.args?.length) {
      cf.a = f.args.map(a => {
        const ca = { n: a.name, t: resolveTypeRef(a.type) };
        if (a.defaultValue != null) ca.def = a.defaultValue;
        return ca;
      });
    }
    return cf;
  });
}

function convertInputFields(fields) {
  if (!fields) return [];
  return fields.map(f => {
    const cf = { n: f.name, t: resolveTypeRef(f.type) };
    if (f.description) cf.d = truncDesc(f.description);
    if (f.defaultValue != null) cf.def = f.defaultValue;
    return cf;
  });
}

function resolveTypeRef(ref, depth = 0) {
  if (!ref || depth > 10) return '...';

  switch (ref.kind) {
    case 'NON_NULL':
      return ref.ofType ? resolveTypeRef(ref.ofType, depth + 1) + '!' : '!';
    case 'LIST':
      return ref.ofType ? '[' + resolveTypeRef(ref.ofType, depth + 1) + ']' : '[]';
    default:
      return ref.name || 'Unknown';
  }
}

// ─── SDL parsing ─────────────────────────────────────────────────

function parseSDL(data, sourceURL, nameOverride) {
  const content = typeof data === 'string' ? data : data.toString();
  const name = nameOverride || slugify(sourceURL);

  const parsed = {
    name,
    source_url: sourceURL,
    fetched_at: new Date().toISOString(),
    method: 'sdl',
    type_count: 0,
    input_count: 0,
    enum_count: 0,
    query_count: 0,
    mutation_count: 0,
    subscription_count: 0,
    types: [],
    inputs: [],
    ifaces: [],
    unions: [],
    enums: [],
    scalars: [],
    queries: [],
    mutations: [],
    subscriptions: [],
    directives: [],
  };

  const cleaned = stripGraphQLComments(content);
  const lines = cleaned.split('\n');
  const origLines = content.split('\n');

  // First pass: detect custom root type names from schema{} block
  const rootNames = parseSchemaBlock(lines);

  // Second pass: parse all blocks
  parseSDLBlocks(lines, origLines, parsed, rootNames);

  updateCounts(parsed);
  return JSON.parse(JSON.stringify(parsed));
}

function parseSchemaBlock(lines) {
  const names = { Query: 'Query', Mutation: 'Mutation', Subscription: 'Subscription' };
  const rootFieldRe = /^\s*(query|mutation|subscription)\s*:\s*(\w+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (SDL_SCHEMA_BLOCK_RE.test(line)) {
      let depth = 1;
      for (let j = i + 1; j < lines.length && depth > 0; j++) {
        const inner = lines[j].trim();
        depth += countChar(inner, '{') - countChar(inner, '}');
        const m = rootFieldRe.exec(inner);
        if (m) {
          if (m[1] === 'query') names.Query = m[2];
          else if (m[1] === 'mutation') names.Mutation = m[2];
          else if (m[1] === 'subscription') names.Subscription = m[2];
        }
      }
      break;
    }
  }
  return names;
}

function parseSDLBlocks(lines, origLines, parsed, rootNames) {
  const typeIndex = new Map(); // name -> index into parsed.types

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip schema block
    if (SDL_SCHEMA_BLOCK_RE.test(line)) {
      i = skipBlock(lines, i);
      continue;
    }

    // Scalar
    let m = SDL_SCALAR_RE.exec(line);
    if (m) {
      parsed.scalars.push(m[1]);
      continue;
    }

    // Union (supports multi-line)
    m = SDL_UNION_RE.exec(line);
    if (m) {
      let typesStr = m[2];
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next || next === '}') break;
        if (next.startsWith('|') || isUnionContinuation(next)) {
          typesStr += ' ' + next;
          i = j;
        } else {
          break;
        }
      }
      typesStr = typesStr.replace(/\|/g, ' ');
      const types = typesStr.split(/\s+/).filter(Boolean);
      parsed.unions.push({
        n: m[1],
        t: types,
        ...(getSDLDescription(origLines, i) ? { d: getSDLDescription(origLines, i) } : {}),
      });
      continue;
    }

    // Directive
    m = SDL_DIRECTIVE_RE.exec(line);
    if (m) {
      const d = { n: m[1], loc: m[3].split('|').map(s => s.trim()).filter(Boolean) };
      if (m[2]) d.a = parseSDLArgs(m[2]);
      parsed.directives.push(d);
      continue;
    }

    // Type (includes root types and extend type)
    m = SDL_TYPE_RE.exec(line);
    if (m) {
      const typeName = m[1];
      const isExtend = line.startsWith('extend ');
      let impl = [];
      if (m[2]) {
        impl = m[2].split('&').map(s => s.replace(',', '').trim()).filter(Boolean);
      }
      const fields = extractSDLBlockFields(lines, origLines, i);

      if (typeName === rootNames.Query) {
        parsed.queries = isExtend ? [...parsed.queries, ...fields] : fields;
      } else if (typeName === rootNames.Mutation) {
        parsed.mutations = isExtend ? [...parsed.mutations, ...fields] : fields;
      } else if (typeName === rootNames.Subscription) {
        parsed.subscriptions = isExtend ? [...parsed.subscriptions, ...fields] : fields;
      } else {
        if (isExtend && typeIndex.has(typeName)) {
          const idx = typeIndex.get(typeName);
          parsed.types[idx].f = [...(parsed.types[idx].f || []), ...fields];
          if (impl.length) {
            parsed.types[idx].impl = [...(parsed.types[idx].impl || []), ...impl];
          }
        } else {
          typeIndex.set(typeName, parsed.types.length);
          const ct = { n: typeName, f: fields };
          if (impl.length) ct.impl = impl;
          const desc = getSDLDescription(origLines, i);
          if (desc) ct.d = desc;
          parsed.types.push(ct);
        }
      }
      i = skipBlock(lines, i);
      continue;
    }

    // Input
    m = SDL_INPUT_RE.exec(line);
    if (m) {
      const ct = { n: m[1], f: extractSDLBlockFields(lines, origLines, i) };
      const desc = getSDLDescription(origLines, i);
      if (desc) ct.d = desc;
      parsed.inputs.push(ct);
      i = skipBlock(lines, i);
      continue;
    }

    // Interface
    m = SDL_IFACE_RE.exec(line);
    if (m) {
      let impl = [];
      if (m[2]) {
        impl = m[2].split('&').map(s => s.replace(',', '').trim()).filter(Boolean);
      }
      const ct = { n: m[1], f: extractSDLBlockFields(lines, origLines, i) };
      if (impl.length) ct.impl = impl;
      const desc = getSDLDescription(origLines, i);
      if (desc) ct.d = desc;
      parsed.ifaces.push(ct);
      i = skipBlock(lines, i);
      continue;
    }

    // Enum
    m = SDL_ENUM_RE.exec(line);
    if (m) {
      const en = { n: m[1], v: [] };
      const desc = getSDLDescription(origLines, i);
      if (desc) en.d = desc;

      let depth = 1;
      for (let j = i + 1; j < lines.length && depth > 0; j++) {
        const inner = lines[j].trim();
        depth += countChar(inner, '{') - countChar(inner, '}');
        if (depth > 0 && inner) {
          const val = inner.split(/\s/)[0];
          if (val && val !== '}' && !val.startsWith('#') && !val.startsWith('"')) {
            en.v.push(val);
          }
        }
        if (depth === 0) i = j;
      }
      parsed.enums.push(en);
      continue;
    }
  }
}

function extractSDLBlockFields(lines, origLines, startIdx) {
  const fields = [];
  let depth = 1;

  for (let j = startIdx + 1; j < lines.length && depth > 0; j++) {
    const inner = lines[j].trim();
    depth += countChar(inner, '{') - countChar(inner, '}');

    if (depth <= 0 || !inner || inner === '}') continue;

    // Extract field name
    let fieldName = '';
    for (const ch of inner) {
      if (ch === '(' || ch === ':' || ch === ' ') break;
      fieldName += ch;
    }
    if (!fieldName || !isIdentifier(fieldName)) continue;

    // Collect full field text (may span multiple lines for multi-line args)
    let fullText = inner;
    if (inner.includes('(') && !inner.includes(')')) {
      let parenDepth = countChar(inner, '(') - countChar(inner, ')');
      for (let k = j + 1; k < lines.length && parenDepth > 0; k++) {
        const nextLine = lines[k].trim();
        parenDepth += countChar(nextLine, '(') - countChar(nextLine, ')');
        fullText += ' ' + nextLine;
        depth += countChar(nextLine, '{') - countChar(nextLine, '}');
        j = k;
      }
    }

    const cf = parseFieldText(fullText, origLines, j);
    if (cf) fields.push(cf);
  }
  return fields;
}

function parseFieldText(text, origLines, lineIdx) {
  const nameEnd = text.search(/[(: ]/);
  if (nameEnd < 0) return null;

  const name = text.slice(0, nameEnd);
  if (!isIdentifier(name)) return null;

  let rest = text.slice(nameEnd).trim();
  const cf = { n: name, t: '' };

  // Get description
  const desc = getSDLFieldDescription(origLines, lineIdx);
  if (desc) cf.d = desc;

  // Extract args if present
  if (rest.startsWith('(')) {
    let parenDepth = 0;
    let closeIdx = -1;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '(') parenDepth++;
      else if (rest[i] === ')') {
        parenDepth--;
        if (parenDepth === 0) { closeIdx = i; break; }
      }
    }
    if (closeIdx > 0) {
      const argsStr = rest.slice(1, closeIdx);
      cf.a = parseSDLArgs(argsStr);
      rest = rest.slice(closeIdx + 1).trim();
    }
  }

  // Should start with ":"
  if (!rest.startsWith(':')) return null;
  rest = rest.slice(1).trim();

  // Extract type (everything up to @ or end)
  let typeStr = rest;
  const atIdx = typeStr.indexOf('@');
  if (atIdx >= 0) {
    const dirText = typeStr.slice(atIdx);
    typeStr = typeStr.slice(0, atIdx).trim();
    if (dirText.includes('deprecated')) cf.dep = true;
  }
  cf.t = typeStr.trim();
  if (!cf.t) return null;

  return cf;
}

function parseSDLArgs(argsStr) {
  const args = [];
  const re = new RegExp(SDL_ARG_RE.source, 'g');
  let m;
  while ((m = re.exec(argsStr)) !== null) {
    const a = { n: m[1], t: m[2] };
    if (m[3]) a.def = m[3].replace(/^"|"$/g, '');
    args.push(a);
  }
  return args;
}

function isIdentifier(s) {
  if (!s) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (i === 0) {
      if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95)) return false;
    } else {
      if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95)) return false;
    }
  }
  return true;
}

function skipBlock(lines, startIdx) {
  let depth = 1;
  for (let j = startIdx + 1; j < lines.length && depth > 0; j++) {
    const inner = lines[j].trim();
    depth += countChar(inner, '{') - countChar(inner, '}');
    if (depth === 0) return j;
  }
  return startIdx;
}

function stripGraphQLComments(content) {
  const result = [];
  let inTripleQuote = false;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    const tripleCount = (trimmed.match(/"""/g) || []).length;
    if (tripleCount % 2 === 1) inTripleQuote = !inTripleQuote;

    if (inTripleQuote) {
      result.push(line);
      continue;
    }

    let inString = false;
    let cleaned = line;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') inString = !inString;
      if (line[i] === '#' && !inString) {
        cleaned = line.slice(0, i);
        break;
      }
    }
    result.push(cleaned);
  }
  return result.join('\n');
}

function getSDLDescription(origLines, lineIdx) {
  if (lineIdx <= 0 || lineIdx >= origLines.length) return '';

  let checkIdx = lineIdx - 1;
  while (checkIdx >= 0 && origLines[checkIdx].trim() === '') checkIdx--;
  if (checkIdx < 0) return '';

  const prev = origLines[checkIdx].trim();

  // Triple-quoted description block
  if (prev.endsWith('"""')) {
    const parts = [];
    for (let j = checkIdx; j >= 0; j--) {
      const l = origLines[j].trim();
      if (l.startsWith('"""')) {
        if (j === checkIdx) {
          // Single line: """text"""
          const inner = l.slice(3, -3);
          return truncDesc(inner.trim());
        }
        const inner = l.slice(3);
        if (inner.trim()) parts.unshift(inner.trim());
        break;
      }
      if (j === checkIdx) {
        parts.unshift(l.slice(0, -3).trim());
      } else {
        parts.unshift(l.trim());
      }
    }
    return truncDesc(parts.join(' ').trim());
  }

  // Single-line quoted description
  if (prev.startsWith('"') && prev.endsWith('"') && prev.length > 1) {
    return truncDesc(prev.slice(1, -1));
  }

  // Comment-style description
  if (prev.startsWith('#')) {
    return truncDesc(prev.slice(1).trim());
  }

  return '';
}

function getSDLFieldDescription(origLines, lineIdx) {
  if (lineIdx <= 0 || lineIdx >= origLines.length) return '';
  const prev = origLines[lineIdx - 1]?.trim() || '';

  if (prev.startsWith('#')) return truncDesc(prev.slice(1).trim());
  if (prev.startsWith('"') && prev.endsWith('"') && prev.length > 1) return truncDesc(prev.slice(1, -1));
  if (prev.endsWith('"""')) return getSDLDescription(origLines, lineIdx);
  return '';
}

function isUnionContinuation(next) {
  return next.startsWith('|') || (
    !next.includes('{') && !next.includes(':') &&
    !next.startsWith('type ') && !next.startsWith('input ') &&
    !next.startsWith('enum ') && !next.startsWith('scalar ') &&
    !next.startsWith('union ') && !next.startsWith('interface ') &&
    !next.startsWith('directive ') && !next.startsWith('#') &&
    !next.startsWith('"') && !next.startsWith('extend ') &&
    !next.startsWith('schema ')
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function updateCounts(parsed) {
  parsed.type_count = parsed.types.length;
  parsed.input_count = parsed.inputs.length;
  parsed.enum_count = parsed.enums.length;
  parsed.query_count = parsed.queries.length;
  parsed.mutation_count = parsed.mutations.length;
  parsed.subscription_count = parsed.subscriptions.length;
}

function slugify(s) {
  s = s.replace(/^https?:\/\//, '').replace(/^file:\/\//, '');
  s = s.replace(/\/graphql$/, '').replace(/\/$/, '');
  s = s.replace(/\.graphql$/, '').replace(/\.gql$/, '');
  s = s.replace(SLUGIFY_RE, '-').replace(/^-|-$/g, '').toLowerCase();
  if (!s) s = 'unknown-api';
  if (s.length > 60) s = s.slice(0, 60);
  return s;
}

function truncDesc(s) {
  s = (s || '').trim();
  return s.length > 120 ? s.slice(0, 117) + '...' : s;
}

function countChar(str, ch) {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === ch) count++;
  }
  return count;
}
