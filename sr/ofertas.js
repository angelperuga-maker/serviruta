/* PROPUESTA · ofertas tipo retail (banderita de descuento) para los cotizadores.
   OFERTA.descuento se aplica sobre el precio del cotizador (que pasa a ser "precio normal").
   Para publicar de verdad: crear el descuento automático equivalente en Shopify, así el carrito cobra lo mismo que muestra la página. */
(function(){
  var OFERTA = { descuento: 10, etiqueta: 'ONLINE', titulo: 'OFERTA DEL MES', hasta: '2026-11-30T23:59:59-03:00' };
  var fin = new Date(OFERTA.hasta).getTime();
  if (Date.now() > fin) return;                                   // oferta vencida: no se muestra nada
  function clp(n){ return '$' + Math.round(n).toLocaleString('es-CL'); }
  function precioOferta(p){ return Math.round(p * (1 - OFERTA.descuento/100) / 100) * 100; }
  // barra superior con contador
  var barra = document.createElement('div'); barra.className = 'sr-oferta-barra';
  barra.innerHTML = '<b>' + OFERTA.titulo + '</b><span>' + OFERTA.descuento + '% de descuento comprando online</span><span class="sr-reloj"><span data-d>--</span><span data-h>--</span><span data-m>--</span><span data-s>--</span></span>';
  var anuncio = document.querySelector('.sr-anuncio'); (anuncio ? anuncio.parentNode : document.body).insertBefore(barra, anuncio ? anuncio.nextSibling : document.body.firstChild);
  function tic(){ var t = Math.max(0, fin - Date.now()), d = Math.floor(t/864e5), h = Math.floor(t/36e5)%24, m = Math.floor(t/6e4)%60, s = Math.floor(t/1e3)%60;
    barra.querySelector('[data-d]').textContent = d + 'd'; barra.querySelector('[data-h]').textContent = ('0'+h).slice(-2) + 'h';
    barra.querySelector('[data-m]').textContent = ('0'+m).slice(-2) + 'm'; barra.querySelector('[data-s]').textContent = ('0'+s).slice(-2) + 's'; }
  tic(); setInterval(tic, 1000);
  function decorar(){
    document.querySelectorAll('#kits-grid .kit-card').forEach(function(card){
      if (card.querySelector('.sr-bandera')) return;
      var el = card.querySelector('.kit-precio'); if (!el) return;
      var normal = parseInt(el.textContent.replace(/[^0-9]/g,''), 10); if (!normal) return;
      var oferta = precioOferta(normal);
      var f = document.createElement('div'); f.className = 'sr-bandera'; f.innerHTML = '-' + OFERTA.descuento + '%<small>' + OFERTA.etiqueta + '</small>';
      card.insertBefore(f, card.firstChild);
      el.classList.add('sr-con-oferta'); el.innerHTML = '<span class="curr">$</span>' + oferta.toLocaleString('es-CL');
      var antes = document.createElement('div'); antes.className = 'sr-antes'; antes.innerHTML = 'Precio normal <s>' + clp(normal) + '</s>';
      var ahorro = document.createElement('div'); ahorro.className = 'sr-ahorro'; ahorro.textContent = 'Ahorras ' + clp(normal - oferta);
      el.parentNode.insertBefore(antes, el.nextSibling); antes.parentNode.insertBefore(ahorro, antes.nextSibling);
      var sellos = document.createElement('div'); sellos.className = 'sr-sellos';
      sellos.innerHTML = '<span class="ok">✓ Técnico a domicilio sin costo</span><span>Precio cerrado</span><span>Garantía escrita</span>';
      ahorro.parentNode.insertBefore(sellos, ahorro.nextSibling);
      var btn = card.querySelector('.sr-comprar small'); if (btn) btn.textContent = clp(oferta);
      var cta = card.querySelector('.kit-cta'); if (cta) cta.innerHTML = '💬 Cotizar por WhatsApp (precio normal)';
    });
  }
  if (typeof window.renderKits === 'function'){ var o = window.renderKits; window.renderKits = function(){ var r = o.apply(this, arguments); try { decorar(); } catch(e){} return r; }; }
})();
