"""Cliente mínimo Admin GraphQL. Credenciales por variables de entorno (nunca en el repo):
   SHOPIFY_SHOP=x1zss0-wq.myshopify.com  SHOPIFY_CLIENT_ID=...  SHOPIFY_CLIENT_SECRET=..."""
import json,os,time,urllib.request,urllib.parse
SHOP=os.environ.get("SHOPIFY_SHOP","x1zss0-wq.myshopify.com"); _tok=None
def token():
    global _tok
    if not _tok:
        body=urllib.parse.urlencode({"grant_type":"client_credentials","client_id":os.environ["SHOPIFY_CLIENT_ID"],"client_secret":os.environ["SHOPIFY_CLIENT_SECRET"]}).encode()
        _tok=json.load(urllib.request.urlopen(urllib.request.Request(f"https://{SHOP}/admin/oauth/access_token",data=body)))["access_token"]
    return _tok
def gql(q,v=None,ver="2026-04"):
    for i in range(6):
        try:
            req=urllib.request.Request(f"https://{SHOP}/admin/api/{ver}/graphql.json",data=json.dumps({"query":q,"variables":v or {}}).encode(),headers={"Content-Type":"application/json","X-Shopify-Access-Token":token()})
            r=json.load(urllib.request.urlopen(req,timeout=90))
            if r.get("errors") and "THROTTLED" in json.dumps(r["errors"]): time.sleep(2+2*i); continue
            return r
        except Exception as e: err=e; time.sleep(3)
    return {"errors":[str(err)]}
