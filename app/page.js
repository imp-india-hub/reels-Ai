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
  const [language, setLanguage] = useState("en");
  const [motionStyle, setMotionStyle] = useState("kenburns");
  const [musicStyle, setMusicStyle] = useState("cinematic");
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
      const r = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, language }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail ? `${d?.error || "Generation failed."} Details: ${d.detail}` : (d?.error || "Generation failed."));
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
      const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: s.voiceover, language }) });
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
      // Mix generated voice audio into the recorded stream; canvas.captureStream alone records video only.
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Your browser does not support audio mixing for reel export.");
      const audioContext = new AudioContextClass();
      await audioContext.resume();
      const audioDestination = audioContext.createMediaStreamDestination();
      // Generate a continuous, royalty-free ambient music bed in the browser so it runs
      // seamlessly underneath every scene without requiring external audio files.
      let stopBackgroundMusic = () => {};
      if (musicStyle !== "none") {
        const musicGain = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = musicStyle === "dramatic" ? 900 : musicStyle === "calm" ? 650 : 1200;
        musicGain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        musicGain.gain.linearRampToValueAtTime(musicStyle === "dramatic" ? 0.20 : musicStyle === "uplifting" ? 0.16 : 0.14, audioContext.currentTime + 2.5);
        filter.connect(musicGain);
        musicGain.connect(audioDestination);
        musicGain.connect(audioContext.destination);
        const pad = [0, 1, 2].map((n) => {
          const osc = audioContext.createOscillator();
          const voiceGain = audioContext.createGain();
          osc.type = musicStyle === "dramatic" ? "triangle" : musicStyle === "uplifting" ? "sine" : "sine";
          voiceGain.gain.value = n === 0 ? 0.32 : n === 1 ? 0.24 : 0.18;
          osc.connect(voiceGain); voiceGain.connect(filter); osc.start();
          return { osc, voiceGain };
        });
        const progressions = {
          cinematic: [[110, 164.81, 220], [87.31, 130.81, 174.61], [98, 146.83, 196], [73.42, 110, 146.83]],
          uplifting: [[130.81, 164.81, 196], [98, 130.81, 164.81], [110, 146.83, 196], [87.31, 130.81, 174.61]],
          calm: [[130.81, 164.81, 196], [110, 146.83, 174.61], [98, 130.81, 164.81], [110, 146.83, 174.61]],
          dramatic: [[73.42, 110, 146.83], [65.41, 98, 130.81], [82.41, 123.47, 164.81], [73.42, 110, 146.83]]
        };
        const progression = progressions[musicStyle] || progressions.cinematic;
        let chordIndex = 0;
        const setChord = () => {
          const chord = progression[chordIndex % progression.length];
          pad.forEach((voice, i) => voice.osc.frequency.setTargetAtTime(chord[i], audioContext.currentTime, 0.8));
          chordIndex++;
        };
        setChord();
        const chordTimer = setInterval(setChord, 4200);
        stopBackgroundMusic = () => {
          clearInterval(chordTimer);
          try {
            musicGain.gain.cancelScheduledValues(audioContext.currentTime);
            musicGain.gain.setTargetAtTime(0.0001, audioContext.currentTime, 0.3);
            setTimeout(() => { pad.forEach(v => { try { v.osc.stop(); } catch {} }); }, 1200);
          } catch {}
        };
      }
      const exportStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks(),
      ]);
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" :
        (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" :
        (MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8" : "video/webm"));
      const chunks = [];
      recorder = new MediaRecorder(exportStream, { mimeType: mime });
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
      const drawCover = (img, progress = 0) => {
        const base = Math.max(canvas.width / img.width, canvas.height / img.height);
        const zoom = motionStyle === "none" ? 1 : motionStyle === "pulse" ? 1 + 0.025 * Math.sin(progress * Math.PI * 2) : 1 + 0.12 * progress;
        const scale = base * zoom;
        const w = img.width * scale, h = img.height * scale;
        let x = (canvas.width - w) / 2, y = (canvas.height - h) / 2;
        if (motionStyle === "slide") x += (progress - 0.5) * 90;
        if (motionStyle === "pan-up") y += (0.5 - progress) * 90;
        ctx.drawImage(img, x, y, w, h);
      };
      const logo = logoData ? await loadImage(logoData) : null;
      const scenes = reel.scenes;
      if (musicStyle !== "none" && audioDestination.stream.getAudioTracks().length === 0) throw new Error("Background music audio track could not be created. Please use Chrome or Edge and try again.");
      recorder.start(250);
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        setExportStatus(`Preparing voice ${i + 1} of ${scenes.length}…`);
        const voiceRes = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: scene.voiceover, language }) });
        const voiceData = await voiceRes.json();
        if (!voiceRes.ok || !voiceData.audio) throw new Error(voiceData?.error || `Voice generation failed for scene ${i + 1}.`);
        const audio = new Audio(voiceData.audio);
        audio.crossOrigin = "anonymous";
        const audioSource = audioContext.createMediaElementSource(audio);
        audioSource.connect(audioDestination);
        audioSource.connect(audioContext.destination);
        await new Promise((resolve, reject) => {
          audio.oncanplaythrough = resolve; audio.onerror = () => reject(new Error(`Could not load voice audio for scene ${i + 1}.`)); audio.load();
        });
        let img = null;
        if (visuals[i]?.url) {
          try { img = await loadImage(visuals[i].url); } catch {}
        }
        if (!img) {
          ctx.fillStyle = "#111827"; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#ffffff"; ctx.font = "bold 40px sans-serif"; ctx.fillText(scene.headline || "A moment unfolds", 48, 180, 620);
          ctx.font = "28px sans-serif"; ctx.fillText("Visual unavailable", 48, 240);
        }
        const duration = Math.max(3, Number(audio.duration) || 5);
        setExportStatus(`Recording scene ${i + 1} of ${scenes.length}…`);
        let start = performance.now();
        audio.currentTime = 0;
        const draw = () => {
          const progress = Math.min(1, Math.max(0, (performance.now() - start) / (duration * 1000)));
          if (img) drawCover(img, progress);
          else { ctx.fillStyle = "#111827"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
          const bandH = 300;
          const grad = ctx.createLinearGradient(0, canvas.height - bandH, 0, canvas.height);
          grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(0.25, "rgba(0,0,0,0.62)"); grad.addColorStop(1, "rgba(0,0,0,0.88)");
          ctx.fillStyle = grad; ctx.fillRect(0, canvas.height - bandH, canvas.width, bandH);
          if (logo) {
            const maxW = 130, maxH = 80, sc = Math.min(maxW / logo.width, maxH / logo.height, 1);
            ctx.drawImage(logo, canvas.width - logo.width * sc - 28, 28, logo.width * sc, logo.height * sc);
          }
          
          ctx.fillStyle = "#ffffff"; ctx.font = "bold 42px sans-serif";
          const headline = String(scene.headline || "").slice(0, 90); ctx.fillText(headline, 42, canvas.height - 168, 630);
          ctx.font = "30px sans-serif";
          const words = String(scene.voiceover || "").split(/\s+/); let line = "", y = canvas.height - 112;
          for (const word of words) { const test = line ? `${line} ${word}` : word; if (ctx.measureText(test).width > 630) { ctx.fillText(line, 42, y); y += 38; line = word; if (y > canvas.height - 35) break; } else line = test; }
          if (line && y <= canvas.height - 35) ctx.fillText(line, 42, y);
        };
        draw();
        const tick = setInterval(draw, 1000 / 30);
        try { if (audioContext.state !== "running") await audioContext.resume(); await audio.play(); } catch { clearInterval(tick); throw new Error("Browser blocked audio playback. Click Download Complete Reel again and allow audio playback."); }
        await new Promise(resolve => {
          let done = false;
          const finish = () => { if (!done) { done = true; resolve(); } };
          audio.onended = finish;
          setTimeout(finish, (duration + 1.5) * 1000);
        });
        clearInterval(tick); audio.pause(); audioSource.disconnect();
        await wait(150);
      }
      stopBackgroundMusic();
      recorder.stop();
      await finished;
      stream = exportStream;
      const blob = new Blob(chunks, { type: "video/webm" });
      if (!blob.size) throw new Error("The exported video was empty. Please try another browser.");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${(reel.title || "reelforge-reel").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "reelforge-reel"}.webm`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      await audioContext.close();
      setExportStatus(musicStyle === "none" ? "Export complete. Your WebM reel includes the generated voiceover." : "Export complete. Your WebM reel includes continuous background music mixed softly under the voiceover.");
    } catch (e) {
      try { if (recorder && recorder.state !== "inactive") recorder.stop(); } catch {}
      try { if (stream) stream.getTracks().forEach(track => track.stop()); } catch {}
      setError(e?.message || "Could not export the reel.");
      setExportStatus("");
    } finally {
      setExporting(false);
    }
  }

  return <main>
    <nav><b>⚡ ReelForge AI</b><span>OpenRouter + Cloudflare AI · Story Reel · 9:16</span></nav>
    <section className="hero">
      <div>
        <small>AI REEL STUDIO</small><h1>Turn any topic into a <i>ready-to-share reel.</i></h1>
        <p>OpenRouter writes the story and creates the voice. Search real Pixabay footage or create custom visuals with Cloudflare AI.</p>
        <div className="box"><label>YOUR TOPIC</label><textarea value={topic} onChange={e => setTopic(e.target.value)} placeholder="Example: How restaurants can use AI to get more customers"/>
          <label>REEL LANGUAGE</label><select value={language} onChange={e => setLanguage(e.target.value)} style={{ width: "100%", padding: 12, margin: "8px 0 14px", borderRadius: 8 }}><option value="en">English (Indian English voice when available)</option><option value="hi">Hindi</option><option value="bilingual">Hindi + English (bilingual script)</option></select>
          <label>BACKGROUND MUSIC</label><select value={musicStyle} onChange={e => setMusicStyle(e.target.value)} style={{ width: "100%", padding: 12, margin: "8px 0 14px", borderRadius: 8 }}><option value="cinematic">Cinematic / emotional — connects the story</option><option value="uplifting">Uplifting / positive</option><option value="calm">Calm / inspirational</option><option value="dramatic">Dramatic / suspense</option><option value="none">No background music</option></select>
          <small style={{ display: "block", marginTop: -8, marginBottom: 12 }}>Music plays continuously across all 7 scenes and stays quieter than the narration.</small>
          <label>GRAPHICS MOTION</label><select value={motionStyle} onChange={e => setMotionStyle(e.target.value)} style={{ width: "100%", padding: 12, margin: "8px 0 14px", borderRadius: 8 }}><option value="kenburns">Cinematic zoom (Ken Burns)</option><option value="slide">Horizontal slide</option><option value="pan-up">Slow upward pan</option><option value="pulse">Gentle pulse</option><option value="none">No motion</option></select>
          <button disabled={loading || !topic.trim()} onClick={generate}>{loading ? "Creating your reel…" : "Generate Story Reel →"}</button></div>
        {error && <div className="error"><strong>Generation error</strong><div>{error}</div></div>}
        {visualError && <div className="error"><strong>Visual notice</strong><div>{visualError}</div></div>}
      </div>
      <div className="phone"><div className="screen">
        {s && visuals[active]?.url ? <img src={visuals[active].url} alt=""/> : s ? <div className="blank"><strong>🎨</strong><h3>{visuals[active]?.source || "Creating visual…"}</h3><button onClick={retryVisual}>Retry visual</button></div> : <div className="blank"><strong>▶</strong><h3>Your reel appears here</h3><p>Enter a topic to start.</p></div>}
        {s && <div className="copy"><h2>{s.headline}</h2><p>{s.voiceover}</p></div>}
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
        <small>Export creates a vertical 9:16 WebM with visuals, animated graphics, headlines, generated voiceover, optional continuous background music, and your optional logo. Music is synthesized in-browser and mixed into the exported audio track; it is heard in the downloaded reel, not in the still-image preview. This is WebM, not MP4.</small>
      </div>}
    </section>
    {reel && <section className="story"><h2>{reel.title}</h2><div className="grid">{reel.scenes.map((x, i) => <article key={i} className={i === active ? "active" : ""} onClick={() => { setActive(i); setAudio(null); }}>
      {visuals[i]?.url ? <img src={visuals[i].url} alt=""/> : <div className="thumbBlank">Visual unavailable</div>}<b>{x.headline}</b><p>{x.voiceover}</p><small>{visuals[i]?.source}</small>
    </article>)}</div></section>}
  </main>;
}
