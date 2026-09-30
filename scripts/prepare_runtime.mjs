#!/usr/bin/env node
import { readFile, mkdir, rename, writeFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const key = process.env.NASA_FIRMS_MAP_KEY?.trim();
if (!key || !/^[A-Za-z0-9_-]+$/.test(key)) {
  throw new Error("Define NASA_FIRMS_MAP_KEY en el entorno o en .env; no incluyas la clave en el repositorio.");
}
const config = JSON.parse(await readFile(resolve(root, "runtime/branding/config.template.json"), "utf8"));
config.parameters.cesiumIonAccessToken = process.env.CESIUM_ION_ACCESS_TOKEN?.trim() || "";
const template = await readFile(resolve(root, "smyeg_geolens_auto.template.json"), "utf8");
const cartoKey = process.env.CARTO_API_KEY?.trim();
const publicCarto = cartoKey
  ? template.replaceAll("__CARTO_API_KEY__", encodeURIComponent(cartoKey))
  : template.replaceAll("?key=__CARTO_API_KEY__", "");
const init = JSON.parse(publicCarto.replaceAll("__NASA_FIRMS_MAP_KEY__", encodeURIComponent(key)));

async function atomicJson(relative, value) {
  const target = resolve(root, relative);
  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o644 });
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
}

await mkdir(resolve(root, "runtime/geolens/collections"), { recursive: true });
await atomicJson("runtime/branding/config.json", config);
await atomicJson("smyeg_geolens_auto.json", init);
console.log("Configuración privada preparada. Los archivos generados no deben publicarse.");
