import sys,json,time; sys.path.insert(0,".")
from shopify_gql import gql
prods=json.load(open("out/shopify_cotiz_products.json"))
M="""mutation($id:ProductSetIdentifiers,$input:ProductSetInput!){productSet(identifier:$id,input:$input,synchronous:false){productSetOperation{id status} userErrors{field message code}}}"""
Q="""query($id:ID!){productOperation(id:$id){... on ProductSetOperation{status product{id handle} userErrors{field message}}}}"""
res={}
for p in prods:
    o1=p["opt1"]; o2=p.get("opt2")
    v1=list(dict.fromkeys(v["veh"] for v in p["variants"])); 
    opts=[{"name":o1,"values":[{"name":x} for x in v1]}]
    if o2: opts.append({"name":o2,"values":[{"name":x} for x in dict.fromkeys(v["nivel"] for v in p["variants"])]})
    variants=[]
    for v in p["variants"]:
        ov=[{"optionName":o1,"name":v["veh"]}]+([{"optionName":o2,"name":v["nivel"]}] if o2 else [])
        variants.append({"optionValues":ov,"price":str(v["price"]),"inventoryPolicy":"CONTINUE","taxable":True,
                         "inventoryItem":{"sku":v["sku"][:250],"tracked":False,"requiresShipping":False}})
    inp={"title":p["title"],"handle":p["handle"],"descriptionHtml":p["body"],"vendor":"Serviruta","productType":"Servicios a domicilio",
         "tags":p["tags"]+["Cotizador"],"status":"ACTIVE","productOptions":opts,"variants":variants,
         "files":[{"originalSource":p["img"],"alt":p["title"],"contentType":"IMAGE"}],
         "seo":{"title":p["title"][:70],"description":(p["title"]+". Precio cerrado, a domicilio en Santiago. Serviruta.")[:320]}}
    r=gql(M,{"id":{"handle":p["handle"]},"input":inp})
    d=(r.get("data") or {}).get("productSet") or {}
    if r.get("errors") or d.get("userErrors"): print("ERR",p["handle"],r.get("errors") or d["userErrors"]); continue
    op=d["productSetOperation"]["id"]
    for i in range(60):
        time.sleep(3); s=gql(Q,{"id":op})["data"]["productOperation"]
        if s["status"]=="COMPLETE": break
    print(p["handle"],s["status"],s.get("userErrors"),s.get("product") and s["product"]["id"],flush=True)
