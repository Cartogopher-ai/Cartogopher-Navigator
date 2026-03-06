# Cartogopher Navigator

[![npm version](https://img.shields.io/npm/v/cartogopher-navigator.svg)](https://www.npmjs.com/package/cartogopher-navigator)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

**External API Intelligence for AI agents** -- An MCP server that fetches, parses, and queries OpenAPI and GraphQL schemas, giving your AI assistant structured, token-efficient access to any external API.

> **Part of Cartogopher** -- This is a free, open-source module from [Cartogopher](https://cartogopher.com), a leading code intelligence tool built in Go and C that saves 40-80% on AI tokens. While the core Cartogopher platform provides deep codebase understanding and intelligent context retrieval, Navigator handles the external API side -- it grabs OpenAPI specs and GraphQL schemas so your AI agent can explore and understand third-party APIs without burning through your context window. This is a standalone Node.js port, available as an npm package for easy integration into any MCP-compatible workflow.

---

## Quick Start

### Install from npm

```bash
npx cartogopher-navigator
```

### Or clone from source

```bash
git clone https://github.com/Cartogopher-ai/Cartogopher-Navigator.git
cd Cartogopher-Navigator
npm install
node index.js
```

---

## Setup

### Claude Code

```bash
claude mcp add navigator -- npx cartogopher-navigator
```

Or from a local clone:

```bash
claude mcp add navigator -- node /path/to/Cartogopher-Navigator/index.js
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "navigator": {
      "command": "npx",
      "args": ["cartogopher-navigator"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "navigator": {
      "command": "npx",
      "args": ["cartogopher-navigator"]
    }
  }
}
```

---

## Tools

### OpenAPI

| Tool | Description |
|------|-------------|
| `navigator_fetch` | Fetch and parse an OpenAPI spec by URL (JSON or YAML) |
| `navigator_list` | List all fetched specs with stats |
| `navigator_search` | Search endpoints across specs by path, operationId, summary, or tags |
| `navigator_endpoint` | Detailed endpoint view with inlined schema fields |
| `navigator_delete` | Remove a stored OpenAPI spec |

### GraphQL

| Tool | Description |
|------|-------------|
| `gqlnav_fetch` | Fetch a GraphQL schema via introspection or SDL file |
| `gqlnav_list` | List all fetched schemas with stats |
| `gqlnav_search` | Search types, operations, and enums across schemas |
| `gqlnav_type` | Detailed type/input/enum/query/mutation view with inlined fields |
| `gqlnav_summary` | High-level schema overview |
| `gqlnav_delete` | Remove a stored GraphQL schema |

---

## Usage Examples

### OpenAPI

```
> navigator_fetch url="https://petstore3.swagger.io/api/v3/openapi.json"
Fetched and parsed: swagger-petstore-openapi-3-0
  19 endpoints, 6 schemas
  Version: 1.0.27 (OpenAPI 3.0.4)
  Auth: oauth2, apiKey

> navigator_search query="pet"
Found 10 endpoints:
[swagger-petstore-openapi-3-0] POST /pet [addPet] Add a new pet to the store. | req: Pet | res: Pet
[swagger-petstore-openapi-3-0] GET /pet/findByStatus [findPetsByStatus] Finds Pets by status.
  | params: status(q,str(available|pending|sold)) | res: arr[Pet]
...

> navigator_endpoint spec="swagger-petstore-openapi-3-0" path="/pet/{petId}" method="GET"
GET /pet/{petId}
  operationId: getPetById
  summary: Find pet by ID.
  tags: pet
  auth: petstore_auth(oauth2) api_key(apiKey,in:header)
  params:
    petId (path, int) *required
  response: Pet
    fields:
      id: int
      name: str
      category: obj
      photoUrls: arr[str]
      tags: arr[obj]
      status: str(available|pending|sold)
  errors: 400, 404
```

### GraphQL

```
> gqlnav_fetch url="https://graphql-pokemon2.vercel.app"
Fetched and parsed: graphql-pokemon2-vercel-app
  Method: introspection
  Types: 5  Inputs: 0  Enums: 0
  Queries: 3  Mutations: 0  Subscriptions: 0

> gqlnav_summary spec="graphql-pokemon2-vercel-app"
=== graphql-pokemon2-vercel-app ===
types: 5  inputs: 0  enums: 0  interfaces: 0  unions: 0  scalars: 0
queries: 3  mutations: 0  subscriptions: 0

main types:
  Pokemon (16 fields)
  Attack (3 fields)

queries:
  query: Query
  pokemons: [Pokemon] (1 args)
  pokemon: Pokemon (2 args)

> gqlnav_type spec="graphql-pokemon2-vercel-app" name="Pokemon"
type Pokemon
  id: ID!
  number: String
  name: String
  weight: PokemonDimension
  height: PokemonDimension
  classification: String
  types: [String]
  ...
```

---

## Storage

Fetched specs are stored locally at `~/.cartogopher/navigator/`:

- **OpenAPI:** `~/.cartogopher/navigator/api/`
- **GraphQL:** `~/.cartogopher/navigator/graphql/`

Each spec is stored as a compact JSON file. Re-fetching the same spec overwrites the previous version. Use `navigator_delete` or `gqlnav_delete` to remove stored specs.

## Token Efficiency

Output is designed for AI consumption -- compact, structured, no filler:

- **Abbreviated locations:** `q`=query, `p`=path, `h`=header, `c`=cookie
- **Compact types:** `str`, `int`, `num`, `bool`, `arr[T]`, `obj`
- **Inline enums:** `str(available|pending|sold)`
- **Inlined schemas:** Fields shown directly in endpoint/type detail views
- **Abbreviated keys:** GraphQL types use `n`=name, `t`=type, `f`=fields, `d`=description

## Requirements

- Node.js 18+
- Two runtime dependencies: [`yaml`](https://www.npmjs.com/package/yaml) and [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk)

## License

MIT -- see [LICENSE](./LICENSE) for details.
