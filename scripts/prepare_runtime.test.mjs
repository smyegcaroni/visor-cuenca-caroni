import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, readFile, readdir, rm } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
test("prepara configuración privada sin modificar las plantillas y rechaza una clave ausente", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "caroni-runtime-"));
  try {
    for (const relative of ["scripts/prepare_runtime.mjs", "runtime/branding/config.template.json", "smyeg_geolens_auto.template.json"]) {
      await mkdir(dirname(join(fixture, relative)), { recursive: true });
      await copyFile(join(source, relative), join(fixture, relative));
    }
    const script = join(fixture, "scripts/prepare_runtime.mjs");
    const env = { ...process.env, NASA_FIRMS_MAP_KEY: "", CESIUM_ION_ACCESS_TOKEN: "", CARTO_API_KEY: "" };
    assert.notEqual(spawnSync(process.execPath, [script], { env }).status, 0);
    assert.equal((await readdir(fixture)).includes("smyeg_geolens_auto.json"), false);
    const run = spawnSync(process.execPath, [script], { env: { ...env, NASA_FIRMS_MAP_KEY: "test-key", CESIUM_ION_ACCESS_TOKEN: "test-token" }, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const config = JSON.parse(await readFile(join(fixture, "runtime/branding/config.json"), "utf8"));
    assert.equal(config.parameters.cesiumIonAccessToken, "test-token");
    const init = await readFile(join(fixture, "smyeg_geolens_auto.json"), "utf8");
    assert.equal((init.match(/mapserver\/wms\/fires\/test-key/g) || []).length, 6);
    assert.equal(init.includes("__NASA_FIRMS_MAP_KEY__"), false);
    assert.equal(init.includes("__CARTO_API_KEY__"), false);
    const cartoRun = spawnSync(process.execPath, [script], { env: { ...env, NASA_FIRMS_MAP_KEY: "test-key", CARTO_API_KEY: "carto-fixture" }, encoding: "utf8" });
    assert.equal(cartoRun.status, 0, cartoRun.stderr);
    assert.equal((await readFile(join(fixture, "smyeg_geolens_auto.json"), "utf8")).includes("key=carto-fixture"), true);
    assert.equal((await readdir(join(fixture, "runtime/branding"))).some(name => name.endsWith(".tmp")), false);
    assert.equal(JSON.parse(await readFile(join(fixture, "runtime/branding/config.template.json"), "utf8")).parameters.cesiumIonAccessToken, "");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
