// @cartogopher/navigator — File storage with manifest
// Port of internal/navigator/store.go and internal/gqlnav/store.go

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';

const BASE_DIR = join(homedir(), '.cartogopher', 'navigator');
const API_DIR = join(BASE_DIR, 'api');
const GQL_DIR = join(BASE_DIR, 'graphql');

// ─── OpenAPI storage ─────────────────────────────────────────────

export async function saveSpec(spec) {
  await mkdir(API_DIR, { recursive: true });
  const specFile = join(API_DIR, spec.name + '.json');
  await writeFile(specFile, JSON.stringify(spec));
  await updateApiManifest(spec);
}

export async function loadSpec(name) {
  const specFile = join(API_DIR, name + '.json');
  const data = await readFile(specFile, 'utf8');
  return JSON.parse(data);
}

export async function loadApiManifest() {
  const manifestFile = join(API_DIR, 'manifest.json');
  try {
    const data = await readFile(manifestFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return { specs: [] };
  }
}

export async function loadAllSpecs() {
  const manifest = await loadApiManifest();
  const specs = [];
  for (const entry of manifest.specs) {
    try {
      specs.push(await loadSpec(entry.name));
    } catch {
      // skip broken specs
    }
  }
  return specs;
}

async function updateApiManifest(spec) {
  const manifest = await loadApiManifest();
  const entry = {
    name: spec.name,
    url: spec.source_url,
    endpoints: spec.endpoint_count,
    schemas: spec.schema_count,
    fetched_at: spec.fetched_at,
  };

  const idx = manifest.specs.findIndex(e => e.name === spec.name);
  if (idx >= 0) {
    manifest.specs[idx] = entry;
  } else {
    manifest.specs.push(entry);
  }

  await mkdir(API_DIR, { recursive: true });
  await writeFile(join(API_DIR, 'manifest.json'), JSON.stringify(manifest));
}

// ─── GraphQL storage ─────────────────────────────────────────────

export async function saveSchema(schema) {
  await mkdir(GQL_DIR, { recursive: true });
  const schemaFile = join(GQL_DIR, schema.name + '.json');
  await writeFile(schemaFile, JSON.stringify(schema));
  await updateGqlManifest(schema);
}

export async function loadSchema(name) {
  const schemaFile = join(GQL_DIR, name + '.json');
  const data = await readFile(schemaFile, 'utf8');
  return JSON.parse(data);
}

export async function loadGqlManifest() {
  const manifestFile = join(GQL_DIR, 'manifest.json');
  try {
    const data = await readFile(manifestFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return { specs: [] };
  }
}

export async function loadAllSchemas() {
  const manifest = await loadGqlManifest();
  const schemas = [];
  for (const entry of manifest.specs) {
    try {
      schemas.push(await loadSchema(entry.name));
    } catch {
      // skip broken schemas
    }
  }
  return schemas;
}

async function updateGqlManifest(schema) {
  const manifest = await loadGqlManifest();
  const entry = {
    name: schema.name,
    url: schema.source_url,
    types: schema.type_count,
    queries: schema.query_count,
    mutations: schema.mutation_count,
    fetched_at: schema.fetched_at,
  };

  const idx = manifest.specs.findIndex(e => e.name === schema.name);
  if (idx >= 0) {
    manifest.specs[idx] = entry;
  } else {
    manifest.specs.push(entry);
  }

  await mkdir(GQL_DIR, { recursive: true });
  await writeFile(join(GQL_DIR, 'manifest.json'), JSON.stringify(manifest));
}

// ─── Delete operations ───────────────────────────────────────────

export async function deleteSpec(name) {
  const specFile = join(API_DIR, name + '.json');
  const { unlink } = await import('node:fs/promises');
  try { await unlink(specFile); } catch { /* ignore */ }

  const manifest = await loadApiManifest();
  manifest.specs = manifest.specs.filter(e => e.name !== name);
  await writeFile(join(API_DIR, 'manifest.json'), JSON.stringify(manifest));
}

export async function deleteSchema(name) {
  const schemaFile = join(GQL_DIR, name + '.json');
  const { unlink } = await import('node:fs/promises');
  try { await unlink(schemaFile); } catch { /* ignore */ }

  const manifest = await loadGqlManifest();
  manifest.specs = manifest.specs.filter(e => e.name !== name);
  await writeFile(join(GQL_DIR, 'manifest.json'), JSON.stringify(manifest));
}
