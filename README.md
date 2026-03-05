# @cartogopher/navigator

**API Navigator MCP Server** — Fetch, search, and query OpenAPI & GraphQL schemas with AI-optimized, token-efficient output.

Free, standalone, pure Node.js. No Go binary required.

## Setup

### Claude Code

```bash
claude mcp add navigator -- node /path/to/navigator-mcp/index.js
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "navigator": {
      "command": "node",
      "args": ["/path/to/navigator-mcp/index.js"]
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
      "command": "node",
      "args": ["/path/to/navigator-mcp/index.js"]
    }
  }
}
```

### From npm (once published)

```bash
npx @cartogopher/navigator
```

## Tools

### OpenAPI (4 tools)

| Tool | Description |
|------|-------------|
| `navigator_fetch` | Fetch and parse an OpenAPI spec by URL (JSON or YAML) |
| `navigator_list` | List all fetched specs with stats |
| `navigator_search` | Search endpoints across specs (path, operationId, summary, tags) |
| `navigator_endpoint` | Detailed endpoint view with inlined schema fields |

### GraphQL (5 tools)

| Tool | Description |
|------|-------------|
| `gqlnav_fetch` | Fetch a GraphQL schema (introspection or SDL file) |
| `gqlnav_list` | List all fetched schemas with stats |
| `gqlnav_search` | Search types, operations, enums across schemas |
| `gqlnav_type` | Detailed type/input/enum/query/mutation view with inlined fields |
| `gqlnav_summary` | High-level schema overview |

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
[swagger-petstore-openapi-3-0] GET /pet/findByStatus [findPetsByStatus] Finds Pets by status. | params: status(q,str(available|pending|sold)) | res: arr[Pet]
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

## Storage

Fetched specs are stored locally:
- OpenAPI: `~/.cartogopher/navigator/api/`
- GraphQL: `~/.cartogopher/navigator/graphql/`

Each spec is stored as a compact JSON file. Re-fetching the same spec overwrites the previous version.

## Requirements

- Node.js 18+
- No other dependencies required (pure Node.js with `yaml` for YAML parsing and `@modelcontextprotocol/sdk` for MCP protocol)

## Token Efficiency

Output is designed for AI consumption — compact, structured, no filler:
- Abbreviated parameter locations: `q`=query, `p`=path, `h`=header, `c`=cookie
- Compact types: `str`, `int`, `num`, `bool`, `arr[T]`, `obj`
- Enum values inline: `str(available|pending|sold)`
- Schema fields inlined directly in endpoint detail views
- GraphQL types use abbreviated JSON keys: `n`=name, `t`=type, `f`=fields, `d`=description
