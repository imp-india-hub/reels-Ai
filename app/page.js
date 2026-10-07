"use client";
import { useState } from "react";

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export default function Home() {
  const [topic, setTopic] = useState("");
  const [reel, setReel] = useState(null);
  const [visuals, setVisuals] = useState([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [audio, setAudio] = useState(null);
  const [error, setError] = useState("");
  const [visualError, setVisualError] = useState("");

  async function generate() {
    setLoading(true); setError(""); setVisualError(""); setReel(null); setVisuals([]); setActive(0); setAudio(null);
    try {
      const r = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Gemini generation failed.");
      setReel(d);

      const initial = d.scenes.map(() => ({ url: null, source: "Generating visual…" }));
      setVisuals(initial);
      const v = await mapLimit(d.scenes, 2, async (s, i) => {
        try {
          const x = await fetch("/api/visual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: s.visual_prompt, query: s.visual_query }) });
          const result = await x.json();
          if (!result.url) setVisualError(prev => prev || result.error || "One or more visuals could not be generated.");
          return result;
        } catch (e) { return { url: null, source: "Visual unavailable", error: e?.message || String(e) }; }
      });
      setVisuals(v);
    } catch (e) { setError(e?.message || "Reel generation failed."); }
    finally { setLoading(false); }
  }

  const s = reel?.scenes?.[active];

  async function generateVoice() {
    if (!s?.voiceover) return;
    setVoiceLoading(true); setError("");
    try {
      const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: s.voiceover, voice: "Kore" }) });
      const d = await r.json();
      if (!r.ok || !d.audio) throw new Error(d?.error || "Voice generation failed.");
      setAudio(d.audio);
    } catch (e) { setError(e?.message || "Voice generation failed."); }
    finally { setVoiceLoading(false); }
  }

  async function retryVisual() {
    if (!s) return;
    const copy = [...visuals]; copy[active] = { url: null, source: "Generating visual…" }; setVisuals(copy); setVisualError("");
    try {
      const r = await fetch("/api/visual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: s.visual_prompt, query: s.visual_query }) });
      const d = await r.json(); copy[active] = d; setVisuals(copy);
      if (!d.url) setVisualError(d.error || "Visual generation failed.");
    } catch (e) { setVisualError(e?.message || "Visual generation failed."); }
  }

  return <main>
    <nav><b>⚡ ReelForge AI</b><span>Gemini + Cloudflare AI · 7 Scenes · 9:16</span></nav>
    <section className="hero">
      <div>
        <small>AI REEL STUDIO</small><h1>Turn any topic into a <i>ready-to-share reel.</i></h1>
        <p>Gemini writes the story. Cloudflare creates the visuals. Gemini TTS creates a natural Indian-English voice.</p>
        <div className="box"><label>YOUR TOPIC</label><textarea value={topic} onChange={e => setTopic(e.target.value)} placeholder="Example: How restaurants can use AI to get more customers"/><button disabled={loading || !topic.trim()} onClick={generate}>{loading ? "Creating your reel…" : "Generate 7 Scenes →"}</button></div>
        {error && <div className="error"><strong>Generation error</strong><div>{error}</div></div>}
        {visualError && <div className="error"><strong>Visual notice</strong><div>{visualError}</div></div>}
      </div>
      <div className="phone"><div className="screen">
        {s && visuals[active]?.url ? <img src={visuals[active].url} alt=""/> : s ? <div className="blank"><strong>🎨</strong><h3>{visuals[active]?.source || "Creating visual…"}</h3><button onClick={retryVisual}>Retry visual</button></div> : <div className="blank"><strong>▶</strong><h3>Your reel appears here</h3><p>Enter a topic to start.</p></div>}
        {s && <div className="copy"><small>SCENE {active + 1}/7</small><h2>{s.headline}</h2><p>{s.voiceover}</p></div>}
      </div><div className="controls"><button onClick={() => setActive(Math.max(0, active - 1))}>‹</button><button onClick={generateVoice} disabled={!s || voiceLoading}>🔊 {voiceLoading ? "…" : ""}</button><button onClick={() => setActive(Math.min(6, active + 1))}>›</button></div>{audio && <audio controls src={audio} style={{ width: "100%", marginTop: 10 }} />}</div>
    </section>
    {reel && <section className="story"><h2>{reel.title}</h2><div className="grid">{reel.scenes.map((x, i) => <article key={i} className={i === active ? "active" : ""} onClick={() => { setActive(i); setAudio(null); }}>
      {visuals[i]?.url ? <img src={visuals[i].url} alt=""/> : <div className="thumbBlank">Visual unavailable</div>}<b>{i + 1}. {x.headline}</b><p>{x.voiceover}</p><small>{visuals[i]?.source}</small>
    </article>)}</div></section>}
  </main>;
}
