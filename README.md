# ReelForge AI V5 — Gemini + Cloudflare Workers AI

Gemini 3.8 Flash handles scripts. Cloudflare Workers AI FLUX.2 Klein 4B handles images. Wikimedia Commons is the image fallback.

Vercel Environment Variables:
GEMINI_API_KEY=...
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_IMAGE_MODEL=@cf/black-forest-labs/flux-2-klein-4b

Create a Cloudflare API token with Workers AI access for the account.

The current build generates 7 scenes, 7 visuals, voiceover scripts and a 9:16 storyboard preview. It does not yet render an MP4.


## Security update
This build uses Next.js 15.5.27, the September 2026 Maintenance LTS security release. If Vercel still reports a vulnerable Next.js version, redeploy with a fresh install/build cache cleared.
