# Sincronizador cotizadores → tienda Shopify

Convierte los precios que calculan los cotizadores (con **sus propias fórmulas**) en productos de la tienda, y genera los mapas que usa el botón **"Comprar online"** (`sr/tienda.js`).

## Cuándo correrlo
Cada vez que cambies precios, modelos o niveles en un cotizador (`DATA`/`calcularKits`), en el cotizador de A/C (`CONFIG`) o publiques packs nuevos en Mantenciones.
Si no se corre, el botón **se oculta solo** en las tarjetas cuyo precio ya no coincide con Shopify (nunca cobra un precio distinto al que muestra la página).

## Cómo
```bash
cd tools/shopify-sync && mkdir -p out
export SHOPIFY_SHOP=x1zss0-wq.myshopify.com SHOPIFY_CLIENT_ID=... SHOPIFY_CLIENT_SECRET=...
node 1_extraer_precios.js          # ejecuta DATA + calcularKits de cada HTML → out/precios.json
python3 2_armar_productos.py       # arma productos (vehículo × nivel) → out/shopify_cotiz_products.json
python3 3_subir_shopify.py         # crea/actualiza productos por handle (idempotente)
python3 4_publicar_y_mapear.py     # publica en la tienda y verifica precio de cada variante → out/shopify_map.json
python3 5_generar_mapas.py         # escribe sr/map/*.js
```
Mantenciones: `mant_packs.json` se actualiza desde Supabase (`mant_pack_precios` publicados + `pack_modelos`); `mant_modelo_ids.json` relaciona cada pack con `pack_modelos.id`.

## Productos en Shopify (tipo "Servicios a domicilio", colección `mantencion-reparacion-domicilio`)
| Cotizador | Producto (handle) | Variantes |
|---|---|---|
| kits-mantencion-auto | kit-mantencion-auto-domicilio | 92 vehículos × 3 kits |
| kits-mantencion-motor-camion | kit-mantencion-motor-camion | 37 × 3 |
| kit-embrague-auto | cambio-kit-embrague-auto | 79 × 3 |
| kit-embrague-camion | cambio-kit-embrague-camion | 37 × 3 |
| baterias-auto-camion | bateria-instalada-segun-vehiculo | 100 × 3 |
| mantenciones | pack-mantencion-completo / pack-mantencion-diesel | 25 / 8 |
| cotizador-aire-acondicionado | aire-acondicionado-* (6 servicios) | por segmento (y refrigerante) |

El compresor de A/C ("desde") no se vende online: se cotiza por WhatsApp.
