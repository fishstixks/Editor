const mediaInput = document.getElementById('mediaInput');
const fileCount = document.getElementById('fileCount');
const templateSelect = document.getElementById('templateSelect');
const generateBtn = document.getElementById('generateBtn');
const outputSection = document.getElementById('outputSection');
const loadingBar = document.getElementById('loadingBar');
const progressBar = document.getElementById('progressBar');
const resultContainer = document.getElementById('resultContainer');
const outputVideo = document.getElementById('outputVideo');
const downloadBtn = document.getElementById('downloadBtn');
const canvas = document.getElementById('processingCanvas');
const ctx = canvas.getContext('2d');

let loadedElements = [];
let animationFrameId;

mediaInput.addEventListener('change', () => {
  const count = mediaInput.files.length;
  if (count > 0) {
    fileCount.textContent = `${count} item${count > 1 ? 's' : ''} staged for auto-cut`;
    fileCount.classList.remove('hidden');
  } else {
    fileCount.classList.add('hidden');
  }
});

generateBtn.addEventListener('click', async () => {
  const files = mediaInput.files;
  if (!files || files.length === 0) return alert('Upload photos or videos to begin.');

  generateBtn.disabled = true;
  outputSection.classList.remove('hidden');
  loadingBar.classList.remove('hidden');
  resultContainer.classList.add('hidden');
  progressBar.style.width = '0%';

  loadedElements = [];
  
  // Unpack and build localized device elements asynchronously
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video');

    await new Promise((resolve) => {
      if (isVideo) {
        const video = document.createElement('video');
        video.src = url;
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.onloadeddata = () => {
          loadedElements.push({ element: video, type: 'video', w: video.videoWidth, h: video.videoHeight });
          resolve();
        };
        video.load();
      } else {
        const img = new Image();
        img.src = url;
        img.onload = () => {
          loadedElements.push({ element: img, type: 'image', w: img.width, h: img.height });
          resolve();
        };
      }
    });
  }

  processPipeline();
});

function processPipeline() {
  // 9:16 Smartphone aspect ratio framing
  canvas.width = 720;
  canvas.height = 1280;

  const durationPerClip = 2000; // 2 seconds allocated per uploaded item
  const totalDuration = loadedElements.length * durationPerClip;
  const fps = 30;
  const totalFrames = (totalDuration / 1000) * fps;
  let currentFrame = 0;

  const stream = canvas.captureStream(fps);
  let options = { mimeType: 'video/mp4' };
  if (!MediaRecorder.isTypeSupported(options.mimeType)) {
    options = { mimeType: 'video/webm' };
  }

  const mediaRecorder = new MediaRecorder(stream, options);
  const chunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/mp4' });
    const finalUrl = URL.createObjectURL(blob);
    outputVideo.src = finalUrl;
    downloadBtn.href = finalUrl;
    
    loadingBar.classList.add('hidden');
    resultContainer.classList.remove('hidden');
    generateBtn.disabled = false;
  };

  mediaRecorder.start();

  function renderLoop() {
    if (currentFrame >= totalFrames) {
      cancelAnimationFrame(animationFrameId);
      mediaRecorder.stop();
      loadedElements.forEach(item => { if (item.type === 'video') item.element.pause(); });
      return;
    }

    const globalProgress = currentFrame / totalFrames;
    progressBar.style.width = `${Math.floor(globalProgress * 100)}%`;

    const currentTimeMs = (currentFrame / fps) * 1000;
    const activeIndex = Math.floor(currentTimeMs / durationPerClip);
    const currentClip = loadedElements[activeIndex >= loadedElements.length ? loadedElements.length - 1 : activeIndex];
    const clipProgress = (currentTimeMs % durationPerClip) / durationPerClip;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (currentClip.type === 'video' && currentClip.element.paused) {
      currentClip.element.play().catch(() => {});
    }

    // Call out to our external template library in effects.js
    const chosenStyle = templateSelect.value;
    const fx = window.VideoTemplates[chosenStyle](ctx, canvas, clipProgress, currentFrame, fps);

    // Dynamic framing and spatial adjustments
    const scaleFactor = Math.max(canvas.width / currentClip.w, canvas.height / currentClip.h) * fx.scale;
    const rW = currentClip.w * scaleFactor;
    const rH = currentClip.h * scaleFactor;
    const rX = ((canvas.width - rW) / 2) + fx.shakeX;
    const rY = ((canvas.height - rH) / 2) + fx.shakeY;

    ctx.drawImage(currentClip.element, rX, rY, rW, rH);

    // Apply color grading and overlays returned by the template
    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${fx.flash * 0.45})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (fx.flash < 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.abs(fx.flash)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (fx.customFilter === 'warm') {
      ctx.globalCompositeOperation = 'color';
      ctx.fillStyle = 'rgba(234, 179, 8, 0.07)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    } else if (fx.customFilter === 'rgbSplit') {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(244, 63, 94, 0.25)'; // Magenta component shift
      ctx.fillRect(6, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(6, 182, 212, 0.25)';  // Cyan component shift
      ctx.fillRect(-6, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    }

    currentFrame++;
    animationFrameId = requestAnimationFrame(renderLoop);
  }

  renderLoop();
}
