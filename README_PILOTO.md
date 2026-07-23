# GridVision Chile — piloto gerencial v0.1.0

Esta carpeta contiene una versión web estática lista para evaluación. No requiere backend ni instalación en el equipo de quien la visita; el alojamiento solo debe servir los archivos por HTTPS.

## Funciones incluidas

- Mapa del Sistema Eléctrico Nacional con 2.856 activos puntuales y 1.050 líneas.
- Búsqueda, filtros combinables y control de capas.
- Pronóstico meteorológico de activos puntuales hasta 72 horas.
- Evaluación de alertas meteorológicas por horizonte.
- División de líneas en tramos y análisis de viento y ráfagas.
- Estimación y ranking de ráfaga transversal.
- Presentación inicial, identificación visible de piloto y advertencia de uso.

## Prueba local

Desde esta carpeta ejecutar:

```powershell
python -m http.server 8000
```

Abrir `http://localhost:8000/` y actualizar con `Ctrl + F5` cuando se reemplacen archivos.

## Publicación

El contenido de esta carpeta debe copiarse completo a la raíz del alojamiento web. `index.html` es la entrada principal.

La aplicación no implementa usuarios ni contraseñas en JavaScript. Si se requiere acceso restringido, este debe configurarse en la plataforma de alojamiento o mediante la identidad corporativa. Una contraseña escrita dentro del código frontend no constituye una protección válida.

GitHub Pages puede utilizarse para una demostración pública. Para un piloto restringido se recomienda un alojamiento corporativo con control de acceso, por ejemplo Microsoft Entra ID o una plataforma aprobada por TI.

## Conectividad requerida

El navegador debe poder acceder a:

- `api.open-meteo.com`, para el pronóstico.
- `*.tile.openstreetmap.org`, para el mapa base.

Leaflet 1.9.4 está incorporado localmente en `vendor/leaflet`, por lo que no depende de una CDN externa.

## Datos y seguridad

El paquete incluye únicamente los dos GeoJSON requeridos por la aplicación. Se omitieron archivos de diagnóstico, inventarios intermedios y la propiedad interna `ruta_origen`.

Los umbrales meteorológicos y la ráfaga transversal son preliminares. El piloto es una herramienta de conciencia situacional y no reemplaza mediciones, protecciones, procedimientos ni decisiones operacionales formales.

## Trazabilidad

- Versión: `0.1.0-piloto`
- Commit base: `67c341b`
- Fecha del paquete: 23 de julio de 2026
