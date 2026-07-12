const canvas = document.getElementById('boothCanvas');
const ctx = canvas.getContext('2d');
const fileInput = document.getElementById('fileInput');
const cameraBtn = document.getElementById('cameraBtn');
const preview = document.getElementById('preview');

cameraBtn.onclick = () => fileInput.click();

fileInput.onchange = (e) => {
  const files = Array.from(e.target.files).slice(0, 4); // Limit to 4 for the booth
  processBooth(files);
};

function processBooth(files) {
  const layout = document.getElementById('layout').value;
  canvas.width = 600;
  canvas.height = 1800; // Standard strip size
  
  ctx.fillStyle = '#ffffff'; // White paper background
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  files.forEach((file, i) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      // Logic for layout (Simplified for Strip)
      const x = 50;
      const y = 50 + (i * 420);
      ctx.drawImage(img, x, y, 500, 400);
      
      if (i === files.length - 1) {
        const data = canvas.toDataURL('image/png');
        preview.innerHTML = `<img src="${data}" class="w-full">`;
        preview.classList.remove('hidden');
        document.getElementById('downloadBtn').classList.remove('hidden');
        document.getElementById('downloadBtn').onclick = () => {
          const a = document.createElement('a');
          a.href = data;
          a.download = 'booth-photo.png';
          a.click();
        };
      }
    };
  });
}
