'use client';

import { useState } from "react";

export default function Home() {
  const [topic, setTopic] = useState("");
  const [reel, setReel] = useState(null);
  const [visuals, setVisuals] = useState([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    setReel(null);
    setVisuals([]);
    setActive(0);

    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic })
      });
      const d = await r.json();

      if (!r.ok) throw new Error(d.error || "Reel generation failed.");

      setReel(d);

      const v = await Promise.all(
        d.scenes.map(async s => {
          try {
            const x = await fetch("/api/visual", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: s.visual_prompt,
                query: s.visual_query
              })
            });
            return await x.json();
          } catch {
            return { url: null, source: "Visual unavailable" };
          }
        })
      );

      setVisuals(v);
    } catch (e) {
      setError(e.message || "Reel generation failed.");
    } finally {
      setLoading(false);
    }
  }

  const s = reel?.scenes?.[active];

  return (
    <main>
      <nav><b>⚡ ReelForge AI</b><span>7 Scenes · 9:16</span></nav>

      <section className="hero">
        <div>
          <small>AI REEL STUDIO</small>
          <h1>Turn any topic into a <i>ready-to-share reel.</i></h1>
          <p>Gemini writes the story. AI creates visuals, with free-stock fallback if needed.</p>

          <div className="box">
            <label>YOUR TOPIC</label>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="Example: How restaurants can use AI to get more customers"
            />
            <button disabled={loading || !topic.trim()} onClick={generate}>
              {loading ? "Creating your reel…" : "Generate 7 Scenes →"}
            </button>
          </div>

          {error && <div className="error">{error}</div>}
        </div>

        <div className="phone">
          <div className="screen">
            {s && visuals[active]?.url ? (
              <img src={visuals[active].url} alt="" />
            ) : s ? (
              <div className="blank">Creating visual…</div>
            ) : (
              <div className="blank">
                <strong>▶</strong>
                <h3>Your reel appears here</h3>
                <p>Enter a topic to start.</p>
              </div>
            )}

            {s && (
              <div className="copy">
                <small>SCENE {active + 1}/7</small>
                <h2>{s.headline}</h2>
                <p>{s.voiceover}</p>
              </div>
            )}
          </div>

          <div className="controls">
            <button onClick={() => setActive(Math.max(0, active - 1))}>‹</button>
            <button onClick={() => {
              if (s?.voiceover && "speechSynthesis" in window) {
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(new SpeechSynthesisUtterance(s.voiceover));
              }
            }}>🔊</button>
            <button onClick={() => setActive(Math.min(6, active + 1))}>›</button>
          </div>
        </div>
      </section>

      {reel && (
        <section className="story">
          <h2>{reel.title}</h2>
          <div className="grid">
            {reel.scenes.map((x, i) => (
              <article
                className={i === active ? "active" : ""}
                onClick={() => setActive(i)}
                key={i}
              >
                {visuals[i]?.url && <img src={visuals[i].url} alt="" />}
                <b>{i + 1}. {x.headline}</b>
                <p>{x.voiceover}</p>
                <small>{visuals[i]?.source}</small>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}