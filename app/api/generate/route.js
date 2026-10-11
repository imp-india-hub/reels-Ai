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
    const language = ["en", "hi", "bilingual"].includes(body?.language) ? body.language : "en";

    if (!clean) {
      return Response.json({ error: "Please enter a topic first." }, { status: 400 });
    }

    const key = process.env.OPENROUTER_API_KEY?.trim();
    if (!key) {
      return Response.json({ error: "OPENROUTER_API_KEY is missing in Vercel Environment Variables." }, { status: 500 });
    }

    const languageInstruction = language === "hi" ? "Write every headline and voiceover in natural, conversational Hindi (Devanagari script)." : language === "bilingual" ? "Write every headline and voiceover in natural Hindi-English bilingual style, mixing Hindi and commonly used English naturally. Use Devanagari for Hindi words and Latin script for English words." : "Write every headline and voiceover in clear, natural Indian English.";
    const prompt = `Create an engaging 7-scene vertical social media reel about "${clean}".
Exactly 7 scenes. Scene 1 is a strong hook. Scenes 2-6 provide useful information. Scene 7 is a takeaway or CTA.
${languageInstruction}
Each voiceover is natural spoken language, 12-22 words.
Each visual_prompt is realistic/cinematic, vertical, and must contain no text, logos or watermarks.
visual_query is 2-5 simple English keywords. Duration is normally 4 seconds.
Return only a JSON object matching the requested schema.`;

    const model = process.env.OPENROUTER_TEXT_MODEL?.trim() || "google/gemini-2.5-flash";
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://reelforge-ai.vercel.app",
        "X-OpenRouter-Title": "ReelForge AI"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You create concise, useful, engaging short-form video scripts. Return valid JSON only." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_schema", json_schema: { name: "reel_script", strict: true, schema } },
        temperature: 0.7,
        max_tokens: 3000
      }),
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data?.error?.message || data?.message || `HTTP ${response.status}`;
      const err = new Error(`OpenRouter script generation failed (${response.status}): ${msg}`);
      err.status = response.status;
      throw err;
    }
    const outputText = data?.choices?.[0]?.message?.content;
    if (typeof outputText !== "string" || !outputText.trim()) {
      throw new Error(`OpenRouter returned no script text. Finish reason: ${data?.choices?.[0]?.finish_reason || "unknown"}`);
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
    console.error("REELFORGE OPENROUTER SCRIPT ERROR:", e);

    const message = String(e?.message || e);
    const lower = message.toLowerCase();
    let error = "OpenRouter script generation failed. Please try again.";

    if (e?.status === 401 || lower.includes("api key") || lower.includes("unauthorized")) {
      error = "OpenRouter API key was rejected. Check OPENROUTER_API_KEY in Vercel.";
    } else if (e?.status === 403 || lower.includes("permission") || lower.includes("forbidden")) {
      error = "OpenRouter access was denied. Check your API key and account credits.";
    } else if (e?.status === 429 || lower.includes("quota") || lower.includes("resource exhausted") || lower.includes("rate limit")) {
      error = "OpenRouter rate limit or credits reached. Check your OpenRouter activity and credits.";
    } else if (e?.status === 404 || lower.includes("not found") || lower.includes("model")) {
      error = "The configured OpenRouter model is unavailable. Check OPENROUTER_TEXT_MODEL.";
    } else if (lower.includes("invalid json")) {
      error = "OpenRouter responded, but the reel JSON was invalid. Please try again.";
    }

    return Response.json({ error, detail: message }, { status: 500 });
  }
}
