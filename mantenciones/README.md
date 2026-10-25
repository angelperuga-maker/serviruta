# SERVIRUTA Mantenciones

Sitio público + panel admin para cambio de aceite y packs de mantención a domicilio (Santiago, RM). Stack: HTML single-file + Supabase (proyecto existente `bqlgfmqcefledqyodkii`) + GitHub Pages en `mantencion.serviruta.cl`.

## Archivos
| Archivo | Qué es |
|---|---|
| `index.html` | Sitio público: buscador marca→modelo→año→motor, packs con precio, formulario de solicitud, cobertura, FAQ, SEO, analítica con consentimiento. |
| `admin.html` | Panel staff (login con usuarios Supabase Auth existentes: `angel`, `nicolas`, `lily`). Solicitudes con estados e historial, precios/margen, modelos, variantes, aplicaciones, filtros, lubricantes, proveedores, comunas, CSV. |
| `config.js` | Configuración pública (URL/anon key de Supabase, WhatsApp, IDs de analítica). **Único archivo que el propietario debe editar.** |
| `supabase/migrations/20261024_mantenciones.sql` | Esquema `mant_*`, vistas públicas, RLS, triggers. Ya aplicado en producción. |
| `supabase/seed_lubricantes.sql` | 21 aceites investigados (Implementos/Autoplanet) ya cargados. |
| `supabase/seed_filtros_aplicaciones.sql` | 33 variantes semilla, 31 filtros y 33 aplicaciones (20 `needs_review`, 13 `unavailable`) ya cargadas. Nada está `verified`. |
| `vendor/supabase.js` | supabase-js 2.118.0 UMD vendorizado (el panel no depende de CDN). |
| `templates/*.csv` | Plantillas de importación (aplicaciones, filtros, lubricantes). |
| `tests/test.mjs` | Pruebas de margen, búsqueda, compatibilidad y envío de solicitud (RLS). |
| `robots.txt`, `sitemap.xml`, `CNAME` | SEO técnico y dominio. |

## Modelo de datos (sobre el cotizador existente)
- `pack_modelos` (existente, 33 modelos) → `mant_variantes` (generación/motor/combustible) → `mant_aplicaciones` (aceite, filtros, capacidad, fuente, URL, estado `verified|needs_review|unavailable`, revisor).
- `mant_lubricantes`, `mant_filtros`, `mant_proveedores`: catálogo de productos con precio ref, SKU, URL y fecha de consulta.
- `mant_packs` (plantillas esencial/estándar/completo/diésel) y `mant_pack_precios` (costos desglosados por modelo y pack; `costo_directo`, `precio_neto`, `margen_pct` son columnas calculadas; `precio_final` incluye IVA 19 %).
- `mant_comunas` (activa / confirmación / sin cobertura), `mant_solicitudes` + `mant_solicitudes_historial` (auditoría de cambios de estado).
- Vistas públicas sin costos: `v_mant_catalogo_publico`, `v_mant_variantes_publico`.

## Seguridad (probado 24-10-2026)
- Público (anon): lee catálogo/vistas; **inserta** solicitudes solo con `consentimiento=true`, honeypot vacío y `estado='nueva'`; **no lee** solicitudes, historial ni `mant_pack_precios`; máximo 3 solicitudes por teléfono cada 10 min.
- Staff (`user_metadata.rol` ∈ owner/coord_senior/coord_junior): todo. Eliminar filas: solo owner/coord_senior (control en UI; a nivel RLS cualquier staff puede).
- El frontend solo usa la anon/publishable key. `service_role` nunca en el navegador.
- ⚠️ Punto abierto heredado: las tablas antiguas `pack_modelos` y `productos_pack` tienen política pública `ALL` (cualquiera podría editarlas). Recomendado: restringir a `mant_es_staff()` cuando se confirme que ningún otro HTML las escribe de forma anónima.
- ⚠️ El rol vive en `user_metadata` (convención actual del proyecto). Es editable por el propio usuario vía API; para endurecer, mover `rol` a `app_metadata`.

## Precios y margen
`costo_directo = aceite + filtros + insumos + MO + traslado + disposición + otros`; `precio_neto = precio_final / 1,19`; `margen = (neto − costo) / neto`.
Estado actual: MO $35.000 (pago técnico) + traslado $12.000 + repuestos a precio público estimado ($59k–107k según segmento, pendiente desglose aceite/filtros). Precios publicados con **margen objetivo 40 %** (decisión del propietario 24-10-2026): city car $210.990, sedán $224.990, SUV $251.990, comercial $271.990, camioneta diésel $305.990. La fórmula del handoff (costo/0,30 = 70 %) daría $420k–$611k; se muestra como referencia en el panel.
Validar tratamiento de IVA con contador.

## Instalación / despliegue
1. Editar `config.js` (WhatsApp, GA4/Meta si corresponde).
2. Repo GitHub `angelperuga-maker/serviruta-mantenciones` → Settings → Pages → branch `main`, raíz. `CNAME` ya apunta a `mantencion.serviruta.cl`.
3. DNS (HostGator/cPanel): CNAME `mantencion` → `angelperuga-maker.github.io`. Activar "Enforce HTTPS" en Pages.
4. Supabase → Authentication → URL Configuration: agregar `https://mantencion.serviruta.cl` a Site URL / Redirect URLs (para el panel).
5. Migraciones: ya aplicadas. Para otro proyecto: ejecutar `supabase/migrations/*.sql` y luego `seed_lubricantes.sql`.
6. Backups: Supabase hace backups diarios en el plan Pro; adicionalmente exportar CSV desde el panel (botón "Exportar CSV" en cada pestaña).

## Carga de catálogo
Desde el panel (pestañas Variantes → Aplicaciones → Filtros/Lubricantes) o importando los CSV de `templates/` con la herramienta de importación de Supabase (Table Editor → Import). Regla: ninguna aplicación pasa a `verified` sin fuente, URL y fecha; la marca `verified` la pone una persona.

## Tests
```
node tests/test.mjs
```
Requiere Node ≥ 18 y acceso a `*.supabase.co`. Inserta y limpia solicitudes de prueba (`origen='test'`). Equivalente SQL ejecutado el 24-10-2026: 12/12 OK (consentimiento, honeypot, estado, teléfono, rate limit, aislamiento de lectura).

## Analítica
Eventos `dataLayer`: `vehicle_search`, `pack_view`, `form_start`, `form_submit`, `whatsapp_click`. GA4/Meta se cargan solo con IDs en `config.js` y tras aceptar el aviso de cookies. `reserva_confirmada` debe dispararse desde el panel/CRM cuando el staff confirma (no implementado en frontend público porque la confirmación no ocurre ahí).

## Pendientes que requieren decisión o credenciales del propietario
Ver sección final del informe de entrega.
