# Visor de la Cuenca del Río Caroní

Aplicación cartográfica web del Sistema de Monitoreo y Evaluación Geoespacial (SMyEG) para la cuenca del río Caroní. La instancia de producción está disponible en [visor.caroni.org.ve](https://visor.caroni.org.ve).

El proyecto se basa en [TerriaMap 0.4.8](https://github.com/TerriaJS/TerriaMap/releases/tag/v0.4.8), que integra TerriaJS 8.13.0. Esta rama incorpora la identidad visual del proyecto, la configuración del visor, catálogos iniciales y sincronizadores para consumir colecciones publicadas por GeoLens.

## Componentes

- TerriaMap y `terriajs-server` en el puerto interno `3001`.
- Imagen Docker `visor-smyeg-fao:latest`.
- Publicación local del contenedor en el puerto `3000`.
- Sincronizadores GeoLens ejecutados con Node.js 22.
- Catálogos dinámicos escritos en `runtime/geolens/` y montados como archivos de solo lectura en el visor.
- Nginx Proxy Manager como terminación HTTPS en el entorno de producción.

## Requisitos

- Docker Engine con Docker Compose v2.
- Al menos 6 GB de memoria disponibles durante la construcción.
- Acceso saliente a los registros de paquetes y a la instancia GeoLens configurada en `docker-compose.yml`.
- Una red Docker externa llamada `geolens_default` cuando se use el Compose incluido.

## Despliegue

```bash
git clone https://github.com/smyegcaroni/visor-cuenca-caroni.git
cd visor-cuenca-caroni

docker network inspect geolens_default >/dev/null 2>&1 \
  || docker network create geolens_default

docker build --pull -t visor-smyeg-fao:latest .
docker compose config --quiet
docker compose up -d
```

Comprobaciones mínimas:

```bash
docker compose ps
docker logs --tail 100 visor-smyeg-fao
curl --fail --show-error http://127.0.0.1:3000/
```

El proxy inverso debe compartir la red `geolens_default` y reenviar las solicitudes al servicio `visor-smyeg-fao` por el puerto interno `3001`. Las claves, contraseñas y archivos privados no deben incorporarse al repositorio.

## Actualización desde TerriaMap

```bash
git remote add upstream https://github.com/TerriaJS/TerriaMap.git
git fetch upstream --tags
git merge upstream/main

docker build --pull -t visor-smyeg-fao:latest .
docker compose up -d --no-deps --force-recreate terriamap
```

Antes de actualizar producción se debe conservar una imagen de reversión, revisar los cambios locales y comprobar la página principal, `config.json`, los catálogos iniciales y el certificado HTTPS.

## Licencia y proyecto base

El código derivado de TerriaMap conserva la licencia incluida en [LICENSE.md](LICENSE.md). La documentación general de TerriaJS está disponible en [docs.terria.io](https://docs.terria.io/).
