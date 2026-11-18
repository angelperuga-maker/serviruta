// ImplementIA · propuesta pública (la abre el dueño del taller desde el link)
// GET  ?t=<token>                         → datos de la propuesta (marca "vista")
// POST { t, accion: "aceptar", nombre, rut } → acepta y dispara el implementador
// POST { t, accion: "rechazar", motivo }
import { db, json, cors, ventasConfig, log, llamarFuncion } from "./_comun.ts";

const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const t = String(body.t ?? url.searchParams.get("t") ?? "");
  if (!UUID.test(t)) return json({ error: "Link no válido" }, 404);

  const { data: p } = await db.from("propuestas_comerciales")
    .select("id,prospecto_id,plan,implementacion,mensual,descuento_pct,cuotas,contenido,estado,creado_at,decision_at,planes(nombre,resumen,implementacion),prospectos(nombre,contacto_nombre,comuna)")
    .eq("token", t).maybeSingle();
  if (!p) return json({ error: "Propuesta no encontrada" }, 404);
  const cfg = await ventasConfig();

  if (req.method === "GET") {
    if (["borrador", "enviada"].includes(p.estado)) {
      await db.from("propuestas_comerciales").update({ estado: "vista", vista_at: new Date().toISOString() }).eq("id", p.id);
      await log("propuesta", `${(p as any).prospectos?.nombre} abrió la propuesta.`, { propuesta_id: p.id });
    }
    const { id: _i, prospecto_id: _p, ...pub } = p as any;
    return json({ ...pub, empresa: cfg.empresa, vendedor: cfg.vendedor_nombre, garantia: cfg.garantia, oferta: cfg.oferta_fundador, wa_numero: cfg.wa_numero });
  }

  if (["aceptada", "rechazada"].includes(p.estado)) return json({ error: `Esta propuesta ya fue ${p.estado}.` }, 409);
  if (body.accion === "aceptar") {
    const nombre = String(body.nombre ?? "").trim().slice(0, 120);
    const rut = String(body.rut ?? "").trim().slice(0, 20);
    if (nombre.length < 3 || rut.length < 7) return json({ error: "Falta nombre o RUT" }, 400);
    await db.from("propuestas_comerciales").update({ estado: "aceptada", decision_at: new Date().toISOString(), acepta_nombre: nombre, acepta_rut: rut }).eq("id", p.id);
    await log("propuesta", `¡${(p as any).prospectos?.nombre} aceptó la propuesta! (${nombre})`, { propuesta_id: p.id });
    // @ts-ignore EdgeRuntime existe en Supabase
    EdgeRuntime.waitUntil(llamarFuncion("comercial", { accion: "implementar", propuesta_id: p.id }));
    return json({ ok: true, estado: "aceptada" });
  }
  if (body.accion === "rechazar") {
    const motivo = String(body.motivo ?? "").slice(0, 500);
    await db.from("propuestas_comerciales").update({ estado: "rechazada", decision_at: new Date().toISOString(), motivo_rechazo: motivo }).eq("id", p.id);
    await db.from("prospectos").update({ proximo_paso: `Propuesta rechazada: ${motivo}` }).eq("id", p.prospecto_id);
    await log("propuesta", `${(p as any).prospectos?.nombre} rechazó la propuesta: ${motivo}`, { propuesta_id: p.id });
    return json({ ok: true, estado: "rechazada" });
  }
  return json({ error: "Acción desconocida" }, 400);
});
