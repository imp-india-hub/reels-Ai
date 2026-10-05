# ReelForge AI — V3 Gemini Fix

1. Upload this project to GitHub.
2. Import the repository into Vercel.
3. In Vercel → Settings → Environment Variables add:
   GEMINI_API_KEY = your Gemini API key
4. Enable it for Production, Preview and Development.
5. Redeploy.

This version uses the current `@google/genai` SDK and a structured JSON response schema. Text generation uses Gemini 3.8 Flash. Visual generation is separate and falls back to Wikimedia Commons if AI image generation fails.

Do not put the Gemini API key in browser/client code.
