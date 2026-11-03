const fs=require('fs'),vm=require('vm');
function stub(){const f=function(){return P};const P=new Proxy(f,{get:(t,k)=>k===Symbol.toPrimitive?(()=>''):k==='length'?0:k==='then'?undefined:P,set:()=>true,apply:()=>P,construct:()=>P});return P}
function load(file){
  const html=fs.readFileSync(file,'utf8'); const scripts=[...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  const S=stub(); const ctx={console:{log(){},warn(){},error(){}},document:S,window:{},navigator:S,localStorage:S,location:S,setTimeout(){},setInterval(){},addEventListener(){},fetch:()=>new Promise(()=>{}),IntersectionObserver:function(){return S},Math,JSON,Date,encodeURIComponent,parseInt,parseFloat,Object,Array,String,Number,isNaN};
  ctx.window=ctx; vm.createContext(ctx);
  for(const s of scripts){ try{ vm.runInContext(s.replace(/\b(const|let)\s+(DATA|CONFIG|LOGOS)\b/g,'var $2'),ctx,{timeout:2000}) }catch(e){} }
  return ctx;
}
const out={};
for (const f of ['kits-mantencion-auto.html','kits-mantencion-motor-camion.html','kit-embrague-auto.html','kit-embrague-camion.html']){
  const c=load('../../'+f); const rows=[];
  for(const [mk,m] of Object.entries(c.DATA)) for(const mo of m.modelos){ for(const k of c.calcularKits(mo)) rows.push({marcaId:mk,marca:m.nombre,modeloId:mo.id,modelo:mo.nombre,motor:mo.motor||mo.desc||'',tipo:k.tipo,nivel:k.nombre,precio:k.precio,features:k.features,garantia:k.garantia||'',cambio:k.cambio||'',vehTipo:mo.tipo||''}) }
  out[f]=rows;
}
{ const c=load('../../baterias-auto-camion.html'); const rows=[];
  for(const [tipo,marcas] of Object.entries(c.DATA)) for(const [mk,mods] of Object.entries(marcas)) for(const mo of mods) for(const k of c.calcularKits(mo,tipo))
    rows.push({tipoVeh:tipo,marcaId:mk,marca:(c.LOGOS[mk]||{}).n||mk,modeloId:mo.id,modelo:mo.nombre,amp:mo.amp,dual:!!mo.dual,tipo:k.tipo,nivel:k.nombre,precio:k.precio,features:k.features||[],garantia:k.garantia||''});
  out['baterias-auto-camion.html']=rows; }
fs.writeFileSync('out/precios.json',JSON.stringify(out,null,1));
for(const [k,v] of Object.entries(out)){ const ps=v.map(r=>r.precio); console.log(k,v.length,'filas', 'modelos',new Set(v.map(r=>r.marcaId+'/'+r.modeloId+(r.tipoVeh||''))).size,'niveles',[...new Set(v.map(r=>r.nivel))].join('|'),'precio',Math.min(...ps),Math.max(...ps), 'NaN',ps.filter(x=>!Number.isFinite(x)).length)}
