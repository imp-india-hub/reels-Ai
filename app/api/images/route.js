export const runtime = "nodejs";

function safeQuery(value) {
  return String(value || "").replace(/[^\w\s-]/g, " ").trim().slice(0, 120);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = safeQuery(searchParams.get("q"));

  if (!q) {
    return Response.json({ error: "Missing image query." }, { status: 400 });
  }

  try {
    const api = new URL("https://commons.wikimedia.org/w/api.php");
    api.searchParams.set("action", "query");
    api.searchParams.set("generator", "search");
    api.searchParams.set("gsrsearch", q);
    api.searchParams.set("gsrnamespace", "6");
    api.searchParams.set("gsrlimit", "8");
    api.searchParams.set("prop", "imageinfo");
    api.searchParams.set("iiprop", "url|mime|size");
    api.searchParams.set("iiurlwidth", "900");
    api.searchParams.set("format", "json");
    api.searchParams.set("origin", "*");

    const response = await fetch(api, {
      headers: { "User-Agent": "ReelForgeAI/1.0 contact@example.com" },
      cache: "no-store"
    });

    if (!response.ok) throw new Error("Wikimedia request failed.");

    const data = await response.json();
    const pages = Object.values(data.query?.pages || {});
    const image = pages.find(
      p =>
        p.imageinfo?.[0]?.thumburl &&
        /^image\//.test(p.imageinfo[0].mime || "")
    );

    if (!image) {
      return Response.json({ image: null, title: null });
    }

    return Response.json({
      image: image.imageinfo[0].thumburl,
      original: image.imageinfo[0].url,
      title: image.title,
      source: "Wikimedia Commons"
    });
  } catch (error) {
    console.error("Image search error:", error);
    return Response.json({ image: null, title: null }, { status: 200 });
  }
}