# ReelForge AI — OpenRouter + Cloudflare

## Providers
- OpenRouter Chat Completions API generates the 7-scene script.
- OpenRouter speech endpoint generates MP3 voiceover audio.
- Cloudflare Workers AI generates scene visuals.
- Next.js App Router app for Vercel.

## Required Vercel environment variables
- `OPENROUTER_API_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Optional:
- `OPENROUTER_TEXT_MODEL` (default `google/gemini-3.8-flash-lite`)
- `OPENROUTER_TTS_MODEL` (optional; leave unset for catalog-based Indian-English voice discovery)
- `OPENROUTER_TTS_VOICE` (optional; leave unset for catalog-based Indian-English voice discovery)
- `OPENROUTER_SITE_URL`
- `CLOUDFLARE_IMAGE_MODEL` (default `@cf/black-forest-labs/flux-2-klein-9b`)

Important: TTS does not guess a voice ID. If both TTS environment variables are unset, the server checks OpenRouter's live speech-model catalog and selects only a voice whose ID explicitly identifies the `en-IN` locale. If the catalog has no such voice available, the API returns an actionable error rather than silently using a different accent. To configure manually, use an exact model/voice pair from `https://openrouter.ai/api/v1/models?output_modalities=speech`. The speech endpoint returns raw audio bytes; the app validates the content type and audio length before preparing MP3 playback.

Never place API keys in client-side code or commit real keys to GitHub. Add variables in Vercel Project Settings → Environment Variables, then redeploy.

## Current scope
Topic → 7-scene script → 7 generated visuals → per-scene voice generation → 9:16 storyboard preview. This project does not yet export a finished MP4.
