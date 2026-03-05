// @cartogopher/navigator — Type definitions
// Matches Go structs in internal/navigator/types.go and internal/gqlnav/types.go

/**
 * @typedef {Object} CompactEndpoint
 * @property {string} m - HTTP method
 * @property {string} p - Path
 * @property {string} [id] - operationId
 * @property {string} [s] - Summary
 * @property {string[]} [t] - Tags
 * @property {CompactParam[]} [params] - Parameters
 * @property {string} [req] - Request body type
 * @property {string} [res] - Response type
 * @property {string[]} [err] - Error responses e.g. ["404:NotFound"]
 */

/**
 * @typedef {Object} CompactParam
 * @property {string} n - Name
 * @property {string} in - Location: q=query, p=path, h=header, c=cookie
 * @property {string} t - Type: str, int, num, bool, arr[T], obj
 * @property {boolean} [r] - Required
 * @property {string} [e] - Pipe-separated enum values
 */

/**
 * @typedef {Object} AuthScheme
 * @property {string} name
 * @property {string} type - apiKey, http, oauth2, openIdConnect
 * @property {string} [in] - header, query, cookie
 * @property {string} [scheme] - bearer, basic
 */

/**
 * @typedef {Object} ParsedSpec
 * @property {string} name
 * @property {string} [version]
 * @property {string} source_url
 * @property {string} [base_url]
 * @property {string} fetched_at
 * @property {string} [spec_version]
 * @property {AuthScheme[]} [auth]
 * @property {number} endpoint_count
 * @property {number} schema_count
 * @property {CompactEndpoint[]} endpoints
 * @property {Object<string, Object<string, any>>} schemas
 */

/**
 * @typedef {Object} ManifestEntry
 * @property {string} name
 * @property {string} url
 * @property {number} endpoints
 * @property {number} schemas
 * @property {string} fetched_at
 */

/**
 * @typedef {Object} Manifest
 * @property {ManifestEntry[]} specs
 */

// ─── GraphQL types ───────────────────────────────────────────────

/**
 * @typedef {Object} GqlCompactType
 * @property {string} n - Name
 * @property {GqlCompactField[]} [f] - Fields
 * @property {string[]} [impl] - Interfaces this type implements
 * @property {string} [d] - Description
 */

/**
 * @typedef {Object} GqlCompactField
 * @property {string} n - Name
 * @property {string} t - Type
 * @property {GqlCompactArg[]} [a] - Arguments
 * @property {string} [d] - Description
 * @property {boolean} [dep] - Deprecated
 * @property {string} [def] - Default value
 */

/**
 * @typedef {Object} GqlCompactArg
 * @property {string} n - Name
 * @property {string} t - Type
 * @property {string} [def] - Default value
 */

/**
 * @typedef {Object} GqlCompactEnum
 * @property {string} n - Name
 * @property {string[]} v - Values
 * @property {string} [d] - Description
 */

/**
 * @typedef {Object} GqlCompactUnion
 * @property {string} n - Name
 * @property {string[]} t - Member types
 * @property {string} [d] - Description
 */

/**
 * @typedef {Object} GqlCompactDirective
 * @property {string} n - Name
 * @property {GqlCompactArg[]} [a] - Arguments
 * @property {string[]} loc - Locations
 */

/**
 * @typedef {Object} GqlParsedSchema
 * @property {string} name
 * @property {string} source_url
 * @property {string} fetched_at
 * @property {string} method - "introspection" or "sdl"
 * @property {number} type_count
 * @property {number} input_count
 * @property {number} enum_count
 * @property {number} query_count
 * @property {number} mutation_count
 * @property {number} subscription_count
 * @property {GqlCompactType[]} [types]
 * @property {GqlCompactType[]} [inputs]
 * @property {GqlCompactType[]} [ifaces]
 * @property {GqlCompactUnion[]} [unions]
 * @property {GqlCompactEnum[]} [enums]
 * @property {string[]} [scalars]
 * @property {GqlCompactField[]} [queries]
 * @property {GqlCompactField[]} [mutations]
 * @property {GqlCompactField[]} [subscriptions]
 * @property {GqlCompactDirective[]} [directives]
 */

/**
 * @typedef {Object} GqlManifestEntry
 * @property {string} name
 * @property {string} url
 * @property {number} types
 * @property {number} queries
 * @property {number} mutations
 * @property {string} fetched_at
 */

/**
 * @typedef {Object} GqlManifest
 * @property {GqlManifestEntry[]} specs
 */

export {};
