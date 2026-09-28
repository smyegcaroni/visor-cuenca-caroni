#!/usr/bin/env node
/**
 * GeoLens collection -> TerriaJS init catalog generator
 *
 * Classifies datasets using positive service checks:
 * - Raster: GeoLens tile-token response, STAC raster_tiles asset, or raster metadata.
 * - Vector: a valid OGC API Features FeatureCollection response.
 *
 * Usage:
 *   node geolens_collection_to_terria.mjs \
 *     --base https://catalogo-smyeg.gisdata.es \
 *     --collection "Cuenca del Río Caroní" \
 *     --output /data/geolens-caroni.json \
 *     --watch 300
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const out = {
    base: "https://catalogo-smyeg.gisdata.es",
    collection: "Cuenca del Río Caroní",
    output: "wwwroot/init/geolens-caroni.json",
    watch: 0,
    limit: 10000
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base") out.base = argv[++i];
    else if (arg === "--collection") out.collection = argv[++i];
    else if (arg === "--output") out.output = argv[++i];
    else if (arg === "--watch") out.watch = Number(argv[++i] || 0);
    else if (arg === "--limit") out.limit = Number(argv[++i] || 10000);
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node geolens_collection_to_terria.mjs [options]\n\n" +
        "  --base URL              GeoLens base URL\n" +
        "  --collection NAME       GeoLens collection name\n" +
        "  --output FILE           Output Terria init JSON\n" +
        "  --limit N               OGC API Features limit (default: 10000)\n" +
        "  --watch SECONDS         Refresh continuously (0 = run once)\n"
      );
      process.exit(0);
    }
  }

  out.base = out.base.replace(/\/+$/, "");
  if (!Number.isFinite(out.watch) || out.watch < 0) out.watch = 0;
  if (!Number.isFinite(out.limit) || out.limit <= 0) out.limit = 10000;
  return out;
}

const cfg = parseArgs(process.argv);

function requestHeaders() {
  const headers = { Accept: "application/json" };
  if (process.env.GEOLENS_API_KEY) headers["X-Api-Key"] = process.env.GEOLENS_API_KEY;
  if (process.env.GEOLENS_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GEOLENS_BEARER_TOKEN}`;
  }
  return headers;
}

async function requestJson(url, { optional = false } = {}) {
  let response;
  try {
    response = await fetch(url, { headers: requestHeaders() });
  } catch (error) {
    if (optional) return { ok: false, status: 0, payload: null, url, error };
    throw new Error(`No se pudo conectar con ${url}: ${error.message}`);
  }

  let payload = null;
  const text = await response.text().catch(() => "");
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      if (response.ok && !optional) {
        throw new Error(`Respuesta no JSON en ${url}: ${error.message}`);
      }
    }
  }

  if (!response.ok && !optional) {
    throw new Error(`HTTP ${response.status} en ${url}${text ? `: ${text.slice(0, 300)}` : ""}`);
  }

  return { ok: response.ok, status: response.status, payload, url };
}

async function getJson(url, options) {
  const result = await requestJson(url, options);
  return result.ok ? result.payload : null;
}

function norm(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
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

function getId(obj) {
  return obj?.id ?? obj?.uuid ?? obj?.dataset_id ?? obj?.datasetId ?? obj?.pk ?? null;
}

function getTitle(obj, fallback) {
  return obj?.title ?? obj?.name ?? obj?.label ?? obj?.properties?.title ?? fallback;
}

function getDescription(obj) {
  return obj?.description ?? obj?.summary ?? obj?.abstract ?? obj?.properties?.description ?? "";
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
  const decoded = value
    .replace(/%7B/gi, "{")
    .replace(/%7D/gi, "}");
  return decoded.includes("{z}") && decoded.includes("{x}") &&
    (decoded.includes("{y}") || decoded.includes("{reverseY}"));
}

function absoluteTileUrl(value) {
  if (!isTileTemplate(value)) return null;
  const decoded = value.replace(/%7B/gi, "{").replace(/%7D/gi, "}");
  try {
    return new URL(decoded, `${cfg.base}/`).href
      .replace(/%7B/gi, "{")
      .replace(/%7D/gi, "}");
  } catch {
    return decoded;
  }
}

function tileTemplateFromObject(obj) {
  const preferred = deepFindStrings(obj, new Set([
    "raster_tiles", "rasterTiles", "tile_url", "tileUrl", "tiles_url", "tilesUrl",
    "template", "url_template", "urlTemplate"
  ])).map(absoluteTileUrl).find(Boolean);
  if (preferred) return preferred;

  // STAC assets normally store the template in an href property. Inspect all
  // href values instead of accepting only the first asset.
  return deepFindStrings(obj, new Set(["href"]))
    .map(absoluteTileUrl)
    .find(Boolean) ?? null;
}

function looksRaster(dataset) {
  const probes = [
    dataset?.type,
    dataset?.dataset_type,
    dataset?.datasetType,
    dataset?.data_type,
    dataset?.dataType,
    dataset?.kind,
    dataset?.source_type,
    dataset?.sourceType,
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
  if (tileTemplateFromObject(dataset)) return true;
  return false;
}

function fallbackRasterTileUrl(datasetId) {
  return `${cfg.base}/raster-tiles/${encodeURIComponent(datasetId)}/tiles/{z}/{x}/{y}.png?v=1`;
}

async function listCollections() {
  const candidates = [
    `${cfg.base}/api/catalog/collections/`,
    `${cfg.base}/api/catalog/collections`
  ];
  let lastError;

  for (const url of candidates) {
    try {
      const payload = await getJson(url);
      const collections = firstArray(payload, ["collections", "results"]);
      if (collections.length || Array.isArray(payload)) return collections;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("GeoLens no devolvió la lista de collections.");
}

async function getCollectionDatasets(collectionId) {
  const url = `${cfg.base}/api/catalog/collections/${encodeURIComponent(collectionId)}/datasets/`;
  const payload = await getJson(url);
  return firstArray(payload, ["datasets", "results", "items", "members"]);
}

async function enrichDataset(datasetId, summary) {
  const encodedId = encodeURIComponent(datasetId);
  const candidates = [
    `${cfg.base}/api/datasets/${encodedId}`,
    `${cfg.base}/datasets/${encodedId}`,
    `${cfg.base}/api/collections/${encodedId}`,
    `${cfg.base}/api/stac/collections/${encodedId}`
  ];
  const details = [];

  for (const url of candidates) {
    const result = await requestJson(url, { optional: true });
    if (result.ok && result.payload && typeof result.payload === "object") details.push(result.payload);
  }
  return mergeObjects(summary, ...details);
}

async function resolveRasterTileUrl(datasetId, dataset) {
  const direct = tileTemplateFromObject(dataset);
  if (direct) return direct;

  const encodedId = encodeURIComponent(datasetId);

  // Current GeoLens versions expose the authorized raster template here.
  for (const url of [
    `${cfg.base}/tiles/token/${encodedId}/`,
    `${cfg.base}/tiles/token/${encodedId}`
  ]) {
    const tokenResponse = await requestJson(url, { optional: true });
    if (tokenResponse.ok) {
      const template = tileTemplateFromObject(tokenResponse.payload);
      if (template) return template;
    }
  }

  // Every GeoLens raster STAC item advertises a raster_tiles asset.
  const stacUrl = `${cfg.base}/api/stac/collections/${encodedId}/items?limit=1`;
  const stacResponse = await requestJson(stacUrl, { optional: true });
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
  const url = `${cfg.base}/api/collections/${encodeURIComponent(datasetId)}/items?limit=1`;
  const result = await requestJson(url, { optional: true });
  const payload = result.payload;
  const isFeatureCollection = result.ok && payload && (
    payload.type === "FeatureCollection" ||
    Array.isArray(payload.features)
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

function terriaVectorItem({ id, title, description, attribution, metadataUrl }) {
  return {
    id: `geolens-${id}`,
    name: title,
    type: "geojson",
    url: `${cfg.base}/api/collections/${encodeURIComponent(id)}/items?limit=${cfg.limit}`,
    attribution,
    description,
    opacity: 0.9,
    metadataUrls: [{ title: "Metadatos OGC API", url: metadataUrl }]
  };
}

async function datasetToTerria(summary) {
  const id = getId(summary);
  if (!id) {
    console.warn("Dataset omitido porque no tiene id/uuid:", summary);
    return null;
  }

  const dataset = await enrichDataset(id, summary);
  const title = getTitle(dataset, getTitle(summary, String(id)));
  const description = getDescription(dataset) || getDescription(summary);
  const attribution = "SMyEG - Proyecto FAO Cuenca del Río Caroní";
  const metadataUrl = `${cfg.base}/api/collections/${encodeURIComponent(id)}`;

  // A real tile template is the strongest raster signal.
  const tileUrl = await resolveRasterTileUrl(id, dataset);
  if (tileUrl) {
    console.log(`[raster] ${title} -> ${tileUrl}`);
    return terriaRasterItem({ id, title, description, attribution, metadataUrl, tileUrl });
  }

  // Metadata can identify a raster even when the public STAC response is
  // protected or temporarily unavailable. Use the stable production fallback.
  if (looksRaster(dataset)) {
    const fallback = fallbackRasterTileUrl(id);
    console.log(`[raster/fallback] ${title} -> ${fallback}`);
    return terriaRasterItem({ id, title, description, attribution, metadataUrl, tileUrl: fallback });
  }

  // Do not assume that every unknown dataset is vector. Confirm it by loading
  // an OGC FeatureCollection first; this prevents raster images from becoming
  // broken GeoJSON catalog members.
  const vectorProbe = await probeVectorDataset(id);
  if (vectorProbe.isFeatureCollection) {
    console.log(`[vector] ${title}`);
    return terriaVectorItem({ id, title, description, attribution, metadataUrl });
  }

  if (vectorProbe.status === 404) {
    const fallback = fallbackRasterTileUrl(id);
    console.warn(`[raster/inferred] ${title}: OGC Features devolvió 404; se usará ${fallback}`);
    return terriaRasterItem({ id, title, description, attribution, metadataUrl, tileUrl: fallback });
  }

  if (vectorProbe.status === 401 || vectorProbe.status === 403) {
    throw new Error(
      `GeoLens rechazó la clasificación de "${title}" (HTTP ${vectorProbe.status}). ` +
      "Configure GEOLENS_API_KEY o GEOLENS_BEARER_TOKEN."
    );
  }

  throw new Error(
    `No se pudo clasificar "${title}" (${id}). ` +
    `OGC Features respondió HTTP ${vectorProbe.status || "sin respuesta"} y GeoLens no publicó un asset raster_tiles.`
  );
}

async function buildOnce() {
  const collections = await listCollections();
  const wanted = norm(cfg.collection);
  const collection = collections.find(item => norm(getTitle(item, "")) === wanted);

  if (!collection) {
    const available = collections.map(item => getTitle(item, "(sin nombre)")).join(", ");
    throw new Error(
      `No se encontró la collection "${cfg.collection}". ` +
      `Disponibles: ${available || "ninguna visible"}`
    );
  }

  const collectionId = getId(collection);
  if (!collectionId) throw new Error(`La collection "${cfg.collection}" no expone un id/uuid.`);

  const datasets = await getCollectionDatasets(collectionId);
  const members = (await Promise.all(datasets.map(datasetToTerria))).filter(Boolean);

  const output = { catalog: members };
  const outputPath = path.resolve(cfg.output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(output, null, 2) + "\n", "utf8");
  await fs.rename(tempPath, outputPath);

  const rasterCount = members.filter(item => item.type === "url-template-imagery").length;
  const vectorCount = members.filter(item => item.type === "geojson").length;
  console.log(`[${new Date().toISOString()}] Collection: ${cfg.collection} (${collectionId})`);
  console.log(`[${new Date().toISOString()}] Publicados: ${members.length} (${vectorCount} vector, ${rasterCount} ráster)`);
  console.log(`[${new Date().toISOString()}] Archivo: ${outputPath}`);
}

async function main() {
  do {
    try {
      await buildOnce();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ERROR: ${error.message}`);
      if (!cfg.watch) process.exitCode = 1;
    }

    if (!cfg.watch) break;
    await new Promise(resolve => setTimeout(resolve, cfg.watch * 1000));
  } while (true);
}

await main();
