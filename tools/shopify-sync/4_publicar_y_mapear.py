import sys,json; sys.path.insert(0,".")
from shopify_gql import gql
prods=json.load(open("out/shopify_cotiz_products.json"))
pub=[p["id"] for p in gql("{publications(first:5){nodes{id name}}}")["data"]["publications"]["nodes"] if p["name"]=="Online Store"][0]
mapping={}; bad=0
for p in prods:
    pid=gql('query($h:String!){productByHandle(handle:$h){id}}',{"h":p["handle"]})["data"]["productByHandle"]["id"]
    gql("mutation($id:ID!,$p:ID!){publishablePublish(id:$id,input:{publicationId:$p}){userErrors{message}}}",{"id":pid,"p":pub})
    vs=[];after=None
    while True:
        d=gql('query($id:ID!,$a:String){product(id:$id){variants(first:250,after:$a){nodes{legacyResourceId sku price} pageInfo{hasNextPage endCursor}}}}',{"id":pid,"a":after})["data"]["product"]["variants"]
        vs+=d["nodes"]
        if not d["pageInfo"]["hasNextPage"]: break
        after=d["pageInfo"]["endCursor"]
    bysku={v["sku"]:v for v in vs}
    for v in p["variants"]:
        s=bysku.get(v["sku"][:250])
        if not s or int(float(s["price"]))!=v["price"]: bad+=1; continue
        mapping[v["key"]]={"v":int(s["legacyResourceId"]),"p":v["price"],"h":p["handle"]}
    print(p["handle"],"spec",len(p["variants"]),"shopify",len(vs))
print("mapped",len(mapping),"bad",bad)
json.dump(mapping,open("out/shopify_map.json","w"),ensure_ascii=False)
