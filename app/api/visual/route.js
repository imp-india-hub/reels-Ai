export const runtime = "nodejs";

const PRIMARY_MODEL = process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-2-klein-9b";
const FALLBACK_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

async function runModel(model, prompt) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!account || !token) throw new Error("Cloudflare image credentials are missing.");

  const form = new FormData();
  form.append("prompt", `${prompt}. Create a premium vertical 9:16 social-media visual. Photorealistic, natural lighting, strong composition, realistic faces and hands, commercially usable look. If people are relevant, use natural contemporary people; if the topic is Indian, show authentic Indian people/settings. Do not put words, captions, logos, watermarks, UI or fake text inside the image.`);
  form.append("width", "768");
  form.append("height", "1344");

  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${encodeURIComponent(model)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    cache: "no-store"
  });

  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Cloudflare ${model} ${r.status}: ${body.slice(0, 900)}`);
  }

  const ct = r.headers.get("content-type") || "";
  if (ct.startsWith("image/")) {
    return { url: `data:${ct};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`, source: `Cloudflare ${model}` };
  }

  const d = await r.json();
  const b = d?.result?.image || d?.result?.image_base64 || d?.image || d?.image_base64;
  if (!b) throw new Error(`Cloudflare returned no image data: ${JSON.stringify(d).slice(0, 900)}`);
  return { url: `data:image/png;base64,${b}`, source: `Cloudflare ${model}` };
}

async function stock(q) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q || "business")}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url&iiurlwidth=900&format=json&origin=*`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Wikimedia fallback failed (${r.status})`);
  const d = await r.json();
  const pages = Object.values(d?.query?.pages || {});
  const hit = pages.find(p => p?.imageinfo?.[0]?.thumburl || p?.imageinfo?.[0]?.url);
  if (!hit) throw new Error("No fallback visual found.");
  return { url: hit.imageinfo[0].thumburl || hit.imageinfo[0].url, source: "Wikimedia Commons fallback" };
}

export async function POST(request) {
  try {
    const { prompt, query, mode } = await request.json();
    if (mode === "stock") return Response.json(await stock(query));

    const errors = [];
    for (const model of [...new Set([PRIMARY_MODEL, FALLBACK_MODEL])]) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          return Response.json(await runModel(model, prompt || query || "business"));
        } catch (e) {
          errors.push(`${model} attempt ${attempt}: ${e?.message || e}`);
          if (attempt === 1) await new Promise(r => setTimeout(r, 700));
        }
      }
    }

    try { return Response.json(await stock(query || "business")); }
    catch (e) { errors.push(e?.message || e); }

    return Response.json({ url: null, source: "Visual unavailable", error: errors.join(" | ") }, { status: 200 });
  } catch (e) {
    console.error("VISUAL ERROR:", e);
    return Response.json({ url: null, source: "Visual unavailable", error: e?.message || String(e) }, { status: 200 });
  }
}
