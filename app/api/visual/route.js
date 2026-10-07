export const runtime="nodejs";
const MODEL=process.env.CLOUDFLARE_IMAGE_MODEL||"@cf/black-forest-labs/flux-2-klein-4b";
async function cloudflareImage(prompt){
 const account=process.env.CLOUDFLARE_ACCOUNT_ID?.trim(), token=process.env.CLOUDFLARE_API_TOKEN?.trim();
 if(!account||!token)throw new Error("Cloudflare image credentials are missing.");
 const form=new FormData();
 form.append("prompt",`${prompt}. Vertical 9:16 social media composition, cinematic, realistic, detailed. No text, logos or watermark.`);
 form.append("width","768"); form.append("height","1344");
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${encodeURIComponent(MODEL)}`,{method:"POST",headers:{Authorization:`Bearer ${token}`},body:form});
 if(!r.ok)throw new Error(`Cloudflare AI ${r.status}: ${(await r.text()).slice(0,700)}`);
 const ct=r.headers.get("content-type")||"";
 if(ct.startsWith("image/"))return {url:`data:${ct};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`,source:"Cloudflare Workers AI"};
 const d=await r.json(), b=d?.result?.image||d?.result?.image_base64||d?.image||d?.image_base64;
 if(!b)throw new Error("Cloudflare returned no image data.");
 return {url:`data:image/png;base64,${b}`,source:"Cloudflare Workers AI"};
}
async function stock(q){
 const url=`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q||"business")}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url&iiurlwidth=900&format=json&origin=*`;
 const r=await fetch(url,{cache:"no-store"}); if(!r.ok)throw new Error("Stock search failed.");
 const d=await r.json(), pages=Object.values(d?.query?.pages||{}), hit=pages.find(p=>p?.imageinfo?.[0]?.thumburl||p?.imageinfo?.[0]?.url);
 return hit?{url:hit.imageinfo[0].thumburl||hit.imageinfo[0].url,source:"Wikimedia Commons fallback"}:{url:null,source:"No visual found"};
}
export async function POST(request){
 try{
  const {prompt,query,mode}=await request.json();
  if(mode==="stock")return Response.json(await stock(query));
  try{return Response.json(await cloudflareImage(prompt||query||"business"))}
  catch(e){console.error("Cloudflare image failed; fallback:",e);return Response.json(await stock(query||"business"))}
 }catch(e){console.error("VISUAL ERROR:",e);return Response.json({url:null,source:"Visual unavailable"})}
}