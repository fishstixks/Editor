/* ============================================================
   DIGITAL PHOTOBOOTH
   photobooth.js — Version 2.3.0
   Full build

   Changelog vs 2.2.0:
   - Removed the QR-code result view. The qrcodejs library on cdnjs
     can't reliably encode a payload as large as a shrunk photo (it
     was throwing internally well before the shrink-loop's own
     "small enough" threshold), so "Couldn't generate a QR code"
     fired on effectively every attempt. Rather than patch a feature
     built on embedding a whole image inside a QR code (which,
     even working, scans poorly and needs no server), it's gone —
     Download remains the way to get the photo off the device.
   - Preview screen no longer auto-advances to processing after a
     fixed delay. Each of the 4 shots now has its own ↻ retake
     button (captureOnePhoto/handleRetakeSinglePhoto — a single
     3-2-1-countdown-and-shoot reusing the same building blocks as
     the main sequence), and a persistent Continue button
     (handleContinueFromPreview) moves things forward explicitly.
   - Result screen gained an "Edit strip" panel (buildResultEditPickers/
     regenerateFinalImage) that lets frame colour, template, layout,
     and filter all be changed *after* capture with no camera
     involved — buildFinalImage() only ever reads from state.photos,
     so it can just recomposite the same 4 shots on demand.

   Changelog vs 2.1.0:
   - Photos no longer look squished. The composite used to force
     each raw capture into a fixed 4:3-ish box with a plain stretch
     drawImage(img, x, y, w, h) call, regardless of the photo's real
     aspect ratio — any mismatch = visible distortion. Cells are now
     3:4, matching the live .camera-frame preview exactly, and
     drawImageCover() crops (never stretches) to fill them, the same
     way CSS object-fit:cover works.
   - Template decorations are real drawn vector artwork (a blossom
     sprig, a sparkle, a traced heart, scattered confetti pieces —
     see "2.5 CANVAS ART MOTIFS") instead of emoji glyphs, sized to
     actually read at a glance instead of 34px text lost in a 28px
     margin. Every template, including Classic, also gets the
     dashed "perforation" motif drawn the full height of the strip —
     the same signature line already used around the on-screen
     result frame in CSS, now carried into the exported image itself.

   Changelog vs 2.0.6:
   - startCamera() now waits for the video element to actually report
     real dimensions (loadedmetadata + a short exposure/white-balance
     settle delay) before the countdown is allowed to start. Root
     cause of the very dark, green-tinted captures: the countdown
     (and first flash/capture) could fire while getUserMedia's stream
     had only just attached, before the sensor's auto-exposure/AWB
     had converged — especially in low light, which reads as a dark,
     noisy, green/IR-looking frame.
   - buildKioskPickers()/init() now also force `display:none` inline
     on the 4 proxy <select> elements as a third, independent layer
     of "never show these" alongside the CSS class and hidden attr,
     so a stale cached stylesheet can never leave them visible.
   ============================================================ */

(function () {
  "use strict";

  /* ------------------------------------------------------------
     0. DEBUG LOGGER
  ------------------------------------------------------------ */
  window.PHOTOBOOTH_DEBUG =
    typeof window.PHOTOBOOTH_DEBUG === "boolean"
      ? window.PHOTOBOOTH_DEBUG
      : true;

  function log(...args) {
    if (window.PHOTOBOOTH_DEBUG) {
      try {
        console.log("[Photobooth]", ...args);
      } catch (e) {}
    }
  }
  function warn(...args) {
    try {
      console.warn("[Photobooth]", ...args);
    } catch (e) {}
  }
  function error(...args) {
    try {
      console.error("[Photobooth]", ...args);
    } catch (e) {}
  }

  const APP_VERSION = "2.3.0";
  log(`photobooth.js v${APP_VERSION} loading...`);

  /* ------------------------------------------------------------
     1. REQUIRED DOM ELEMENTS
  ------------------------------------------------------------ */
  const REQUIRED_IDS = [
    "welcomeScreen", "cameraScreen", "previewScreen", "processingScreen",
    "printingScreen", "resultScreen",
    "startBtn", "switchCamera", "cancelSession", "downloadBtn", "retakeBtn", "newSession",
    "camera", "countdown", "photoCounter", "progressFill", "flash", "shutter",
    "theme", "layout", "filter", "template",
    "colourSwatches", "templateSwatches", "layoutSwatches", "filterSwatches",
    "preview1", "preview2", "preview3", "preview4",
    "previewCaption", "continueBtn",
    "exportCanvas",
    "printPreview", "printingStatus",
    "resultImage",
    "editToggleBtn", "editPanel",
    "resultColourSwatches", "resultTemplateSwatches", "resultLayoutSwatches", "resultFilterSwatches",
  ];

  const el = {};

  function validateDOM() {
    const missing = [];
    REQUIRED_IDS.forEach((id) => {
      const node = document.getElementById(id);
      el[id] = node || null;
      if (!node) missing.push(id);
    });
    if (missing.length > 0) {
      error(`DOM validation FAILED. Missing ${missing.length} element(s):`, missing);
    } else {
      log(`DOM validation passed. All ${REQUIRED_IDS.length} elements found.`);
    }
    return { ok: missing.length === 0, missing };
  }

  function showUserError(message) {
    error(message);
    const errEl = document.getElementById("cameraError");
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = message;
      window.clearTimeout(showUserError._t);
      showUserError._t = window.setTimeout(() => {
        errEl.hidden = true;
      }, 5000);
    } else {
      warn("#cameraError element not found, falling back to alert()");
      try { alert(message); } catch (e) {}
    }
  }

  /* ------------------------------------------------------------
     2. APP STATE
  ------------------------------------------------------------ */
  const state = {
    domReady: false,
    stream: null,
    facingMode: "user",
    isStarting: false,
    isSessionActive: false,
    isCapturing: false,
    isCameraReady: false,    // true once exposure/white-balance has settled
    photos: [],              // raw captured frames (data URLs, unfiltered)
    currentFilter: "normal",
    currentLayout: "strip",
    currentFrameColour: "cream",
    currentTemplate: "classic",
    finalImageDataUrl: null,
    retakingIndex: null,      // set while a single-photo retake is in progress
    captureTimers: [],        // all pending timeouts, for cleanup
  };

  window.__photoboothState = state;

  const FILTERS = {
    normal: "none",
    bw: "grayscale(1) contrast(1.05)",
    warm: "sepia(0.28) saturate(1.35) brightness(1.03)",
    cool: "saturate(1.1) hue-rotate(-8deg) brightness(1.02) contrast(1.05)",
    vintage: "sepia(0.4) contrast(0.9) brightness(0.95) saturate(0.85)",
  };

  // Frame colour options — these style ONLY the exported strip
  // (background + accent border), never the site chrome itself.
  const FRAME_COLOURS = {
    cream: { bg: "#f7f3ee", accent: "rgba(13,11,20,0.15)", ink: "rgba(13,11,20,0.55)" },
    blush: { bg: "#f6dde2", accent: "rgba(150,60,80,0.25)", ink: "rgba(90,30,45,0.6)" },
    noir: { bg: "#17141c", accent: "rgba(255,255,255,0.18)", ink: "rgba(255,255,255,0.75)" },
    gold: { bg: "#f1e6c9", accent: "rgba(140,105,30,0.3)", ink: "rgba(90,65,10,0.65)" },
    mint: { bg: "#dcefe6", accent: "rgba(30,110,80,0.25)", ink: "rgba(15,70,50,0.6)" },
    sky: { bg: "#dde9f7", accent: "rgba(40,80,140,0.25)", ink: "rgba(20,50,95,0.6)" },
  };

  // Template designs — each one (besides Classic) is drawn as real
  // vector artwork directly on the export canvas (see "CANVAS ART
  // MOTIFS" below), not emoji glyphs. `icon` here is only the tiny
  // symbol shown on the picker chip, kept in the same restrained
  // unicode-glyph language as the layout/filter chips (▤ ▦ ◐ ◑ …).
  const TEMPLATES = {
    classic: { label: "Classic", icon: "—" },
    blossom: { label: "Blossom", icon: "❀" },
    stars: { label: "Stars", icon: "✧" },
    hearts: { label: "Hearts", icon: "♡" },
    confetti: { label: "Confetti", icon: "✦" },
  };

  const FRAME_COLOUR_SWATCHES = [
    { id: "cream", hex: "#f7f3ee" },
    { id: "blush", hex: "#f6dde2" },
    { id: "noir", hex: "#17141c" },
    { id: "gold", hex: "#e8cf8f" },
    { id: "mint", hex: "#bfe3d0" },
    { id: "sky", hex: "#bcd6f2" },
  ];

  const LAYOUT_OPTIONS = [
    { id: "strip", icon: "▤", label: "Strip" },
    { id: "grid", icon: "▦", label: "Grid" },
  ];

  const FILTER_OPTIONS = [
    { id: "normal", icon: "◐", label: "Normal" },
    { id: "bw", icon: "◑", label: "B&W" },
    { id: "warm", icon: "◒", label: "Warm" },
    { id: "cool", icon: "◓", label: "Cool" },
    { id: "vintage", icon: "◔", label: "Vintage" },
  ];

  /* ------------------------------------------------------------
     2.5 CANVAS ART MOTIFS
     Real hand-drawn vector artwork for the printed strip, replacing
     the old emoji glyphs. Each motif is a small pure function that
     draws itself centred at (cx, cy) at the given scale — cheap to
     call many times, crisp at any resolution (unlike an emoji glyph,
     which is just whatever font the OS happens to substitute).
  ------------------------------------------------------------ */

  // The brand's own signature: the dashed "perforation" that already
  // runs down both sides of the result-frame in CSS. Drawing it onto
  // the exported strip itself (not just the on-screen frame around
  // it) ties capture to output, so every template — including
  // Classic — gets a real, deliberate piece of design rather than
  // "barely anything".
  function drawPerforationEdges(ctx, x, y, w, h, color) {
    const dashLen = 9;
    const gapLen = 7;
    const dashW = 4;
    const inset = 10;
    ctx.save();
    ctx.fillStyle = color;
    [x + inset, x + w - inset - dashW].forEach((lineX) => {
      let cy = y + inset;
      while (cy < y + h - inset) {
        ctx.fillRect(lineX, cy, dashW, dashLen);
        cy += dashLen + gapLen;
      }
    });
    ctx.restore();
  }

  // A small 5-petal sprig — Blossom template.
  function drawBlossomMotif(ctx, cx, cy, scale, petalColor, centerColor) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate((Math.PI * 2 * i) / 5);
      ctx.beginPath();
      ctx.ellipse(0, -9, 5.5, 9, 0, 0, Math.PI * 2);
      ctx.fillStyle = petalColor;
      ctx.globalAlpha = 0.92;
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = centerColor;
    ctx.globalAlpha = 1;
    ctx.fill();
    ctx.restore();
  }

  // A 4-point sparkle — Stars template.
  function drawSparkleMotif(ctx, cx, cy, size, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.quadraticCurveTo(size * 0.18, -size * 0.18, size, 0);
    ctx.quadraticCurveTo(size * 0.18, size * 0.18, 0, size);
    ctx.quadraticCurveTo(-size * 0.18, size * 0.18, -size, 0);
    ctx.quadraticCurveTo(-size * 0.18, -size * 0.18, 0, -size);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();
    ctx.restore();
  }

  // A simple traced heart — Hearts template.
  function drawHeartMotif(ctx, cx, cy, size, color) {
    ctx.save();
    ctx.translate(cx, cy - size * 0.3);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.35);
    ctx.bezierCurveTo(-size * 0.6, -size * 0.35, -size, size * 0.15, 0, size * 0.85);
    ctx.bezierCurveTo(size, size * 0.15, size * 0.6, -size * 0.35, 0, size * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // A little scattered piece of confetti — Confetti template.
  function drawConfettiMotif(ctx, cx, cy, size, color, rotation, shape) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.fillStyle = color;
    if (shape === "circle") {
      ctx.beginPath();
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (shape === "triangle") {
      ctx.beginPath();
      ctx.moveTo(0, -size / 2);
      ctx.lineTo(size / 2, size / 2);
      ctx.lineTo(-size / 2, size / 2);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(-size / 2, -size / 3, size, (size * 2) / 3);
    }
    ctx.restore();
  }

  // Draws a single motif for a given template id at (cx, cy), sized
  // to `scale`. Returns false (no-op) for "classic", which relies on
  // the perforation edges alone as its signature.
  function drawTemplateMotifAt(ctx, templateId, cx, cy, scale, colours) {
    switch (templateId) {
      case "blossom":
        drawBlossomMotif(ctx, cx, cy, scale / 16, var_blossomPetal(), colours.ink);
        return true;
      case "stars":
        drawSparkleMotif(ctx, cx, cy, scale, var_gold());
        return true;
      case "hearts":
        drawHeartMotif(ctx, cx, cy, scale, var_blossomDeep());
        return true;
      case "confetti": {
        const shapes = ["circle", "triangle", "rect"];
        const palette = [var_gold(), var_blossomPetal(), colours.ink];
        [-1, 0, 1].forEach((offset, i) => {
          drawConfettiMotif(
            ctx,
            cx + offset * scale * 0.9,
            cy + (i % 2 === 0 ? -scale * 0.3 : scale * 0.3),
            scale * 0.85,
            palette[i % palette.length],
            offset * 0.6,
            shapes[i % shapes.length]
          );
        });
        return true;
      }
      default:
        return false;
    }
  }

  // Small fixed brand colours used by canvas artwork, kept separate
  // from the CSS custom properties (canvas can't read var() values).
  function var_gold() { return "#c9a66b"; }
  function var_blossomPetal() { return "#e8b4bc"; }
  function var_blossomDeep() { return "#d98fa0"; }

  // Draws `img` into the destination box exactly like CSS
  // `object-fit: cover` — cropping to fill without distorting the
  // aspect ratio. The old code stretched the raw capture into a
  // fixed-aspect box directly, which is what made photos look
  // squished whenever the camera's native frame didn't already
  // match that box's proportions.
  function drawImageCover(ctx, img, dx, dy, dWidth, dHeight) {
    const imgRatio = img.width / img.height;
    const boxRatio = dWidth / dHeight;
    let sx, sy, sw, sh;
    if (imgRatio > boxRatio) {
      sh = img.height;
      sw = sh * boxRatio;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      sw = img.width;
      sh = sw / boxRatio;
      sx = 0;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dWidth, dHeight);
  }

  /* ------------------------------------------------------------
     3. SCREEN MANAGEMENT
  ------------------------------------------------------------ */
  const SCREENS = [
    "welcomeScreen", "cameraScreen", "previewScreen",
    "processingScreen", "printingScreen", "resultScreen",
  ];

  function showScreen(id) {
    if (!SCREENS.includes(id)) {
      warn(`showScreen called with unknown screen id: ${id}`);
      return;
    }
    SCREENS.forEach((screenId) => {
      const node = el[screenId];
      if (!node) return;
      if (screenId === id) {
        node.hidden = false;
        requestAnimationFrame(() => {
          node.classList.add("screen-active");
          node.classList.remove("screen-hidden");
        });
      } else {
        node.classList.remove("screen-active");
        node.classList.add("screen-hidden");
        window.setTimeout(() => {
          if (!node.classList.contains("screen-active")) {
            node.hidden = true;
          }
        }, 400);
      }
    });
    log(`Screen changed -> ${id}`);
  }

  function trackedTimeout(fn, ms) {
    const id = window.setTimeout(() => {
      state.captureTimers = state.captureTimers.filter((t) => t !== id);
      fn();
    }, ms);
    state.captureTimers.push(id);
    return id;
  }

  function clearAllTimers() {
    state.captureTimers.forEach((id) => window.clearTimeout(id));
    state.captureTimers = [];
  }

  /* ------------------------------------------------------------
     4. CAMERA
  ------------------------------------------------------------ */
  function isGetUserMediaSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function stopCurrentStream() {
    if (state.stream) {
      log("Stopping existing camera stream tracks...");
      state.stream.getTracks().forEach((track) => {
        try { track.stop(); } catch (e) { warn("Error stopping track:", e); }
      });
      state.stream = null;
    }
    if (el.camera) el.camera.srcObject = null;
    state.isCameraReady = false;
  }

  // Resolves once the <video> element has real pixel dimensions AND
  // has painted at least one frame. Resolves with true/false so
  // callers can decide whether to proceed. Times out defensively
  // after 4s so a broken stream can't hang the app forever.
  function waitForVideoReady(video, timeoutMs = 4000) {
    return new Promise((resolve) => {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        resolve(true);
        return;
      }
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        video.removeEventListener("loadeddata", onReady);
        window.clearTimeout(timer);
        resolve(ok);
      };
      const onReady = () => {
        if (video.videoWidth > 0) done(true);
      };
      video.addEventListener("loadeddata", onReady);
      const timer = window.setTimeout(() => done(video.videoWidth > 0), timeoutMs);
    });
  }

  // Real cameras (especially front-facing ones in low light) need a
  // short window after the stream attaches for auto-exposure and
  // auto-white-balance to converge. Skipping this is the reason a
  // capture taken the instant getUserMedia resolves can come out
  // dark, noisy, and green/off-colour. This is a fixed settle delay
  // rather than a pixel-brightness probe, since it needs no extra
  // canvas reads and works consistently across devices.
  const EXPOSURE_SETTLE_MS = 900;

  async function startCamera(facingMode) {
    if (!isGetUserMediaSupported()) {
      showUserError("Camera access unavailable. Your browser does not support camera capture.");
      return false;
    }
    if (!el.camera) {
      showUserError("Camera element not found. Cannot start session.");
      return false;
    }

    stopCurrentStream();
    state.isCameraReady = false;
    if (el.camera) el.camera.classList.add("camera-warming-up");

    const constraints = {
      audio: false,
      video: {
        facingMode: facingMode || state.facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    };

    try {
      log("Requesting camera with constraints:", constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      state.stream = stream;
      state.facingMode = facingMode || state.facingMode;

      el.camera.srcObject = stream;
      el.camera.setAttribute("playsinline", "true");
      el.camera.muted = true;

      // Mirror only the front camera, not the back one.
      el.camera.style.transform = state.facingMode === "user" ? "scaleX(-1)" : "scaleX(1)";

      try {
        await el.camera.play();
      } catch (playErr) {
        warn("video.play() rejected:", playErr);
      }

      const gotFrame = await waitForVideoReady(el.camera);
      if (!gotFrame) {
        warn("Video never reported real dimensions — proceeding anyway, but captures may be blank.");
      }

      // Let exposure/white-balance settle before anything is allowed
      // to capture from this stream.
      await new Promise((resolve) => trackedTimeout(resolve, EXPOSURE_SETTLE_MS));

      state.isCameraReady = true;
      if (el.camera) el.camera.classList.remove("camera-warming-up");

      log("Camera started and ready (exposure settled).");
      return true;
    } catch (err) {
      if (el.camera) el.camera.classList.remove("camera-warming-up");
      handleCameraError(err);
      return false;
    }
  }

  function handleCameraError(err) {
    let message = "Camera access unavailable.";
    if (err && err.name) {
      switch (err.name) {
        case "NotAllowedError":
        case "PermissionDeniedError":
          message = "Camera permission was denied. Please allow camera access and try again.";
          break;
        case "NotFoundError":
        case "DevicesNotFoundError":
          message = "No camera was found on this device.";
          break;
        case "NotReadableError":
        case "TrackStartError":
          message = "The camera is already in use by another application or tab.";
          break;
        case "OverconstrainedError":
          message = "Camera constraints could not be satisfied.";
          break;
        case "SecurityError":
          message = "Camera access requires a secure (https) connection.";
          break;
        default:
          message = `Camera access unavailable (${err.name}).`;
      }
    }
    showUserError(message);
    error("getUserMedia error:", err);
  }

  /* ------------------------------------------------------------
     5. START / CANCEL SESSION
  ------------------------------------------------------------ */
  async function handleStartSession(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    log("Start Session clicked.");

    if (!state.domReady) { warn("Clicked before DOM validated. Ignoring."); return; }
    if (state.isStarting) { warn("Already starting. Ignoring duplicate click."); return; }

    state.isStarting = true;
    if (el.startBtn) el.startBtn.disabled = true;

    // Read settings from the welcome screen before entering camera view.
    if (el.theme && el.theme.value) applyFrameColour(el.theme.value);
    if (el.layout && el.layout.value) state.currentLayout = el.layout.value;
    if (el.filter && el.filter.value) state.currentFilter = el.filter.value;
    if (el.template && el.template.value) state.currentTemplate = el.template.value;

    try {
      const started = await startCamera(state.facingMode);
      if (started) {
        state.isSessionActive = true;
        state.photos = [];
        resetProgress();
        showScreen("cameraScreen");
        beginCaptureSequence();
      } else {
        showScreen("welcomeScreen");
      }
    } catch (err) {
      error("Unexpected error in handleStartSession:", err);
      showUserError("Something went wrong starting the session. Please try again.");
      showScreen("welcomeScreen");
    } finally {
      state.isStarting = false;
      if (el.startBtn) el.startBtn.disabled = false;
    }
  }

  async function handleSwitchCamera(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    const nextMode = state.facingMode === "user" ? "environment" : "user";
    log(`Switch camera requested -> ${nextMode}`);
    await startCamera(nextMode);
  }

  function handleCancelSession(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    log("Cancel session requested.");
    clearAllTimers();
    state.isCapturing = false;
    stopCurrentStream();
    state.isSessionActive = false;
    resetProgress();

    if (state.retakingIndex !== null) {
      // Cancelling a single-photo retake should just drop back to the
      // preview screen with the original 4 photos intact, not wipe
      // the whole session.
      state.retakingIndex = null;
      showPreview();
      return;
    }
    showScreen("welcomeScreen");
  }

  function applyFrameColour(colourId) {
    state.currentFrameColour = FRAME_COLOURS[colourId] ? colourId : "cream";
    log(`Frame colour set: ${state.currentFrameColour} (applies to the printed strip only)`);
  }

  /* ------------------------------------------------------------
     6. CAPTURE SEQUENCE (countdown -> flash -> shutter -> 4 photos)
  ------------------------------------------------------------ */
  function resetProgress() {
    if (el.progressFill) el.progressFill.style.width = "0%";
    if (el.photoCounter) el.photoCounter.textContent = "0 / 4";
    if (el.countdown) {
      el.countdown.textContent = "";
      el.countdown.removeAttribute("data-warming");
    }
  }

  function updateProgress(count) {
    const pct = Math.min(100, (count / 4) * 100);
    if (el.progressFill) el.progressFill.style.width = pct + "%";
    if (el.photoCounter) el.photoCounter.textContent = `${count} / 4`;
  }

  function playShutterSound() {
    if (!el.shutter) return;
    try {
      el.shutter.currentTime = 0;
      const p = el.shutter.play();
      if (p && p.catch) p.catch((e) => warn("Shutter sound blocked:", e));
    } catch (e) {
      warn("Error playing shutter sound:", e);
    }
  }

  function triggerFlash() {
    if (!el.flash) return;
    el.flash.classList.remove("flash-active");
    // Force reflow so the animation can restart if triggered rapidly.
    void el.flash.offsetWidth;
    el.flash.classList.add("flash-active");
  }

  function runCountdown(seconds) {
    return new Promise((resolve) => {
      let remaining = seconds;
      if (el.countdown) el.countdown.textContent = String(remaining);

      const tick = () => {
        remaining -= 1;
        if (remaining > 0) {
          if (el.countdown) el.countdown.textContent = String(remaining);
          trackedTimeout(tick, 1000);
        } else {
          if (el.countdown) el.countdown.textContent = "";
          resolve();
        }
      };
      trackedTimeout(tick, 1000);
    });
  }

  // Shown briefly before the very first countdown if the camera
  // stream needs a moment longer to settle than expected.
  function showWarmingMessage() {
    if (!el.countdown) return;
    el.countdown.textContent = "Getting ready…";
    el.countdown.setAttribute("data-warming", "true");
  }

  function clearWarmingMessage() {
    if (!el.countdown) return;
    el.countdown.textContent = "";
    el.countdown.removeAttribute("data-warming");
  }

  function captureFrame() {
    if (!el.camera) return null;
    const video = el.camera;
    if (!video.videoWidth || !video.videoHeight) {
      warn("captureFrame called with a video that has no dimensions yet.");
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    // Match the mirrored preview when using the front camera so the
    // exported photo looks the same as what the user saw live.
    if (state.facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.92);
  }

  async function beginCaptureSequence() {
    if (state.isCapturing) {
      warn("Capture sequence already running.");
      return;
    }
    state.isCapturing = true;
    state.photos = [];
    resetProgress();

    try {
      // Belt-and-suspenders: startCamera() already waits for the
      // exposure settle delay, but if for any reason the camera still
      // isn't marked ready (e.g. a very slow device), wait here too
      // rather than shooting a guaranteed-bad first frame.
      if (!state.isCameraReady) {
        showWarmingMessage();
        let waited = 0;
        while (!state.isCameraReady && state.isSessionActive && waited < 4000) {
          await new Promise((resolve) => trackedTimeout(resolve, 150));
          waited += 150;
        }
        clearWarmingMessage();
      }

      for (let i = 1; i <= 4; i++) {
        if (!state.isSessionActive) break; // cancelled mid-sequence
        await runCountdown(3);
        if (!state.isSessionActive) break;

        triggerFlash();
        playShutterSound();

        const frame = captureFrame();
        if (frame) {
          state.photos.push(frame);
          updateProgress(state.photos.length);
        } else {
          warn(`Failed to capture frame ${i}`);
        }

        // brief pause after the flash before the next countdown starts
        await new Promise((resolve) => trackedTimeout(resolve, 500));
      }

      if (state.isSessionActive && state.photos.length === 4) {
        showPreview();
      } else if (state.isSessionActive) {
        showUserError("Couldn't capture all 4 photos. Please try again.");
        showScreen("welcomeScreen");
      }
    } finally {
      state.isCapturing = false;
    }
  }

  /* ------------------------------------------------------------
     7. PREVIEW -> PROCESSING -> COMPOSITE -> PRINTING -> RESULT
  ------------------------------------------------------------ */
  function showPreview() {
    stopCurrentStream();
    state.isSessionActive = false;

    const previewIds = ["preview1", "preview2", "preview3", "preview4"];
    previewIds.forEach((id, idx) => {
      const img = el[id];
      if (!img) return;
      img.style.animation = "none";
      void img.offsetWidth;
      img.style.animation = "";
      img.src = state.photos[idx] || "";
    });

    if (el.previewCaption) {
      el.previewCaption.textContent = "Nice shots! Tap ↻ on any photo to retake just that one.";
    }

    showScreen("previewScreen");
    // No auto-advance here on purpose: retaking a single photo needs
    // the preview screen to just sit still until the person taps
    // Continue (or one of the ↻ buttons).
  }

  // Runs one 3-2-1 countdown + flash + shutter + capture and resolves
  // with the resulting data URL (or null on failure). Shares all the
  // same building blocks as the main 4-shot sequence so a retaken
  // photo looks identical to the others.
  async function captureOnePhoto() {
    await runCountdown(3);
    if (!state.isSessionActive) return null;
    triggerFlash();
    playShutterSound();
    return captureFrame();
  }

  async function handleRetakeSinglePhoto(idx) {
    if (state.retakingIndex !== null) return; // already retaking one
    log(`Retaking photo ${idx + 1} only.`);
    state.retakingIndex = idx;

    const started = await startCamera(state.facingMode);
    if (!started) {
      state.retakingIndex = null;
      showScreen("previewScreen");
      return;
    }

    state.isSessionActive = true;
    if (el.photoCounter) el.photoCounter.textContent = `Retake photo ${idx + 1}`;
    if (el.progressFill) el.progressFill.style.width = "0%";
    showScreen("cameraScreen");

    const frame = await captureOnePhoto();
    state.isSessionActive = false;
    stopCurrentStream();
    state.retakingIndex = null;

    if (frame) {
      state.photos[idx] = frame;
      log(`Photo ${idx + 1} retaken.`);
    } else {
      warn(`Retake of photo ${idx + 1} failed; keeping original.`);
    }
    showPreview();
  }

  function handleContinueFromPreview(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    if (state.photos.length !== 4) {
      showUserError("Still missing a photo — please retake it first.");
      return;
    }
    showScreen("processingScreen");
    trackedTimeout(buildFinalImage, 1200);
  }

  // onComplete, if given, is called instead of goToPrinting() once the
  // composite is ready — used by the result-screen edit panel to
  // instantly refresh the strip in place without replaying the whole
  // printing animation.
  function buildFinalImage(onComplete) {
    const canvas = el.exportCanvas;
    if (!canvas) {
      showUserError("Could not build the final image (export canvas missing).");
      return;
    }
    const ctx = canvas.getContext("2d");
    const colours = FRAME_COLOURS[state.currentFrameColour] || FRAME_COLOURS.cream;
    const templateId = TEMPLATES[state.currentTemplate] ? state.currentTemplate : "classic";
    const filterCss = FILTERS[state.currentFilter] || FILTERS.normal;

    const border = 34;
    const gap = 12;
    const footerH = 96; // dedicated band for the watermark + centre motif

    // Cells use the SAME 3:4 aspect ratio as the live camera-frame
    // (see .camera-frame in style.css). Drawing into a box with a
    // different aspect than the raw capture is what stretched/
    // squished the photos before; matching it means every photo in
    // the strip looks exactly like what was framed on screen.
    const CELL_ASPECT = 3 / 4; // width / height

    let frameW, frameH, totalW, totalH, positions;

    if (state.currentLayout === "grid") {
      frameW = 300;
      frameH = frameW / CELL_ASPECT;
      totalW = border * 2 + frameW * 2 + gap;
      totalH = border * 2 + frameH * 2 + gap + footerH;
      positions = [
        { x: border, y: border },
        { x: border + frameW + gap, y: border },
        { x: border, y: border + frameH + gap },
        { x: border + frameW + gap, y: border + frameH + gap },
      ];
    } else {
      frameW = 400;
      frameH = frameW / CELL_ASPECT;
      totalW = border * 2 + frameW;
      totalH = border * 2 + frameH * 4 + gap * 3 + footerH;
      positions = [0, 1, 2, 3].map((i) => ({
        x: border,
        y: border + i * (frameH + gap),
      }));
    }

    canvas.width = totalW;
    canvas.height = totalH;

    // Background — colour chosen by the user for this strip only.
    ctx.fillStyle = colours.bg;
    ctx.fillRect(0, 0, totalW, totalH);

    let loaded = 0;
    const images = [];

    state.photos.forEach((dataUrl, idx) => {
      const img = new Image();
      img.onload = () => {
        images[idx] = img;
        loaded += 1;
        if (loaded === 4) drawComposite();
      };
      img.onerror = () => {
        error(`Failed to load captured photo ${idx} for compositing.`);
        loaded += 1;
        if (loaded === 4) drawComposite();
      };
      img.src = dataUrl;
    });

    function drawComposite() {
      positions.forEach((pos, idx) => {
        const img = images[idx];
        if (!img) return;
        ctx.save();
        ctx.beginPath();
        ctx.rect(pos.x, pos.y, frameW, frameH);
        ctx.clip();
        ctx.filter = filterCss;
        // object-fit:cover style crop — never distorts the photo.
        drawImageCover(ctx, img, pos.x, pos.y, frameW, frameH);
        ctx.restore();

        // thin frame around each cell, tinted to the chosen colour
        ctx.strokeStyle = colours.accent;
        ctx.lineWidth = 3;
        ctx.strokeRect(pos.x, pos.y, frameW, frameH);
      });

      drawTemplateDecorations();
      drawWatermark();
      state.finalImageDataUrl = canvas.toDataURL("image/png");
      log("Final composite image built.");
      if (typeof onComplete === "function") {
        onComplete();
      } else {
        goToPrinting();
      }
    }

    // Real vector artwork, not emoji: the perforation motif runs the
    // full height of the strip on every template (the brand's
    // signature, tying capture to output — see style.css intro
    // comment). Templates beyond "classic" add a deliberate cluster
    // of hand-drawn motifs at the four corners and centred above the
    // watermark, sized to be clearly visible rather than a tiny
    // 34px glyph lost in a 28px margin.
    function drawTemplateDecorations() {
      drawPerforationEdges(ctx, 0, 0, totalW, totalH, colours.accent);
      if (templateId === "classic") return;

      const motifScale = 15;
      const cornerInset = border / 2 + 4;
      const corners = [
        { x: cornerInset, y: cornerInset },
        { x: totalW - cornerInset, y: cornerInset },
        { x: cornerInset, y: totalH - footerH + cornerInset },
        { x: totalW - cornerInset, y: totalH - footerH + cornerInset },
      ];
      corners.forEach((c) => drawTemplateMotifAt(ctx, templateId, c.x, c.y, motifScale, colours));

      // A slightly larger centred motif above the watermark text —
      // the strip's one deliberate flourish, not scattered clutter.
      drawTemplateMotifAt(ctx, templateId, totalW / 2, totalH - footerH + 26, motifScale * 1.3, colours);
    }

    function drawWatermark() {
      ctx.save();
      ctx.fillStyle = colours.ink;
      ctx.font = "600 26px 'Songmyung', Georgia, serif";
      ctx.textAlign = "center";
      const y = templateId === "classic" ? totalH - footerH / 2 : totalH - footerH / 2 + 20;
      ctx.fillText("DIGITAL PHOTOBOOTH", totalW / 2, y);
      ctx.restore();
    }
  }

  function goToPrinting() {
    if (el.printPreview) {
      // restart the paper-feed CSS animation each time
      el.printPreview.style.animation = "none";
      void el.printPreview.offsetWidth;
      el.printPreview.style.animation = "";
      if (state.finalImageDataUrl) {
        el.printPreview.style.backgroundImage = `url(${state.finalImageDataUrl})`;
        el.printPreview.style.backgroundSize = "cover";
      }
    }
    if (el.printingStatus) el.printingStatus.textContent = "Printing your strip...";

    showScreen("printingScreen");

    trackedTimeout(() => {
      if (el.printingStatus) el.printingStatus.textContent = "Done!";
      trackedTimeout(showResult, 700);
    }, 2400);
  }

  function showResult() {
    if (el.resultImage && state.finalImageDataUrl) {
      el.resultImage.src = state.finalImageDataUrl;
    }
    if (el.resultCaption) el.resultCaption.textContent = "Digital Photobooth · Fresh Print";
    if (el.editPanel) el.editPanel.hidden = true;
    if (el.editToggleBtn) {
      el.editToggleBtn.textContent = "Edit strip";
      el.editToggleBtn.setAttribute("aria-expanded", "false");
    }
    buildResultEditPickers();
    showScreen("resultScreen");
  }

  // Re-styling controls on the result screen. These never touch the
  // camera — buildFinalImage() only reads from state.photos, so any
  // of colour/template/layout/filter can change after capture and
  // just re-composite the same 4 photos.
  function regenerateFinalImage() {
    buildFinalImage(() => {
      if (el.resultImage) el.resultImage.src = state.finalImageDataUrl;
    });
  }

  function buildResultEditPickers() {
    buildSwatchGroup(el.resultColourSwatches, FRAME_COLOUR_SWATCHES, state.currentFrameColour, (id) => {
      applyFrameColour(id);
      setSelectValue(el.theme, id);
      regenerateFinalImage();
    });

    buildSwatchGroup(
      el.resultTemplateSwatches,
      Object.keys(TEMPLATES).map((id) => ({ id, ...TEMPLATES[id] })),
      state.currentTemplate,
      (id) => {
        state.currentTemplate = id;
        setSelectValue(el.template, id);
        regenerateFinalImage();
      },
      (btn, opt) => {
        btn.innerHTML = `<span class="tile-icon">${opt.icon}</span><span class="tile-label">${opt.label}</span>`;
      }
    );

    buildSwatchGroup(
      el.resultLayoutSwatches,
      LAYOUT_OPTIONS,
      state.currentLayout,
      (id) => {
        state.currentLayout = id;
        setSelectValue(el.layout, id);
        regenerateFinalImage();
      },
      (btn, opt) => {
        btn.innerHTML = `<span class="tile-icon">${opt.icon}</span><span class="tile-label">${opt.label}</span>`;
      }
    );

    buildSwatchGroup(
      el.resultFilterSwatches,
      FILTER_OPTIONS,
      state.currentFilter,
      (id) => {
        state.currentFilter = id;
        setSelectValue(el.filter, id);
        regenerateFinalImage();
      },
      (btn, opt) => {
        btn.innerHTML = `<span class="tile-icon">${opt.icon}</span><span class="tile-label">${opt.label}</span>`;
      }
    );
  }

  function handleToggleEditPanel(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    if (!el.editPanel) return;
    const isHidden = el.editPanel.hidden;
    el.editPanel.hidden = !isHidden;
    if (el.editToggleBtn) {
      el.editToggleBtn.textContent = isHidden ? "Hide edit" : "Edit strip";
      el.editToggleBtn.setAttribute("aria-expanded", String(isHidden));
    }
  }

  /* ------------------------------------------------------------
     8. CONTROLS: download / retake / new session
  ------------------------------------------------------------ */
  function dataUrlToBlob(dataUrl) {
    const [header, base64] = dataUrl.split(",");
    const mimeMatch = header.match(/data:(.*?);base64/);
    const mime = mimeMatch ? mimeMatch[1] : "image/png";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function handleDownload(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    if (!state.finalImageDataUrl) {
      warn("No final image available to download.");
      return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `digital-photobooth-${stamp}.png`;

    // iOS Safari ignores <a download> for data/blob URLs, so on
    // devices that support the Web Share API with files, share the
    // image directly to the system share sheet ("Save Image" /
    // Photos) instead of relying on a silent, no-op click.
    try {
      const blob = dataUrlToBlob(state.finalImageDataUrl);
      const file = new File([blob], filename, { type: blob.type });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Digital Photobooth",
        });
        log("Shared via Web Share API.");
        return;
      }

      // Desktop / Android Chrome: normal anchor download works fine.
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
      log("Download triggered via blob URL.");
    } catch (err) {
      // User cancelling the share sheet also throws — don't treat
      // that as a real error.
      if (err && err.name === "AbortError") {
        log("Share sheet dismissed by user.");
        return;
      }
      error("Download failed, falling back to open-in-tab:", err);
      const tab = window.open(state.finalImageDataUrl, "_blank");
      if (!tab) {
        showUserError("Could not open the image. Long-press the photo above and choose Save Image.");
      } else {
        showUserError("Long-press the photo and choose Save Image to download it.");
      }
    }
  }

  async function handleRetake(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    log("Retake requested.");
    state.photos = [];
    state.finalImageDataUrl = null;
    resetProgress();
    const started = await startCamera(state.facingMode);
    if (started) {
      state.isSessionActive = true;
      showScreen("cameraScreen");
      beginCaptureSequence();
    } else {
      showScreen("welcomeScreen");
    }
  }

  function handleNewSession(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    log("New session requested.");
    clearAllTimers();
    state.photos = [];
    state.finalImageDataUrl = null;
    state.isSessionActive = false;
    state.isCapturing = false;
    stopCurrentStream();
    resetProgress();
    showScreen("welcomeScreen");
  }

  /* ------------------------------------------------------------
     9. KIOSK PICKER (visual swatches instead of native selects)
     Real photobooths let you tap a colour/template on a touchscreen
     rather than pick from a dropdown, so we render actual swatches
     and keep the underlying #theme/#layout/#filter/#template
     selects in sync (hidden) for compatibility with the rest of
     the app and anything reading their .value.
  ------------------------------------------------------------ */
  function setSelectValue(selectEl, value) {
    if (!selectEl) return;
    selectEl.value = value;
  }

  // Forces the 4 proxy selects to stay invisible regardless of CSS
  // state. Called at init, independent of whatever style.css does.
  function hardHideProxySelects() {
    [el.theme, el.layout, el.filter, el.template].forEach((node) => {
      if (!node) return;
      node.hidden = true;
      node.style.display = "none";
      node.setAttribute("aria-hidden", "true");
      node.setAttribute("tabindex", "-1");
    });
  }

  function buildSwatchGroup(container, options, initialId, onPick, renderTile) {
    if (!container) return;
    container.innerHTML = "";
    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = renderTile ? "tile-swatch" : "colour-swatch";
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", String(opt.id === initialId));
      btn.dataset.value = opt.id;
      if (renderTile) {
        renderTile(btn, opt);
      } else {
        btn.style.background = opt.hex;
        btn.setAttribute("aria-label", opt.id);
      }
      btn.addEventListener("click", () => {
        Array.from(container.children).forEach((child) => {
          child.setAttribute("aria-checked", String(child === btn));
        });
        onPick(opt.id);
      });
      container.appendChild(btn);
    });
  }

  function buildKioskPickers() {
    hardHideProxySelects();

    buildSwatchGroup(el.colourSwatches, FRAME_COLOUR_SWATCHES, state.currentFrameColour, (id) => {
      applyFrameColour(id);
      setSelectValue(el.theme, id);
    });

    buildSwatchGroup(
      el.templateSwatches,
      Object.keys(TEMPLATES).map((id) => ({ id, ...TEMPLATES[id] })),
      state.currentTemplate,
      (id) => {
        state.currentTemplate = id;
        setSelectValue(el.template, id);
        log(`Template set: ${id}`);
      },
      (btn, opt) => {
        btn.innerHTML = `<span class="tile-icon">${opt.icon}</span><span class="tile-label">${opt.label}</span>`;
      }
    );

    buildSwatchGroup(
      el.layoutSwatches,
      LAYOUT_OPTIONS,
      state.currentLayout,
      (id) => {
        state.currentLayout = id;
        setSelectValue(el.layout, id);
        log(`Layout set: ${id}`);
      },
      (btn, opt) => {
        btn.innerHTML = `<span class="tile-icon">${opt.icon}</span><span class="tile-label">${opt.label}</span>`;
      }
    );

    buildSwatchGroup(
      el.filterSwatches,
      FILTER_OPTIONS,
      state.currentFilter,
      (id) => {
        state.currentFilter = id;
        setSelectValue(el.filter, id);
        log(`Filter set: ${id}`);
      },
      (btn, opt) => {
        btn.innerHTML = `<span class="tile-icon">${opt.icon}</span><span class="tile-label">${opt.label}</span>`;
      }
    );
  }

  /* ------------------------------------------------------------
     10. EVENT WIRING
  ------------------------------------------------------------ */
  function safeAddListener(node, eventName, handler, label) {
    if (!node) { warn(`Skipped listener "${label}" — element not found.`); return; }
    node.addEventListener(eventName, (evt) => {
      try { handler(evt); } catch (err) { error(`Error in "${label}" handler:`, err); }
    });
    log(`Listener attached: ${label}`);
  }

  function wireCoreListeners() {
    safeAddListener(el.startBtn, "click", handleStartSession, "startBtn:click");
    safeAddListener(el.switchCamera, "click", handleSwitchCamera, "switchCamera:click");
    safeAddListener(el.cancelSession, "click", handleCancelSession, "cancelSession:click");
    safeAddListener(el.downloadBtn, "click", handleDownload, "downloadBtn:click");
    safeAddListener(el.retakeBtn, "click", handleRetake, "retakeBtn:click");
    safeAddListener(el.newSession, "click", handleNewSession, "newSession:click");
    safeAddListener(el.continueBtn, "click", handleContinueFromPreview, "continueBtn:click");
    safeAddListener(el.editToggleBtn, "click", handleToggleEditPanel, "editToggleBtn:click");

    // Delegated: the 4 .retake-one-btn elements live inside
    // .preview-grid and are static markup, so one listener on their
    // common container covers all of them.
    const previewGrid = document.querySelector(".preview-grid");
    safeAddListener(previewGrid, "click", (evt) => {
      const btn = evt.target.closest(".retake-one-btn");
      if (!btn) return;
      const idx = parseInt(btn.dataset.photoIndex, 10);
      if (Number.isInteger(idx)) handleRetakeSinglePhoto(idx);
    }, "previewGrid:retake-delegate");
  }

  function wireLifecycleCleanup() {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && state.isSessionActive) {
        log("Tab hidden — pausing camera stream to save resources.");
        clearAllTimers();
        stopCurrentStream();
        state.isSessionActive = false;
      }
    });
    window.addEventListener("beforeunload", () => { clearAllTimers(); stopCurrentStream(); });
    window.addEventListener("pagehide", () => { clearAllTimers(); stopCurrentStream(); });
  }

  /* ------------------------------------------------------------
     11. INIT
  ------------------------------------------------------------ */
  function init() {
    log("Initializing photobooth...");

    const result = validateDOM();
    state.domReady = result.ok;

    if (!result.ok) {
      showUserError(`Photobooth failed to initialize. Missing elements: ${result.missing.join(", ")}`);
    }

    wireCoreListeners();
    buildKioskPickers();
    wireLifecycleCleanup();

    applyFrameColour(state.currentFrameColour);
    if (el.layout && el.layout.value) state.currentLayout = el.layout.value;
    if (el.filter && el.filter.value) state.currentFilter = el.filter.value;
    if (el.template && el.template.value) state.currentTemplate = el.template.value;

    showScreen("welcomeScreen");
    log(`Photobooth init complete. Version ${APP_VERSION}.`);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.Photobooth = window.Photobooth || {};
  Object.assign(window.Photobooth, {
    el, state, log, warn, error,
    showUserError, showScreen, startCamera, stopCurrentStream, validateDOM,
    APP_VERSION,
  });
})();
