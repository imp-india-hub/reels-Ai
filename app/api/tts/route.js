export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { text, voice = "Kore" } = await request.json();
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return Response.json({ error: "GEMINI_API_KEY is missing." }, { status: 500 });
    if (!text?.trim()) return Response.json({ error: "Text is required." }, { status: 400 });

    const payload = {
      model: "gemini-3.8-flash-lite-tts",
      input: [{
        type: "user_input",
        content: [{
          type: "text",
          text: text.trim(),
          annotations: [{
            type: "speech_metadata",
            style: "Natural Indian English accent from India, warm confident social-media narrator, clear pronunciation, conversational pace, energetic but not exaggerated, professional and friendly. Use authentic Indian English intonation."
          }]
        }]
      }],
      response_format: { type: "audio", mime_type: "audio/wav", sample_rate: 24000 },
      generation_config: { speech_config: [{ voice }] }
    };

    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    const raw = await r.text();
    if (!r.ok) throw new Error(`Gemini TTS ${r.status}: ${raw.slice(0, 900)}`);
    const d = JSON.parse(raw);
    const audio = d?.output_audio?.data || d?.outputAudio?.data;
    if (!audio) throw new Error(`Gemini TTS returned no audio: ${raw.slice(0, 1200)}`);

    return Response.json({ audio: `data:audio/wav;base64,${audio}`, voice, model: "gemini-3.8-flash-lite-tts" });
  } catch (e) {
    console.error("TTS ERROR:", e);
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
