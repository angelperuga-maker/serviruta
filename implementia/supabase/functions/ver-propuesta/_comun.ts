// ImplementIA · utilidades compartidas por los agentes comerciales
import { createClient } from "npm:@supabase/supabase-js@2";

export const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
export const MODEL = "claude-sonnet-5-5";
export const TZ = "America/Santiago";
export const FUNC_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-cron-secret",
};
export const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

export const peso = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");
export const localHoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
export const DIAS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];

function offsetDe(fecha: Date): string {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
    .formatToParts(fecha).find((x) => x.type === "timeZoneName")?.value ?? "GMT-03:00";
  return p.replace("GMT", "") || "+00:00";
}
export function aUTC(fechaLocal: string, hora: string): Date {
  const tentativa = new Date(`${fechaLocal}T${hora}:00-03:00`);
  return new Date(`${fechaLocal}T${hora}:00${offsetDe(tentativa)}`);
}
export const horaLocal = (d: Date | string) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

// ── Claude ──
export async function claude(system: string, prompt: string, maxTokens = 2000): Promise<string | null> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return null;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) { console.error("Claude", r.status, await r.text()); return null; }
  const res = await r.json();
  return res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
}
export async function claudeJSON<T>(system: string, prompt: string, maxTokens = 3000): Promise<T | null> {
  const r = await claude(system + "\nResponde solo con JSON válido, sin texto adicional.", prompt, maxTokens);
  if (!r) return null;
  const i = Math.min(...["{", "["].map((c) => r.indexOf(c)).filter((x) => x >= 0));
  const j = Math.max(r.lastIndexOf("}"), r.lastIndexOf("]"));
  try { return JSON.parse(r.slice(i, j + 1)); } catch { console.error("JSON inválido", r.slice(0, 300)); return null; }
}

// ── WhatsApp Cloud API ──
export async function enviarWA(phoneId: string, para: string, texto: string): Promise<string | null> {
  const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("WA_ACCESS_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "text", text: { body: texto } }),
  });
  if (!r.ok) return `WhatsApp ${r.status}: ${(await r.text()).slice(0, 200)}`;
  return null;
}
export async function enviarPlantillaWA(phoneId: string, para: string, nombre: string, idioma: string, params: string[]): Promise<string | null> {
  const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("WA_ACCESS_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: para, type: "template",
      template: { name: nombre, language: { code: idioma }, components: params.length ? [{ type: "body", parameters: params.map((t) => ({ type: "text", text: t.replace(/\s+/g, " ").slice(0, 900) })) }] : [] },
    }),
  });
  if (!r.ok) return `WhatsApp plantilla ${r.status}: ${(await r.text()).slice(0, 200)}`;
  return null;
}

// ── Config, bitácora y permisos ──
export async function ventasConfig() {
  const { data } = await db.from("ventas_config").select("*").eq("id", 1).single();
  return data!;
}
export async function log(agente: string, resumen: string, detalle?: unknown) {
  await db.from("agente_comercial_log").insert({ agente, resumen, detalle: detalle ?? null });
}
export async function cronSecreto(): Promise<string | null> {
  const { data } = await db.from("cron_secreto").select("valor").eq("id", 1).maybeSingle();
  return data?.valor ?? null;
}
// Devuelve "cron", el id del usuario staff, o null
export async function autorizar(req: Request): Promise<string | null> {
  const s = req.headers.get("x-cron-secret");
  if (s) { const v = await cronSecreto(); return v && s === v ? "cron" : null; }
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return null;
  const { data: st } = await db.from("implementia_staff").select("user_id").eq("user_id", u.user.id).maybeSingle();
  return st ? u.user.id : null;
}
export async function llamarFuncion(nombre: string, body: unknown) {
  const s = await cronSecreto();
  return fetch(`${FUNC_URL}/${nombre}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": s ?? "" },
    body: JSON.stringify(body),
  });
}

export const CONTEXTO_IMPLEMENTIA = `ImplementIA (implementia.cl) instala en talleres mecánicos de Chile un sistema de gestión conectado con IA (Claude): bot de WhatsApp que responde en segundos y agenda solo, CRM con embudo, presupuestos que al aceptarse abren la orden de trabajo, agenda, app del mecánico con fotos, comisiones que se suman solas al sueldo, tablero del dueño y agentes que hacen el seguimiento a clientes cada mañana. Caso de éxito: Serviruta, empresa de servicio automotriz en terreno con más de 10 años, que opera con este mismo sistema.`;
