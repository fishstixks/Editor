const welcome = document.getElementById('welcomeScreen');
const booth = document.getElementById('boothScreen');
const fileInput = document.getElementById('fileInput');
const startBtn = document.getElementById('startBtn');
const canvas = document.createElement('canvas'); // Off-screen canvas
const ctx = canvas.getContext('2d');

startBtn.onclick = () => {
  welcome.classList.add('hidden');
  booth.classList.remove('hidden');
  fileInput.click();
};

fileInput.onchange = (e) => {
  const files = Array.from(e.target.files).slice(0, 4);
  document.getElementById('status').innerText = "Processing...";
  renderBooth(files);
};

function renderBooth(files) {
  canvas.width = 600;
  canvas.height = 1800;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let loaded = 0;
  files.forEach((file, i) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      // Corrected Y-offset logic for all 4 photos
      ctx.drawImage(img, 50, 50 + (i * 420), 500, 400);
      loaded++;
      if (loaded === files.length) triggerPrint();
    };
  });
}

function triggerPrint() {
  document.getElementById('status').innerText = "Finalizing...";
  document.getElementById('printAnim').classList.remove('hidden');
  
  setTimeout(() => {
    document.getElementById('printAnim').classList.add('hidden');
    const data = canvas.toDataURL('image/png');
    
    // UI Updates
    document.getElementById('preview').innerHTML = `<img src="${data}" class="w-full">`;
    document.getElementById('preview').classList.remove('hidden');
    document.getElementById('downloadBtn').classList.remove('hidden');
    
    // QR Code
    document.getElementById('qrArea').classList.remove('hidden');
    document.getElementById('qrCode').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data)}`;
    
    document.getElementById('downloadBtn').onclick = () => {
      const a = document.createElement('a');
      a.href = data;
      a.download = 'booth-photo.png';
      a.click();
    };
  }, 2000); // 2-second printing animation
}
