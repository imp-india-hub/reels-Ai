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
    const prompt = `Write a short, emotionally connected STORY for a vertical social-media reel about "${clean}". Create exactly 7 consecutive story beats, but NEVER write or speak labels such as "Scene 1", "Scene 2", numbers, chapter names, or transition announcements.
Think like a storyteller, not a presenter giving a speech or a list of tips. Use one relatable person, moment, problem, desire, or situation as the emotional thread whenever the topic allows. Begin with a vivid moment or feeling that makes viewers curious. Each next beat must grow naturally from the previous beat: show what happened next, what changed, what the person felt or discovered, and why it matters. Include a small obstacle or tension, a believable turning point, and a satisfying emotional payoff. Make the SEVENTH and final beat a clear, compelling call to action (CTA) that grows naturally from the story: tell the viewer exactly ONE next step to take now (for example comment with an answer, save this for later, share it with someone who needs it, try the solution, or visit/contact the brand if the topic clearly supports that). Make the benefit or emotional reason to act clear. Keep it short, specific to this topic, warm and memorable; avoid vague endings like “what do you think?”, “follow for more”, “learn more”, or “take the first step” unless made concrete. Do not invent URLs, phone numbers, discounts, guarantees, or brand claims. For Hindi/bilingual reels, write the CTA naturally in the selected language style. The seventh headline should be a natural CTA phrase, never a scene label. The final voiceover must finish with the actual spoken CTA, not just a moral or summary. Avoid generic introductions like "Today we will talk about", "First", "Secondly", "In conclusion", and avoid repeating the topic as a lecture.
${languageInstruction}
Every headline and voiceover must sound like the next line in the SAME story. Voiceover is conversational and emotionally warm, 12-18 words per beat. Keep visual_prompt concise (10-18 words), visual_query 2-5 keywords, and headline 2-6 words. Do not include explanations outside the JSON. Keep transitions implicit through cause-and-effect, not labels. Headline is a short, cinematic phrase, not a scene label.
Each visual_prompt describes the matching moment in the story, keeping the same people/setting visually consistent across beats where appropriate. Visuals must be realistic/cinematic, vertical, and contain absolutely NO text of any kind: no words, letters, captions, subtitles, labels, scene numbers, digits, typography, logos, watermarks, UI, or signage. Depict only the visual moment. Never put “Scene 1”, “Scene 2”, or any numbering inside an image.
visual_query is 2-5 simple English keywords. Duration is normally 4 seconds.
Return only a JSON object matching the requested schema.`;

    // Prefer explicit free models with structured-output support before the
    // random free router. The router can select a reasoning-heavy model that
    // spends its output budget thinking and returns no final JSON.
    const configuredModel = process.env.OPENROUTER_TEXT_MODEL?.trim() || "inclusionai/ling-3.1-flash";
    const models = [...new Set([
      configuredModel,
      "google/gemma-4-31b-it:free",
      "qwen/qwen3.8-27b:free",
      "openrouter/free"
    ])];
    let reel = null;
    let lastError = null;

    for (const model of models) {
      let response;
      let data;
      try {
        response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
              { role: "system", content: "You create concise, useful, engaging short-form video scripts. Return valid JSON only, with title, hook, and exactly seven scenes. Each scene needs scene (integer), headline, visual_prompt, visual_query, voiceover, and duration (number)." },
              { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.4,
            max_tokens: 5000
          }),
          cache: "no-store"
        });
        data = await response.json().catch(() => ({}));
      } catch (networkError) {
        lastError = new Error(`Could not connect to OpenRouter using ${model}: ${networkError?.message || networkError}`);
        continue;
      }

      if (!response.ok) {
        const msg = data?.error?.message || data?.message || `HTTP ${response.status}`;
        lastError = new Error(`OpenRouter request failed for ${model} (${response.status}): ${msg}`);
        lastError.status = response.status;
        // Invalid credentials and account billing errors are account-wide.
        // Model access, provider, and rate-limit errors may be recoverable via
        // OpenRouter's free-only router, so continue to the next candidate.
        if ([401, 402].includes(response.status)) throw lastError;
        continue;
      }

      const outputText = data?.choices?.[0]?.message?.content;
      if (typeof outputText !== "string" || !outputText.trim()) {
        const finishReason = data?.choices?.[0]?.finish_reason || "unknown";
        lastError = new Error(`OpenRouter model ${model} returned no script text. Finish reason: ${finishReason}. The model may have exhausted its output-token budget before returning the JSON.`);
        continue;
      }

      try {
        const parsed = JSON.parse(outputText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
        if (!Array.isArray(parsed.scenes) || parsed.scenes.length !== 7) {
          lastError = new Error(`Model ${model} returned ${parsed?.scenes?.length || 0} scenes instead of 7.`);
          continue;
        }
        reel = parsed;
        break;
      } catch {
        lastError = new Error(`OpenRouter model ${model} returned invalid JSON. Try another model or retry.`);
      }
    }

    if (!reel) throw (lastError || new Error("OpenRouter script generation failed on all configured fallback models."));

    reel.title = String(reel.title || clean);
    reel.hook = String(reel.hook || reel.scenes[0]?.voiceover || "");
    reel.scenes = reel.scenes.map((s, i) => ({
      scene: i + 1,
      headline: String(s?.headline || "A moment unfolds").replace(/^\s*(scene|chapter|part)\s*\d+\s*[:.-]?\s*/i, ""),
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
    } else if (e?.status === 402 || lower.includes("insufficient credits") || lower.includes("payment required")) {
      error = "Your OpenRouter account needs credits or billing setup before it can generate scripts.";
    } else if (e?.status === 403 || lower.includes("permission") || lower.includes("forbidden")) {
      error = "OpenRouter denied access to both the selected model and the free-model fallback. Check your API key permissions and model access.";
    } else if (e?.status === 429 || lower.includes("quota") || lower.includes("resource exhausted") || lower.includes("rate limit")) {
      error = "OpenRouter free-model rate limits may have been reached. Wait and retry, or check OpenRouter activity.";
    } else if (e?.status === 404 || lower.includes("not found") || lower.includes("model")) {
      error = "OpenRouter could not generate a script with the configured model or explicit free fallbacks. The app tries Gemma 4, Qwen 3.8, and then the free-model router. Check the detail below.";
    } else if (lower.includes("invalid json")) {
      error = "OpenRouter responded, but the reel JSON was invalid. Please try again.";
    }

    return Response.json({ error, detail: message }, { status: 500 });
  }
}
