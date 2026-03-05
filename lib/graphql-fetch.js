// @cartogopher/navigator — GraphQL schema fetching
// Port of internal/gqlnav/fetch.go

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const USER_AGENT = 'CartoGopher-Navigator';
const MAX_BODY = 50 * 1024 * 1024; // 50MB
const FETCH_TIMEOUT = 30_000;

// Standard introspection query (matches Go version exactly)
const INTROSPECTION_QUERY = `{
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      kind
      name
      description
      fields(includeDeprecated: true) {
        name
        description
        isDeprecated
        deprecationReason
        args {
          name
          description
          type { ...TypeRef }
          defaultValue
        }
        type { ...TypeRef }
      }
      inputFields {
        name
        description
        type { ...TypeRef }
        defaultValue
      }
      interfaces {
        name
      }
      enumValues(includeDeprecated: true) {
        name
        description
        isDeprecated
      }
      possibleTypes {
        name
      }
    }
    directives {
      name
      description
      locations
      args {
        name
        description
        type { ...TypeRef }
        defaultValue
      }
    }
  }
}

fragment TypeRef on __Type {
  kind
  name
  ofType {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
        }
      }
    }
  }
}`;

const SDL_VALIDATION_RE = /(?:^|\n)(type|input|enum|interface|union|scalar|schema|extend|directive)\s+/;

/**
 * Fetch a GraphQL schema. Returns { data: string, format: 'sdl'|'introspection' }
 * @param {string} rawURL
 * @param {{ forceSDL?: boolean, headers?: string[] }} [opts]
 */
export async function fetchSchema(rawURL, opts = {}) {
  // Handle local files
  if (rawURL.startsWith('file://')) {
    return fetchLocalFile(rawURL.slice(7));
  }

  // Check bare file path
  if (!rawURL.startsWith('http://') && !rawURL.startsWith('https://')) {
    const lowerURL = rawURL.toLowerCase();
    if (rawURL.includes('/') && (lowerURL.endsWith('.graphql') || lowerURL.endsWith('.gql') || lowerURL.endsWith('.sdl'))) {
      if (existsSync(rawURL)) {
        return fetchLocalFile(rawURL);
      }
    }
    rawURL = 'https://' + rawURL;
  }

  const extraHeaders = parseHeaders(opts.headers || []);
  const lowerURL = rawURL.toLowerCase();

  // If URL looks like an SDL file, fetch as SDL
  if (opts.forceSDL || lowerURL.endsWith('.graphql') || lowerURL.endsWith('.gql') || lowerURL.endsWith('.sdl')) {
    return fetchSDL(rawURL, extraHeaders);
  }

  // Try introspection first
  try {
    return await fetchIntrospection(rawURL, extraHeaders);
  } catch (introErr) {
    // Fall back to SDL
    try {
      return await fetchSDL(rawURL, extraHeaders);
    } catch (sdlErr) {
      throw new Error(`Introspection failed: ${introErr.message}; SDL fetch failed: ${sdlErr.message}`);
    }
  }
}

async function fetchLocalFile(path) {
  const data = await readFile(path, 'utf8');
  if (!isValidSDL(data)) {
    throw new Error(`File ${path} does not look like a GraphQL SDL`);
  }
  return { data, format: 'sdl' };
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

async function fetchIntrospection(url, extraHeaders) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
        ...extraHeaders,
      },
      body: JSON.stringify({ query: INTROSPECTION_QUERY }),
    });

    if (resp.status !== 200) {
      throw new Error(`Introspection returned status ${resp.status}`);
    }

    const data = await resp.text();
    if (data.length > MAX_BODY) {
      throw new Error('Introspection response too large (>50MB)');
    }

    // Validate response
    const check = JSON.parse(data);
    if (check.errors?.length && (!check.data?.__schema?.types?.length)) {
      throw new Error('Introspection returned errors with no types');
    }
    if (!check.data?.__schema?.types?.length) {
      throw new Error('Introspection returned no types');
    }

    return { data, format: 'introspection' };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSDL(url, extraHeaders) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/plain, application/graphql, */*',
        'User-Agent': USER_AGENT,
        ...extraHeaders,
      },
    });

    if (resp.status !== 200) {
      throw new Error(`SDL fetch returned status ${resp.status}`);
    }

    const data = await resp.text();
    if (data.length > MAX_BODY) {
      throw new Error('SDL response too large (>50MB)');
    }

    if (!isValidSDL(data)) {
      throw new Error('Response does not look like a GraphQL SDL (no type/input/enum/schema keywords found)');
    }

    return { data, format: 'sdl' };
  } finally {
    clearTimeout(timer);
  }
}

function isValidSDL(content) {
  return SDL_VALIDATION_RE.test(content);
}
