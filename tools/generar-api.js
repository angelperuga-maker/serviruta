// Genera /api/*.json leyendo los cotizadores HTML del portal.
// Ejecuta la MISMA fórmula de cada página (no la copia), así el JSON
// siempre coincide con lo que ve el cliente. Uso: node tools/generar-api.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const OUT = path.join(RAIZ, 'api');
const BASE_URL = 'https://angelperuga-maker.github.io/serviruta/';

// Extrae un bloque balanceado de llaves desde la primera '{' después de idx
function bloque(src, idx) {
  let i = src.indexOf('{', idx), prof = 0, q = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); continue; }
    if (c === '/' && src[j + 1] === '*') { j = src.indexOf('*/', j) + 1; continue; }
    if (c === '{') prof++;
    else if (c === '}' && --prof === 0) return src.slice(idx, j + 1);
  }
  throw new Error('bloque sin cerrar');
}
function trozo(src, marcador) {
  const i = src.indexOf(marcador);
  if (i < 0) throw new Error('no encontré: ' + marcador);
  return bloque(src, i);
}

function kitsPorModelo(archivo, tipo) {
  const src = fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
  const codigo = trozo(src, 'var DATA') + ';\n' + trozo(src, 'function calcularKits') +
    ';\nthis.DATA = DATA; this.calcularKits = calcularKits;';
  const ctx = {}; vm.runInNewContext(codigo, ctx, { timeout: 2000 });
  const modelos = [];
  for (const [marca_id, m] of Object.entries(ctx.DATA)) {
    for (const mo of (m.modelos || [])) {
      const kits = (ctx.calcularKits(mo) || []).map(k => ({
        tipo: k.tipo, nombre: k.nombre, precio: k.precio, desc: k.desc || null,
        cambio: k.cambio || null, destacado: !!k.destacado, incluye: k.features || []
      }));
      const { id, nombre, ...resto } = mo;
      modelos.push({ marca_id, marca: m.nombre, modelo_id: id, modelo: nombre, ...resto, kits });
    }
  }
  return { cotizador: tipo, fuente: BASE_URL + archivo, moneda: 'CLP', total_modelos: modelos.length, modelos };
}

function aireAcondicionado(archivo) {
  const src = fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
  const ctx = {}; vm.runInNewContext(trozo(src, 'var CONFIG') + ';\nthis.CONFIG = CONFIG;', ctx, { timeout: 2000 });
  const C = ctx.CONFIG, segs = { L: 'auto liviano', M: 'SUV / camioneta', C: 'furgón / camión liviano' };
  const servicios = C.servicios.map(s => ({
    id: s.id, titulo: s.titulo, detalle: s.detalle, desde: !!s.desde, solo: !!s.solo,
    precio: s.porGas ? { R134a: C.preciosGas.R134a, R1234yf: C.preciosGas.R1234yf } : s.precio,
    por_gas: !!s.porGas
  }));
  const vehiculos = [];
  for (const [marca, lista] of Object.entries(C.vehiculos)) for (const [modelo, seg] of lista) vehiculos.push({ marca, modelo, segmento: seg });
  return { cotizador: 'aire_acondicionado', fuente: BASE_URL + archivo, moneda: 'CLP', segmentos: segs,
    ano_r1234yf_desde: C.anoR1234yf, incluye: C.incluye, servicios, total_vehiculos: vehiculos.length, vehiculos };
}

const COTIZADORES = [
  ['kits-mantencion-auto', () => kitsPorModelo('kits-mantencion-auto.html', 'mantencion_auto')],
  ['kits-mantencion-camion', () => kitsPorModelo('kits-mantencion-motor-camion.html', 'mantencion_camion')],
  ['kit-embrague-auto', () => kitsPorModelo('kit-embrague-auto.html', 'embrague_auto')],
  ['kit-embrague-camion', () => kitsPorModelo('kit-embrague-camion.html', 'embrague_camion')],
  ['aire-acondicionado', () => aireAcondicionado('cotizador-aire-acondicionado.html')],
];

fs.mkdirSync(OUT, { recursive: true });
const generado = new Date().toISOString(), indice = [];
for (const [nombre, fn] of COTIZADORES) {
  try {
    const data = { generado, ...fn() };
    fs.writeFileSync(path.join(OUT, nombre + '.json'), JSON.stringify(data, null, 1));
    indice.push({ cotizador: nombre, url: BASE_URL + 'api/' + nombre + '.json', fuente: data.fuente, registros: data.total_modelos ?? data.total_vehiculos });
    console.log('OK', nombre, data.total_modelos ?? data.total_vehiculos);
  } catch (e) { console.error('ERROR', nombre, e.message); process.exitCode = 1; }
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ generado, cotizadores: indice }, null, 1));
