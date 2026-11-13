// Informe de servicio en PDF (pdf-lib, fuentes estándar). Sin anotaciones de tipo a propósito.
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1"

const W = 595.28, H = 841.89, M = 40
const ROJO = rgb(0.91, 0.13, 0.04), NEGRO = rgb(0.04, 0.04, 0.05), GRIS = rgb(0.42, 0.42, 0.45), CLARO = rgb(0.96, 0.96, 0.96)
const COL = { ok: rgb(0.09, 0.64, 0.29), atencion: rgb(0.85, 0.64, 0), urgente: ROJO }
const EST = { ok: "BIEN", atencion: "VIGILAR", urgente: "URGENTE" }
const BAT = { buena: ["Batería en buen estado", "ok"], recargar: ["Recargar y volver a medir", "atencion"], reemplazar_pronto: ["Reemplazar pronto", "atencion"], reemplazar: ["Reemplazar", "urgente"] }

// Las fuentes estándar solo cubren Latin-1: se quitan emojis y símbolos fuera de rango.
function t(s) {
  if (s === null || s === undefined) return ""
  return String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/•/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "").replace(/[ \t]+/g, " ").trim()
}
function fecha(iso) {
  if (!iso) return ""
  const m = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
  const p = String(iso).slice(0, 10).split("-")
  return `${Number(p[2])} de ${m[Number(p[1]) - 1]} de ${p[0]}`
}
const km = (n) => n ? Number(n).toLocaleString("es-CL") + " km" : ""

export async function informePdf(inf, carta, portal) {
  const pdf = await PDFDocument.create()
  const f = await pdf.embedFont(StandardFonts.Helvetica), fb = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page, y
  const nueva = () => { page = pdf.addPage([W, H]); y = H - M }
  const need = (h) => { if (y - h < M + 24) nueva() }
  const wrap = (txt, size, font, maxW) => {
    const out = []
    for (const par of t(txt).split("\n")) {
      let line = ""
      for (const w of par.split(" ")) {
        const test = line ? line + " " + w : w
        if (font.widthOfTextAtSize(test, size) > maxW && line) { out.push(line); line = w } else line = test
      }
      out.push(line)
    }
    return out
  }
  const para = (txt, size = 9.5, font = f, color = NEGRO, x = M, maxW = W - 2 * M) => {
    for (const l of wrap(txt, size, font, maxW)) { need(size + 4); page.drawText(l, { x, y, size, font, color }); y -= size + 4 }
  }
  const sec = (titulo) => {
    need(40); y -= 12
    page.drawRectangle({ x: M, y: y - 3, width: 4, height: 13, color: ROJO })
    page.drawText(t(titulo), { x: M + 10, y, size: 11.5, font: fb, color: NEGRO }); y -= 18
  }
  const pares = (items) => {
    const vis = items.filter((i) => t(i[1]))
    const colW = (W - 2 * M) / 2
    for (let i = 0; i < vis.length; i += 2) {
      need(28)
      for (let k = 0; k < 2 && i + k < vis.length; k++) {
        const x = M + k * colW
        page.drawText(t(vis[i + k][0]).toUpperCase(), { x, y, size: 6.5, font: fb, color: GRIS })
        page.drawText(wrap(vis[i + k][1], 10, f, colW - 10)[0], { x, y: y - 12, size: 10, font: fb, color: NEGRO })
      }
      y -= 28
    }
  }

  nueva()
  // Encabezado
  page.drawRectangle({ x: 0, y: H - 78, width: W, height: 78, color: NEGRO })
  page.drawRectangle({ x: 0, y: H - 82, width: W, height: 4, color: ROJO })
  page.drawText("SERVI", { x: M, y: H - 46, size: 24, font: fb, color: rgb(1, 1, 1) })
  page.drawText("RUTA", { x: M + fb.widthOfTextAtSize("SERVI", 24), y: H - 46, size: 24, font: fb, color: ROJO })
  page.drawText("MECÁNICA MÓVIL PROFESIONAL", { x: M, y: H - 60, size: 7, font: f, color: rgb(0.7, 0.7, 0.7) })
  const tit = "INFORME DE MANTENCIÓN", sub = t(fecha(inf.fecha) + (inf.presupuesto_numero ? "  -  Presupuesto N° " + inf.presupuesto_numero : ""))
  page.drawText(tit, { x: W - M - fb.widthOfTextAtSize(tit, 12), y: H - 40, size: 12, font: fb, color: rgb(1, 1, 1) })
  page.drawText(sub, { x: W - M - f.widthOfTextAtSize(sub, 8.5), y: H - 54, size: 8.5, font: f, color: rgb(0.7, 0.7, 0.7) })
  y = H - 96

  sec("Cliente y vehículo")
  pares([
    ["Cliente", inf.cliente], ["Comuna", inf.comuna],
    ["Vehículo", [inf.vehiculo, inf.anio].filter(Boolean).join(" ")], ["Patente", (inf.patente || "").toUpperCase()],
    ["Motor", inf.motor], ["Kilometraje", km(inf.km)],
    ["Técnico", inf.tecnico], ["Servicio", inf.servicio],
  ])

  const trab = inf.trabajos || []
  if (trab.length) {
    sec("Trabajos realizados")
    for (const w of trab) para("- " + t(w.item) + (t(w.detalle) ? "  (" + t(w.detalle) + ")" : ""))
  }

  const ch = inf.checklist || []
  if (ch.length) {
    const n = (e) => ch.filter((c) => c.estado === e).length
    sec(`Revisión de ${ch.length} puntos críticos`)
    need(34)
    const bw = (W - 2 * M - 16) / 3
    ;["ok", "atencion", "urgente"].forEach((e, i) => {
      const x = M + i * (bw + 8)
      page.drawRectangle({ x, y: y - 22, width: bw, height: 32, color: CLARO })
      page.drawText(String(n(e)), { x: x + 10, y: y - 14, size: 18, font: fb, color: COL[e] })
      page.drawText(EST[e], { x: x + 44, y: y - 10, size: 8, font: fb, color: GRIS })
    })
    y -= 38
    let g = ""
    ch.forEach((c, i) => {
      if (c.grupo && c.grupo !== g) { g = c.grupo; need(30); y -= 6; page.drawText(t(g).toUpperCase(), { x: M, y, size: 7, font: fb, color: GRIS }); y -= 12 }
      need(16)
      const col = COL[c.estado] || GRIS, lab = EST[c.estado] || ""
      page.drawCircle({ x: M + 4, y: y + 3, size: 3.2, color: col })
      const nombre = `${i + 1}. ${t(c.nombre)}`
      page.drawText(nombre, { x: M + 14, y, size: 9.5, font: f, color: NEGRO })
      if (t(c.med)) page.drawText(`${t(c.med)} ${t(c.u)}`, { x: M + 20 + f.widthOfTextAtSize(nombre, 9.5), y, size: 9.5, font: fb, color: NEGRO })
      page.drawText(lab, { x: W - M - fb.widthOfTextAtSize(lab, 7.5), y, size: 7.5, font: fb, color: col })
      y -= 13
      if (t(c.nota)) para(c.nota, 8.5, f, GRIS, M + 14, W - 2 * M - 80)
      page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.4, color: rgb(0.9, 0.9, 0.9) })
      y -= 3
    })
  }

  const b = inf.bateria
  if (b) {
    sec("Test de batería con analizador")
    const R = BAT[b.resultado]
    if (R) { need(16); page.drawCircle({ x: M + 4, y: y + 3, size: 3.2, color: COL[R[1]] }); page.drawText(t(R[0]), { x: M + 14, y, size: 10.5, font: fb, color: NEGRO }); y -= 16 }
    const pct = b.soh != null ? b.soh : (b.cca_nominal > 0 && b.cca_medido > 0 ? Math.round(b.cca_medido / b.cca_nominal * 100) : null)
    if (pct != null) {
      need(26)
      const bw = W - 2 * M
      page.drawRectangle({ x: M, y: y - 2, width: bw, height: 7, color: rgb(0.92, 0.92, 0.92) })
      page.drawRectangle({ x: M, y: y - 2, width: bw * Math.max(0, Math.min(100, pct)) / 100, height: 7, color: R ? COL[R[1]] : GRIS })
      y -= 14; page.drawText(`Salud de la batería: ${pct}%`, { x: M, y, size: 8.5, font: f, color: GRIS }); y -= 14
    }
    pares([["Voltaje", b.voltaje != null ? b.voltaje + " V" : ""], ["Arranque medido", b.cca_medido != null ? b.cca_medido + " CCA" : ""], ["Arranque nominal", b.cca_nominal != null ? b.cca_nominal + " CCA" : ""]])
    if (b.resultado === "reemplazar" || b.resultado === "reemplazar_pronto") para("Te la cambiamos a domicilio, con instalación incluida. Escríbenos por WhatsApp.", 9)
  }

  if (t(inf.recomendaciones)) { sec("Recomendaciones del técnico"); para(inf.recomendaciones, 10) }

  if (inf.proxima_mantencion_km || inf.proxima_mantencion_fecha) {
    sec("Próxima mantención")
    para([km(inf.proxima_mantencion_km), fecha(inf.proxima_mantencion_fecha)].filter(Boolean).join("  o  "), 12, fb)
    para("Lo que ocurra primero. Te avisaremos por WhatsApp.", 8.5, f, GRIS)
  }

  const docs = [["Revisión técnica", inf.rt_vence], ["Permiso de circulación", inf.permiso_vence], ["SOAP", inf.soap_vence], ["Licencia de conducir", inf.licencia_vence]].filter((d) => d[1])
  if (docs.length) {
    sec("Documentos del vehículo")
    pares(docs.map((d) => [d[0] + " vence", fecha(d[1])]))
    para("Te enviaremos un recordatorio por WhatsApp antes de cada vencimiento.", 8.5, f, GRIS)
  }

  if (carta) {
    sec("Garantía")
    const kmg = carta.garantia_km ? ` o ${Number(carta.garantia_km).toLocaleString("es-CL")} km` : ""
    para(`Servicio con garantía de ${carta.garantia_meses} meses${kmg}, hasta el ${fecha(carta.garantia_hasta)}.`, 10, fb)
    if (carta.descuento_pct) para(`${carta.descuento_pct}% de descuento en la mano de obra de tu próximo servicio, válido hasta el ${fecha(carta.descuento_hasta)}.`, 9.5)
    para(`Certificado de garantía: ${portal}/carta-garantia.html?id=${carta.id}`, 8, f, GRIS)
  }

  const pages = pdf.getPages()
  pages.forEach((pg, i) => {
    const s = `Serviruta - Mecánica a domicilio - serviruta.cl - WhatsApp +56 9 8507 9392 - Página ${i + 1} de ${pages.length}`
    pg.drawText(s, { x: (W - f.widthOfTextAtSize(s, 7)) / 2, y: 20, size: 7, font: f, color: GRIS })
  })
  return await pdf.save()
}
