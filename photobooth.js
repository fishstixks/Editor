/* ============================================================
   DIGITAL PHOTOBOOTH
   photobooth.js — Version 2.0.4 Alpha
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
    "theme", "layout", "filter",
    "preview1", "preview2", "preview3", "preview4",
    "exportCanvas",
    "printPreview", "printingStatus",
    "resultImage",
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
    currentTheme: "noir",
    finalImageDataUrl: null,
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
    if (el.theme && el.theme.value) applyTheme(el.theme.value);
    if (el.layout && el.layout.value) state.currentLayout = el.layout.value;
    if (el.filter && el.filter.value) state.currentFilter = el.filter.value;

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

  function applyTheme(themeName) {
    state.currentTheme = themeName;
    document.body.setAttribute("data-theme", themeName);
    log(`Theme applied: ${themeName}`);
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

    // Background (paper-white strip look).
    ctx.fillStyle = "#f7f3ee";
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

        // thin frame around each cell
        ctx.strokeStyle = "rgba(13,11,20,0.15)";
        ctx.lineWidth = 2;
        ctx.strokeRect(pos.x, pos.y, frameW, frameH);
      });

      drawWatermark();
      state.finalImageDataUrl = canvas.toDataURL("image/png");
      log("Final composite image built.");
      goToPrinting();
    }

    function drawWatermark() {
      ctx.save();
      ctx.fillStyle = "rgba(13,11,20,0.55)";
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
    showScreen("resultScreen");
  }

  /* ------------------------------------------------------------
     8. CONTROLS: download / retake / new session
  ------------------------------------------------------------ */
  function handleDownload(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    if (!state.finalImageDataUrl) {
      warn("No final image available to download.");
      return;
    }
    try {
      const link = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.href = state.finalImageDataUrl;
      link.download = `digital-photobooth-${stamp}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      log("Download triggered.");
    } catch (err) {
      error("Download failed:", err);
      showUserError("Could not download the image. Long-press the photo to save it instead.");
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
     9. LIVE SETTINGS (theme / layout / filter change handlers)
  ------------------------------------------------------------ */
  function wireSettingsListeners() {
    safeAddListener(el.theme, "change", (e) => applyTheme(e.target.value), "theme:change");
    safeAddListener(
      el.layout,
      "change",
      (e) => { state.currentLayout = e.target.value; log(`Layout set: ${state.currentLayout}`); },
      "layout:change"
    );
    safeAddListener(
      el.filter,
      "change",
      (e) => { state.currentFilter = e.target.value; log(`Filter set: ${state.currentFilter}`); },
      "filter:change"
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
    wireSettingsListeners();
    wireLifecycleCleanup();

    if (el.theme && el.theme.value) applyTheme(el.theme.value);
    if (el.layout && el.layout.value) state.currentLayout = el.layout.value;
    if (el.filter && el.filter.value) state.currentFilter = el.filter.value;

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
