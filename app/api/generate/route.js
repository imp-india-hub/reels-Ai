export const runtime = "nodejs";

const schema = {
  type: "object",
  properties: {
    title: { type: "string" },
    hook: { type: "string" },
    scenes: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        properties: {
          scene: { type: "integer" },
          headline: { type: "string" },
          visual_prompt: { type: "string" },
          visual_query: { type: "string" },
          voiceover: { type: "string" },
          duration: { type: "number" }
        },
        required: ["scene", "headline", "visual_prompt", "visual_query", "voiceover", "duration"]
      }
    }
  },
  required: ["title", "hook", "scenes"]
};

function collectText(value, out = []) {
  if (!value) return out;
  if (typeof value === "string") {
    if (value.trim()) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, out);
    return out;
  }
  if (typeof value === "object") {
    // Prefer actual model-output text/content fields. Avoid IDs, metadata and
    // other string fields that are not generated text.
    for (const key of ["text", "output_text", "content", "parts", "model_output", "output"]) {
      if (key in value) collectText(value[key], out);
    }
  }
  return out;
}

function extractOutputText(data) {
  // Interactions API normally exposes output_text, but depending on API
  // response shape the generated text can be nested in output/steps.
  const candidates = [
    data?.output_text,
    data?.output,
    data?.steps,
    data?.response?.output_text,
    data?.response?.output,
    data?.interaction?.output_text,
    data?.interaction?.output,
    data?.interaction?.steps
  ];

  for (const candidate of candidates) {
    const texts = collectText(candidate, []);
    if (texts.length) {
      // The first complete JSON-looking string is preferable when structured
      // output is requested.
      const jsonText = texts.find(t => {
        const x = t.trim();
        return x.startsWith("{") && x.endsWith("}");
      });
      return (jsonText || texts.join("\n")).trim();
    }
  }
  return "";
}

export async function POST(request) {
  try {
    const body = await request.json();
    const clean = body?.topic?.trim();

    if (!clean) {
      return Response.json({ error: "Please enter a topic first." }, { status: 400 });
    }

    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) {
      return Response.json(
        { error: "GEMINI_API_KEY is missing in Vercel Environment Variables." },
        { status: 500 }
      );
    }

    const prompt = `Create an engaging 7-scene vertical social media reel about "${clean}".
Exactly 7 scenes. Scene 1 is a strong hook. Scenes 2-6 provide useful information. Scene 7 is a takeaway or CTA.
Each voiceover is natural spoken language, 12-22 words.
Each visual_prompt is realistic/cinematic, vertical, and must contain no text, logos or watermarks.
visual_query is 2-5 simple English keywords.
Duration is normally 4 seconds.
Return only the requested JSON object.`;

    // Use Gemini's REST Interactions endpoint directly. This avoids SDK-version
    // differences and follows Google's current documented API contract.
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gemini-3.5-flash-lite",
        input: prompt,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema
        },
        generation_config: {
          max_output_tokens: 3000,
          thinking_level: "low"
        }
      }),
      cache: "no-store"
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const apiMessage = data?.error?.message || data?.message || `HTTP ${response.status}`;
      const error = new Error(apiMessage);
      error.status = response.status;
      error.api = data;
      throw error;
    }

    if (data?.status === "failed") {
      throw new Error(data?.error?.message || "Gemini interaction failed.");
    }

    const outputText = extractOutputText(data);
    if (!outputText) {
      const shape = {
        status: data?.status,
        hasOutputText: typeof data?.output_text === "string",
        outputType: Array.isArray(data?.output) ? "array" : typeof data?.output,
        stepCount: Array.isArray(data?.steps) ? data.steps.length : 0,
        keys: Object.keys(data || {}).slice(0, 20)
      };
      console.error("REELFORGE GEMINI EMPTY OUTPUT SHAPE:", JSON.stringify(shape));
      throw new Error(`Gemini completed but returned no model text. Response shape: ${JSON.stringify(shape)}`);
    }

    let reel;
    try {
      reel = JSON.parse(outputText);
    } catch {
      throw new Error("Gemini returned invalid JSON. Please try the topic again.");
    }

    if (!Array.isArray(reel.scenes) || reel.scenes.length !== 7) {
      throw new Error(`Gemini returned ${reel?.scenes?.length || 0} scenes instead of 7.`);
    }

    reel.title = String(reel.title || clean);
    reel.hook = String(reel.hook || reel.scenes[0]?.voiceover || "");
    reel.scenes = reel.scenes.map((s, i) => ({
      scene: i + 1,
      headline: String(s?.headline || `Scene ${i + 1}`),
      visual_prompt: String(s?.visual_prompt || clean),
      visual_query: String(s?.visual_query || clean),
      voiceover: String(s?.voiceover || ""),
      duration: Number(s?.duration) || 4
    }));
    reel.narration = reel.scenes.map((s) => s.voiceover).join(" ");

    return Response.json(reel);
  } catch (e) {
    console.error("REELFORGE GEMINI ERROR:", e);

    const message = String(e?.message || e);
    const lower = message.toLowerCase();
    let error = "Gemini generation failed. Please try again.";

    if (e?.status === 401 || lower.includes("api key") || lower.includes("unauthorized")) {
      error = "Gemini API key was rejected. Check GEMINI_API_KEY in Vercel.";
    } else if (e?.status === 403 || lower.includes("permission") || lower.includes("forbidden")) {
      error = "Gemini API access was denied. Check that the API key has Gemini API access enabled.";
    } else if (e?.status === 429 || lower.includes("quota") || lower.includes("resource exhausted") || lower.includes("rate limit")) {
      error = "Gemini quota/rate limit reached. Check Google AI Studio usage and billing/quota.";
    } else if (e?.status === 404 || lower.includes("not found") || lower.includes("model")) {
      error = "Gemini 3.5 Flash-Lite is unavailable for this API key/project.";
    } else if (lower.includes("invalid json")) {
      error = "Gemini responded, but the reel JSON was invalid. Please try again.";
    }

    return Response.json({ error, detail: message }, { status: 500 });
  }
}
