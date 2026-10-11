export const runtime = "nodejs";

const CATALOG_URL = "https://openrouter.ai/api/v1/models?output_modalities=speech";
const PREFERRED_MODELS = [
  "microsoft/mai-voice-2.1",
  "microsoft/mai-voice-2",
  "microsoft/mai-voice-2.1-flash",
  "google/gemini-3.8-flash-tts",
  "google/gemini-3.8-flash-lite-tts",
  "hexgrad/kokoro-82m"
];

function getVoiceList(model) {
  const voices = model?.supported_voices;
  if (Array.isArray(voices)) return voices.filter(v => typeof v === "string");
  return [];
}

function isIndianEnglishVoice(voice) {
  return /en[-_]IN(?:[-_:]|$)|indian[-_ ]english/i.test(voice);
}

async function resolveIndianVoice(apiKey) {
  const configuredModel = process.env.OPENROUTER_TTS_MODEL?.trim();
  const configuredVoice = process.env.OPENROUTER_TTS_VOICE?.trim();

  // Explicit overrides are accepted only when the voice ID itself indicates
  // Indian English; never let an arbitrary voice silently violate the request.
  if (configuredModel && configuredVoice && !isIndianEnglishVoice(configuredVoice)) {
    throw new Error("OPENROUTER_TTS_VOICE must be an exact supported Indian-English voice ID containing en-IN. Check the OpenRouter speech-model catalog.");
  }

  const r = await fetch(CATALOG_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error(`Could not check OpenRouter's supported speech voices (${r.status}). Set OPENROUTER_TTS_MODEL and OPENROUTER_TTS_VOICE to a verified pair.`);

  const catalog = await r.json();
  const models = Array.isArray(catalog?.data) ? catalog.data : [];
  const preferred = [...models].sort((a, b) => {
    const ai = PREFERRED_MODELS.indexOf(a.id);
    const bi = PREFERRED_MODELS.indexOf(b.id);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });

  // Only select a voice whose catalog entry explicitly indicates an Indian
  // English locale. Never guess a voice ID or silently use an American accent.
  for (const model of preferred) {
    if (configuredModel && model.id !== configuredModel) continue;
    const voices = getVoiceList(model);
    const voice = configuredVoice
      ? voices.find(v => v === configuredVoice)
      : voices.find(isIndianEnglishVoice);
    if (voice && isIndianEnglishVoice(voice)) {
      return { model: model.id, voice, selectedBy: "verified-catalog" };
    }
  }

  throw new Error("OpenRouter's current speech-model catalog did not expose a verified Indian-English (en-IN) voice. No audio was generated with a different accent. Check https://openrouter.ai/api/v1/models?output_modalities=speech and set OPENROUTER_TTS_MODEL plus OPENROUTER_TTS_VOICE in Vercel to a model/voice pair that explicitly supports en-IN.");
}

export async function POST(request) {
  try {
    const { text } = await request.json();
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) return Response.json({ error: "OPENROUTER_API_KEY is missing in Vercel Environment Variables." }, { status: 500 });
    if (typeof text !== "string" || !text.trim()) return Response.json({ error: "Text is required." }, { status: 400 });
    if (text.length > 4000) return Response.json({ error: "Voiceover is too long. Keep it under 4,000 characters." }, { status: 400 });

    const { model, voice, selectedBy } = await resolveIndianVoice(apiKey);
    const response = await fetch("https://openrouter.ai/api/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://reelforge-ai.vercel.app",
        "X-OpenRouter-Title": "ReelForge AI"
      },
      body: JSON.stringify({
        model,
        input: text.trim(),
        voice,
        response_format: "mp3"
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(60000)
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenRouter TTS failed (${response.status}) for ${model}/${voice}: ${detail.slice(0, 700)}`);
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
      voice,
      model,
      accent: "Indian English (verified voice locale)",
      selectedBy,
      mimeType: contentType
    });
  } catch (e) {
    console.error("OPENROUTER TTS ERROR:", e);
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
