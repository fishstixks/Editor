/* ============================================================
   DIGITAL PHOTOBOOTH
   photobooth.js — Version 2.0.6 Alpha
   Full build (Parts 1-4 combined)
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

  log("photobooth.js v2.0.4 Alpha loading...");

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
    "exportCanvas",
    "printPreview", "printingStatus",
    "resultImage", "qrToggleBtn", "qrContainer",
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
    photos: [],              // raw captured frames (data URLs, unfiltered)
    currentFilter: "normal",
    currentLayout: "strip",
    currentFrameColour: "cream",
    currentTemplate: "classic",
    finalImageDataUrl: null,
    showingQr: false,
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

  // Template designs — decorations drawn on top of the composite.
  // Emoji glyphs render natively via canvas fillText on iOS/Android,
  // so no image assets are needed.
  const TEMPLATES = {
    classic: { label: "Classic", icon: "—", glyphs: [] },
    blossom: { label: "Blossom", icon: "🌸", glyphs: ["🌸", "🌷", "🌸"] },
    stars: { label: "Stars", icon: "✨", glyphs: ["✨", "⭐", "✨"] },
    hearts: { label: "Hearts", icon: "💕", glyphs: ["💕", "💗", "💕"] },
    confetti: { label: "Confetti", icon: "🎉", glyphs: ["🎉", "🎊", "✨"] },
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
  }

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

      log("Camera started successfully.");
      return true;
    } catch (err) {
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
    if (el.countdown) el.countdown.textContent = "";
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

  function captureFrame() {
    if (!el.camera) return null;
    const video = el.camera;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
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
        await new Promise((resolve) => trackedTimeout(resolve, 2000)); // wait 2s after 4th photo
        showPreview();
      }
    } catch (err) {
      error("Error during capture sequence:", err);
      showUserError("Something went wrong during capture. Please try again.");
      showScreen("welcomeScreen");
    } finally {
      state.isCapturing = false;
    }
  }

  /* ------------------------------------------------------------
     7. PREVIEW -> PROCESSING -> PRINTING -> RESULT
  ------------------------------------------------------------ */
  function showPreview() {
    const previewEls = [el.preview1, el.preview2, el.preview3, el.preview4];
    previewEls.forEach((imgEl, idx) => {
      if (!imgEl) return;
      imgEl.style.filter = FILTERS[state.currentFilter] || "none";
      imgEl.src = state.photos[idx] || "";
      imgEl.style.animationDelay = `${idx * 90}ms`;
    });

    stopCurrentStream(); // done shooting, release camera to avoid memory/battery drain
    showScreen("previewScreen");

    trackedTimeout(() => {
      showScreen("processingScreen");
      trackedTimeout(() => {
        buildFinalImage();
      }, 1400);
    }, 1200);
  }

  /**
   * Composites the 4 captured photos onto the hidden export canvas,
   * applying the selected filter, layout (strip or grid), and a
   * watermark. Produces state.finalImageDataUrl.
   */
  function buildFinalImage() {
    if (!el.exportCanvas) {
      showUserError("Export canvas not found. Cannot build final image.");
      return;
    }
    if (state.photos.length < 4) {
      showUserError("Not enough photos captured to build the final image.");
      showScreen("welcomeScreen");
      return;
    }

    const canvas = el.exportCanvas;
    const ctx = canvas.getContext("2d");
    const filterCss = FILTERS[state.currentFilter] || "none";
    const colours = FRAME_COLOURS[state.currentFrameColour] || FRAME_COLOURS.cream;
    const template = TEMPLATES[state.currentTemplate] || TEMPLATES.classic;

    const frameW = 900; // export resolution per photo cell (high-res)
    const frameH = 675;
    const gap = 24;
    const border = 40;

    let totalW, totalH, positions;

    if (state.currentLayout === "grid") {
      totalW = frameW * 2 + gap + border * 2;
      totalH = frameH * 2 + gap + border * 2;
      positions = [
        { x: border, y: border },
        { x: border + frameW + gap, y: border },
        { x: border, y: border + frameH + gap },
        { x: border + frameW + gap, y: border + frameH + gap },
      ];
    } else {
      // strip: 4 stacked vertically
      totalW = frameW + border * 2;
      totalH = (frameH + gap) * 4 - gap + border * 2 + 90; // extra bottom space for label
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
        ctx.filter = filterCss;
        ctx.drawImage(img, pos.x, pos.y, frameW, frameH);
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
      goToPrinting();
    }

    // Scatters the template's glyphs (flowers, stars, hearts, confetti)
    // along the outer border of the strip, like stickers on a real
    // printed photobooth strip. "Classic" has no glyphs, so it's a no-op.
    function drawTemplateDecorations() {
      if (!template.glyphs || template.glyphs.length === 0) return;

      ctx.save();
      ctx.font = "34px serif"; // system emoji font renders regardless of family
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const marginY = border / 2 + 4;
      const spots = [];

      // top border and bottom border, spaced evenly
      const count = state.currentLayout === "grid" ? 5 : 4;
      for (let i = 0; i < count; i++) {
        const x = (totalW / (count + 1)) * (i + 1);
        spots.push({ x, y: marginY });
        spots.push({ x, y: totalH - marginY - (state.currentLayout === "strip" ? 60 : 0) });
      }

      spots.forEach((spot, i) => {
        const glyph = template.glyphs[i % template.glyphs.length];
        ctx.fillText(glyph, spot.x, spot.y);
      });

      ctx.restore();
    }

    function drawWatermark() {
      ctx.save();
      ctx.fillStyle = colours.ink;
      ctx.font = "600 28px 'Songmyung', Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText("DIGITAL PHOTOBOOTH", totalW / 2, totalH - border / 2 - (state.currentLayout === "strip" ? 40 : 0));
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
    state.showingQr = false;
    if (el.qrContainer) { el.qrContainer.hidden = true; el.qrContainer.innerHTML = ""; }
    if (el.resultImage) el.resultImage.hidden = false;
    if (el.qrToggleBtn) el.qrToggleBtn.textContent = "View as QR code";
    if (el.resultCaption) el.resultCaption.textContent = "Digital Photobooth · Fresh Print";
    showScreen("resultScreen");
  }

  /**
   * Builds a small, heavily compressed thumbnail small enough to fit
   * inside a QR code's data capacity (QR codes can hold a few KB at
   * most — nowhere near enough for the full-resolution strip). This
   * is a genuine technical ceiling: without a server to host the
   * image and put a real link in the QR code, the code can only
   * carry the image itself, so it's offered as a quick low-res
   * "preview elsewhere" option, not a replacement for Download.
   */
  function buildQrThumbnail(sourceDataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let width = 260;
        let quality = 0.5;
        const attempt = () => {
          const canvas = document.createElement("canvas");
          const scale = width / img.width;
          canvas.width = width;
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const out = canvas.toDataURL("image/jpeg", quality);

          if (out.length < 2200 || (width <= 90 && quality <= 0.25)) {
            resolve(out);
            return;
          }
          // Still too big for a QR code — shrink further and retry.
          if (quality > 0.25) {
            quality -= 0.1;
          } else {
            width = Math.max(90, width - 40);
          }
          attempt();
        };
        attempt();
      };
      img.onerror = () => reject(new Error("Could not load image for QR thumbnail."));
      img.src = sourceDataUrl;
    });
  }

  async function handleToggleQr(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    if (!state.finalImageDataUrl) return;

    if (state.showingQr) {
      // switch back to the photo view
      state.showingQr = false;
      if (el.resultImage) el.resultImage.hidden = false;
      if (el.qrContainer) el.qrContainer.hidden = true;
      if (el.qrToggleBtn) el.qrToggleBtn.textContent = "View as QR code";
      if (el.resultCaption) el.resultCaption.textContent = "Digital Photobooth · Fresh Print";
      return;
    }

    if (!window.QRCode) {
      showUserError("QR code library did not load. Check your connection and try again.");
      return;
    }

    try {
      if (el.qrToggleBtn) el.qrToggleBtn.disabled = true;
      const thumbDataUrl = await buildQrThumbnail(state.finalImageDataUrl);

      if (el.qrContainer) {
        el.qrContainer.innerHTML = "";
        // eslint-disable-next-line no-new
        new window.QRCode(el.qrContainer, {
          text: thumbDataUrl,
          width: 180,
          height: 180,
          correctLevel: window.QRCode.CorrectLevel.L,
        });
        el.qrContainer.hidden = false;
      }
      if (el.resultImage) el.resultImage.hidden = true;
      state.showingQr = true;
      if (el.qrToggleBtn) el.qrToggleBtn.textContent = "View photo strip";
      if (el.resultCaption) {
        el.resultCaption.textContent = "Low-res scan preview — use Download for full quality";
      }
      log("QR thumbnail generated, length:", thumbDataUrl.length);
    } catch (err) {
      error("Failed to build QR code:", err);
      showUserError("Couldn't generate a QR code for this photo.");
    } finally {
      if (el.qrToggleBtn) el.qrToggleBtn.disabled = false;
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
    safeAddListener(el.qrToggleBtn, "click", handleToggleQr, "qrToggleBtn:click");
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
    log("Photobooth init complete.");
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
  });
})();
