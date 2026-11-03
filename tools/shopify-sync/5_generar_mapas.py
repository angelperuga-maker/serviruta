"""Escribe sr/map/<pagina>.js a partir de out/shopify_map.json (variantes de Shopify por modelo y nivel)."""
import json,collections
m=json.load(open("out/shopify_map.json")); by=collections.defaultdict(dict)
ids=json.load(open("mant_modelo_ids.json"))
for k,v in m.items():
    p=k.split("|")
    if p[0].endswith(".html"): by[p[0][:-5]][k]={"v":v["v"],"p":v["p"]}
    elif p[0]=="ac": by["cotizador-aire-acondicionado"][k]={"v":v["v"],"p":v["p"]}
    elif p[0]=="mant": by["mantenciones"][f"mant|{p[1]}|{ids['|'.join(p[1:])]}"]={"v":v["v"],"p":v["p"]}
for page,d in by.items():
    open(f"../../sr/map/{page}.js","w").write("/* generado por el sincronizador Serviruta→Shopify; no editar */\nwindow.SR_MAP="+json.dumps(d,separators=(",",":"))+";\n"); print(page,len(d))
