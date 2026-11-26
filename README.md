# ToxGuard — AI-Powered Toxic Video Analysis (Demo)

A front-end demo of a pre-publish toxicity checker for creators.
Upload a video (or pick a sample) and get a verdict + heatmap + flagged
segments + suggested fixes, all mapped to major social platforms.

## Run it

1. Open this folder in **VS Code**.
2. Install the **Live Server** extension (by Ritwick Dey) if you don't have it.
3. Right-click `index.html` → **Open with Live Server**.
4. Browser opens at `http://127.0.0.1:5500`.

That's it — no build step, no dependencies.

> The analysis is simulated in `js/analyzer.js`. To plug in a real model,
> replace `analyzeVideo()` with a `fetch()` to your backend and return the
> same object shape (score, flags[], heat[], platformVerdicts[], recommendations[]).

## Files
- `index.html` — markup
- `css/styles.css` — dark, minimal styling
- `js/analyzer.js` — simulated AI analysis engine
- `js/app.js` — UI logic, upload, timeline, export

## Notes
- Advisory only — this is a demo, not a moderation system.
- Sample cards use deterministic seeds so results are stable.
- Uploaded videos play locally via `URL.createObjectURL` — nothing leaves the browser.