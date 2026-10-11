"use client";
import { useRef, useState } from "react";

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
  const [stockResults, setStockResults] = useState([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [logoData, setLogoData] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const logoInputRef = useRef(null);

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
      const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: s.voiceover }) });
      const d = await r.json();
      if (!r.ok || !d.audio) throw new Error(d?.error || "Voice generation failed.");
      setAudio(d.audio);
    } catch (e) { setError(e?.message || "Voice generation failed."); }
    finally { setVoiceLoading(false); }
  }

  async function searchStock() {
    if (!s) return;
    setStockLoading(true); setStockResults([]); setVisualError("");
    try {
      const r = await fetch("/api/stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: s.visual_query || s.headline || topic }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Stock search failed.");
      setStockResults(d.results || []);
      if (!(d.results || []).length) setVisualError("No Pixabay results found. Check your API key or try AI visual generation.");
    } catch (e) { setVisualError(e?.message || "Stock search failed."); }
    finally { setStockLoading(false); }
  }

  function chooseStock(item) {
    const copy = [...visuals];
    copy[active] = { url: item.url, source: `Pixabay ${item.kind}`, kind: item.kind, pageURL: item.pageURL };
    setVisuals(copy); setStockResults([]); setVisualError("");
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


  function uploadLogo(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please upload a PNG, JPG, or WebP logo image."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Logo must be 5 MB or smaller."); return; }
    const reader = new FileReader();
    reader.onload = () => { setLogoData(String(reader.result || "")); setError(""); };
    reader.onerror = () => setError("Could not read that logo file.");
    reader.readAsDataURL(file);
  }

  async function downloadCompleteReel() {
    if (!reel?.scenes?.length) return;
    setExporting(true); setExportStatus("Preparing scenes…"); setError("");
    let stream = null, recorder = null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 720; canvas.height = 1280;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Your browser does not support canvas video export.");
      const canvasStream = canvas.captureStream(30);
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" :
        (MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8" : "video/webm");
      const chunks = [];
      recorder = new MediaRecorder(canvasStream, { mimeType: mime });
      const finished = new Promise((resolve, reject) => {
        recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.onerror = () => reject(new Error("Video recording failed in this browser."));
        recorder.onstop = resolve;
      });
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const loadImage = src => new Promise((resolve, reject) => {
        const img = new Image(); img.crossOrigin = "anonymous";
        img.onload = () => resolve(img); img.onerror = () => reject(new Error("A scene visual could not be loaded for export."));
        img.src = src;
      });
      const drawCover = img => {
        const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      };
      const logo = logoData ? await loadImage(logoData) : null;
      const scenes = reel.scenes;
      recorder.start(250);
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        setExportStatus(`Preparing voice ${i + 1} of ${scenes.length}…`);
        const voiceRes = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: scene.voiceover }) });
        const voiceData = await voiceRes.json();
        if (!voiceRes.ok || !voiceData.audio) throw new Error(voiceData?.error || `Voice generation failed for scene ${i + 1}.`);
        const audio = new Audio(voiceData.audio);
        audio.crossOrigin = "anonymous";
        await new Promise((resolve, reject) => {
          audio.oncanplaythrough = resolve; audio.onerror = () => reject(new Error(`Could not load voice audio for scene ${i + 1}.`)); audio.load();
        });
        let img = null;
        if (visuals[i]?.url) {
          try { img = await loadImage(visuals[i].url); } catch {}
        }
        if (!img) {
          ctx.fillStyle = "#111827"; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#ffffff"; ctx.font = "bold 40px sans-serif"; ctx.fillText(scene.headline || `Scene ${i + 1}`, 48, 180, 620);
          ctx.font = "28px sans-serif"; ctx.fillText("Visual unavailable", 48, 240);
        }
        const duration = Math.max(3, Number(audio.duration) || 5);
        setExportStatus(`Recording scene ${i + 1} of ${scenes.length}…`);
        let start = performance.now();
        audio.currentTime = 0;
        const draw = () => {
          if (img) drawCover(img);
          else { ctx.fillStyle = "#111827"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
          const bandH = 300;
          const grad = ctx.createLinearGradient(0, canvas.height - bandH, 0, canvas.height);
          grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(0.25, "rgba(0,0,0,0.62)"); grad.addColorStop(1, "rgba(0,0,0,0.88)");
          ctx.fillStyle = grad; ctx.fillRect(0, canvas.height - bandH, canvas.width, bandH);
          if (logo) {
            const maxW = 130, maxH = 80, sc = Math.min(maxW / logo.width, maxH / logo.height, 1);
            ctx.drawImage(logo, canvas.width - logo.width * sc - 28, 28, logo.width * sc, logo.height * sc);
          }
          ctx.fillStyle = "#93c5fd"; ctx.font = "bold 24px sans-serif"; ctx.fillText(`SCENE ${i + 1} / ${scenes.length}`, 42, canvas.height - 220);
          ctx.fillStyle = "#ffffff"; ctx.font = "bold 42px sans-serif";
          const headline = String(scene.headline || "").slice(0, 90); ctx.fillText(headline, 42, canvas.height - 168, 630);
          ctx.font = "30px sans-serif";
          const words = String(scene.voiceover || "").split(/\s+/); let line = "", y = canvas.height - 112;
          for (const word of words) { const test = line ? `${line} ${word}` : word; if (ctx.measureText(test).width > 630) { ctx.fillText(line, 42, y); y += 38; line = word; if (y > canvas.height - 35) break; } else line = test; }
          if (line && y <= canvas.height - 35) ctx.fillText(line, 42, y);
        };
        draw();
        const tick = setInterval(draw, 1000 / 30);
        try { await audio.play(); } catch { clearInterval(tick); throw new Error("Browser blocked audio playback. Click export again and allow playback."); }
        await new Promise(resolve => {
          audio.onended = resolve;
          setTimeout(resolve, (duration + 0.5) * 1000);
        });
        clearInterval(tick); audio.pause();
        await wait(150);
      }
      recorder.stop();
      await finished;
      stream = canvasStream;
      const blob = new Blob(chunks, { type: "video/webm" });
      if (!blob.size) throw new Error("The exported video was empty. Please try another browser.");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${(reel.title || "reelforge-reel").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "reelforge-reel"}.webm`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      setExportStatus("Export complete. Your reel was downloaded as a WebM video.");
    } catch (e) {
      try { if (recorder && recorder.state !== "inactive") recorder.stop(); } catch {}
      setError(e?.message || "Could not export the reel.");
      setExportStatus("");
    } finally {
      setExporting(false);
    }
  }

  return <main>
    <nav><b>⚡ ReelForge AI</b><span>OpenRouter + Cloudflare AI · 7 Scenes · 9:16</span></nav>
    <section className="hero">
      <div>
        <small>AI REEL STUDIO</small><h1>Turn any topic into a <i>ready-to-share reel.</i></h1>
        <p>OpenRouter writes the story and creates the voice. Search real Pixabay footage or create custom visuals with Cloudflare AI.</p>
        <div className="box"><label>YOUR TOPIC</label><textarea value={topic} onChange={e => setTopic(e.target.value)} placeholder="Example: How restaurants can use AI to get more customers"/><button disabled={loading || !topic.trim()} onClick={generate}>{loading ? "Creating your reel…" : "Generate 7 Scenes →"}</button></div>
        {error && <div className="error"><strong>Generation error</strong><div>{error}</div></div>}
        {visualError && <div className="error"><strong>Visual notice</strong><div>{visualError}</div></div>}
      </div>
      <div className="phone"><div className="screen">
        {s && visuals[active]?.url ? <img src={visuals[active].url} alt=""/> : s ? <div className="blank"><strong>🎨</strong><h3>{visuals[active]?.source || "Creating visual…"}</h3><button onClick={retryVisual}>Retry visual</button></div> : <div className="blank"><strong>▶</strong><h3>Your reel appears here</h3><p>Enter a topic to start.</p></div>}
        {s && <div className="copy"><small>SCENE {active + 1}/7</small><h2>{s.headline}</h2><p>{s.voiceover}</p></div>}
      </div><div className="controls"><button onClick={() => setActive(Math.max(0, active - 1))}>‹</button><button onClick={generateVoice} disabled={!s || voiceLoading}>🔊 {voiceLoading ? "…" : ""}</button><button onClick={() => setActive(Math.min(6, active + 1))}>›</button></div>{audio && <audio controls src={audio} style={{ width: "100%", marginTop: 10 }} />}
      {s && <div style={{ marginTop: 12 }}><button onClick={searchStock} disabled={stockLoading}>{stockLoading ? "Searching Pixabay…" : "🎞 Find real stock video / image"}</button><button onClick={retryVisual} style={{ marginLeft: 8 }}>✨ Generate AI visual</button></div>}
      {stockResults.length > 0 && <div className="stockResults"><h3>Choose a matching Pixabay visual</h3><div className="grid">{stockResults.map(item => <article key={item.id} onClick={() => chooseStock(item)} style={{ cursor: "pointer" }}>{item.kind === "video" ? <video src={item.url} poster={item.thumbnail} muted playsInline controls style={{ width: "100%", borderRadius: 8 }} /> : <img src={item.url} alt={item.tags || "Pixabay result"} />}<b>{item.kind === "video" ? "Video" : "Image"}: {(item.tags || "Pixabay visual").slice(0, 90)}</b><small>Click to use this visual</small></article>)}</div></div>}
      </div>
      {reel && <div className="box" style={{ marginTop: 16 }}>
        <h3>Brand your reel</h3>
        <p>Upload your own logo to place it in the top-right corner of every exported scene.</p>
        <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => uploadLogo(e.target.files?.[0])} />
        {logoData && <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}><img src={logoData} alt="Uploaded logo preview" style={{ maxWidth: 120, maxHeight: 64, objectFit: "contain", background: "#fff", padding: 6, borderRadius: 8 }} /><button type="button" onClick={() => { setLogoData(""); if (logoInputRef.current) logoInputRef.current.value = ""; }}>Remove logo</button></div>}
        <button onClick={downloadCompleteReel} disabled={exporting || !reel?.scenes?.length} style={{ marginTop: 12 }}>{exporting ? "Exporting complete reel…" : "⬇ Download Complete Reel (WebM)"}</button>
        {exportStatus && <p aria-live="polite">{exportStatus}</p>}
        <small>Export creates a vertical 9:16 video with scene visuals, headlines, voiceover, and your optional logo. This browser export downloads WebM, not MP4.</small>
      </div>}
    </section>
    {reel && <section className="story"><h2>{reel.title}</h2><div className="grid">{reel.scenes.map((x, i) => <article key={i} className={i === active ? "active" : ""} onClick={() => { setActive(i); setAudio(null); }}>
      {visuals[i]?.url ? <img src={visuals[i].url} alt=""/> : <div className="thumbBlank">Visual unavailable</div>}<b>{i + 1}. {x.headline}</b><p>{x.voiceover}</p><small>{visuals[i]?.source}</small>
    </article>)}</div></section>}
  </main>;
}
