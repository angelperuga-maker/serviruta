// informe-cliente v2
// action=enviar {informe_id}: arma recordatorios, genera el informe en PDF y lo envía al cliente por WhatsApp
//   como documento (con la garantía y los recordatorios en el mensaje). Si el documento falla, envía el link.
// action=recordatorios: (cron diario) envía los avisos que tocan hoy, agrupados por teléfono.
// GET ?pdf=<token>: descarga el PDF del informe finalizado.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { informePdf } from "./pdf.ts"

const WHAPI_URL = "https://gate.whapi.cloud"
const WHAPI_TOKEN = Deno.env.get("WHAPI_TOKEN") || ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const PORTAL_URL = Deno.env.get("PORTAL_URL") || "https://angelperuga-maker.github.io/serviruta"
const ADMINS = [{ nombre: "Angel", telefono: "56945210814" }, { nombre: "Lilly", telefono: "56985058250" }]

const ANTICIPO: Record<string, number> = { mantencion: 10, revision_tecnica: 30, permiso_circulacion: 20, soap: 20, licencia: 30, descuento: 30 }
const NOMBRE: Record<string, string> = {
  mantencion: "🔧 Próxima mantención", revision_tecnica: "📋 Revisión técnica", permiso_circulacion: "🪪 Permiso de circulación",
  soap: "🛡️ SOAP", licencia: "🚗 Licencia de conducir", descuento: "🎁 Tu 20% de descuento en mano de obra",
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "*" }
const J = (o: unknown, s = 200) => new Response(JSON.stringify(o, null, 2), { status: s, headers: { ...CORS, "Content-Type": "application/json" } })

async function sb(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) } })
  if (!r.ok) { console.error("sb fail", path, r.status, (await r.text()).slice(0, 300)); return null }
  const t = await r.text(); return t ? JSON.parse(t) : []
}
async function whapi(endpoint: string, payload: unknown) {
  try {
    const r = await fetch(`${WHAPI_URL}/messages/${endpoint}`, { method: "POST", headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    return await r.json()
  } catch (e) { return { error: String(e) } }
}
const sendWA = (to: string, body: string) => whapi("text", { to, body })
async function logWA(tel: string, nombre: string, mensaje: string, extra: any) {
  await sb("whatsapp_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ tipo: "enviado", telefono: tel, nombre, mensaje, raw_payload: extra }) })
}
function telWA(t: string) {
  const d = (t || "").replace(/\D/g, "")
  if (!d) return ""
  if (d.startsWith("56")) return d
  if (d.length === 9) return "56" + d
  if (d.length === 8) return "569" + d
  return d
}
function hoyCL(off = 0) {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Santiago" }))
  d.setDate(d.getDate() + off)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function restarDias(iso: string, n: number) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10) }
function fechaLarga(iso: string) { try { return new Date(iso + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" }) } catch { return iso } }
const primer = (n: string) => (n || "").trim().split(/\s+/)[0] || ""
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
function b64(bytes: Uint8Array) {
  let s = ""
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
function nombrePdf(inf: any) {
  const pat = String(inf.patente || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  return `Informe-Serviruta${pat ? "-" + pat : ""}-${String(inf.fecha || "").slice(0, 10)}.pdf`
}

async function cartaExistente(pptoId: string | null) {
  if (!pptoId) return null
  const c = await sb(`cartas_garantia?presupuesto_id=eq.${pptoId}&select=*&limit=1`)
  return c && c[0] ? c[0] : null
}
async function cartaDe(pptoId: string | null) {
  if (!pptoId) return null
  let c = await cartaExistente(pptoId)
  if (c) return c
  const p = await sb(`presupuestos?id=eq.${pptoId}&select=pago_cliente&limit=1`)
  if (!p || !p[0] || String(p[0].pago_cliente || "").toLowerCase() !== "pagado") return null
  await fetch(`${SUPABASE_URL}/functions/v1/enviar-carta-garantia`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ presupuesto_id: pptoId, destino: "generar" }) })
  for (let i = 0; i < 4; i++) { await sleep(1500); c = await cartaExistente(pptoId); if (c) return c }
  return null
}

async function crearRecordatorios(inf: any, carta: any) {
  const base = { informe_id: inf.id, cliente: inf.cliente, telefono: telWA(inf.telefono), patente: (inf.patente || "").toUpperCase() || null, vehiculo: inf.vehiculo }
  const hoy = hoyCL()
  const filas: any[] = []
  const add = (tipo: string, vence: string | null) => {
    if (!vence || vence < hoy) return
    filas.push({ ...base, tipo, vence, avisar_desde: restarDias(vence, ANTICIPO[tipo]) })
  }
  add("mantencion", inf.proxima_mantencion_fecha)
  add("revision_tecnica", inf.rt_vence)
  add("permiso_circulacion", inf.permiso_vence)
  add("soap", inf.soap_vence)
  add("licencia", inf.licencia_vence)
  if (carta?.descuento_hasta) add("descuento", carta.descuento_hasta)
  if (!filas.length) return []
  await sb("recordatorios_vehiculo?on_conflict=patente,tipo,vence", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(filas) })
  return filas
}

async function enviarInforme(id: string, forzar = false) {
  const r = await sb(`informes_servicio?id=eq.${id}&select=*&limit=1`)
  const inf = r && r[0]
  if (!inf) return { ok: false, error: "informe no encontrado" }
  if (inf.estado !== "finalizado") return { ok: false, error: "informe en borrador" }
  if (inf.enviado_cliente_at && !forzar) return { ok: true, ya_enviado: true }

  const carta = await cartaDe(inf.presupuesto_id)
  const recs = await crearRecordatorios(inf, carta)
  const tel = telWA(inf.telefono)
  const link = `${PORTAL_URL}/informe.html?t=${inf.token}`
  const ch = inf.checklist || []
  const urg = ch.filter((c: any) => c.estado === "urgente").length
  const atn = ch.filter((c: any) => c.estado === "atencion").length

  let msg = `Hola ${primer(inf.cliente)} 👋 Gracias por confiar en *Serviruta*.\n\n` +
    `Te enviamos en PDF el *informe de tu mantención*${inf.vehiculo ? ` (${inf.vehiculo}${inf.patente ? " · " + inf.patente.toUpperCase() : ""})` : ""}: el servicio realizado, la revisión de ${ch.length || 25} puntos críticos y nuestras recomendaciones.\n`
  if (urg || atn) msg += `\n⚠️ Encontramos ${urg ? `*${urg} punto${urg > 1 ? "s" : ""} urgente${urg > 1 ? "s" : ""}*` : ""}${urg && atn ? " y " : ""}${atn ? `${atn} para vigilar` : ""}. Está todo detallado en el informe.\n`
  if (carta) {
    const km = carta.garantia_km ? ` o ${Number(carta.garantia_km).toLocaleString("es-CL")} km` : ""
    msg += `\n🛡️ *Certificado de garantía* (${carta.garantia_meses} meses${km}):\n${PORTAL_URL}/carta-garantia.html?id=${carta.id}\n`
  }
  if (recs.length) msg += `\n📅 Además *te avisaremos antes de que venzan*:\n` + recs.map((x) => `• ${NOMBRE[x.tipo].replace(/^\S+ /, "")}: ${fechaLarga(x.vence)}`).join("\n") + "\n"
  msg += `\nTambién puedes verlo en línea:\n${link}\n\nCualquier duda, respóndenos por aquí 🙌`

  let pdfOk = false, wa: any = null, pdfErr = ""
  if (tel) {
    try {
      const bytes = await informePdf(inf, carta, PORTAL_URL)
      const filename = nombrePdf(inf)
      wa = await whapi("document", { to: tel, media: `data:application/pdf;name=${filename};base64,${b64(bytes)}`, filename, caption: msg })
      pdfOk = !!(wa && (wa.sent || wa.message) && !wa.error)
      if (!pdfOk) pdfErr = JSON.stringify(wa).slice(0, 300)
    } catch (e) { pdfErr = String(e); console.error("pdf err", e) }
    // Respaldo: si el documento no salió, el cliente igual recibe el informe por link.
    if (!pdfOk) wa = await sendWA(tel, msg)
    await logWA(tel, inf.cliente, msg, { tipo_notif: "informe_servicio_cliente", informe_id: inf.id, carta_id: carta?.id || null, pdf: pdfOk, pdf_error: pdfErr || null, wa })
  }
  await sb(`informes_servicio?id=eq.${inf.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ enviado_cliente_at: new Date().toISOString() }) })
  if (carta && tel && !carta.enviada_cliente_at) await sb(`cartas_garantia?id=eq.${carta.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ enviada_cliente_at: new Date().toISOString() }) })

  const aviso = `📄 *Informe enviado al cliente*${tel ? (pdfOk ? " (PDF)" : " (⚠️ el PDF falló, se envió el link)") : ""}\n${inf.cliente || "—"} · ${inf.vehiculo || ""} ${inf.patente ? "· " + inf.patente.toUpperCase() : ""}\nTécnico: ${inf.tecnico || "—"}\nUrgentes: ${urg} · Vigilar: ${atn}\nRecordatorios creados: ${recs.length}${carta ? "\nCarta de garantía incluida ✅" : "\nSin carta (presupuesto no pagado o sin vincular)"}${tel ? "" : "\n⚠️ SIN TELÉFONO: no se envió al cliente"}\n${link}`
  for (const a of ADMINS) { await sendWA(a.telefono, aviso); await sleep(800) }
  return { ok: true, enviado: !!tel, pdf: pdfOk, pdf_error: pdfErr || null, carta: !!carta, recordatorios: recs.length, link }
}

function textoAviso(x: any) {
  const f = fechaLarga(x.vence)
  switch (x.tipo) {
    case "mantencion": return `${NOMBRE.mantencion} de tu ${x.vehiculo || "vehículo"}: corresponde el *${f}*. Te la hacemos a domicilio.`
    case "revision_tecnica": return `${NOMBRE.revision_tecnica}${x.patente ? " (" + x.patente + ")" : ""}: vence el *${f}*. Podemos hacerte una pre-revisión a domicilio para que pases a la primera.`
    case "permiso_circulacion": return `${NOMBRE.permiso_circulacion}: vence el *${f}*.`
    case "soap": return `${NOMBRE.soap}: vence el *${f}*.`
    case "licencia": return `${NOMBRE.licencia}: vence el *${f}*.`
    case "descuento": return `${NOMBRE.descuento}: vence el *${f}*. Úsalo en tu próximo servicio.`
  }
  return ""
}

async function enviarRecordatorios(dry: boolean) {
  const hoy = hoyCL()
  if (!dry) await sb(`recordatorios_vehiculo?estado=eq.pendiente&vence=lt.${hoy}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ estado: "cancelado" }) })
  const pend = await sb(`recordatorios_vehiculo?estado=eq.pendiente&avisar_desde=lte.${hoy}&vence=gte.${hoy}&telefono=not.is.null&select=*&order=vence.asc`) || []
  const porTel = new Map<string, any[]>()
  for (const p of pend) { if (!p.telefono) continue; (porTel.get(p.telefono) || porTel.set(p.telefono, []).get(p.telefono)!).push(p) }
  const out: any[] = []
  for (const [tel, lista] of porTel) {
    const msg = `Hola ${primer(lista[0].cliente)} 👋 Te escribe *Serviruta* con un recordatorio:\n\n` + lista.map(textoAviso).join("\n\n") +
      `\n\n¿Te agendamos? Responde *SÍ* y te contactamos.`
    if (dry) { out.push({ tel, items: lista.length, msg }); continue }
    const wa = await sendWA(tel, msg)
    await logWA(tel, lista[0].cliente, msg, { tipo_notif: "recordatorio_vehiculo", ids: lista.map((x) => x.id), wa })
    await sb(`recordatorios_vehiculo?id=in.(${lista.map((x) => x.id).join(",")})`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ estado: "enviado", enviado_at: new Date().toISOString() }) })
    out.push({ tel, items: lista.length })
    await sleep(1500)
  }
  return { fecha: hoy, telefonos: out.length, avisos: pend.length, detalle: out }
}

async function descargarPdf(token: string) {
  if (!/^[a-f0-9]{16,64}$/i.test(token)) return new Response("Enlace inválido", { status: 400, headers: CORS })
  const r = await sb(`informes_servicio?token=eq.${token}&estado=eq.finalizado&select=*&limit=1`)
  const inf = r && r[0]
  if (!inf) return new Response("Informe no encontrado", { status: 404, headers: CORS })
  const bytes = await informePdf(inf, await cartaExistente(inf.presupuesto_id), PORTAL_URL)
  return new Response(bytes, { headers: { ...CORS, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nombrePdf(inf)}"`, "Cache-Control": "no-store" } })
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  const url = new URL(req.url)
  try {
    if (req.method === "GET") {
      if (url.searchParams.get("pdf")) return await descargarPdf(url.searchParams.get("pdf")!)
      if (url.searchParams.get("action") === "recordatorios") return J(await enviarRecordatorios(url.searchParams.get("dry_run") === "true"))
      return J({ status: "ok", service: "informe-cliente", version: 2, has_whapi: WHAPI_TOKEN.length > 0 })
    }
    const body = await req.json().catch(() => ({}))
    const action = body.action || url.searchParams.get("action") || "enviar"
    if (action === "recordatorios") return J(await enviarRecordatorios(body.dry_run === true))
    if (!body.informe_id) return J({ ok: false, error: "falta informe_id" }, 400)
    return J(await enviarInforme(String(body.informe_id), body.forzar === true))
  } catch (e) {
    console.error(e); return J({ ok: false, error: String(e) }, 500)
  }
})
