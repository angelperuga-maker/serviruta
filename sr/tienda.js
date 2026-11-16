/* Serviruta · conexión cotizador → tienda Shopify
   Agrega "Comprar online" a cada tarjeta de kit. Usa el mismo modelo y nivel que el
   cotizador calculó y lleva al checkout de la tienda con ese producto en el carro.
   El mapa de variantes (sr/map/<pagina>.js) lo genera el sincronizador; no editar a mano. */
(function(){
  var TIENDA = 'https://x1zss0-wq.myshopify.com';   // cambiar a https://serviruta.cl cuando el dominio apunte a Shopify
  var s = document.currentScript, PAGINA = (s && s.getAttribute('data-cotizador')) || '';
  var MAP = window.SR_MAP || {};
  function fmt(n){ return '$' + Number(n).toLocaleString('es-CL'); }
  function utm(){ var q = new URLSearchParams(location.search), out = [];
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid'].forEach(function(k){ if(q.get(k)) out.push(k+'='+encodeURIComponent(q.get(k))); });
    return out; }
  function link(v, nombre){
    var p = ['attributes[origen]=cotizador', 'attributes[pagina]=' + encodeURIComponent(PAGINA), 'attributes[seleccion]=' + encodeURIComponent(nombre)].concat(utm());
    return TIENDA + '/cart/' + v + ':1?' + p.join('&');
  }
  function evento(n, d){ window.dataLayer = window.dataLayer || []; d.event = n; window.dataLayer.push(d); }
  function g(n){ try { return eval(n); } catch(e){ return undefined; } }   // variables globales del cotizador (var/let)
  function decorar(){
    var modelo = g('modeloSeleccionado'), marca = g('marcaSeleccionada'), tipoVeh = g('tipoSeleccionado') || '';
    if(!modelo || typeof window.calcularKits !== 'function') return;
    var kits = PAGINA === 'baterias-auto-camion.html' ? window.calcularKits(modelo, tipoVeh) : window.calcularKits(modelo);
    var cards = document.querySelectorAll('#kits-grid .kit-card');
    cards.forEach(function(card, i){
      var k = kits[i]; if(!k || card.querySelector('.sr-comprar')) return;
      var key = PAGINA + '|' + (PAGINA === 'baterias-auto-camion.html' ? tipoVeh : '') + '|' + marca + '|' + modelo.id + '|' + k.tipo;
      var m = MAP[key]; if(!m || m.p !== k.precio) return;            // si el precio no coincide, no se ofrece compra online
      var nombre = k.nombre + ' · ' + (modelo.nombre || '');
      var a = document.createElement('a');
      a.className = 'sr-comprar'; a.href = link(m.v, nombre); a.rel = 'nofollow';
      a.innerHTML = '🛒 Comprar online <small>' + fmt(k.precio) + '</small>';
      a.addEventListener('click', function(){ evento('begin_checkout', {pagina: PAGINA, item: nombre, value: k.precio, currency: 'CLP'}); });
      var nota = document.createElement('div'); nota.className = 'sr-pago';
      nota.textContent = 'Pago seguro con tarjeta · Coordinamos día y hora por WhatsApp';
      var cta = card.querySelector('.kit-cta');
      if(cta){ card.insertBefore(a, cta); card.insertBefore(nota, cta); cta.innerHTML = '💬 Prefiero cotizar por WhatsApp'; }
      else { card.appendChild(a); card.appendChild(nota); }
    });
  }
  if(typeof window.renderKits === 'function'){
    var original = window.renderKits;
    window.renderKits = function(){ var r = original.apply(this, arguments); try { decorar(); } catch(e){} return r; };
  }

  // Cotizador de aire acondicionado: puede llevar varios servicios en una sola compra
  document.addEventListener('sr:aa-calcula', function(){
    var A = window.SR_AA; if(!A) return; var e = A.estado, res = document.getElementById('aaRes');
    var viejo = res.querySelector('.sr-comprar'); if(viejo){ viejo.remove(); var n = res.querySelector('.sr-pago'); if(n) n.remove(); }
    var gas = e.gas === 'R1234yf' ? 'R1234yf' : 'R134a', items = [], total = 0, ok = true;
    e.elegidos.forEach(function(id){
      var sv = A.servicio(id); var key = 'ac|' + id + '|' + e.segmento + (sv && sv.porGas ? '|' + gas : '');
      var m = MAP[key]; if(!m || (sv && sv.desde)){ ok = false; return; } items.push(m.v + ':1'); total += m.p;
    });
    if(!ok || !items.length || total !== e.total) return;   // compresor u otro "desde": solo WhatsApp
    var nombre = e.marca + ' ' + e.modelo + ' ' + e.ano;
    var a = document.createElement('a'); a.className = 'sr-comprar'; a.rel = 'nofollow';
    var p = ['attributes[origen]=cotizador', 'attributes[pagina]=' + encodeURIComponent(PAGINA), 'attributes[vehiculo]=' + encodeURIComponent(nombre)].concat(utm());
    a.href = TIENDA + '/cart/' + items.join(',') + '?' + p.join('&');
    a.innerHTML = '🛒 Comprar online <small>' + fmt(total) + '</small>';
    a.addEventListener('click', function(){ evento('begin_checkout', {pagina: PAGINA, item: nombre, value: total, currency: 'CLP'}); });
    var nota = document.createElement('div'); nota.className = 'sr-pago'; nota.textContent = 'Pago seguro con tarjeta · Coordinamos día y hora por WhatsApp';
    var w = document.getElementById('aaWsp'); res.insertBefore(a, w); res.insertBefore(nota, w);
  });

  // Sitio Mantenciones (packs desde Supabase): agrega Comprar a cada tarjeta de pack
  if(PAGINA === 'mantenciones'){
    var caja = document.getElementById('resultados');
    var poner = function(){
      if(!caja) return;
      caja.querySelectorAll('article.card[data-m][data-p]').forEach(function(card){
        if(card.querySelector('.sr-comprar')) return;
        var m = MAP['mant|' + card.getAttribute('data-p') + '|' + card.getAttribute('data-m')]; if(!m) return;
        var pr = card.querySelector('.price'); var visto = pr ? parseInt(pr.textContent.replace(/[^0-9]/g,'').slice(0, String(m.p).length), 10) : 0;
        if(visto !== m.p) return;                                   // precio distinto al de Shopify: no se ofrece compra
        var h = card.querySelector('h3'); var nombre = (h ? h.textContent.replace(/\s+/g,' ').trim() : '') + ' · Pack ' + card.getAttribute('data-p');
        var a = document.createElement('a'); a.className = 'sr-comprar'; a.rel = 'nofollow'; a.href = link(m.v, nombre);
        a.innerHTML = '🛒 Comprar online <small>' + fmt(m.p) + '</small>';
        a.addEventListener('click', function(){ evento('begin_checkout', {pagina: PAGINA, item: nombre, value: m.p, currency: 'CLP'}); });
        var nota = document.createElement('div'); nota.className = 'sr-pago'; nota.textContent = 'Pago seguro con tarjeta · Coordinamos día y hora por WhatsApp';
        var fila = pr ? pr.nextElementSibling : null; while(fila && !fila.classList.contains('row')) fila = fila.nextElementSibling;
        if(fila){ card.insertBefore(a, fila); card.insertBefore(nota, fila); } else { card.appendChild(a); card.appendChild(nota); }
      });
    };
    if(caja){ new MutationObserver(poner).observe(caja, {childList: true, subtree: true}); poner(); }
  }
  // logo de la tienda
  document.querySelectorAll('a.logo').forEach(function(a){
    if(a.querySelector('img.sr-logo')) return;
    var img = new Image(); img.className = 'sr-logo'; img.alt = 'SERVIRUTA.cl'; img.src = (s && s.src ? s.src.replace(/tienda\.js.*$/, '') : 'sr/') + 'logo-serviruta.png';
    a.insertBefore(img, a.firstChild);
  });
})();
