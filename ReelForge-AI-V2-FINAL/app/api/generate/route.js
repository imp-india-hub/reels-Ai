import {GoogleGenAI} from "@google/genai";
export const runtime="nodejs";
export async function POST(req){
 try{
  const {topic}=await req.json();
  if(!topic?.trim()) return Response.json({error:"Enter a topic first."},{status:400});
  if(!process.env.GEMINI_API_KEY) return Response.json({error:"GEMINI_API_KEY is missing in Vercel Environment Variables."},{status:500});
  const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
  const prompt=`Create a 7-scene vertical social media reel about "${topic}".
Return ONLY JSON:
{"title":"short title","hook":"strong hook","scenes":[{"scene":1,"headline":"short headline","visual_prompt":"detailed image description, no text in image","visual_query":"2-5 English keywords","voiceover":"12-22 natural spoken words","duration":4}]}
Exactly 7 scenes. Scene 1 hook. Scenes 2-6 useful story/information. Scene 7 takeaway or CTA. Keep visual prompts cinematic and easy to generate.`;
  const r=await ai.models.generateContent({model:"gemini-2.5-flash",contents:prompt,config:{responseMimeType:"application/json"}});
  const reel=JSON.parse(r.text);
  if(!Array.isArray(reel.scenes)||reel.scenes.length!==7) throw new Error("Invalid scene count");
  reel.scenes=reel.scenes.map((s,i)=>({...s,scene:i+1,duration:Number(s.duration)||4}));
  reel.narration=reel.scenes.map(s=>s.voiceover).join(" ");
  return Response.json(reel);
 }catch(e){
  console.error(e);
  return Response.json({error:"Gemini script generation failed. Check your API key, model access and Vercel logs."},{status:500});
 }
}