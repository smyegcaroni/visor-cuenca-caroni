# Visor de la Cuenca del Río Caroní

Visor del Sistema de Monitoreo y Evaluación Geoespacial (SMyEG), basado en TerriaMap. Instancia pública: [visor.caroni.org.ve](https://visor.caroni.org.ve). Catálogo GeoLens: [catalogo.caroni.org.ve](https://catalogo.caroni.org.ve).

## Estado de la publicación

El código y los recursos estáticos se consolidaron el 15 de octubre de 2026 a partir de la instancia activa `visor-smyeg-fao:20261014-pwaicon1`. Se incluyen los iconos, la instalación PWA, el modo sin conexión, los colores y el comportamiento del logotipo de cabecera publicados. El logotipo abre el visor en la misma pestaña; los enlaces del menú conservan su comportamiento.

Las plantillas reflejan la configuración efectiva y el orden de los catálogos de producción. Las claves se proporcionan mediante `.env`; los catálogos dinámicos se regeneran desde GeoLens. Los respaldos, los archivos de ejecución privados y los módulos compilados no se versionan. Los hashes de los archivos de la publicación comprobada están en `docs/production-assets-20261015.json`.

Una imagen con nombre de producción es una referencia local, no una imagen pública descargable. Para una instalación nueva se debe construir con `docker compose build terriamap` en un equipo con recursos suficientes y transferir la imagen al servidor cuando corresponda. Esta sincronización no recompiló ni sustituyó la imagen activa.

## Personalización

El encabezado y la pantalla de carga usan `logo_fao_caroni.png`; la pantalla de carga muestra el logo a 350 × 40 px. La barra superior incluye **Sobre el proyecto** y **Catalogo Geodatos**, en ese orden antes de Map Settings. Ambos enlaces abren una pestaña nueva. Se retiró el botón About.

Los estilos están en `wwwroot/caroni-branding/caroni-colors.css` y `lib/Views/global.scss`. Los módulos JS y CSS compilados incorporan un hash en el nombre para evitar que el navegador conserve una navegación anterior después del despliegue.

## Catálogos

`geolens_collections_to_terria.mjs` consulta las colecciones cada 300 segundos y genera un catálogo separado por colección, además de `runtime/geolens/geolens-collections.json`, que sirve como índice para Terria. Una nueva colección publicada se incorpora en el siguiente ciclo satisfactorio. Los archivos se escriben de forma atómica. Los vectores apuntan al endpoint OGC API Features con `limit=100000`; los ráster usan las teselas disponibles. El límite no garantiza que se reciban todas las entidades de datasets que superen 100.000 registros.

NASA FIRMS se mantiene como catálogo WMS independiente. Su clave no se guarda en las plantillas públicas. Las claves incluidas en un cliente web siguen siendo visibles para quien consulte los recursos que sirve el visor; no equivalen a un secreto de servidor.

Se conserva `geolens_collection_to_terria.mjs` para la sincronización de una sola colección.

## Preparación

Se requieren Docker Engine, Docker Compose v2 y Node.js 22 para preparar la configuración. GeoLens y el proxy deben compartir con el visor la red Docker `geolens_default`. El nombre interno `geolens-api-1` debe resolver en esa red y la API debe escuchar en el puerto 8000.

```bash
git clone https://github.com/smyegcaroni/visor-cuenca-caroni.git
cd visor-cuenca-caroni
cp .env.example .env
```

Complete `NASA_FIRMS_MAP_KEY` en `.env`. `CESIUM_ION_ACCESS_TOKEN` es opcional, pero los servicios de Cesium que lo requieren no funcionarán sin un token válido. `CARTO_API_KEY` permite suministrar una clave propia para los mapas base CARTO; si se omite, sus URLs se generan sin ese parámetro y su disponibilidad depende del proveedor. El archivo `.env` y los archivos privados generados se excluyen del control de versiones.

```bash
node --env-file=.env scripts/prepare_runtime.mjs
docker network inspect geolens_default
docker compose config --quiet
docker compose build terriamap
docker compose up -d
```

La compilación consume mucha memoria. En el servidor de producción con 8 GB compartidos y sin swap, una compilación provocó falta de memoria y afectó a GeoLens. Se recomienda compilar en otra máquina con memoria suficiente, transferir la imagen y desplegarla sin volver a compilar en el servidor compartido. Los límites de memoria de los servicios Compose no limitan automáticamente la memoria del proceso de compilación.

El proxy HTTPS debe reenviar al contenedor `visor-smyeg-fao` por el puerto interno 3001. El puerto publicado en el host es 3000.

## Cambios de configuración

En producción la configuración efectiva es `runtime/branding/config.json`, montada en `/app/wwwroot/config.json`. Editar únicamente `wwwroot/config.json` no modifica ese archivo montado.

Después de editar el archivo efectivo:

```bash
node -e 'JSON.parse(require("node:fs").readFileSync("runtime/branding/config.json", "utf8")); console.log("JSON válido")'
docker compose up -d --no-deps --force-recreate terriamap
curl --fail --show-error http://127.0.0.1:3000/config.json >/dev/null
```

No hace falta reconstruir la imagen por un cambio del JSON montado. Los cambios en componentes o estilos compilados sí requieren una nueva imagen. No use `docker compose down` para actualizar solo el visor: detendría también la sincronización.

El preparador sobrescribe la configuración privada a partir de la plantilla. No vuelva a ejecutarlo sobre una configuración personalizada sin incorporar antes los cambios a `runtime/branding/config.template.json` y retirar las credenciales de esa plantilla.

## Validación

```bash
node --test scripts/prepare_runtime.test.mjs
node --check geolens_collection_to_terria.mjs
node --check geolens_collections_to_terria.mjs
docker compose ps
docker logs --tail 100 visor-smyeg-fao
docker logs --tail 100 geolens-sync
curl --fail --show-error http://127.0.0.1:3000/ >/dev/null
curl --fail --show-error http://127.0.0.1:3000/init/geolens/geolens-collections.json
```

Compruebe en el navegador los dos enlaces, la ausencia de About y la apertura de los catálogos. Las pruebas del preparador no sustituyen la validación de Docker, GeoLens o la interfaz desplegada.

## Seguridad y limpieza

No publique `.env`, claves SSH, configuraciones privadas, copias de seguridad ni catálogos con claves de acceso. Si una clave se publicó en un commit anterior, eliminarla del estado actual del repositorio no la borra del historial: debe reemplazarse en el proveedor.

Antes de limpiar Docker, identifique las imágenes usadas por todos los contenedores, incluidos los detenidos. No elimine volúmenes de datos. La limpieza de la caché de compilación no detiene los servicios, pero obliga a reconstruir las capas en compilaciones posteriores.

## Actualizaciones y recuperación

Antes de modificar una instalación existente, respalde el repositorio, los archivos privados y la configuración Compose. Conserve la imagen anterior y registre los contenedores activos. Incorpore los cambios locales de las plantillas antes de volver a ejecutar el preparador.

Para actualizar únicamente el visor con una imagen ya construida y disponible localmente:

```bash
docker compose up -d --no-deps --no-build --pull never terriamap
docker compose ps terriamap
curl --fail --show-error https://visor.caroni.org.ve/config.json >/dev/null
```

Para revertir una actualización de imagen, restaure el Compose y los archivos privados del respaldo y ejecute el mismo comando con la imagen anterior. No elimine volúmenes ni reinicie servicios ajenos al visor.

Las claves que hayan aparecido en versiones anteriores continúan en el historial Git. Esta consolidación retira los valores del estado actual sin reescribir ese historial; su sustitución se gestiona con cada proveedor.

## Licencia

Se conserva la licencia de TerriaMap incluida en [LICENSE.md](LICENSE.md).
