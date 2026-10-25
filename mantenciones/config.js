// SERVIRUTA Mantenciones — configuración pública (sin secretos).
// La anon/publishable key es pública por diseño; la seguridad está en RLS.
window.SERVIRUTA_CONFIG = {
  SUPABASE_URL: "https://bqlgfmqcefledqyodkii.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_h33L3eMAcskEsPi93Liohg__FfzCxOE",
  SITE_URL: "https://angelperuga-maker.github.io/serviruta/mantenciones",
  // WhatsApp en formato internacional sin "+" (ej: "56912345678"). Vacío = el botón no se muestra.
  WHATSAPP: "",
  // IDs de analítica. Vacíos = no se carga nada. Solo se activan tras consentimiento del visitante.
  GA4_ID: "",
  META_PIXEL_ID: "",
  // Horario de atención mostrado en el formulario
  HORARIO: "Lunes a viernes 08:00–18:00 · Sábado 08:00–13:00",
  DOMINIO_LOGIN: "serviruta.local"
};
