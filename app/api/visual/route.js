import {GoogleGenAI} from "@google/genai";
export const runtime="nodejs";
async function stock(q){
 try{
  const u=new URL("https://commons.wikimedia.org/w/api.php");
  u.searchParams.set("action","query");u.searchParams.set("generator","search");u.searchParams.set("gsrsearch",q);
  u.searchParams.set("gsrnamespace","6");u.searchParams.set("gsrlimit","8");u.searchParams.set("prop","imageinfo");
  u.searchParams.set("iiprop","url|mime");u.searchParams.set("iiurlwidth","900");u.searchParams.set("format","json");u.searchParams.set("origin","*");
  const r=await fetch(u,{headers:{"User-Agent":"ReelForgeAI/2.0"}});const d=await r.json();
  const p=Object.values(d.query?.pages||{}).find(x=>x.imageinfo?.[0]?.thumburl&&/^image\//.test(x.imageinfo[0].mime||""));
  return p?{url:p.imageinfo[0].thumburl,source:"Wikimedia Commons"}:null;
 }catch{return null}
}
export async function POST(req){
 const {prompt,query,mode="auto"}=await req.json();
 if(mode==="stock") return Response.json((await stock(query||prompt))||{url:null,source:"none"});
 if(process.env.GEMINI_API_KEY){
  try{
   const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
   const r=await ai.models.generateContent({
    model:"gemini-2.5-flash-image",
    contents:`Create a high-quality vertical 9:16 social-media image. No text, no logo, no watermark. ${prompt}`,
    config:{responseModalities:["IMAGE"],imageConfig:{aspectRatio:"9:16"}}
   });
   const parts=r.candidates?.[0]?.content?.parts||[];
   const part=parts.find(p=>p.inlineData);
   if(part) return Response.json({url:`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,source:"Gemini AI image"});
  }catch(e){console.error("AI visual failed, using stock fallback",e)}
 }
 return Response.json((await stock(query||prompt))||{url:null,source:"none"});
}