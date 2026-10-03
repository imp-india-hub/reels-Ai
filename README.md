# ReelForge AI — Vercel + Gemini

## Features
- Topic → Gemini-generated 7-scene storyboard
- Free Wikimedia Commons image search
- 9:16 reel preview
- Browser voice preview using SpeechSynthesis
- Browser WebM export
- Share button
- Responsive UI

## 1. Install
```bash
npm install
```

## 2. Add Gemini key
Copy `.env.example` to `.env.local`:

```env
GEMINI_API_KEY=your_key_here
```

Never expose the key in client-side code.

## 3. Run
```bash
npm run dev
```

Open http://localhost:3000

## 4. Deploy to Vercel
Push this folder to GitHub, import the repo into Vercel, and add:

`GEMINI_API_KEY`

under Project → Settings → Environment Variables.

Then deploy.

## Notes
The exported file is WebM generated in the browser. Browser capture can be blocked by cross-origin image restrictions for some sources. The preview and voice preview still work. For reliable MP4/server-side rendering, add a media rendering service or object storage in a later version.
