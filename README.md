# Digital Photobooth — v2.3.0

## v2.3.0 — QR removed, per-photo retake, edit-after-capture

**QR code kept failing.** `buildQrThumbnail()` shrank the exported
photo down and handed it to `qrcodejs` as long as the shrunk output
was under ~2200 bytes — but that library can't reliably encode a
payload anywhere near that size; it was throwing internally well
before the shrink-loop's own threshold, so "Couldn't generate a QR
code" fired on essentially every attempt. Even fixed, embedding a
whole photo as QR data is a dead end: no real link, a code too dense
to scan reliably, and no benefit over Download. Removed the feature
entirely — `qrToggleBtn`/`qrContainer`, the qrcodejs `<script>` tag,
`buildQrThumbnail()`, `handleToggleQr()`, and `state.showingQr` are
all gone.

**Retake a single photo instead of all 4.** The preview screen no
longer auto-advances to processing on a fixed timer — that timer
was the reason there was never enough time to react to a bad shot.
Each of the 4 preview photos now has its own ↻ button
(`handleRetakeSinglePhoto`) that re-opens the camera for one more
3-2-1-and-shoot (`captureOnePhoto`), replaces just that frame, and
drops back to preview. A persistent **Continue** button
(`handleContinueFromPreview`) moves things forward explicitly once
you're happy with all 4.

**Change template/colour/layout/filter after the shots are taken.**
The result screen has a new **Edit strip** toggle that reveals the
same swatch pickers as the welcome screen. Since `buildFinalImage()`
only ever reads from `state.photos` (the raw, unfiltered captures),
any of those four settings can change after capture with zero camera
involvement — `regenerateFinalImage()` just recomposites the same 4
photos and swaps `resultImage.src` in place.

Remember to bump the `?v=` cache-busting number (now `2.3.0`) when
you deploy this — see the section below.

## v2.2.0 — squished photos + emoji decorations

**Photos looked squished.** The compositor forced every raw capture
into a fixed box with a plain stretch (`drawImage(img, x, y, w, h)`),
ignoring the photo's real aspect ratio. Any mismatch between the
camera's native frame and that box = visible distortion. Fixed two
ways:
- Cells are now 3:4, the same ratio as the live `.camera-frame`
  preview, so the exported strip matches what you actually framed
  on screen.
- Photos are drawn with a new `drawImageCover()` helper that crops
  to fill the cell — the canvas equivalent of CSS
  `object-fit: cover` — instead of stretching.

**The strip decoration was "barely anything."** The old version drew
tiny emoji glyphs (34px, in a 28px margin) via `fillText`. Replaced
with real vector artwork drawn straight on the canvas:
- a blossom sprig, a sparkle, a traced heart, and scattered confetti
  pieces — one real shape per template, sized to actually be seen,
  placed at the four corners plus a larger centred flourish above
  the watermark
- every template (including Classic) now also gets the dashed
  "perforation" line run the full height of the strip — the same
  motif already used around the on-screen result frame in CSS, now
  carried into the exported image itself, so there's a real
  through-line between capture and print rather than nothing at all
  for Classic.

## What was actually broken (v2.1.0)

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

**Note:** if your strip still looks dark/green after deploying
2.2.0+, first check the `v=` number in view-source actually matches
what you pushed (see cache-busting section) — a stale cache will
make it look like this fix "isn't working" when it's just not loaded
yet.

## Cache-busting for future deploys

`index.html` loads `style.css?v=2.3.0` and `photobooth.js?v=2.3.0`.
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
