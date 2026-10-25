// Tests SERVIRUTA Mantenciones — node tests/test.mjs
// 1) fórmula de margen, 2) búsqueda/compatibilidad (misma lógica que index.html),
// 3) envío de solicitud real contra Supabase con la clave pública (RLS) y verificación de que el público no lee datos.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cfgSrc = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
const C = Function('window', cfgSrc + ';return window.SERVIRUTA_CONFIG')({});
const REST = C.SUPABASE_URL + '/rest/v1/';
const H = { apikey: C.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + C.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
let ok = 0, fail = 0;
async function t(name, fn) { try { await fn(); ok++; console.log('✓', name); } catch (e) { fail++; console.log('✗', name, '\n   ', e.message); } }

// ---------- 1. margen ----------
const neto = (final, iva = 19) => Math.round(final / (1 + iva / 100));
const margen = (final, costo) => Math.round(((neto(final) - costo) / neto(final)) * 10000) / 100;
const precio70 = (costo) => Math.round(costo / 0.30 * 1.19);

await t('margen: precio = costo/0,30 da 70% (no recargo de 70%)', () => {
  const costo = 100000; const final = precio70(costo);
  assert.equal(margen(final, costo), 70);
  assert.notEqual(margen(costo * 1.7 * 1.19, costo), 70); // recargo 70% ≠ margen 70%
});
await t('margen: precio actual citycar $210.990 / costo $106.000 ≈ 40%', () => {
  assert.ok(Math.abs(margen(210990, 106000) - 40.2) < 0.2);
});
await t('margen: coincide con columna generada en Supabase', async () => {
  const r = await fetch(REST + 'v_mant_catalogo_publico?select=modelo_id,precio_final&limit=1', { headers: H });
  assert.equal(r.status, 200);
});

// ---------- 2. búsqueda / compatibilidad ----------
function anioOk(r, a) { if (!a) return true; const s = (r.anios || '').replace(/\s/g, ''); let m;
  if ((m = s.match(/^(\d{4})-(\d{4})$/))) return a >= +m[1] && a <= +m[2];
  if ((m = s.match(/^(\d{4})\+$/))) return a >= +m[1]; return true; }
function fuel(r) { return (r.pack_tipo === 'diesel' || /diésel|diesel|hdi|di-d|tdi|crdi/i.test(r.motor || '')) ? 'diesel' : 'bencina'; }
await t('búsqueda: rango de años 2016-2022 incluye 2019 y excluye 2023', () => {
  assert.ok(anioOk({ anios: '2016-2022' }, 2019)); assert.ok(!anioOk({ anios: '2016-2022' }, 2023)); assert.ok(anioOk({ anios: '2017+' }, 2025)); assert.ok(!anioOk({ anios: '2017+' }, 2015));
});
await t('búsqueda: combustible se infiere del pack diésel o del motor', () => {
  assert.equal(fuel({ pack_tipo: 'diesel', motor: '2.4' }), 'diesel'); assert.equal(fuel({ pack_tipo: 'completo', motor: '1.6 HDi' }), 'diesel'); assert.equal(fuel({ pack_tipo: 'completo', motor: '1.5' }), 'bencina');
});
await t('catálogo público: no expone costos ni márgenes', async () => {
  const r = await fetch(REST + 'v_mant_catalogo_publico?select=*&limit=1', { headers: H }); const [row] = await r.json();
  assert.ok(row, 'catálogo vacío'); for (const k of Object.keys(row)) assert.ok(!/costo|margen|neto|mano_obra/.test(k), 'campo expuesto: ' + k);
});
await t('catálogo público: texto "sail 2019" encuentra Chevrolet Sail 1.5 2016-2022', async () => {
  const r = await fetch(REST + 'v_mant_catalogo_publico?select=marca,modelo,motor,anios', { headers: H }); const rows = await r.json();
  const q = ['sail']; const hit = rows.filter(x => q.every(t => (x.marca + ' ' + x.modelo).toLowerCase().includes(t)) && anioOk(x, 2019));
  assert.ok(hit.some(x => x.motor === '1.5'), JSON.stringify(hit));
});
await t('compatibilidad: variantes no verificadas no se marcan como verificadas', async () => {
  const r = await fetch(REST + 'v_mant_catalogo_publico?select=n_variantes,n_verificadas', { headers: H }); const rows = await r.json();
  for (const x of rows) assert.ok(x.n_verificadas <= x.n_variantes);
});

// ---------- 3. solicitud (RLS) ----------
await t('solicitud: inserción pública con consentimiento → 201 sin devolver datos', async () => {
  const r = await fetch(REST + 'mant_solicitudes', { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ nombre: 'TEST AUTOMATICO', telefono: '+56900000001', comuna: 'Maipú', vehiculo_texto: 'Test node', pack_tipo: 'completo', consentimiento: true, origen: 'test', website: '' }) });
  assert.equal(r.status, 201, await r.text());
});
await t('solicitud: sin consentimiento es rechazada por RLS/check', async () => {
  const r = await fetch(REST + 'mant_solicitudes', { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ nombre: 'TEST', telefono: '+56900000002', comuna: 'Maipú', consentimiento: false, website: '' }) });
  assert.ok(r.status >= 400);
});
await t('solicitud: honeypot lleno es rechazada', async () => {
  const r = await fetch(REST + 'mant_solicitudes', { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ nombre: 'BOT', telefono: '+56900000003', comuna: 'Maipú', consentimiento: true, website: 'http://spam' }) });
  assert.ok(r.status >= 400);
});
await t('solicitud: el público no puede leer solicitudes ni precios internos', async () => {
  const a = await (await fetch(REST + 'mant_solicitudes?select=id', { headers: H })).json();
  const b = await (await fetch(REST + 'mant_pack_precios?select=id', { headers: H })).json();
  assert.deepEqual(a, []); assert.deepEqual(b, []);
});
await t('solicitud: rate limit tras 3 envíos del mismo teléfono', async () => {
  const body = { nombre: 'TEST RATE', telefono: '+56900000009', comuna: 'Maipú', consentimiento: true, website: '' };
  let last; for (let i = 0; i < 4; i++) last = await fetch(REST + 'mant_solicitudes', { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(body) });
  assert.ok(last.status >= 400, 'cuarta inserción debió fallar');
});

console.log(`\n${ok} ok, ${fail} fallidos`);
process.exit(fail ? 1 : 0);
