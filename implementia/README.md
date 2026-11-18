# ImplementIA · Central

Central interna de ImplementIA: motor comercial con agentes y gestión de clientes.

- `index.html` — la central (solo equipo ImplementIA). Inicio con meta, Bandeja de aprobación, Prospectos, Embudo, Conversaciones, Demos, Propuestas, Clientes, Agentes y Ajustes.
- `propuesta.html?t=<token>` — página pública de la propuesta; el taller la acepta con nombre y RUT.
- Usa el mismo Supabase que ImplementIA Taller (`../implementia-taller/config.js`).

## Agentes (Supabase Edge Functions)
| Función | Qué hace |
| --- | --- |
| `prospector` | 1 · Busca talleres en Google Maps por comuna y les pone puntaje |
| `comercial` | 2 Investigador · 3 Contacto · 5 Preparador de demo · 6 Propuesta · 7 Implementador · Orquestador diario |
| `vendedor-wa` | 4 · Vendedor por WhatsApp: califica y agenda demos (lo llama `whatsapp-webhook` cuando escribe al número de ventas) |
| `ver-propuesta` | API pública de la propuesta (ver, aceptar, rechazar) |

El orquestador corre de lunes a sábado a las 08:30 (cron `motor-comercial-diario`).

Secretos: `GOOGLE_PLACES_KEY`, `ANTHROPIC_API_KEY`, `WA_ACCESS_TOKEN`, `WA_VERIFY_TOKEN`. Sin la llave de Anthropic los agentes usan textos de plantilla.

El código de las funciones está en `supabase/functions/` (cada función lleva su copia de `_comun.ts`).
