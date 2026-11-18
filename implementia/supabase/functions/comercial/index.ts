// ImplementIA · motor comercial (agentes 2, 3, 5, 6, implementador y orquestador diario)
// POST { accion, ...params }  — sesión de staff ImplementIA o encabezado x-cron-secret
//   investigar   { limite?, ids? }        Agente 2: diagnóstico y gancho por taller
//   contactar    { limite? }              Agente 3: borradores de la secuencia + seguimientos + recordatorios
//   enviar       { mensaje_id, texto?, modo: "api" | "manual" }
//   preparar_demo{ prospecto_id, demo_id? } Agente 5: taller demo cargado + guion
//   proponer     { prospecto_id, plan? }  Agente 6: propuesta personalizada + mensaje con link
//   implementar  { propuesta_id }         Agente 7: crea el taller cliente y el plan de implementación
//   diario       {}                       Orquestador: investigar + contactar + resumen
import {
  db, json, cors, claude, claudeJSON, enviarWA, enviarPlantillaWA, ventasConfig, log, autorizar,
  peso, localHoy, horaLocal, CONTEXTO_IMPLEMENTIA,
} from "./_comun.ts";

type P = Record<string, any>;
const DIA = 864e5;

// ─────────────────────────── Agente 2: investigador ───────────────────────────
async function detalleGoogle(placeId: string) {
  const key = Deno.env.get("GOOGLE_PLACES_KEY");
  if (!key || !placeId) return null;
  const r = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=es`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "reviews,regularOpeningHours.weekdayDescriptions,editorialSummary" },
  });
  if (!r.ok) return null;
  const d = await r.json();
  return {
    horario: d.regularOpeningHours?.weekdayDescriptions ?? null,
    resumen: d.editorialSummary?.text ?? null,
    resenas: (d.reviews ?? []).slice(0, 5).map((x: any) => ({ estrellas: x.rating, texto: (x.text?.text ?? "").slice(0, 400), hace: x.relativePublishTimeDescription })),
  };
}
async function senalesWeb(url?: string | null) {
  if (!url || /facebook|instagram/i.test(url)) return null;
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 6000);
    const r = await fetch(url, { signal: c.signal, redirect: "follow" }); clearTimeout(t);
    const h = (await r.text()).slice(0, 300000).toLowerCase();
    return {
      boton_whatsapp: /wa\.me|api\.whatsapp|whatsapp/.test(h),
      agenda_online: /agend|reserva|booking|calendly|turno/.test(h),
      muestra_precios: /\$\s?\d{2,3}\.\d{3}/.test(h),
      instagram: h.match(/instagram\.com\/([a-z0-9_.]+)/)?.[1] ?? null,
      email: h.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.(cl|com)/)?.[0] ?? null,
    };
  } catch { return { error: "sitio no responde" }; }
}

async function investigar(p: P) {
  const cfg = await ventasConfig();
  let q = db.from("prospectos").select("*");
  q = p.ids?.length ? q.in("id", p.ids) : q.eq("estado", "nuevo").gte("puntaje", 40).order("puntaje", { ascending: false }).limit(p.limite ?? cfg.investigar_por_dia);
  const { data: lista } = await q;
  let hechos = 0;
  for (const x of lista ?? []) {
    const [g, w] = await Promise.all([detalleGoogle(x.place_id), senalesWeb(x.web)]);
    const datos = { nombre: x.nombre, comuna: x.comuna, rating: x.rating, resenas: x.n_resenas, web: x.web, motivos: x.motivos, google: g, sitio: w };
    const ia = await claudeJSON<{ diagnostico: string; gancho: string; dolor: string; plan_sugerido: string }>(
      `Eres analista comercial de ImplementIA. ${CONTEXTO_IMPLEMENTIA}
Con los datos públicos de un taller mecánico, escribe:
- diagnostico: 3 o 4 viñetas cortas (empiezan con "• ") sobre su atención, presencia digital y oportunidades que el sistema resuelve. Basadas solo en los datos; si citas reseñas, parafrasea.
- gancho: UNA frase concreta y respetuosa para abrir conversación con el dueño (ej. algo que dicen sus reseñas, que no tiene agenda online, que responde por Instagram).
- dolor: el problema más probable del taller en pocas palabras.
- plan_sugerido: "taller_que_vende" si parece grande o con demanda alta, "taller_completo" si es mediano, "taller_ordenado" si es chico.`,
      JSON.stringify(datos), 1200,
    );
    const m: string[] = x.motivos ?? [];
    const upd: P = {
      estado: "investigado",
      proximo_contacto_at: new Date().toISOString(),
      diagnostico: ia?.diagnostico ?? m.map((s) => "• " + s).join("\n"),
      gancho: ia?.gancho ?? (m.includes("Sin sitio web") ? `Vi que ${x.nombre} tiene muy buenas reseñas pero no tiene dónde agendar en línea.` : `Vi las reseñas de ${x.nombre} en Google.`),
      dolor: ia?.dolor ?? null,
      plan_sugerido: ia?.plan_sugerido ?? (x.n_resenas > 250 ? "taller_que_vende" : x.n_resenas > 60 ? "taller_completo" : "taller_ordenado"),
    };
    if (w && !("error" in w)) { if (w.email && !x.email) upd.email = w.email; if (w.instagram && !x.instagram) upd.instagram = w.instagram; }
    await db.from("prospectos").update(upd).eq("id", x.id);
    hechos++;
  }
  const resumen = `${hechos} talleres investigados.`;
  await log("investigador", resumen, { ids: (lista ?? []).map((x) => x.id) });
  return { resumen, investigados: hechos };
}

// ─────────────────────────── Agente 3: contacto ───────────────────────────
async function contactar(p: P) {
  const cfg = await ventasConfig();
  const { data: pasos } = await db.from("secuencia_pasos").select("*").order("paso");
  const maxPaso = Math.max(...(pasos ?? []).map((s) => s.paso));
  const hoyInicio = new Date(new Date().setUTCHours(3, 0, 0, 0)).toISOString();
  const { count: hechosHoy } = await db.from("prospecto_mensajes").select("id", { count: "exact", head: true })
    .eq("agente", "contacto").gte("creado_at", hoyInicio);
  const cupo = Math.max(0, (p.limite ?? cfg.limite_diario_contactos) - (hechosHoy ?? 0));

  const { data: pend } = await db.from("prospecto_mensajes").select("prospecto_id").eq("estado", "borrador");
  const conBorrador = new Set((pend ?? []).map((x) => x.prospecto_id));

  // 1) Secuencia
  const { data: cand } = await db.from("prospectos").select("*")
    .in("estado", ["investigado", "contactado"]).lt("secuencia_paso", maxPaso)
    .or(`proximo_contacto_at.is.null,proximo_contacto_at.lte.${new Date().toISOString()}`)
    .order("puntaje", { ascending: false }).limit(cupo + conBorrador.size);
  const lista = (cand ?? []).filter((x) => !conBorrador.has(x.id)).slice(0, cupo);

  const tareas = lista.map((x) => {
    const paso = pasos!.find((s) => s.paso === x.secuencia_paso + 1)!;
    let canal = paso.canal;
    if (canal === "email" && !x.email) canal = x.telefono ? "whatsapp" : "email";
    if (canal === "whatsapp" && !x.telefono) canal = x.email ? "email" : "llamada";
    return { x, paso, canal };
  });

  let creados = 0;
  for (let i = 0; i < tareas.length; i += 12) {
    const lote = tareas.slice(i, i + 12);
    const ia = await claudeJSON<Record<string, { asunto?: string; texto: string }>>(
      `Eres ${cfg.vendedor_nombre}, fundador de ${cfg.empresa}. ${CONTEXTO_IMPLEMENTIA}
Escribes mensajes de prospección a dueños de talleres mecánicos de Chile, uno por taller, según el objetivo del paso y el canal.
Reglas: tono de colega emprendedor, directo, sin exageraciones ni emojis en exceso; español de Chile sin modismos.
WhatsApp: máximo 3 frases cortas. Email: asunto de menos de 8 palabras y 4 a 6 frases. Llamada: guion de 3 líneas para decir por teléfono.
Usa el gancho y el diagnóstico de cada taller; nunca inventes datos del taller ni cifras de resultados.
Oferta fundador (solo si el paso lo pide): ${cfg.oferta_fundador}
Formato: {"<id>": {"asunto": "...(solo email)", "texto": "..."}}`,
      JSON.stringify(lote.map(({ x, paso, canal }) => ({
        id: x.id, taller: x.nombre, comuna: x.comuna, contacto: x.contacto_nombre, canal, paso: paso.paso, objetivo: paso.objetivo,
        gancho: x.gancho, diagnostico: x.diagnostico, dolor: x.dolor,
      }))),
      4000,
    );
    const filas = lote.map(({ x, paso, canal }) => {
      const r = ia?.[x.id];
      return {
        prospecto_id: x.id, canal, direccion: "saliente", autor: "agente", agente: "contacto", paso: paso.paso, estado: "borrador",
        asunto: canal === "email" ? (r?.asunto ?? `Una idea para ${x.nombre}`) : null,
        texto: r?.texto ?? plantillaPaso(paso.paso, x, cfg),
      };
    });
    if (filas.length) { await db.from("prospecto_mensajes").insert(filas); creados += filas.length; }
  }

  // 2) Seguimiento de propuestas sin respuesta (3+ días)
  const { data: props } = await db.from("propuestas_comerciales").select("id,prospecto_id,plan,enviada_at,prospectos(nombre,contacto_nombre,telefono)")
    .in("estado", ["enviada", "vista"]).lt("enviada_at", new Date(Date.now() - 3 * DIA).toISOString());
  let seguimientos = 0;
  for (const pr of props ?? []) {
    if (conBorrador.has(pr.prospecto_id)) continue;
    const { count } = await db.from("prospecto_mensajes").select("id", { count: "exact", head: true })
      .eq("prospecto_id", pr.prospecto_id).eq("agente", "seguimiento").gte("creado_at", new Date(Date.now() - 3 * DIA).toISOString());
    if (count) continue;
    const pp: any = pr.prospectos;
    const texto = await claude(
      `Eres ${cfg.vendedor_nombre} de ${cfg.empresa}. Escribe un WhatsApp de seguimiento (2 frases) a un dueño de taller que recibió una propuesta hace unos días y no ha respondido. Pregunta si tiene alguna duda y ofrece una llamada de 10 minutos. Sin presión.`,
      JSON.stringify({ taller: pp?.nombre, contacto: pp?.contacto_nombre }), 300,
    ) ?? `Hola${pp?.contacto_nombre ? " " + pp.contacto_nombre.split(" ")[0] : ""}, ¿pudiste revisar la propuesta para ${pp?.nombre}? Si tienes alguna duda la vemos en una llamada de 10 minutos.`;
    await db.from("prospecto_mensajes").insert({ prospecto_id: pr.prospecto_id, canal: pp?.telefono ? "whatsapp" : "email", direccion: "saliente", autor: "agente", agente: "seguimiento", texto, estado: "borrador" });
    seguimientos++;
  }

  // 3) Recordatorio de demos de mañana
  const manana = new Date(Date.now() + DIA); const fin = new Date(Date.now() + 2 * DIA);
  const { data: demos } = await db.from("demos").select("id,inicio,prospecto_id,prospectos(nombre,contacto_nombre)")
    .eq("estado", "agendada").gte("inicio", new Date().toISOString()).lt("inicio", fin.toISOString());
  let recordatorios = 0;
  for (const d of demos ?? []) {
    if (new Date(d.inicio) < manana && new Date(d.inicio).getTime() - Date.now() < 3 * 3600e3) continue;
    const { count } = await db.from("prospecto_mensajes").select("id", { count: "exact", head: true }).eq("prospecto_id", d.prospecto_id).eq("agente", "recordatorio");
    if (count) continue;
    const pp: any = d.prospectos;
    await db.from("prospecto_mensajes").insert({
      prospecto_id: d.prospecto_id, canal: "whatsapp", direccion: "saliente", autor: "agente", agente: "recordatorio", estado: "borrador",
      texto: `Hola${pp?.contacto_nombre ? " " + pp.contacto_nombre.split(" ")[0] : ""}, te confirmo la demo de ${cfg.empresa} el ${horaLocal(d.inicio)}. Vas a ver ${pp?.nombre} funcionando con el sistema. ¿Sigue en pie?`,
    });
    recordatorios++;
  }

  const resumen = `${creados} mensajes de secuencia, ${seguimientos} seguimientos de propuesta y ${recordatorios} recordatorios de demo listos para aprobar.`;
  await log("contacto", resumen);
  return { resumen, creados, seguimientos, recordatorios };
}

function plantillaPaso(paso: number, x: P, cfg: P) {
  const hola = `Hola${x.contacto_nombre ? " " + x.contacto_nombre.split(" ")[0] : ""}`;
  if (paso === 1) return `${hola}, soy ${cfg.vendedor_nombre} de ${cfg.empresa}. ${x.gancho ?? ""} ¿Hoy cómo agendan las horas en ${x.nombre}, por WhatsApp o teléfono?`;
  if (paso === 2) return `${hola}, te escribo de ${cfg.empresa}. En Serviruta usamos un sistema donde WhatsApp responde y agenda solo, el mecánico arma su día desde el celular y las comisiones se calculan solas. Lo estamos instalando en talleres como ${x.nombre}. ¿Te muestro tu taller funcionando en una demo de 30 minutos?`;
  if (paso === 3) return `${hola}, ${cfg.oferta_fundador} Te armo la demo con ${x.nombre} ya cargado. ¿Te acomoda esta semana?`;
  return `${hola}, no te molesto más por ahora. Si más adelante quieres ordenar ${x.nombre} con WhatsApp automático y agenda, me escribes por aquí. ¡Éxito!`;
}

// ─────────────────────────── Envío ───────────────────────────
async function aplicarEnvio(m: P) {
  await db.from("prospecto_mensajes").update({ estado: "enviado", enviado_at: new Date().toISOString(), error: null }).eq("id", m.id);
  const { data: x } = await db.from("prospectos").select("*").eq("id", m.prospecto_id).single();
  const upd: P = { ultimo_contacto: new Date().toISOString() };
  if (m.paso) {
    const { data: pasos } = await db.from("secuencia_pasos").select("*").order("paso");
    const actual = pasos!.find((s) => s.paso === m.paso);
    const sig = pasos!.find((s) => s.paso === m.paso + 1);
    upd.secuencia_paso = Math.max(x!.secuencia_paso, m.paso);
    upd.proximo_contacto_at = sig ? new Date(Date.now() + (sig.dia - actual!.dia) * DIA).toISOString() : null;
    if (!sig) upd.proximo_paso = "Secuencia terminada sin respuesta";
    if (["nuevo", "investigado"].includes(x!.estado)) upd.estado = "contactado";
  }
  if (m.agente === "propuesta") {
    await db.from("propuestas_comerciales").update({ estado: "enviada", enviada_at: new Date().toISOString() })
      .eq("prospecto_id", m.prospecto_id).eq("estado", "borrador");
  }
  await db.from("prospectos").update(upd).eq("id", m.prospecto_id);
}

async function enviar(p: P) {
  const { data: m } = await db.from("prospecto_mensajes").select("*").eq("id", p.mensaje_id).single();
  if (!m) throw new Error("Mensaje no existe");
  if (m.estado === "enviado") return { resumen: "Ya estaba enviado." };
  if (p.texto) { await db.from("prospecto_mensajes").update({ texto: p.texto, asunto: p.asunto ?? m.asunto }).eq("id", m.id); m.texto = p.texto; }
  if (p.modo === "manual") { await aplicarEnvio(m); return { resumen: "Marcado como enviado." }; }
  if (m.canal !== "whatsapp") throw new Error("Este canal se envía a mano: usa 'Ya lo envié'.");

  const cfg = await ventasConfig();
  const { data: x } = await db.from("prospectos").select("wa_digitos,nombre,contacto_nombre").eq("id", m.prospecto_id).single();
  if (!cfg.wa_phone_number_id || !Deno.env.get("WA_ACCESS_TOKEN")) throw new Error("WhatsApp de ventas no conectado: usa 'Abrir en WhatsApp'.");
  if (!x?.wa_digitos) throw new Error("El prospecto no tiene teléfono.");
  const { data: ult } = await db.from("prospecto_mensajes").select("creado_at").eq("prospecto_id", m.prospecto_id)
    .eq("direccion", "entrante").order("creado_at", { ascending: false }).limit(1).maybeSingle();
  const enVentana = ult && Date.now() - new Date(ult.creado_at).getTime() < 23.5 * 3600e3;
  let err: string | null;
  if (enVentana) err = await enviarWA(cfg.wa_phone_number_id, x.wa_digitos, m.texto);
  else if (cfg.wa_plantilla) err = await enviarPlantillaWA(cfg.wa_phone_number_id, x.wa_digitos, cfg.wa_plantilla, cfg.wa_plantilla_idioma, [x.contacto_nombre?.split(" ")[0] ?? x.nombre]);
  else throw new Error("Fuera de la ventana de 24 h y sin plantilla aprobada: usa 'Abrir en WhatsApp'.");
  if (err) { await db.from("prospecto_mensajes").update({ estado: "error", error: err }).eq("id", m.id); throw new Error(err); }
  await aplicarEnvio(m);
  return { resumen: enVentana ? "Enviado por WhatsApp." : "Enviada la plantilla de primer contacto." };
}

// ─────────────────────────── Agente 5: preparador de demo ───────────────────────────
const CATALOGO_BASE = [
  { tipo: "servicio", nombre: "Diagnóstico con escáner", incluye: "Lectura de fallas y revisión de sensores", precio: 35000, minutos: 45 },
  { tipo: "servicio", nombre: "Cambio de aceite y filtro", incluye: "Aceite sintético hasta 4 L y filtro", precio: 59000, minutos: 45 },
  { tipo: "pack", nombre: "Mantención 10.000 km", incluye: "Aceite, filtros de aceite y aire, revisión de 25 puntos", precio: 129000, minutos: 120 },
  { tipo: "pack", nombre: "Mantención 40.000 km", incluye: "Aceite, todos los filtros, bujías, líquido de frenos", precio: 289000, minutos: 240 },
  { tipo: "servicio", nombre: "Pastillas de freno delanteras", incluye: "Pastillas y mano de obra", precio: 69000, minutos: 60 },
  { tipo: "servicio", nombre: "Discos y pastillas delanteras", incluye: "Discos, pastillas y mano de obra", precio: 159000, minutos: 120 },
  { tipo: "servicio", nombre: "Kit de embrague", incluye: "Kit y mano de obra", precio: 390000, minutos: 360 },
  { tipo: "servicio", nombre: "Correa de distribución", incluye: "Kit, bomba de agua y mano de obra", precio: 320000, minutos: 300 },
  { tipo: "servicio", nombre: "Alineación y balanceo", incluye: "4 ruedas", precio: 25000, minutos: 45 },
  { tipo: "servicio", nombre: "Revisión de suspensión", incluye: "Diagnóstico de amortiguadores y tren delantero", precio: 20000, minutos: 30 },
  { tipo: "servicio", nombre: "Carga de aire acondicionado", incluye: "Gas y revisión de fugas", precio: 45000, minutos: 60 },
  { tipo: "pack", nombre: "Pre revisión técnica", incluye: "Luces, frenos, emisiones y holguras", precio: 39000, minutos: 60 },
];
const NOMBRES = ["Carolina Muñoz", "Jorge Fuentes", "Patricia Rojas", "Felipe Soto", "Daniela Contreras", "Rodrigo Silva"];
const AUTOS = [["Toyota", "Yaris", 2018], ["Chevrolet", "Sail", 2019], ["Hyundai", "Accent", 2017], ["Kia", "Rio", 2020], ["Nissan", "Versa", 2016], ["Suzuki", "Swift", 2021]];

async function prepararDemo(p: P) {
  const { data: x } = await db.from("prospectos").select("*").eq("id", p.prospecto_id).single();
  if (!x) throw new Error("Prospecto no existe");
  let tid = x.demo_taller_id as string | null;

  if (!tid) {
    const { data: t, error } = await db.from("talleres").insert({ nombre: `${x.nombre} (demo)`, es_demo: true, prospecto_id: x.id }).select("id").single();
    if (error) throw error;
    tid = t.id;
    await db.from("taller_config").upsert({ taller_id: tid, direccion: x.direccion, bot_instrucciones: "Taller de demostración." });

    const cat = await claudeJSON<typeof CATALOGO_BASE>(
      `Arma el catálogo de servicios de demostración para un taller mecánico de Chile: 12 ítems (servicios y packs) con precios realistas en pesos chilenos, IVA incluido. Ajusta a lo que el taller parece hacer según su nombre y diagnóstico (ej. si es de camiones, diésel, frenos o transmisiones). Formato: [{"tipo":"servicio|pack","nombre":"","incluye":"","precio":0,"minutos":0}]`,
      JSON.stringify({ taller: x.nombre, diagnostico: x.diagnostico, dolor: x.dolor }), 2000,
    );
    const items = (cat?.length ? cat : CATALOGO_BASE).slice(0, 14).map((c, i) => ({
      taller_id: tid, tipo: c.tipo === "pack" ? "pack" : "servicio", nombre: c.nombre, incluye: c.incluye, precio: Math.round(Number(c.precio) || 0),
      minutos: c.minutos ?? 60, bot_puede_cotizar: true, activo: true, orden: i,
    }));
    await db.from("catalogo").insert(items);

    // Clientes, vehículos, agenda y órdenes de ejemplo
    const etapas = ["nuevo", "contactado", "cotizado", "agendado", "ejecutado", "postventa"];
    const hoy = localHoy();
    for (let i = 0; i < NOMBRES.length; i++) {
      const { data: c } = await db.from("clientes").insert({
        taller_id: tid, nombre: NOMBRES[i], telefono: `5699${(1000000 + i * 137531).toString().slice(0, 7)}`, comuna: x.comuna,
        fuente: i % 2 ? "whatsapp" : "meta", etapa: etapas[i], proxima_accion: i < 3 ? "Llamar para cerrar" : null, proxima_accion_fecha: hoy,
      }).select("id").single();
      const [marca, modelo, anio] = AUTOS[i];
      const { data: v } = await db.from("vehiculos").insert({
        taller_id: tid, cliente_id: c!.id, patente: `DEMO${i}${String.fromCharCode(65 + i)}`, marca, modelo, anio, kilometraje: 40000 + i * 15000,
      }).select("id").single();
      if (i >= 2 && i <= 4) {
        await db.from("agenda").insert({
          taller_id: tid, cliente_id: c!.id, vehiculo_id: v!.id, servicio: items[i].nombre, origen: i === 3 ? "bot" : "manual",
          inicio: new Date(Date.now() + (i - 1) * 3 * 3600e3).toISOString(),
        });
      }
      if (i >= 3) {
        await db.from("ordenes_trabajo").insert({
          taller_id: tid, cliente_id: c!.id, vehiculo_id: v!.id, estado: ["en_trabajo", "listo", "ingresado"][i - 3],
          total: items[i].precio, mano_obra: Math.round(items[i].precio * 0.4), notas: items[i].nombre,
        });
      }
    }
    await db.from("prospectos").update({ demo_taller_id: tid }).eq("id", x.id);
  }

  const cfg = await ventasConfig();
  const guion = await claude(
    `Eres coach comercial de ImplementIA. ${CONTEXTO_IMPLEMENTIA}
Escribe el guion de una demo de 30 a 45 minutos para ${cfg.vendedor_nombre}, con el taller del prospecto ya cargado en el sistema. Estructura breve:
1. Apertura (2 preguntas para confirmar su dolor)
2. Qué mostrar, en orden, conectado a SU dolor (máximo 5 pasos)
3. Preguntas de cierre y manejo de 3 objeciones probables (precio, tiempo, "mis mecánicos no usan apps")
4. Plan recomendado y cierre con la oferta fundador: ${cfg.oferta_fundador}
Usa viñetas cortas, en español de Chile.`,
    JSON.stringify({ taller: x.nombre, comuna: x.comuna, diagnostico: x.diagnostico, dolor: x.dolor, n_mecanicos: x.n_mecanicos, ot_mes: x.ot_mes, como_agenda: x.como_agenda, plan_sugerido: x.plan_sugerido }),
    1800,
  ) ?? `1. Apertura: ¿cuántas consultas por WhatsApp se les quedan sin responder? ¿Cómo saben hoy cuánto lleva cada mecánico en comisiones?
2. Mostrar: bot de WhatsApp agendando → agenda del día → app del mecánico con fotos → presupuesto aceptado abre OT → tablero del dueño.
3. Objeciones: precio (se paga con 2 o 3 trabajos más al mes), tiempo (lo implementamos nosotros en 2 semanas), mecánicos (la app es como WhatsApp).
4. Cierre: plan ${x.plan_sugerido ?? "Taller Completo"} con la oferta fundador.`;

  let q = db.from("demos").update({ guion }).eq("prospecto_id", x.id);
  q = p.demo_id ? q.eq("id", p.demo_id) : q.eq("estado", "agendada");
  await q;
  await db.from("prospectos").update({ notas: x.notas, proximo_paso: "Demo preparada" }).eq("id", x.id);
  await log("demo", `Demo preparada para ${x.nombre}.`, { prospecto_id: x.id, taller_demo: tid });
  return { resumen: `Demo lista: taller "${x.nombre} (demo)" cargado y guion escrito.`, taller_demo_id: tid, guion };
}

// ─────────────────────────── Agente 6: propuesta ───────────────────────────
async function proponer(p: P) {
  const cfg = await ventasConfig();
  const { data: x } = await db.from("prospectos").select("*").eq("id", p.prospecto_id).single();
  if (!x) throw new Error("Prospecto no existe");
  const codigo = p.plan ?? x.plan_sugerido ?? ((x.n_mecanicos ?? 0) >= 6 ? "taller_que_vende" : (x.n_mecanicos ?? 0) >= 3 ? "taller_completo" : "taller_ordenado");
  const { data: plan } = await db.from("planes").select("*").eq("codigo", codigo).single();
  const desc = Number(p.descuento_pct ?? cfg.descuento_fundador_pct ?? 0);
  const impl = Math.round(plan!.implementacion * (1 - desc / 100));
  const cuotas = p.cuotas ?? cfg.cuotas_fundador ?? 1;

  const contenido = await claude(
    `Eres ${cfg.vendedor_nombre}, fundador de ${cfg.empresa}. ${CONTEXTO_IMPLEMENTIA}
Escribe en Markdown el cuerpo de una propuesta comercial breve y personalizada para el dueño de un taller. Secciones con "## ":
## Lo que vimos en tu taller (desde el diagnóstico y lo conversado; sin inventar)
## Cómo va a funcionar tu taller (5 a 7 viñetas concretas del día a día)
## Implementación en 14 días (4 hitos)
## Garantía
No incluyas precios (se muestran aparte). Máximo 350 palabras.`,
    JSON.stringify({ taller: x.nombre, contacto: x.contacto_nombre, diagnostico: x.diagnostico, dolor: x.dolor, n_mecanicos: x.n_mecanicos, ot_mes: x.ot_mes, como_agenda: x.como_agenda, plan: plan!.nombre, incluye: plan!.resumen, garantia: cfg.garantia }),
    1800,
  ) ?? `## Lo que vimos en tu taller
${x.diagnostico ?? "• Conversamos sobre cómo ordenar la agenda y la atención por WhatsApp."}

## Cómo va a funcionar tu taller
- Cada mensaje de WhatsApp se responde en segundos y la hora queda agendada.
- El presupuesto aceptado abre la orden de trabajo sola.
- Cada mecánico ve su día en el celular, sube fotos y ve sus comisiones.
- Cada mañana los agentes dejan listos los seguimientos a clientes.
- Tú ves en un tablero cuánto se vendió, qué está pendiente y qué atender.

## Implementación en 14 días
1. Día 1: reunión de inicio y carga de servicios y precios.
2. Día 3: usuarios, horario y WhatsApp conectado.
3. Día 7: capacitación al equipo.
4. Día 14: bot y agentes funcionando, revisión de la primera semana.

## Garantía
${cfg.garantia}`;

  await db.from("propuestas_comerciales").update({ estado: "rechazada", motivo_rechazo: "Reemplazada por una nueva versión" })
    .eq("prospecto_id", x.id).eq("estado", "borrador");
  const { data: prop, error } = await db.from("propuestas_comerciales").insert({
    prospecto_id: x.id, plan: codigo, implementacion: impl, mensual: plan!.mensual, descuento_pct: desc, cuotas, contenido,
  }).select("id,token").single();
  if (error) throw error;
  const link = `${cfg.url_central}propuesta.html?t=${prop.token}`;
  const hola = `Hola${x.contacto_nombre ? " " + x.contacto_nombre.split(" ")[0] : ""}`;
  await db.from("prospecto_mensajes").insert({
    prospecto_id: x.id, canal: x.telefono ? "whatsapp" : "email", direccion: "saliente", autor: "agente", agente: "propuesta", estado: "borrador",
    asunto: x.telefono ? null : `Propuesta ${cfg.empresa} para ${x.nombre}`,
    texto: `${hola}, gracias por tu tiempo. Aquí está la propuesta para ${x.nombre}: ${link}\nPlan ${plan!.nombre}: implementación ${peso(impl)}${cuotas > 1 ? ` en ${cuotas} cuotas` : ""} + ${peso(plan!.mensual)} mensual (más IVA). Si te hace sentido, la aceptas desde el mismo link y partimos esta semana.`,
  });
  await db.from("prospectos").update({ estado: "propuesta", proximo_paso: "Enviar propuesta" }).eq("id", x.id);
  await log("propuesta", `Propuesta ${plan!.nombre} para ${x.nombre} (${peso(impl)} + ${peso(plan!.mensual)}/mes).`, { propuesta_id: prop.id });
  return { resumen: "Propuesta creada y mensaje listo para aprobar.", propuesta_id: prop.id, link };
}

// ─────────────────────────── Agente 7: implementador ───────────────────────────
const CHECKLIST = [
  "Reunión de inicio con el dueño", "Cobrar implementación (o primera cuota)", "Cargar servicios y packs con precios reales",
  "Configurar horario, cupos por hora y dirección", "Crear usuarios: dueño, recepción y mecánicos", "Configurar comisiones por mecánico",
  "Conectar el número de WhatsApp del taller", "Cargar clientes y vehículos históricos", "Capacitación al dueño y recepción",
  "Capacitación a mecánicos (app)", "Activar bot de WhatsApp", "Activar agentes diarios", "Lanzar primera campaña de anuncios",
  "Revisión de la primera semana", "Pedir testimonio en video",
];
async function implementar(p: P) {
  const { data: prop } = await db.from("propuestas_comerciales").select("*, planes(nombre)").eq("id", p.propuesta_id).single();
  if (!prop) throw new Error("Propuesta no existe");
  const { data: x } = await db.from("prospectos").select("*").eq("id", prop.prospecto_id).single();
  const { data: ya } = await db.from("talleres").select("id").eq("prospecto_id", x!.id).eq("es_demo", false).maybeSingle();
  if (ya) return { resumen: "El taller ya estaba creado.", taller_id: ya.id };

  const { data: t, error } = await db.from("talleres").insert({
    nombre: x!.nombre, prospecto_id: x!.id, plan: prop.plan, implementacion: prop.implementacion, mensual: prop.mensual,
    estado_cliente: "implementando", inicio_contrato: localHoy(),
  }).select("id").single();
  if (error) throw error;
  await db.from("taller_config").upsert({ taller_id: t.id, direccion: x!.direccion, telefono_whatsapp: x!.telefono });
  if (x!.demo_taller_id) {
    const { data: cat } = await db.from("catalogo").select("tipo,nombre,incluye,precio,precio_desde,mano_obra,minutos,bot_puede_cotizar,activo,orden").eq("taller_id", x!.demo_taller_id);
    if (cat?.length) await db.from("catalogo").insert(cat.map((c) => ({ ...c, taller_id: t.id })));
  }
  await db.from("implementaciones").insert({
    taller_id: t.id, prospecto_id: x!.id, checklist: CHECKLIST.map((tarea, i) => ({ n: i + 1, tarea, hecho: false })),
  });
  await db.from("prospectos").update({ estado: "cliente", proximo_paso: "Implementación en curso" }).eq("id", x!.id);
  const cfg = await ventasConfig();
  await db.from("prospecto_mensajes").insert({
    prospecto_id: x!.id, canal: x!.telefono ? "whatsapp" : "email", direccion: "saliente", autor: "agente", agente: "implementador", estado: "borrador",
    texto: `${x!.contacto_nombre ? x!.contacto_nombre.split(" ")[0] + ", b" : "B"}ienvenido a ${cfg.empresa}. Partimos con ${x!.nombre}: ¿te acomoda la reunión de inicio mañana o pasado? Necesito tu lista de servicios con precios y los nombres de tu equipo.`,
  });
  await log("implementador", `Nuevo cliente: ${x!.nombre} (${(prop as any).planes?.nombre}). Implementación iniciada.`, { taller_id: t.id });
  return { resumen: `Cliente creado e implementación iniciada para ${x!.nombre}.`, taller_id: t.id };
}

// ─────────────────────────── Orquestador ───────────────────────────
async function diario() {
  const a = await investigar({});
  const b = await contactar({});
  const { count: demosHoy } = await db.from("demos").select("id", { count: "exact", head: true }).eq("estado", "agendada")
    .gte("inicio", new Date().toISOString()).lt("inicio", new Date(Date.now() + DIA).toISOString());
  const resumen = `${a.resumen} ${b.resumen} Demos en las próximas 24 h: ${demosHoy ?? 0}.`;
  await log("orquestador", resumen);
  return { resumen };
}

const ACCIONES: Record<string, (p: P) => Promise<P>> = {
  investigar, contactar, enviar, preparar_demo: prepararDemo, proponer, implementar, diario,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const quien = await autorizar(req);
  if (!quien) return json({ error: "Solo equipo ImplementIA" }, 403);
  const body = await req.json().catch(() => ({}));
  const f = ACCIONES[body.accion];
  if (!f) return json({ error: "Acción desconocida" }, 400);
  try {
    return json({ ok: true, ...(await f(body)) });
  } catch (e) {
    console.error(body.accion, e);
    return json({ error: String((e as Error).message ?? e) }, 400);
  }
});
