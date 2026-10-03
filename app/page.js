use client';

import { useEffect, useMemo, useRef, useState } from "react";

const DEMO = "5 simple ways small businesses can use AI in marketing";

export default function Home() {
  const [topic, setTopic] = useState("");
  const [reel, setReel] = useState(null);
  const [images, setImages] = useState([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const timer = useRef(null);

  const scene = reel?.scenes?.[active];

  async function generate() {
    setError("");
    setReel(null);
    setImages([]);
    setActive(0);

    if (!topic.trim()) {
      setError("Enter a subject or topic first.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed.");
      setReel(data);
      await loadImages(data.scenes);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadImages(scenes) {
    setImageLoading(true);
    const results = await Promise.all(
      scenes.map(async (s) => {
        try {
          const r = await fetch(`/api/images?q=${encodeURIComponent(s.visual_query)}`);
          return await r.json();
        } catch {
          return { image: null };
        }
      })
    );
    setImages(results);
    setImageLoading(false);
  }

  useEffect(() => {
    if (!playing || !reel) return;
    timer.current = setInterval(() => {
      setActive((current) => {
        if (current >= reel.scenes.length - 1) {
          clearInterval(timer.current);
          setPlaying(false);
          return 0;
        }
        return current + 1;
      });
    }, (scene?.duration || 4) * 1000);

    return () => clearInterval(timer.current);
  }, [playing, reel, scene?.duration]);

  function speak() {
    if (!scene?.voiceover || typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(scene.voiceover);
    u.rate = 0.95;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  }

  function updateScene(field, value) {
    setReel((old) => ({
      ...old,
      scenes: old.scenes.map((s, i) =>
        i === active ? { ...s, [field]: value } : s
      )
    }));
  }

  async function exportReel() {
    if (!reel || !images.length) return;
    setExporting(true);
    setError("");

    try {
      const W = 540;
      const H = 960;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");

      const loaded = await Promise.all(
        images.map(async (item) => {
          if (!item?.image) return null;
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = item.image;
          try {
            await img.decode();
            return img;
          } catch {
            return null;
          }
        })
      );

      const stream = canvas.captureStream(30);
      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });

      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

      const finished = new Promise((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
      });

      recorder.start();

      for (let i = 0; i < reel.scenes.length; i++) {
        const s = reel.scenes[i];
        const img = loaded[i];

        const end = performance.now() + s.duration * 1000;
        while (performance.now() < end) {
          drawScene(ctx, W, H, img, s, i);
          await new Promise(requestAnimationFrame);
        }
      }

      recorder.stop();
      const blob = await finished;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "reelforge-ai-reel.webm";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(
        "Export failed. Some free image sources block browser video capture. Try another topic/image set or use Share."
      );
    } finally {
      setExporting(false);
    }
  }

  async function shareReel() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: reel?.title || "ReelForge AI Reel",
          text: `Created with ReelForge AI: ${reel?.title || topic}`
        });
      } catch {}
    } else {
      await navigator.clipboard?.writeText(window.location.href);
      alert("Link copied.");
    }
  }

  const progress = useMemo(
    () => (reel ? ((active + 1) / reel.scenes.length) * 100 : 0),
    [active, reel]
  );

  return (
    <main>
      <nav className="nav">
        <div className="brand"><span>RF</span> ReelForge <b>AI</b></div>
        <div className="navpill">7 scenes · 9:16 · AI powered</div>
      </nav>

      <section className="hero">
        <div className="heroCopy">
          <div className="eyebrow">AI REEL STUDIO</div>
          <h1>Turn any subject into a <em>ready-to-share reel.</em></h1>
          <p>
            Give ReelForge a topic. Gemini writes seven scenes, free visuals are
            found automatically, and browser narration brings the story to life.
          </p>

          <div className="composer">
            <label>What should your reel be about?</label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Example: Why every local restaurant should use AI..."
              rows={4}
            />
            <div className="composerBottom">
              <button className="demo" onClick={() => setTopic(DEMO)}>
                Try demo topic
              </button>
              <button className="generate" onClick={generate} disabled={loading}>
                {loading ? "Creating…" : "Generate 7 scenes →"}
              </button>
            </div>
          </div>

          {error && <div className="error">{error}</div>}

          <div className="steps">
            <span>01 <b>Topic</b></span>
            <i>→</i>
            <span>02 <b>AI Story</b></span>
            <i>→</i>
            <span>03 <b>Visuals</b></span>
            <i>→</i>
            <span>04 <b>Reel</b></span>
          </div>
        </div>

        <div className="studio">
          <div className="phone">
            <div className="phoneTop"><span>ReelForge AI</span><span>9:16</span></div>
            <div className="screen">
              {scene ? (
                <>
                  {images[active]?.image ? (
                    <img className="sceneImage" src={images[active].image} alt="" />
                  ) : (
                    <div className="imageFallback">{imageLoading ? "Finding visual…" : "Visual unavailable"}</div>
                  )}
                  <div className="shade" />
                  <div className="sceneText">
                    <small>SCENE {active + 1} / 7</small>
                    <h2>{scene.headline}</h2>
                    <p>{scene.voiceover}</p>
                  </div>
                </>
              ) : (
                <div className="emptyPhone">
                  <div className="playOrb">▶</div>
                  <h3>Your reel appears here</h3>
                  <p>Enter a topic and let AI build the story.</p>
                </div>
              )}
            </div>
            <div className="phoneControls">
              <div className="progress"><span style={{ width: `${progress}%` }} /></div>
              <div className="controlRow">
                <button onClick={() => setActive(Math.max(0, active - 1))}>‹</button>
                <button className="play" onClick={() => {
                  setPlaying((v) => !v);
                  if (!playing) speak();
                }}>{playing ? "Ⅱ" : "▶"}</button>
                <button onClick={() => { setActive(Math.min((reel?.scenes?.length || 1) - 1, active + 1)); }}>›</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {reel && (
        <section className="workspace">
          <div className="workspaceHead">
            <div>
              <div className="eyebrow">YOUR STORYBOARD</div>
              <h2>{reel.title}</h2>
            </div>
            <div className="actions">
              <button className="secondary" onClick={speak}>🔊 Voice preview</button>
              <button className="secondary" onClick={shareReel}>↗ Share</button>
              <button className="primary" onClick={exportReel} disabled={exporting}>
                {exporting ? "Rendering…" : "↓ Download reel"}
              </button>
            </div>
          </div>

          <div className="sceneGrid">
            {reel.scenes.map((s, i) => (
              <article
                key={i}
                className={`sceneCard ${i === active ? "active" : ""}`}
                onClick={() => setActive(i)}
              >
                <div className="thumb">
                  {images[i]?.image ? <img src={images[i].image} alt="" /> : <span>{i + 1}</span>}
                  <b>{i + 1}</b>
                </div>
                <div className="cardBody">
                  <input
                    value={s.headline}
                    onChange={(e) => updateScene("headline", e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <textarea
                    value={s.voiceover}
                    onChange={(e) => updateScene("voiceover", e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    rows={3}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function drawScene(ctx, W, H, img, scene, index) {
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, W, H);

  if (img) {
    const scale = Math.max(W / img.width, H / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  }

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(0,0,0,.05)");
  g.addColorStop(.55, "rgba(0,0,0,.18)");
  g.addColorStop(1, "rgba(0,0,0,.9)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#fff";
  ctx.font = "700 20px Arial";
  ctx.fillText(`SCENE ${index + 1} / 7`, 38, 60);

  ctx.font = "800 46px Arial";
  wrapText(ctx, scene.headline, 38, H - 260, W - 76, 54);

  ctx.font = "400 25px Arial";
  wrapText(ctx, scene.voiceover, 38, H - 120, W - 76, 34);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(" ");
  let line = "";
  const lines = [];
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  lines.slice(0, 5).forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}