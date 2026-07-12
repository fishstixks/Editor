# Digital Photobooth — v2.1.0

## What was actually broken

Looking at your screenshots against your source, the code you had was
already correct — the swatch-picker JS and the mirrored-capture logic
were right. Two real things were still wrong:

**1. Four raw `<select>` dropdowns showing instead of swatches.**
`.visually-hidden` in your CSS *should* hide `#theme`, `#layout`,
`#filter`, `#template` — and it would, if the browser was definitely
running your latest `style.css`. If it's serving a slightly stale
cached copy (very common with GitHub Pages + Safari, since neither
sets aggressive cache-busting by default), you get exactly what your
screenshot shows: the swatch containers render (empty or fine) but
the hidden selects aren't hidden.

Fix, three independent layers so no single point of failure can show
them again:
- CSS class (`display:none !important` added, not just the old clip trick)
- `hidden` attribute in the HTML
- inline `style="display:none"` in the HTML
- JS also forces `.style.display = "none"` on all four at init

**2. Photos coming out very dark and green.**
That's the classic look of a camera capturing before auto-exposure /
auto-white-balance has converged — the old code started the 3-2-1
countdown (and could fire the very first capture) the instant
`getUserMedia()` resolved. In low light especially, that's a frame
taken before the sensor has adjusted.

Fix in `photobooth.js`: `startCamera()` now waits for the video to
report real pixel dimensions, then holds for a ~900ms exposure-settle
window before the app is allowed to start capturing. There's also a
"Getting ready…" fallback message and a hard 4s timeout so a slow
device never hangs indefinitely.

## Cache-busting for future deploys

`index.html` loads `style.css?v=2.1.0` and `photobooth.js?v=2.1.0`.
**Bump that `v=` number every time you push a change** — that's what
forces the browser to fetch the new file instead of reusing a cached
one. The page also sends `Cache-Control: no-cache` meta tags, but
those only govern the HTML document itself; the version query string
is what actually matters for the CSS/JS.

If you still see old behavior after deploying:
1. Confirm the new commit is live: view-source on the page and check
   the `v=` number matches what you just pushed.
2. Hard-refresh (iOS Safari: Settings → Safari → Clear History and
   Website Data, or just wait — GitHub Pages' CDN can take a minute
   to propagate after a push).

## Files

- `index.html` — markup, screens, cache-busted asset links
- `style.css` — all styling, the hardened `.visually-hidden` rule
- `photobooth.js` — all app logic (camera, capture, compositing, swatches)
- `manifest.json` — home-screen app metadata (matches the existing
  `apple-mobile-web-app-*` meta tags in `index.html`)
- `.nojekyll` — tells GitHub Pages to serve files as-is
