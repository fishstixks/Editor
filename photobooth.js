const canvas = document.getElementById('boothCanvas');
const ctx = canvas.getContext('2d');
const fileInput = document.getElementById('fileInput');
const cameraBtn = document.getElementById('cameraBtn');
const preview = document.getElementById('preview');
const qrArea = document.getElementById('qrArea');
const qrCode = document.getElementById('qrCode');

cameraBtn.onclick = () => fileInput.click();

fileInput.onchange = (e) => {
  const files = Array.from(e.target.files).slice(0, 4);
  processBooth(files);
};

function processBooth(files) {
  canvas.width = 600;
  canvas.height = 1800;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let loaded = 0;
  files.forEach((file, i) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      ctx.drawImage(img, 50, 50 + (i * 420), 500, 400);
      loaded++;
      if (loaded === files.length) finalizeBooth();
    };
  });
}

function finalizeBooth() {
  const data = canvas.toDataURL('image/png');
  preview.innerHTML = `<img src="${data}" class="w-full">`;
  preview.classList.remove('hidden');
  
  // Show Download
  const dl = document.getElementById('downloadBtn');
  dl.classList.remove('hidden');
  dl.onclick = () => {
    const a = document.createElement('a');
    a.href = data;
    a.download = 'booth-photo.png';
    a.click();
  };

  // Generate QR (using a public encoding API for the data URL)
  qrArea.classList.remove('hidden');
  const encodedData = encodeURIComponent(data);
  qrCode.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodedData}`;
}
