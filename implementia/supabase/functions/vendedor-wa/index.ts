// ImplementIA · Agente 4: vendedor por WhatsApp
// Recibe (reenviado por whatsapp-webhook) los mensajes que llegan al número de VENTAS de ImplementIA.
// Califica al taller, responde dudas, ofrece horarios y agenda la demo. Al agendar, dispara el preparador de demo.
import {
  db, json, cors, enviarWA, ventasConfig, log, cronSecreto, llamarFuncion, aUTC, localHoy, DIAS, horaLocal, peso, MODEL, CONTEXTO_IMPLEMENTIA,
} from "./_comun.ts";

type Ctx = { prospectoId: string; cfg: any; phoneId: string; telefono: string };

const herramientas = [
  {
    name: "guardar_calificacion",
    description: "Guarda lo que el dueño cuente de su taller apenas lo diga: su nombre, nombre y comuna del taller, número de mecánicos, órdenes de trabajo al mes, cómo agendan hoy, su principal problema, correo.",
    input_schema: {
      type: "object",
      properties: {
        contacto_nombre: { type: "string" }, nombre_taller: { type: "string" }, comuna: { type: "string" },
        n_mecanicos: { type: "integer" }, ot_mes: { type: "integer" }, como_agenda: { type: "string" }, dolor: { type: "string" }, email: { type: "string" },
      },
    },
  },
  {
    name: "horarios_demo",
    description: "Horarios libres para la demo en una fecha (YYYY-MM-DD, hora de Chile).",
    input_schema: { type: "object", properties: { fecha: { type: "string" } }, required: ["fecha"] },
  },
  {
    name: "agendar_demo",
    description: "Agenda la demo cuando el dueño confirmó día y hora. Requiere tener al menos su nombre y el nombre del taller.",
    input_schema: { type: "object", properties: { fecha: { type: "string" }, hora: { type: "string", description: "HH:MM" } }, required: ["fecha", "hora"] },
  },
  {
    name: "derivar_a_angel",
    description: "Pasa la conversación a una persona cuando lo piden, hay un reclamo, quieren negociar precio o algo que no puedes resolver.",
    input_schema: { type: "object", properties: { motivo: { type: "string" } }, required: ["motivo"] },
  },
];

async function slotsLibres(cfg: any, fecha: string): Promise<string[]> {
  const dia = DIAS[new Date(`${fecha}T12:00:00Z`).getUTCDay()];
  const rango = cfg.horario_demos?.[dia];
  if (!rango) return [];
  const [ini, fin] = rango.map((h: string) => Number(h.slice(0, 2)));
  const { data: ocupadas } = await db.from("demos").select("inicio,minutos").neq("estado", "cancelada")
    .gte("inicio", aUTC(fecha, "00:00").toISOString()).lte("inicio", aUTC(fecha, "23:59").toISOString());
  const libres: string[] = [];
  for (let h = ini; h < fin; h++) {
    const hora = `${String(h).padStart(2, "0")}:00`;
    const t = aUTC(fecha, hora).getTime();
    if (t < Date.now() + 3 * 3600e3) continue;
    const choca = (ocupadas ?? []).some((o) => Math.abs(new Date(o.inicio).getTime() - t) < (o.minutos ?? 45) * 60e3);
    if (!choca) libres.push(hora);
  }
  return libres;
}

async function ejecutar(nombre: string, input: any, ctx: Ctx): Promise<string> {
  if (nombre === "guardar_calificacion") {
    const upd: Record<string, unknown> = {};
    for (const k of ["contacto_nombre", "comuna", "n_mecanicos", "ot_mes", "como_agenda", "dolor", "email"]) if (input[k] != null) upd[k] = input[k];
    if (input.nombre_taller) {
      const { data: x } = await db.from("prospectos").select("origen,nombre").eq("id", ctx.prospectoId).single();
      if (x?.origen !== "google_maps" || !x?.nombre) upd.nombre = input.nombre_taller;
    }
    if (upd.n_mecanicos != null) upd.calificado = Number(upd.n_mecanicos) >= 2;
    await db.from("prospectos").update(upd).eq("id", ctx.prospectoId);
    return "Guardado.";
  }
  if (nombre === "horarios_demo") {
    const l = await slotsLibres(ctx.cfg, input.fecha);
    return l.length ? `Libres el ${input.fecha}: ${l.join(", ")}` : "No hay horarios ese día; prueba otro día hábil.";
  }
  if (nombre === "agendar_demo") {
    const libres = await slotsLibres(ctx.cfg, input.fecha);
    if (!libres.includes(input.hora)) return "Ese horario ya no está libre. Ofrece otros con horarios_demo.";
    const inicio = aUTC(input.fecha, input.hora);
    const { data: d, error } = await db.from("demos").insert({ prospecto_id: ctx.prospectoId, inicio: inicio.toISOString(), minutos: ctx.cfg.duracion_demo_min, origen: "bot" }).select("id").single();
    if (error) return `No se pudo agendar: ${error.message}`;
    await db.from("prospectos").update({ estado: "demo", proximo_paso: `Demo ${horaLocal(inicio)}`, proximo_contacto_at: null }).eq("id", ctx.prospectoId);
    // El preparador arma el taller demo y el guion en segundo plano
    // @ts-ignore EdgeRuntime existe en Supabase
    EdgeRuntime.waitUntil(llamarFuncion("comercial", { accion: "preparar_demo", prospecto_id: ctx.prospectoId, demo_id: d.id }));
    await log("vendedor", `Demo agendada por WhatsApp: ${horaLocal(inicio)}.`, { prospecto_id: ctx.prospectoId, demo_id: d.id });
    return `Demo agendada el ${horaLocal(inicio)}. Dile que le llegará el link de la videollamada y que verá su propio taller funcionando.`;
  }
  if (nombre === "derivar_a_angel") {
    await db.from("prospectos").update({ bot_pausado: true, proximo_paso: `Responder: ${input.motivo}` }).eq("id", ctx.prospectoId);
    await db.from("prospecto_mensajes").insert({ prospecto_id: ctx.prospectoId, canal: "nota", direccion: "saliente", autor: "sistema", estado: "enviado", texto: `Derivado a ${ctx.cfg.vendedor_nombre}: ${input.motivo}` });
    await log("vendedor", `Conversación derivada: ${input.motivo}`, { prospecto_id: ctx.prospectoId });
    return `Derivado. Dile que ${ctx.cfg.vendedor_nombre} le escribe personalmente a la brevedad.`;
  }
  return "Herramienta desconocida.";
}

async function instrucciones(cfg: any, prospecto: any) {
  const { data: planes } = await db.from("planes").select("*").order("orden");
  const lista = (planes ?? []).map((p) => `- ${p.nombre}: implementación ${peso(p.implementacion)} + ${peso(p.mensual)} mensual, más IVA. ${p.resumen}`).join("\n");
  const horario = Object.entries(cfg.horario_demos ?? {}).map(([d, r]: any) => `${d} ${r.join("-")}`).join(", ");
  return `Eres el asistente comercial de ${cfg.empresa} por WhatsApp y hablas en nombre de ${cfg.vendedor_nombre}. Hoy es ${localHoy()} (hora de Chile).
${CONTEXTO_IMPLEMENTIA}
Tu objetivo: entender el taller y agendar una demo de ${cfg.duracion_demo_min} minutos por videollamada, donde verá SU taller cargado en el sistema.
Pasos: 1) responde su duda en corto; 2) haz UNA pregunta de calificación a la vez (nombre, cuántos mecánicos, cuántas órdenes al mes, cómo agendan hoy, qué les complica más) y guárdala con guardar_calificacion; 3) cuando haya interés, consulta horarios_demo y ofrece dos opciones; 4) agenda solo con confirmación.
Planes (solo si preguntan precio; aclara que en la demo se recomienda el plan justo):
${lista}
Oferta fundador: ${cfg.oferta_fundador}
Garantía: ${cfg.garantia}
Horario de demos: ${horario}.
Lo que ya sabemos de este taller: ${JSON.stringify({ taller: prospecto.nombre, comuna: prospecto.comuna, contacto: prospecto.contacto_nombre, diagnostico: prospecto.diagnostico, n_mecanicos: prospecto.n_mecanicos, como_agenda: prospecto.como_agenda })}
Reglas: mensajes cortos (máximo 3 frases), español de Chile sin modismos, nunca inventes resultados ni descuentos; si quieren negociar o algo no lo sabes, usa derivar_a_angel.
${cfg.instrucciones_extra ?? ""}`;
}

async function responder(ctx: Ctx, prospecto: any) {
  const { data: hist } = await db.from("prospecto_mensajes").select("direccion,autor,texto,estado").eq("prospecto_id", ctx.prospectoId)
    .in("canal", ["whatsapp"]).in("estado", ["enviado", "recibido"]).order("creado_at", { ascending: false }).limit(30);
  const messages: any[] = [];
  for (const m of (hist ?? []).reverse()) {
    const role = m.direccion === "entrante" ? "user" : "assistant";
    if (messages.length && messages.at(-1).role === role) messages.at(-1).content += "\n" + m.texto;
    else messages.push({ role, content: m.texto });
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || !Deno.env.get("ANTHROPIC_API_KEY")) return;
  const system = await instrucciones(ctx.cfg, prospecto);

  for (let vuelta = 0; vuelta < 6; vuelta++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system, tools: herramientas, messages }),
    });
    if (!r.ok) { console.error("Claude", r.status, await r.text()); return; }
    const res = await r.json();
    const usos = res.content.filter((b: any) => b.type === "tool_use");
    const texto = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    if (!usos.length) {
      if (texto) {
        const err = await enviarWA(ctx.phoneId, ctx.telefono, texto);
        await db.from("prospecto_mensajes").insert({ prospecto_id: ctx.prospectoId, canal: "whatsapp", direccion: "saliente", autor: "bot", texto, estado: err ? "error" : "enviado", error: err, enviado_at: new Date().toISOString() });
      }
      return;
    }
    messages.push({ role: "assistant", content: res.content });
    const out = [];
    for (const u of usos) out.push({ type: "tool_result", tool_use_id: u.id, content: await ejecutar(u.name, u.input, ctx) });
    messages.push({ role: "user", content: out });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const s = req.headers.get("x-cron-secret");
  if (!s || s !== (await cronSecreto())) return json({ error: "no autorizado" }, 403);

  const body = await req.json().catch(() => null);
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  if (!msg) return json({ ok: true });
  const cfg = await ventasConfig();
  const phoneId = value.metadata.phone_number_id;
  const telefono = String(msg.from);
  const texto = msg.type === "text" ? msg.text.body : msg.type === "button" ? msg.button?.text : `[${msg.type}]`;
  const perfil = value.contacts?.[0]?.profile?.name ?? null;

  let { data: x } = await db.from("prospectos").select("*").eq("wa_digitos", telefono).order("puntaje", { ascending: false }).limit(1).maybeSingle();
  if (!x) {
    const ins = await db.from("prospectos").insert({ nombre: perfil ? `Taller de ${perfil}` : "Taller (WhatsApp)", contacto_nombre: perfil, telefono_intl: "+" + telefono, origen: "whatsapp_entrante", estado: "respondio" }).select("*").single();
    x = ins.data;
  }
  const { error: dup } = await db.from("prospecto_mensajes").insert({ prospecto_id: x!.id, canal: "whatsapp", direccion: "entrante", autor: "prospecto", texto, estado: "recibido", wa_id: msg.id });
  if (dup) return json({ ok: true });
  const upd: Record<string, unknown> = { ultimo_contacto: new Date().toISOString(), proximo_contacto_at: null };
  if (["nuevo", "investigado", "contactado"].includes(x!.estado)) upd.estado = "respondio";
  if (!x!.contacto_nombre && perfil) upd.contacto_nombre = perfil;
  await db.from("prospectos").update(upd).eq("id", x!.id);
  // descarta borradores de secuencia: ya respondió
  await db.from("prospecto_mensajes").update({ estado: "descartado" }).eq("prospecto_id", x!.id).eq("estado", "borrador").eq("agente", "contacto");

  if (cfg.bot_activo && !x!.bot_pausado) await responder({ prospectoId: x!.id, cfg, phoneId, telefono }, { ...x, ...upd });
  return json({ ok: true });
});
