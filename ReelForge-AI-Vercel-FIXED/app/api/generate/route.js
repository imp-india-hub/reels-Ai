import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { topic } = await request.json();

    if (!topic?.trim()) {
      return Response.json({ error: "Please enter a topic." }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return Response.json(
        { error: "GEMINI_API_KEY is missing. Add it in Vercel Environment Variables." },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.8
      }
    });

    const prompt = `
You are a professional short-form social media video writer.

Create a compelling 7-scene vertical reel about:
"${topic.trim()}"

Return ONLY valid JSON in exactly this structure:
{
  "title": "short title",
  "hook": "short hook",
  "scenes": [
    {
      "scene": 1,
      "headline": "short headline",
      "visual_query": "2 to 5 simple English keywords for a free stock image search",
      "voiceover": "12 to 22 natural spoken words",
      "duration": 4
    }
  ]
}

Rules:
- Exactly 7 scenes.
- Scene 1 must stop the scroll with a strong hook.
- Scenes 2-6 explain useful information, steps, facts, or story progression.
- Scene 7 ends with a useful takeaway or natural CTA.
- Keep language simple and conversational.
- Avoid unsupported statistics unless they are broadly established.
- Every visual_query should describe an easy-to-find visual.
- Duration should normally be 4 seconds.
- Do not include markdown or commentary.
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const reel = JSON.parse(text);

    if (!Array.isArray(reel.scenes) || reel.scenes.length !== 7) {
      throw new Error("Gemini did not return exactly 7 scenes.");
    }

    reel.scenes = reel.scenes.map((s, i) => ({
      scene: i + 1,
      headline: String(s.headline || `Scene ${i + 1}`),
      visual_query: String(s.visual_query || topic),
      voiceover: String(s.voiceover || ""),
      duration: Math.max(3, Math.min(8, Number(s.duration) || 4))
    }));

    reel.narration = reel.scenes.map(s => s.voiceover).join(" ");

    return Response.json(reel);
  } catch (error) {
    console.error("Gemini generation error:", error);
    return Response.json(
      { error: "Reel generation failed. Check your Gemini API key and try again." },
      { status: 500 }
    );
  }
}