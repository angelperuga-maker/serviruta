import json,re,html
P=json.load(open("out/precios.json")); M=json.load(open("mant_packs.json"))
IMG_AUTO="https://cdn.shopify.com/s/files/1/1020/0301/5965/files/WhatsApp-Image-2022-09-08-at-4.50.38-PM-1.jpg"
IMG_CAMION="https://cdn.shopify.com/s/files/1/1020/0301/5965/files/IMG_20180820_115822.jpg"
TYPE="Servicios a domicilio"
def clean(s): return re.sub(r"\s*\([\d.,]+\s*L\)","",s)
def body(intro,tiers):
    h=f"<p>{html.escape(intro)}</p>"
    for name,feats,extra in tiers:
        h+=f"<h4>{html.escape(name)}</h4><ul>"+"".join(f"<li>{html.escape(clean(f))}</li>" for f in feats)+"</ul>"+(f"<p>{html.escape(extra)}</p>" if extra else "")
    return h+"<p><strong>Servicio a domicilio en Santiago (RM).</strong> Después de tu compra te contactamos por WhatsApp para coordinar día, hora y dirección. Valores con IVA incluido.</p>"
def from_cotiz(file,handle,title,intro,img,label,veh_fmt,sku_pre,tags):
    rows=P[file]; tiers=[]; seen=set()
    for r in rows:
        if r["nivel"] not in seen: seen.add(r["nivel"]); tiers.append((r["nivel"],r["features"],(r.get("cambio") and "Cambio recomendado "+r["cambio"]) or (r.get("garantia") and "Garantía "+r["garantia"]) or ""))
    vals={}; variants=[]
    for r in rows:
        v=veh_fmt(r); key=(v,r["nivel"])
        if key in vals: continue
        vals[key]=1
        variants.append({"veh":v,"nivel":r["nivel"],"price":r["precio"],"sku":f"{sku_pre}-{r.get('tipoVeh','')+'-' if r.get('tipoVeh') else ''}{r['marcaId']}-{r['modeloId']}-{r['tipo']}".lower(),
                         "key":f"{file}|{r.get('tipoVeh','')}|{r['marcaId']}|{r['modeloId']}|{r['tipo']}"})
    return {"handle":handle,"title":title,"body":body(intro,tiers),"img":img,"opt1":label,"opt2":"Nivel","variants":variants,"tags":tags}
prods=[
 from_cotiz("kits-mantencion-auto.html","kit-mantencion-auto-domicilio","Kit de mantención a domicilio · Autos, SUV y camionetas",
   "Cambio de aceite y filtros en tu casa u oficina. Elige tu vehículo y el nivel del kit; el precio incluye repuestos y mano de obra.",IMG_AUTO,"Vehículo",lambda r:f"{r['marca']} {r['modelo']}","KMA",["Mantención","Autos"]),
 from_cotiz("kits-mantencion-motor-camion.html","kit-mantencion-motor-camion","Kit de mantención de motor a domicilio · Camiones",
   "Mantención de motor en tu bodega, faena o en ruta. Elige tu camión y el nivel del kit; incluye aceite, filtros y mano de obra.",IMG_CAMION,"Camión",lambda r:f"{r['marca']} {r['modelo']}","KMC",["Mantención","Camiones"]),
 from_cotiz("kit-embrague-auto.html","cambio-kit-embrague-auto","Cambio de kit de embrague a domicilio · Autos, SUV y camionetas",
   "Cambio de embrague donde está tu vehículo, con 2 técnicos. Elige modelo y calidad del kit; incluye repuestos y mano de obra.",IMG_AUTO,"Vehículo",lambda r:f"{r['marca']} {r['modelo']}","KEA",["Embrague","Autos"]),
 from_cotiz("kit-embrague-camion.html","cambio-kit-embrague-camion","Cambio de kit de embrague a domicilio · Camiones",
   "Cambio de embrague de camión en tu base o en ruta. Elige modelo y calidad del kit; incluye repuestos, 2 técnicos y prueba dinámica.",IMG_CAMION,"Camión",lambda r:f"{r['marca']} {r['modelo']}","KEC",["Embrague","Camiones"]),
 from_cotiz("baterias-auto-camion.html","bateria-instalada-segun-vehiculo","Batería instalada a domicilio según tu vehículo",
   "Elige tu vehículo y la calidad de batería. Te llegamos, hacemos test de batería y alternador e instalamos. Incluye retiro de la batería usada.",IMG_AUTO,"Vehículo",
   lambda r:f"{ {'auto':'Auto','suv':'SUV','camioneta':'Camioneta','camion':'Camión'}.get(r['tipoVeh'],r['tipoVeh'])} · {r['marca']} {r['modelo']} · {r['amp']} Ah","BAT",["Baterías"]),
]
# mantenciones packs (Supabase)
for tipo,title,intro,img in [("completo","Pack Mantención Completo a domicilio","Aceite + filtro de aceite + filtro de aire + filtro de habitáculo/polen, mano de obra y revisión. Precio cerrado por modelo.",IMG_AUTO),
                             ("diesel","Pack Mantención Diésel a domicilio","Aceite correcto + filtros de aceite, aire y combustible/separador de agua, mano de obra y revisión. Precio cerrado por modelo.",IMG_CAMION)]:
    vs=[{"veh":f"{m} {mo} {mot} ({a})","price":p,"sku":f"MANT-{tipo}-{m}-{mo}-{mot}".lower().replace(" ","-").replace("/","-"),"key":f"mant|{tipo}|{m}|{mo}|{mot}|{a}"} for t,p,m,mo,mot,a in M if t==tipo]
    prods.append({"handle":f"pack-mantencion-{tipo}","title":title,"body":f"<p>{intro}</p><p><strong>Servicio a domicilio en Santiago (RM).</strong> Te contactamos por WhatsApp para coordinar. Promoción: 20% de descuento en el segundo vehículo en la misma visita y dirección (consúltalo al coordinar).</p>","img":img,"opt1":"Vehículo","opt2":None,"variants":vs,"tags":["Mantención","Pack"]})
# Aire acondicionado
SEG={"L":"Auto","M":"SUV / Camioneta","C":"Furgón / Camión liviano"}
ac=[("carga","Recarga de gas A/C con vacío",{"R134a":{"L":65000,"M":75000,"C":92000},"R1234yf":{"L":145000,"M":165000,"C":198000}}),
    ("fuga","Detección de fuga A/C",{"L":45000,"M":45000,"C":55000}),("sanitizacion","Sanitización del evaporador y ductos",{"L":35000,"M":38000,"C":45000}),
    ("filtro","Cambio de filtro de cabina",{"L":25000,"M":28000,"C":34000}),("deshidratador","Cambio de filtro deshidratador A/C (incluye recarga)",{"L":95000,"M":110000,"C":135000}),
    ("diagnostico","Diagnóstico de aire acondicionado",{"L":35000,"M":35000,"C":42000})]
for sid,t,pr in ac:
    if sid=="carga":
        vs=[{"veh":SEG[s],"nivel":g,"price":pr[g][s],"sku":f"AC-{sid}-{g}-{s}".lower(),"key":f"ac|{sid}|{s}|{g}"} for g in pr for s in "LMC"]
        o2="Refrigerante"
    else:
        vs=[{"veh":SEG[s],"price":pr[s],"sku":f"AC-{sid}-{s}".lower(),"key":f"ac|{sid}|{s}"} for s in "LMC"]; o2=None
    prods.append({"handle":f"aire-acondicionado-{sid}","title":t+" · a domicilio","body":"<p>Servicio de aire acondicionado a domicilio en Santiago (RM). Incluye traslado del técnico, mano de obra, prueba de temperatura en salida y garantía de 3 meses en mano de obra.</p>"+("<p>El diagnóstico se descuenta si haces la reparación con nosotros.</p>" if sid in("fuga","diagnostico") else ""),
                  "img":IMG_AUTO,"opt1":"Tipo de vehículo","opt2":o2,"variants":vs,"tags":["Aire acondicionado"]})
json.dump(prods,open("out/shopify_cotiz_products.json","w"),ensure_ascii=False,indent=1)
for p in prods: print(p["handle"],len(p["variants"]),min(v["price"] for v in p["variants"]),max(v["price"] for v in p["variants"]))
