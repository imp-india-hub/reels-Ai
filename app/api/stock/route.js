export const runtime = "nodejs";

export async function POST(request) {
  try {
    const key = process.env.PIXABAY_API_KEY?.trim();
    if (!key) return Response.json({ error: "Pixabay API key is not configured. Add PIXABAY_API_KEY in Vercel Environment Variables, then redeploy." }, { status: 400 });
    const body = await request.json();
    const query = String(body?.query || "").trim().slice(0, 100);
    if (!query) return Response.json({ error: "Enter a scene description to search." }, { status: 400 });

    const [videoResponse, imageResponse] = await Promise.all([
      fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&safesearch=true&per_page=8`, { cache: "no-store" }),
      fetch(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&image_type=photo&orientation=vertical&safesearch=true&per_page=8`, { cache: "no-store" })
    ]);
    if (!videoResponse.ok && !imageResponse.ok) throw new Error("Pixabay search failed. Verify the API key and try again.");
    const videos = videoResponse.ok ? await videoResponse.json() : { hits: [] };
    const images = imageResponse.ok ? await imageResponse.json() : { hits: [] };
    const videoResults = (videos.hits || []).map(hit => {
      const variants = hit.videos || {};
      const file = variants.medium?.url ? variants.medium : variants.small?.url ? variants.small : variants.tiny;
      if (!file?.url) return null;
      return { id: `v-${hit.id}`, kind: "video", url: file.url, thumbnail: file.thumbnail, tags: hit.tags, pageURL: hit.pageURL, duration: hit.duration };
    }).filter(Boolean);
    const imageResults = (images.hits || []).map(hit => ({ id: `i-${hit.id}`, kind: "image", url: hit.largeImageURL || hit.webformatURL, thumbnail: hit.previewURL, tags: hit.tags, pageURL: hit.pageURL })).filter(x => x.url);
    return Response.json({ results: [...videoResults, ...imageResults].slice(0, 12), attribution: "Media from Pixabay" });
  } catch (error) {
    console.error("PIXABAY SEARCH ERROR:", error);
    return Response.json({ error: error?.message || "Pixabay search failed." }, { status: 500 });
  }
}
