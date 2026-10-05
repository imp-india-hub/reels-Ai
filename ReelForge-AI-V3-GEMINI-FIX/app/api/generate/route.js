import { GoogleGenAI, Type } from "@google/genai";

export const runtime = "nodejs";

const schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    hook: { type: Type.STRING },
    scenes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          scene: { type: Type.INTEGER },
          headline: { type: Type.STRING },
          visual_prompt: { type: Type.STRING },
          visual_query: { type: Type.STRING },
          voiceover: { type: Type.STRING },
          duration: { type: Type.NUMBER }
        },
        required: ["scene", "headline", "visual_prompt", "visual_query", "voiceover", "duration"]
      }
    }
  },
  required: ["title", "hook", "scenes"]
};

export async function POST(req) {
  try {
    const { topic } = await req.json();

    if (!topic?.trim()) {
      return Response.json({ error: "Enter a topic first." }, { status: 400 });
    }

    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) {
      return Response.json({
        error: "GEMINI_API_KEY is missing. Add it in Vercel → Settings → Environment Variables, then redeploy."
      }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: key });

    const prompt = `Create a 7-scene vertical social-media reel about "${topic.trim()}".

Rules:
- Exactly 7 scenes.
- Scene 1 must be a strong attention-grabbing hook.
- Scenes 2-6 should give useful, clear information.
- Scene 7 should end with a practical takeaway or CTA.
- Voiceover should sound natural when spoken aloud, 12-22 words per scene.
- visual_prompt must describe a realistic/cinematic vertical image and must NOT request text, logos or watermarks.
- visual_query must be 2-5 simple English keywords suitable for finding a free stock photo.
- duration should normally be 4 seconds.
- Return only the requested structured data.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.8
      }
    });

    if (!response?.text) {
      throw new Error("Gemini returned an empty response.");
    }

    const reel = JSON.parse(response.text);

    if (!Array.isArray(reel.scenes) || reel.scenes.length !== 7) {
      throw new Error(`Gemini returned ${reel.scenes?.length || 0} scenes instead of 7.`);
    }

    reel.scenes = reel.scenes.map((s, i) => ({
      ...s,
      scene: i + 1,
      duration: Number(s.duration) || 4
    }));

    reel.narration = reel.scenes.map(s => s.voiceover).join(" ");

    return Response.json(reel);
  } catch (e) {
    console.error("REELFORGE GEMINI ERROR:", e);

    const msg = String(e?.message || e);
    const lower = msg.toLowerCase();

    let error = "Gemini script generation failed.";

    if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("401") || lower.includes("403")) {
      error = "Gemini API key was rejected. Create/check a current Gemini API key and update GEMINI_API_KEY in Vercel.";
    } else if (lower.includes("quota") || lower.includes("429") || lower.includes("resource exhausted")) {
      error = "Gemini API quota/rate limit was reached. Check Google AI Studio usage/billing and try again.";
    } else if (lower.includes("not found") || lower.includes("404") || lower.includes("model")) {
      error = "The Gemini model is unavailable for this API key/project. Check the Gemini API access for this project.";
    } else if (lower.includes("json") || lower.includes("schema")) {
      error = "Gemini responded, but the structured reel format could not be read. Try the topic again.";
    }

    return Response.json({ error, detail: process.env.NODE_ENV === "development" ? msg : undefined }, { status: 500 });
  }
}