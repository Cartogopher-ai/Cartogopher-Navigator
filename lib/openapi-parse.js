// @cartogopher/navigator — OpenAPI V3 parsing
// Port of internal/navigator/parse.go
// Instead of libopenapi (Go library), we walk the JSON/YAML structure directly.

import YAML from 'yaml';

const MAX_SCHEMA_FIELDS = 30;
const SLUG_RE = /[^a-z0-9]+/g;

/**
 * Parse raw OpenAPI spec text into a token-efficient ParsedSpec.
 * @param {string} data - Raw spec text
 * @param {string} format - 'json' or 'yaml'
 * @param {string} sourceURL - Where the spec was fetched from
 * @param {string} [nameOverride] - Optional name override
 * @returns {import('./types.js').ParsedSpec}
 */
export function parseSpec(data, format, sourceURL, nameOverride) {
  let doc;
  try {
    doc = format === 'json' ? JSON.parse(data) : YAML.parse(data);
  } catch (e) {
    throw new Error(`Failed to parse ${format}: ${e.message}`);
  }

  // Detect version
  const specVersion = doc.openapi || doc.swagger || '';
  if (doc.swagger) {
    throw new Error('Swagger 2.0 is not supported. Convert at https://converter.swagger.io');
  }
  if (!doc.openapi) {
    throw new Error('Not a valid OpenAPI 3.x document (missing "openapi" field)');
  }

  const spec = {
    name: nameOverride || slugify(doc.info?.title || '') || 'unknown-api',
    version: doc.info?.version || undefined,
    source_url: sourceURL,
    base_url: doc.servers?.[0]?.url || undefined,
    fetched_at: new Date().toISOString(),
    spec_version: specVersion || undefined,
    auth: extractAuthSchemes(doc),
    endpoint_count: 0,
    schema_count: 0,
    endpoints: [],
    schemas: {},
  };

  // Extract endpoints from paths
  if (doc.paths) {
    for (const [pathStr, pathItem] of Object.entries(doc.paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;
      spec.endpoints.push(...extractPathOps(pathStr, pathItem, doc));
    }
  }

  // Extract schemas from components
  if (doc.components?.schemas) {
    for (const [name, schema] of Object.entries(doc.components.schemas)) {
      if (!schema || typeof schema !== 'object') continue;
      const flat = flattenSchema(schema, doc);
      if (flat) spec.schemas[name] = flat;
    }
  }

  spec.endpoint_count = spec.endpoints.length;
  spec.schema_count = Object.keys(spec.schemas).length;

  // Clean undefined values for compact JSON
  return JSON.parse(JSON.stringify(spec));
}

function extractAuthSchemes(doc) {
  const secSchemes = doc.components?.securitySchemes;
  if (!secSchemes) return undefined;

  const schemes = [];
  for (const [name, ss] of Object.entries(secSchemes)) {
    if (!ss) continue;
    const scheme = { name, type: ss.type };
    if (ss.in) scheme.in = ss.in;
    if (ss.scheme) scheme.scheme = ss.scheme;
    schemes.push(scheme);
  }
  return schemes.length > 0 ? schemes : undefined;
}

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];

function extractPathOps(path, pathItem, doc) {
  const endpoints = [];
  // Path-level parameters
  const pathParams = pathItem.parameters || [];

  for (const method of HTTP_METHODS) {
    const op = pathItem[method];
    if (!op) continue;

    const ep = {
      m: method.toUpperCase(),
      p: path,
    };
    if (op.operationId) ep.id = op.operationId;
    if (op.summary) ep.s = op.summary;
    if (op.tags?.length) ep.t = op.tags;

    // Parameters (merge path-level + operation-level)
    const allParams = [...pathParams, ...(op.parameters || [])];
    if (allParams.length > 0) {
      ep.params = allParams
        .filter(p => p && typeof p === 'object')
        .map(p => resolveRef(p, doc))
        .filter(p => p.name)
        .map(p => {
          const cp = {
            n: p.name,
            in: abbreviateIn(p.in),
            t: p.schema ? simplifySchemaType(resolveRef(p.schema, doc), doc) : 'str',
          };
          if (p.required) cp.r = true;
          if (p.schema) {
            const resolved = resolveRef(p.schema, doc);
            const enumVal = extractEnumValues(resolved);
            if (enumVal) cp.e = enumVal;
          }
          return cp;
        });
    }

    // Request body
    if (op.requestBody) {
      const reqBody = resolveRef(op.requestBody, doc);
      ep.req = extractSchemaTypeName(reqBody.content, doc);
    }

    // Response (200, 201, 202, or default)
    if (op.responses) {
      for (const code of ['200', '201', '202']) {
        if (op.responses[code]) {
          const resp = resolveRef(op.responses[code], doc);
          ep.res = extractSchemaTypeName(resp.content, doc);
          if (ep.res) break;
        }
      }
      if (!ep.res && op.responses.default) {
        const resp = resolveRef(op.responses.default, doc);
        ep.res = extractSchemaTypeName(resp.content, doc);
      }
    }

    // Error responses
    if (op.responses) {
      const errs = [];
      for (const [code, respRef] of Object.entries(op.responses)) {
        if (code[0] !== '4' && code[0] !== '5') continue;
        const resp = resolveRef(respRef, doc);
        const typeName = extractSchemaTypeName(resp.content, doc);
        errs.push(typeName ? `${code}:${typeName}` : code);
      }
      if (errs.length > 0) ep.err = errs;
    }

    // Clean undefined values
    endpoints.push(JSON.parse(JSON.stringify(ep)));
  }
  return endpoints;
}

function extractSchemaTypeName(content, doc) {
  if (!content || typeof content !== 'object') return '';

  // Try application/json first, then first entry
  let schemaObj = content['application/json']?.schema;
  if (!schemaObj) {
    for (const mt of Object.values(content)) {
      if (mt?.schema) { schemaObj = mt.schema; break; }
    }
  }
  if (!schemaObj) return '';

  // Check for $ref
  if (schemaObj.$ref) return refToName(schemaObj.$ref);

  const resolved = resolveRef(schemaObj, doc);
  return schemaToTypeName(resolved, doc);
}

function schemaToTypeName(s, doc) {
  if (!s) return '';
  if (s.$ref) return refToName(s.$ref);

  const type = Array.isArray(s.type) ? s.type[0] : s.type;
  if (type === 'array') {
    if (s.items) {
      if (s.items.$ref) return 'arr[' + refToName(s.items.$ref) + ']';
      const inner = resolveRef(s.items, doc);
      return 'arr[' + schemaToType(inner, doc) + ']';
    }
    return 'arr[any]';
  }
  if (s.title) return s.title;
  if (s.properties && Object.keys(s.properties).length > 0) return 'obj';
  return '';
}

function simplifySchemaType(s, doc) {
  if (!s) return '';
  if (s.$ref) return refToName(s.$ref);

  return schemaToType(s, doc);
}

function schemaToType(s, doc) {
  if (!s) return '';
  if (s.$ref) return refToName(s.$ref);

  const type = Array.isArray(s.type) ? s.type[0] : s.type;

  if (!type) {
    if (s.allOf?.[0]) return simplifySchemaType(resolveRef(s.allOf[0], doc), doc);
    if (s.oneOf?.[0]) return simplifySchemaType(resolveRef(s.oneOf[0], doc), doc);
    if (s.anyOf?.[0]) return simplifySchemaType(resolveRef(s.anyOf[0], doc), doc);
    return 'obj';
  }

  switch (type) {
    case 'string': {
      const e = extractEnumValues(s);
      return e ? `str(${e})` : 'str';
    }
    case 'integer': return 'int';
    case 'number': return 'num';
    case 'boolean': return 'bool';
    case 'array': {
      let itemType = 'any';
      if (s.items) {
        const resolved = resolveRef(s.items, doc);
        itemType = simplifySchemaType(resolved, doc) || 'any';
      }
      return `arr[${itemType}]`;
    }
    case 'object': return 'obj';
    default: return type;
  }
}

function extractEnumValues(s) {
  if (!s?.enum?.length) return '';
  const vals = [];
  for (let i = 0; i < s.enum.length; i++) {
    if (i >= 8) {
      vals.push(`...${s.enum.length - 8} more`);
      break;
    }
    if (s.enum[i] != null) vals.push(String(s.enum[i]));
  }
  return vals.length > 0 ? vals.join('|') : '';
}

function flattenSchema(s, doc) {
  if (!s || typeof s !== 'object') return null;
  const resolved = resolveRef(s, doc);

  const result = {};

  // Handle allOf: merge all properties
  if (resolved.allOf?.length) {
    for (const sub of resolved.allOf) {
      const subResolved = resolveRef(sub, doc);
      const merged = flattenSchema(subResolved, doc);
      if (merged) Object.assign(result, merged);
    }
    if (Object.keys(result).length > 0) return truncateSchema(result);
  }

  // Extract properties
  if (resolved.properties) {
    for (const [name, prop] of Object.entries(resolved.properties)) {
      const propResolved = resolveRef(prop, doc);
      result[name] = simplifySchemaType(propResolved, doc) || 'any';
    }
  }

  return Object.keys(result).length > 0 ? truncateSchema(result) : null;
}

function truncateSchema(m) {
  const keys = Object.keys(m);
  if (keys.length <= MAX_SCHEMA_FIELDS + 20) return m;

  const result = {};
  let count = 0;
  for (const k of keys) {
    if (count >= MAX_SCHEMA_FIELDS) break;
    result[k] = m[k];
    count++;
  }
  result['...'] = `${keys.length - MAX_SCHEMA_FIELDS} more`;
  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────

function resolveRef(obj, doc) {
  if (!obj || typeof obj !== 'object' || !obj.$ref) return obj;
  const ref = obj.$ref;
  // Only handle local refs: #/components/schemas/Foo
  if (!ref.startsWith('#/')) return obj;

  const parts = ref.substring(2).split('/');
  let current = doc;
  for (const part of parts) {
    current = current?.[part];
    if (current === undefined) return obj; // ref not found, return original
  }
  return current || obj;
}

function refToName(ref) {
  if (!ref) return '';
  const parts = ref.split('/');
  return parts[parts.length - 1];
}

function abbreviateIn(location) {
  switch (location) {
    case 'query': return 'q';
    case 'path': return 'p';
    case 'header': return 'h';
    case 'cookie': return 'c';
    default: return location || '';
  }
}

function slugify(s) {
  if (!s) return '';
  return s.toLowerCase().replace(SLUG_RE, '-').replace(/^-|-$/g, '');
}
