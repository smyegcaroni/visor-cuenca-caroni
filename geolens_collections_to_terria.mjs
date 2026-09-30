#!/usr/bin/env node
/**
 * Dynamic GeoLens collections -> TerriaJS catalog synchronizer.
 *
 * Every successful cycle:
 *   1. discovers every public GeoLens collection;
 *   2. writes one Terria catalog file per collection;
 *   3. writes a small index of lazy terria-reference entries;
 *   4. leaves files untouched when their content did not change.
 * Vector geometries are read directly by TerriaMap from OGC API Features;
 * this process never exports or caches complete datasets.
 *
 * Credentials, when required, are read only from GEOLENS_BEARER_TOKEN or
 * GEOLENS_API_KEY and are never copied into generated Terria catalogs.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_ATTRIBUTION = "SMyEG - Proyecto FAO Cuenca del Río Caroní";

function parseArgs(argv) {
  const out = {
    base: "https://catalogo.caroni.org.ve",
    apiBase: null,
    outputDir: "/data/collections",
    indexOutput: "/data/geolens-collections.json",
    publicPrefix: "init/geolens/collections",
    watch: 300,
    limit: 100000,
    concurrency: 4,
    timeout: 20000,
    retries: 3
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`Falta un valor para ${arg}.`);
      return next;
    };

    if (arg === "--base") out.base = value();
    else if (arg === "--api-base") out.apiBase = value();
    else if (arg === "--output-dir") out.outputDir = value();
    else if (arg === "--index-output") out.indexOutput = value();
    else if (arg === "--public-prefix") out.publicPrefix = value();
    else if (arg === "--watch") out.watch = Number(value());
    else if (arg === "--limit") out.limit = Number(value());
    else if (arg === "--concurrency") out.concurrency = Number(value());
    else if (arg === "--timeout") out.timeout = Number(value());
    else if (arg === "--retries") out.retries = Number(value());
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node geolens_collections_to_terria.mjs [options]\n\n" +
        "  --base URL              Public GeoLens base URL\n" +
        "  --api-base URL          Optional internal GeoLens API base URL\n" +
        "  --output-dir DIR        Directory for per-collection catalogs\n" +
        "  --index-output FILE     Terria index catalog output\n" +
        "  --public-prefix PATH    Public URL prefix for collection files\n" +
        "  --watch SECONDS         Refresh interval (0 = run once)\n" +
        "  --limit N               Maximum GeoLens OGC page size (default 100000)\n" +
        "  --concurrency N         Maximum concurrent dataset probes\n" +
        "  --timeout MS            HTTP request timeout\n" +
        "  --retries N             Retry count for transient HTTP failures\n"
      );
      process.exit(0);
    } else {
      throw new Error(`Opción desconocida: ${arg}`);
    }
  }

  out.base = String(out.base).replace(/\/+$/, "");
  out.apiBase = String(out.apiBase || out.base).replace(/\/+$/, "");
  out.publicPrefix = String(out.publicPrefix).replace(/^\/+|\/+$/g, "");

  for (const [name, value] of [["--base", out.base], ["--api-base", out.apiBase]]) {
    try {
      new URL(value);
    } catch {
      throw new Error(`${name} no es una URL válida: ${value}`);
    }
  }
  if (!out.outputDir || !out.indexOutput || !out.publicPrefix) {
    throw new Error("--output-dir, --index-output y --public-prefix son obligatorios.");
  }
  if (!Number.isFinite(out.watch) || out.watch < 0) throw new Error("--watch debe ser >= 0.");
  if (!Number.isInteger(out.limit) || out.limit < 1 || out.limit > 100000) {
    throw new Error("--limit debe ser un entero entre 1 y 100000.");
  }
  if (!Number.isInteger(out.concurrency) || out.concurrency < 1 || out.concurrency > 16) {
    throw new Error("--concurrency debe ser un entero entre 1 y 16.");
  }
  if (!Number.isInteger(out.timeout) || out.timeout < 1000 || out.timeout > 120000) {
    throw new Error("--timeout debe ser un entero entre 1000 y 120000 ms.");
  }
  if (!Number.isInteger(out.retries) || out.retries < 0 || out.retries > 8) {
    throw new Error("--retries debe ser un entero entre 0 y 8.");
  }
  return out;
}

const cfg = parseArgs(process.argv);

function requestHeaders() {
  const headers = { Accept: "application/json" };
  if (process.env.GEOLENS_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GEOLENS_BEARER_TOKEN}`;
  } else if (process.env.GEOLENS_API_KEY) headers["X-Api-Key"] = process.env.GEOLENS_API_KEY;
  return headers;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function requestJson(url, { optional = false } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= cfg.retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeout);
    let response;
    let text;
    try {
      response = await fetch(url, {
        headers: requestHeaders(),
        signal: controller.signal
      });
      text = await response.text();
    } catch (error) {
      lastError = error;
      clearTimeout(timer);
      if (attempt < cfg.retries) {
        await sleep(400 * (2 ** attempt));
        continue;
      }
      if (optional) return { ok: false, status: 0, payload: null, url, error };
      throw new Error(`No se pudo conectar con ${url}: ${error.message}`);
    }
    clearTimeout(timer);

    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        if (response.ok && !optional) {
          throw new Error(`Respuesta no JSON en ${url}: ${error.message}`);
        }
      }
    }

    if (response.ok) return { ok: true, status: response.status, payload, url };
    if (retryableStatus(response.status) && attempt < cfg.retries) {
      await sleep(400 * (2 ** attempt));
      continue;
    }
    if (optional) return { ok: false, status: response.status, payload, url };
    throw new Error(
      `HTTP ${response.status} en ${url}${text ? `: ${text.slice(0, 300)}` : ""}`
    );
  }

  if (optional) return { ok: false, status: 0, payload: null, url, error: lastError };
  throw lastError ?? new Error(`Falló la solicitud a ${url}.`);
}

async function getJson(url, options) {
  const result = await requestJson(url, options);
  return result.ok ? result.payload : null;
}

function firstArray(payload, preferredKeys = []) {
  if (Array.isArray(payload)) return payload;
  for (const key of preferredKeys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  for (const key of ["results", "items", "features", "collections", "datasets", "data", "members"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function getTotal(payload, fallback) {
  for (const key of ["total", "count", "numberMatched"]) {
    if (payload?.[key] === null || payload?.[key] === undefined) continue;
    const value = Number(payload?.[key]);
    if (Number.isInteger(value) && value >= 0) return value;
  }
  return fallback;
}

function getId(obj) {
  return obj?.id ?? obj?.uuid ?? obj?.dataset_id ?? obj?.datasetId ?? obj?.pk ?? null;
}

function getTitle(obj, fallback) {
  return obj?.title ?? obj?.name ?? obj?.label ?? obj?.properties?.title ?? fallback;
}

function getDescription(obj) {
  return obj?.description ?? obj?.summary ?? obj?.abstract ?? obj?.properties?.description ?? "";
}

function norm(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function mergeObjects(...objects) {
  return Object.assign({}, ...objects.filter(value => value && typeof value === "object"));
}

function deepFindStrings(obj, keys, depth = 0, found = []) {
  if (!obj || typeof obj !== "object" || depth > 7) return found;
  for (const [key, value] of Object.entries(obj)) {
    if (keys.has(key) && typeof value === "string" && value.trim()) found.push(value.trim());
    if (value && typeof value === "object") deepFindStrings(value, keys, depth + 1, found);
  }
  return found;
}

function isTileTemplate(value) {
  if (typeof value !== "string") return false;
  const decoded = value.replace(/%7B/gi, "{").replace(/%7D/gi, "}");
  return decoded.includes("{z}") && decoded.includes("{x}") &&
    (decoded.includes("{y}") || decoded.includes("{reverseY}"));
}

function publicTileUrl(value) {
  if (!isTileTemplate(value)) return null;
  const decoded = value.replace(/%7B/gi, "{").replace(/%7D/gi, "}");
  try {
    const resolved = new URL(decoded, `${cfg.base}/`);
    const apiOrigin = new URL(cfg.apiBase).origin;
    const publicValue = resolved.origin === apiOrigin
      ? `${cfg.base}${resolved.pathname}${resolved.search}${resolved.hash}`
      : resolved.href;
    return publicValue.replace(/%7B/gi, "{").replace(/%7D/gi, "}");
  } catch {
    return decoded;
  }
}

function tileTemplateFromObject(obj) {
  const preferred = deepFindStrings(obj, new Set([
    "raster_tiles", "rasterTiles", "tile_url", "tileUrl", "tiles_url", "tilesUrl",
    "template", "url_template", "urlTemplate"
  ])).map(publicTileUrl).find(Boolean);
  if (preferred) return preferred;

  return deepFindStrings(obj, new Set(["href"]))
    .map(publicTileUrl)
    .find(Boolean) ?? null;
}

function looksRaster(dataset) {
  const probes = [
    dataset?.type,
    dataset?.record_type,
    dataset?.dataset_type,
    dataset?.datasetType,
    dataset?.data_type,
    dataset?.dataType,
    dataset?.kind,
    dataset?.source_type,
    dataset?.sourceType,
    dataset?.source_format,
    dataset?.format,
    dataset?.media_type,
    dataset?.mediaType,
    dataset?.geometry_type,
    dataset?.geometryType,
    dataset?.properties?.type,
    dataset?.properties?.dataset_type,
    dataset?.properties?.data_type,
    dataset?.properties?.geometry_type
  ].filter(Boolean).map(norm);

  if (probes.some(value => /raster|cog|geotiff|tiff|image|coverage|grid/.test(value))) return true;
  return Boolean(tileTemplateFromObject(dataset));
}

function fallbackRasterTileUrl(datasetId) {
  return `${cfg.base}/raster-tiles/${encodeURIComponent(datasetId)}/tiles/{z}/{x}/{y}.png?v=1`;
}

async function listCollections() {
  const pageSize = 100;
  const all = [];
  const seen = new Set();

  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    let payload;
    let lastError;
    for (const suffix of ["/api/catalog/collections/", "/api/catalog/collections"]) {
      try {
        payload = await getJson(`${cfg.apiBase}${suffix}?${query}`);
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (payload === undefined) throw lastError ?? new Error("GeoLens no devolvió collections.");

    const rows = firstArray(payload, ["collections", "results"]);
    for (const row of rows) {
      const id = String(getId(row) ?? "");
      if (id && !seen.has(id)) {
        seen.add(id);
        all.push(row);
      }
    }
    const total = getTotal(payload, all.length);
    if (rows.length < pageSize || all.length >= total) break;
  }

  return all;
}

async function getCollectionDatasets(collectionId) {
  const encoded = encodeURIComponent(collectionId);
  let lastError;
  for (const suffix of [
    `/api/catalog/collections/${encoded}/datasets/`,
    `/api/catalog/collections/${encoded}/datasets`
  ]) {
    try {
      const payload = await getJson(`${cfg.apiBase}${suffix}`);
      return firstArray(payload, ["datasets", "results", "items", "members"]);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`GeoLens no devolvió los datasets de ${collectionId}.`);
}

async function enrichDataset(datasetId, summary) {
  const encodedId = encodeURIComponent(datasetId);
  const candidates = [
    `${cfg.apiBase}/api/datasets/${encodedId}`,
    `${cfg.apiBase}/datasets/${encodedId}`,
    `${cfg.apiBase}/api/collections/${encodedId}`,
    `${cfg.apiBase}/api/stac/collections/${encodedId}`
  ];
  for (const url of candidates) {
    const result = await requestJson(url, { optional: true });
    if (result.ok && result.payload && typeof result.payload === "object") {
      return mergeObjects(summary, result.payload);
    }
  }
  return summary;
}

async function resolveRasterTileUrl(datasetId, dataset) {
  const direct = tileTemplateFromObject(dataset);
  if (direct) return direct;
  const encodedId = encodeURIComponent(datasetId);

  for (const url of [
    `${cfg.apiBase}/tiles/token/${encodedId}/`,
    `${cfg.apiBase}/tiles/token/${encodedId}`
  ]) {
    const response = await requestJson(url, { optional: true });
    if (response.ok) {
      const template = tileTemplateFromObject(response.payload);
      if (template) return template;
    }
  }

  const stacResponse = await requestJson(
    `${cfg.apiBase}/api/stac/collections/${encodedId}/items?limit=1`,
    { optional: true }
  );
  if (stacResponse.ok) {
    const items = firstArray(stacResponse.payload, ["features", "items"]);
    for (const item of items) {
      const rasterAsset = item?.assets?.raster_tiles ?? item?.assets?.rasterTiles;
      const template = tileTemplateFromObject(rasterAsset) ?? tileTemplateFromObject(item?.assets);
      if (template) return template;
    }
  }
  return null;
}

async function probeVectorDataset(datasetId) {
  const url = `${cfg.apiBase}/api/collections/${encodeURIComponent(datasetId)}/items?limit=1&include_geometry=false`;
  const result = await requestJson(url, { optional: true });
  const payload = result.payload;
  const isFeatureCollection = result.ok && payload && (
    payload.type === "FeatureCollection" && Array.isArray(payload.features)
  );
  return { ...result, isFeatureCollection };
}

function terriaRasterItem({ id, title, description, attribution, metadataUrl, tileUrl }) {
  return {
    id: `geolens-${id}`,
    name: title,
    type: "url-template-imagery",
    url: tileUrl,
    attribution,
    description,
    opacity: 0.9,
    tileWidth: 256,
    tileHeight: 256,
    metadataUrls: [{ title: "Metadatos", url: metadataUrl }]
  };
}

function terriaVectorItem({ id, title, description, attribution, metadataUrl, dataset, featureCount }) {
  const itemsUrl = `${cfg.base}/api/collections/${encodeURIComponent(id)}/items`;
  const item = {
    id: `geolens-${id}`,
    name: title,
    type: "geojson",
    url: `${itemsUrl}?limit=${cfg.limit}`,
    attribution,
    description,
    opacity: 0.9,
    cacheDuration: "5m",
    metadataUrls: [{ title: "Metadatos OGC API", url: metadataUrl }]
  };
  const rectangle = datasetRectangle(dataset);
  if (rectangle) item.rectangle = rectangle;
  if (featureCount !== null && featureCount > cfg.limit) {
    // TerriaJS merges these direct OGC responses into one FeatureCollection.
    // Offset pagination is used only beyond the configured server page ceiling.
    item.urls = Array.from({ length: Math.ceil(featureCount / cfg.limit) }, (_, page) => ({
      url: `${itemsUrl}?limit=${cfg.limit}&offset=${page * cfg.limit}`
    }));
  }
  return item;
}

function datasetFeatureCount(dataset) {
  for (const key of ["feature_count", "featureCount", "row_count", "rowCount", "count"]) {
    if (dataset?.[key] === null || dataset?.[key] === undefined) continue;
    const value = Number(dataset?.[key]);
    if (Number.isInteger(value) && value >= 0) return value;
  }
  return null;
}

function datasetRectangle(dataset) {
  const bbox = dataset?.extent_bbox ?? dataset?.extentBbox ?? dataset?.bbox;
  if (!Array.isArray(bbox) || bbox.length < 4) return null;
  const [west, south, east, north] = bbox.slice(0, 4).map(Number);
  if (![west, south, east, north].every(Number.isFinite)) return null;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return null;
  return { west, south, east, north };
}

async function datasetToTerria(summary) {
  const id = getId(summary);
  if (!id) throw new Error("GeoLens devolvió un dataset sin id/uuid.");

  const dataset = await enrichDataset(id, summary);
  const title = getTitle(dataset, getTitle(summary, String(id)));
  const description = getDescription(dataset) || getDescription(summary);
  const attribution = dataset?.attribution || summary?.attribution || DEFAULT_ATTRIBUTION;
  const metadataUrl = `${cfg.base}/api/collections/${encodeURIComponent(id)}`;

  const tileUrl = looksRaster(dataset) ? await resolveRasterTileUrl(id, dataset) : null;
  if (tileUrl) {
    return terriaRasterItem({ id, title, description, attribution, metadataUrl, tileUrl });
  }
  if (looksRaster(dataset)) {
    return terriaRasterItem({
      id,
      title,
      description,
      attribution,
      metadataUrl,
      tileUrl: fallbackRasterTileUrl(id)
    });
  }

  const vectorProbe = await probeVectorDataset(id);
  if (vectorProbe.isFeatureCollection) {
    const matched = Number(vectorProbe.payload?.numberMatched);
    const featureCount = datasetFeatureCount(dataset) ??
      (Number.isInteger(matched) && matched >= 0 ? matched : null);
    return terriaVectorItem({ id, title, description, attribution, metadataUrl, dataset, featureCount });
  }
  if (vectorProbe.status === 401 || vectorProbe.status === 403) {
    throw new Error(
      `GeoLens rechazó la clasificación de "${title}" (HTTP ${vectorProbe.status}). ` +
      "Configure GEOLENS_API_KEY o GEOLENS_BEARER_TOKEN."
    );
  }
  throw new Error(
    `No se pudo clasificar "${title}" (${id}): OGC Features respondió ` +
    `HTTP ${vectorProbe.status || "sin respuesta"} y no existe raster_tiles.`
  );
}

async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

function stableCompare(a, b) {
  const byName = String(a?.name ?? "").localeCompare(String(b?.name ?? ""), "es", { sensitivity: "base" });
  if (byName) return byName;
  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
}

function collectionFilename(collectionId) {
  const safe = String(collectionId).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `collection-${safe}.json`;
}

function collectionReference(collection, filename) {
  const id = String(getId(collection));
  const name = getTitle(collection, id);
  return {
    id: `geolens-collection-${id}`,
    name,
    type: "terria-reference",
    url: `${cfg.publicPrefix}/${filename}`,
    isGroup: true,
    description: getDescription(collection) || `Colección sincronizada automáticamente desde GeoLens: ${name}.`,
    cacheDuration: "5m"
  };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonIfChanged(filePath, value) {
  const content = JSON.stringify(value, null, 2) + "\n";
  try {
    if (await fs.readFile(filePath, "utf8") === content) return false;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tempPath, content, "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  return true;
}

async function buildCollection(collection) {
  const id = String(getId(collection) ?? "");
  const name = getTitle(collection, id || "(sin nombre)");
  if (!id) throw new Error(`La colección "${name}" no expone id/uuid.`);

  const datasets = await getCollectionDatasets(id);
  const declaredCount = Number(collection?.dataset_count);
  if (Number.isInteger(declaredCount) && declaredCount >= 0 && declaredCount !== datasets.length) {
    throw new Error(
      `La colección "${name}" declara ${declaredCount} datasets pero la API devolvió ${datasets.length}; ` +
      "se conserva el archivo anterior."
    );
  }

  const members = await mapLimit(datasets, cfg.concurrency, datasetToTerria);
  members.sort(stableCompare);
  const filename = collectionFilename(id);
  const outputPath = path.resolve(cfg.outputDir, filename);
  const changed = await writeJsonIfChanged(outputPath, { catalog: members });
  const rasterCount = members.filter(item => item.type === "url-template-imagery").length;
  const geojsonCount = members.filter(item => item.type === "geojson").length;
  const vectorCount = geojsonCount;

  console.log(
    `[${new Date().toISOString()}] ${changed ? "Actualizado" : "Sin cambios"}: ` +
    `${name} (${members.length}: ${vectorCount} vector OGC directo, ${rasterCount} ráster)`
  );
  return { reference: collectionReference(collection, filename), filename, members, changed };
}

async function syncCycle() {
  const collections = await listCollections();
  if (!collections.length) {
    throw new Error("GeoLens no devolvió ninguna colección pública; se conserva el índice existente.");
  }
  collections.sort((a, b) => stableCompare(
    { name: getTitle(a, ""), id: getId(a) },
    { name: getTitle(b, ""), id: getId(b) }
  ));

  const references = [];
  let changedCollections = 0;
  let failedCollections = 0;

  for (const collection of collections) {
    const id = String(getId(collection) ?? "");
    const filename = collectionFilename(id);
    const outputPath = path.resolve(cfg.outputDir, filename);
    try {
      const result = await buildCollection(collection);
      references.push(result.reference);
      if (result.changed) changedCollections++;
    } catch (error) {
      failedCollections++;
      console.error(
        `[${new Date().toISOString()}] ERROR en ${getTitle(collection, id || "colección")}: ${error.message}`
      );
      if (id && await fileExists(outputPath)) {
        references.push(collectionReference(collection, filename));
        console.warn(`[${new Date().toISOString()}] Se conserva ${outputPath}.`);
      }
    }
  }

  if (!references.length) {
    throw new Error("Ninguna colección pudo publicarse y no existen archivos anteriores; se conserva el índice.");
  }

  references.sort(stableCompare);
  const indexChanged = await writeJsonIfChanged(path.resolve(cfg.indexOutput), { catalog: references });
  console.log(
    `[${new Date().toISOString()}] Índice ${indexChanged ? "actualizado" : "sin cambios"}: ` +
    `${references.length} colecciones; ${changedCollections} archivos modificados; ${failedCollections} errores.`
  );

  if (failedCollections) {
    throw new Error(`${failedCollections} colección(es) no pudieron actualizarse; se conservaron sus archivos anteriores.`);
  }
}

async function main() {
  do {
    try {
      await syncCycle();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR: ${error.message}`);
      if (!cfg.watch) process.exitCode = 1;
    }

    if (!cfg.watch) break;
    await sleep(cfg.watch * 1000);
  } while (true);
}

await main();
