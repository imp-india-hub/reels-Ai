export const runtime = "nodejs";

const DEFAULT_TTS_MODEL = "fish-audio/s2.1-pro-free";

function getTtsModel() {
  // OpenRouter lists Fish Audio S2.1 Pro Free under this model ID. Accept the
  // user's optional :free suffix in Vercel and normalize it to the catalog ID.
  const configured = process.env.OPENROUTER_TTS_MODEL?.trim() || DEFAULT_TTS_MODEL;
  if (configured === "fish-audio/s2.1-pro-free:free") return "fish-audio/s2.1-pro-free";
  return configured;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const text = body?.text;
    const language = ["en", "hi", "bilingual"].includes(body?.language) ? body.language : "en";
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) return Response.json({ error: "OPENROUTER_API_KEY is missing in Vercel Environment Variables." }, { status: 500 });
    if (typeof text !== "string" || !text.trim()) return Response.json({ error: "Text is required." }, { status: 400 });
    if (text.length > 4000) return Response.json({ error: "Voiceover is too long. Keep it under 4,000 characters." }, { status: 400 });

    const model = getTtsModel();
    const configuredVoice = process.env.OPENROUTER_TTS_VOICE?.trim();
    const payload = {
      model,
      input: text.trim(),
      response_format: "mp3"
    };
    // Fish Audio supports multilingual expressive synthesis. Do not force an
    // invented/default voice ID; only pass a voice when the deployer configured one.
    if (configuredVoice) payload.voice = configuredVoice;

    const response = await fetch("https://openrouter.ai/api/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://reelforge-ai.vercel.app",
        "X-OpenRouter-Title": "ReelForge AI"
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(60000)
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenRouter TTS failed (${response.status}) for ${model}: ${detail.slice(0, 700)}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("audio/")) {
      const detail = await response.text();
      throw new Error(`OpenRouter TTS returned a non-audio response (${contentType || "unknown content type"}): ${detail.slice(0, 400)}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 100) throw new Error("OpenRouter TTS returned an empty or incomplete audio file.");

    return Response.json({
      audio: `data:${contentType};base64,${bytes.toString("base64")}`,
      voice: configuredVoice || "model default",
      model,
      language,
      selectedBy: configuredVoice ? "configured voice" : "Fish Audio model default",
      mimeType: contentType
    });
  } catch (e) {
    console.error("OPENROUTER TTS ERROR:", e);
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
