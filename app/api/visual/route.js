import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

async function stock(query) {
  const q = encodeURIComponent(query || "business");
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${q}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url&iiurlwidth=900&format=json&origin=*`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("Stock image search failed.");
  const data = await r.json();
  const pages = Object.values(data.query?.pages || {});
  const hit = pages.find(p => p.imageinfo?.[0]?.thumburl || p.imageinfo?.[0]?.url);
  if (!hit) return { url: null, source: "No visual found" };
  return {
    url: hit.imageinfo[0].thumburl || hit.imageinfo[0].url,
    source: "Wikimedia Commons"
  };
}

export async function POST(req) {
  try {
    const { prompt, query, mode } = await req.json();

    if (mode === "stock") return Response.json(await stock(query));

    const key = process.env.GEMINI_API_KEY?.trim();

    if (key) {
      try {
        const ai = new GoogleGenAI({ apiKey: key });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-image",
          contents: `Create a high-quality vertical 9:16 social-media image. No text, no logo, no watermark. ${prompt || query || "business"}`
        });

        const parts = response?.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find(p => p.inlineData?.data);

        if (imagePart) {
          return Response.json({
            url: `data:${imagePart.inlineData.mimeType || "image/png"};base64,${imagePart.inlineData.data}`,
            source: "Gemini AI image"
          });
        }
      } catch (imageError) {
        console.error("Gemini image failed, using stock fallback:", imageError);
      }
    }

    return Response.json(await stock(query || "business"));
  } catch (e) {
    console.error("VISUAL ERROR:", e);
    return Response.json({ url: null, source: "Visual unavailable" }, { status: 200 });
  }
}