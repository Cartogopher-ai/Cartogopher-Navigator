#!/usr/bin/env node
// @cartogopher/navigator — API Navigator MCP Server
// Standalone, free, pure Node.js — no Go binary required.
// Fetch, search, and query OpenAPI & GraphQL schemas with AI-optimized output.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { fetchSpec } from './lib/openapi-fetch.js';
import { parseSpec } from './lib/openapi-parse.js';
import * as openapiQuery from './lib/openapi-query.js';
import { saveSpec, deleteSpec, saveSchema, deleteSchema } from './lib/store.js';

import { fetchSchema } from './lib/graphql-fetch.js';
import { parseSchema } from './lib/graphql-parse.js';
import * as gqlQuery from './lib/graphql-query.js';

const server = new McpServer({
  name: '@cartogopher/navigator',
  version: '1.0.1',
});

// ─── OpenAPI Tools ───────────────────────────────────────────────

server.tool(
  'navigator_fetch',
  'Fetch and parse an OpenAPI spec by URL. Stores it locally for querying.',
  {
    url: z.string().describe('URL of the OpenAPI spec (JSON or YAML)'),
    name: z.string().optional().describe('Optional name override for the spec'),
    headers: z.array(z.string()).optional().describe('Extra headers in "Key: Value" format (e.g., "Authorization: Bearer token")'),
  },
  async ({ url, name, headers }) => {
    try {
      const { data, format } = await fetchSpec(url, { headers });
      const spec = parseSpec(data, format, url, name);
      await saveSpec(spec);
      return {
        content: [{
          type: 'text',
          text: `Fetched and parsed: ${spec.name}\n` +
                `  ${spec.endpoint_count} endpoints, ${spec.schema_count} schemas\n` +
                `  Version: ${spec.version || '?'} (OpenAPI ${spec.spec_version || '?'})\n` +
                (spec.auth?.length ? `  Auth: ${spec.auth.map(a => a.type).join(', ')}\n` : '') +
                (spec.base_url ? `  Base URL: ${spec.base_url}` : ''),
        }],
      };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }] };
    }
  }
);

server.tool(
  'navigator_list',
  'List all fetched external OpenAPI specs with stats',
  {},
  async () => {
    const result = await openapiQuery.list();
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'navigator_search',
  'Search endpoints across fetched OpenAPI specs',
  {
    query: z.string().describe('Search query (matches path, operationId, summary, tags)'),
    spec: z.string().optional().describe('Filter to specific spec name (optional)'),
    method: z.string().optional().describe('Filter by HTTP method (optional)'),
    limit: z.number().optional().describe('Maximum results (default: 20)'),
  },
  async ({ query, spec, method, limit }) => {
    const result = await openapiQuery.search({ query, spec, method, limit });
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'navigator_endpoint',
  'Get detailed view of one endpoint from a fetched OpenAPI spec, with inlined schema fields',
  {
    spec: z.string().describe('Spec name (from navigator_list)'),
    path: z.string().describe('Endpoint path (e.g., "/v1/charges")'),
    method: z.string().optional().describe('HTTP method filter (optional)'),
  },
  async ({ spec, path, method }) => {
    const result = await openapiQuery.endpointDetail({ spec, path, method });
    return { content: [{ type: 'text', text: result }] };
  }
);

// ─── GraphQL Tools ───────────────────────────────────────────────

server.tool(
  'gqlnav_fetch',
  'Fetch a GraphQL schema by URL (introspection or SDL). Stores it locally for querying.',
  {
    url: z.string().describe('URL of the GraphQL endpoint or SDL file'),
    name: z.string().optional().describe('Optional name override for the schema'),
    force_sdl: z.boolean().optional().describe('Skip introspection, fetch as SDL only'),
    headers: z.array(z.string()).optional().describe('Extra headers in "Key: Value" format (e.g., for auth)'),
  },
  async ({ url, name, force_sdl, headers }) => {
    try {
      const { data, format } = await fetchSchema(url, { forceSDL: force_sdl, headers });
      const schema = parseSchema(data, format, url, name);
      await saveSchema(schema);
      return {
        content: [{
          type: 'text',
          text: `Fetched and parsed: ${schema.name}\n` +
                `  Method: ${schema.method}\n` +
                `  Types: ${schema.type_count}  Inputs: ${schema.input_count}  Enums: ${schema.enum_count}\n` +
                `  Queries: ${schema.query_count}  Mutations: ${schema.mutation_count}  Subscriptions: ${schema.subscription_count}`,
        }],
      };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }] };
    }
  }
);

server.tool(
  'gqlnav_list',
  'List all fetched external GraphQL schemas with stats',
  {},
  async () => {
    const result = await gqlQuery.list();
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'gqlnav_search',
  'Search types, operations, and enums across fetched GraphQL schemas',
  {
    query: z.string().describe('Search query (matches type names, field names, descriptions)'),
    spec: z.string().optional().describe('Filter to specific schema name (optional)'),
    kind: z.string().optional().describe('Filter by kind: type, input, enum, query, mutation, subscription, all (default: all)'),
    limit: z.number().optional().describe('Maximum results (default: 20)'),
  },
  async ({ query, spec, kind, limit }) => {
    const result = await gqlQuery.search({ query, spec, kind, limit });
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'gqlnav_type',
  'Get detailed view of a type/input/enum/query/mutation from a fetched GraphQL schema, with inlined field types',
  {
    spec: z.string().describe('Schema name (from gqlnav_list)'),
    name: z.string().describe('Type, input, enum, query, or mutation name'),
  },
  async ({ spec, name }) => {
    const result = await gqlQuery.typeDetail({ spec, name });
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'gqlnav_summary',
  'Get high-level overview of a fetched GraphQL schema: main types, queries, mutations, enums',
  {
    spec: z.string().describe('Schema name (from gqlnav_list)'),
  },
  async ({ spec }) => {
    const result = await gqlQuery.summary(spec);
    return { content: [{ type: 'text', text: result }] };
  }
);

// ─── Delete Tools ────────────────────────────────────────────────

server.tool(
  'navigator_delete',
  'Delete a previously fetched OpenAPI spec from local storage',
  {
    spec: z.string().describe('Spec name to delete (from navigator_list)'),
  },
  async ({ spec }) => {
    try {
      await deleteSpec(spec);
      return { content: [{ type: 'text', text: `Deleted spec: ${spec}` }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }] };
    }
  }
);

server.tool(
  'gqlnav_delete',
  'Delete a previously fetched GraphQL schema from local storage',
  {
    spec: z.string().describe('Schema name to delete (from gqlnav_list)'),
  },
  async ({ spec }) => {
    try {
      await deleteSchema(spec);
      return { content: [{ type: 'text', text: `Deleted schema: ${spec}` }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }] };
    }
  }
);

// ─── Start server ────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
