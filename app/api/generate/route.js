import { GoogleGenAI } from "@google/genai";
export const runtime="nodejs";
const schema={type:"object",properties:{title:{type:"string"},hook:{type:"string"},scenes:{type:"array",items:{type:"object",properties:{scene:{type:"integer"},headline:{type:"string"},visual_prompt:{type:"string"},visual_query:{type:"string"},voiceover:{type:"string"},duration:{type:"number"}},required:["scene","headline","visual_prompt","visual_query","voiceover","duration"]}}},required:["title","hook","scenes"]};
export async function POST(request){
 try{
  const {topic}=await request.json(); const clean=topic?.trim();
  if(!clean)return Response.json({error:"Please enter a topic first."},{status:400});
  const key=process.env.GEMINI_API_KEY?.trim();
  if(!key)return Response.json({error:"GEMINI_API_KEY is missing in Vercel Environment Variables."},{status:500});
  const ai=new GoogleGenAI({apiKey:key});
  const prompt=`Create an engaging 7-scene vertical social media reel about "${clean}".
Exactly 7 scenes. Scene 1 is a strong hook. Scenes 2-6 provide useful information. Scene 7 is a takeaway or CTA.
Each voiceover is natural spoken language, 12-22 words. Each visual_prompt is realistic/cinematic, vertical, and must contain no text, logos or watermarks. visual_query is 2-5 simple English keywords. Duration is normally 4 seconds. Return only JSON matching the schema.`;
  const interaction=await ai.interactions.create({model:"gemini-3.8-flash",input:prompt,response_format:{type:"text",mime_type:"application/json",schema}});
  if(!interaction?.output_text)throw new Error("Gemini returned an empty response.");
  const reel=JSON.parse(interaction.output_text);
  if(!Array.isArray(reel.scenes)||reel.scenes.length!==7)throw new Error(`Gemini returned ${reel.scenes?.length||0} scenes instead of 7.`);
  reel.title=String(reel.title||clean); reel.hook=String(reel.hook||reel.scenes[0]?.voiceover||"");
  reel.scenes=reel.scenes.map((s,i)=>({scene:i+1,headline:String(s.headline||`Scene ${i+1}`),visual_prompt:String(s.visual_prompt||clean),visual_query:String(s.visual_query||clean),voiceover:String(s.voiceover||""),duration:Number(s.duration)||4}));
  reel.narration=reel.scenes.map(s=>s.voiceover).join(" ");
  return Response.json(reel);
 }catch(e){
  console.error("REELFORGE GEMINI ERROR:",e);
  const m=String(e?.message||e), l=m.toLowerCase();
  let error="Gemini generation failed. Please try again.";
  if(l.includes("api key")||l.includes("401")||l.includes("403")||l.includes("unauthorized"))error="Gemini API key was rejected. Check GEMINI_API_KEY in Vercel.";
  else if(l.includes("quota")||l.includes("429")||l.includes("resource exhausted"))error="Gemini quota/rate limit reached. Check Google AI Studio usage.";
  else if(l.includes("404")||l.includes("not found")||l.includes("model"))error="Gemini 3.8 Flash is unavailable for this API key/project.";
  return Response.json({error,detail:m},{status:500});
 }}