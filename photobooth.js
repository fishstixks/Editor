/* ===========================================================
   DIGITAL PHOTOBOOTH
   PART 1 / 3
=========================================================== */

// ---------- ELEMENTS ----------

const welcomeScreen = document.getElementById("welcomeScreen");
const boothScreen = document.getElementById("boothScreen");

const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");

const fileInput = document.getElementById("fileInput");

const status = document.getElementById("status");

const countdown = document.getElementById("countdown");

const flashOverlay = document.getElementById("flashOverlay");

const previewArea = document.getElementById("previewArea");
const previewImage = document.getElementById("previewImage");

const printingArea = document.getElementById("printingArea");
const printingImage = document.getElementById("printingImage");

const downloadBtn = document.getElementById("downloadBtn");

const qrArea = document.getElementById("qrArea");
const qrCode = document.getElementById("qrCode");

const layoutSelect = document.getElementById("layoutSelect");


// ---------- OFFSCREEN CANVAS ----------

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");


// ---------- VARIABLES ----------

let selectedLayout = "strip";

let imageFiles = [];

let loadedImages = [];

let finalImage = "";


// ==========================================================
// START SESSION
// ==========================================================

startBtn.addEventListener("click", () => {

    selectedLayout = layoutSelect.value;

    welcomeScreen.classList.add("hidden");

    boothScreen.classList.remove("hidden");

    resetBooth();

    fileInput.click();

});


// ==========================================================
// FILE PICKER
// ==========================================================

fileInput.addEventListener("change", async (event) => {

    imageFiles = Array.from(event.target.files);

    if (imageFiles.length !== 4) {

        alert("Please select exactly 4 photos.");

        fileInput.value = "";

        status.innerText = "Waiting...";

        return;

    }

    status.innerText = "Preparing Session...";

    await startCountdown();

    await loadImages();

    renderLayout();

});


// ==========================================================
// COUNTDOWN
// ==========================================================

async function startCountdown() {

    countdown.classList.remove("hidden");

    for (let i = 3; i >= 1; i--) {

        countdown.innerText = i;

        status.innerText = "Get Ready";

        await sleep(1000);

    }

    countdown.innerText = "📸";

    flash();

    await sleep(500);

    countdown.classList.add("hidden");

}


// ==========================================================
// FLASH EFFECT
// ==========================================================

function flash() {

    flashOverlay.classList.add("flash");

    setTimeout(() => {

        flashOverlay.classList.remove("flash");

    },350);

}


// ==========================================================
// LOAD ALL IMAGES
// ==========================================================

async function loadImages(){

    loadedImages=[];

    status.innerText="Loading Photos...";

    const promises=imageFiles.map(file=>{

        return new Promise((resolve,reject)=>{

            const img=new Image();

            img.onload=()=>resolve(img);

            img.onerror=reject;

            img.src=URL.createObjectURL(file);

        });

    });

    loadedImages=await Promise.all(promises);

}


// ==========================================================
// RESET BOOTH
// ==========================================================

function resetBooth(){

    status.innerText="Waiting...";

    previewArea.classList.add("hidden");

    printingArea.classList.add("hidden");

    qrArea.classList.add("hidden");

    downloadBtn.classList.add("hidden");

    restartBtn.classList.add("hidden");

    countdown.classList.add("hidden");

    fileInput.value="";

    imageFiles=[];

    loadedImages=[];

    finalImage="";

}


// ==========================================================
// SLEEP
// ==========================================================

function sleep(ms){

    return new Promise(resolve=>{

        setTimeout(resolve,ms);

    });

}


// ==========================================================
// FIT IMAGE
// ==========================================================

function drawCover(img,x,y,w,h){

    const scale=Math.max(

        w/img.width,

        h/img.height

    );

    const nw=img.width*scale;

    const nh=img.height*scale;

    const nx=x+(w-nw)/2;

    const ny=y+(h-nh)/2;

    ctx.drawImage(

        img,

        nx,

        ny,

        nw,

        nh

    );

}


// ==========================================================
// PART 2 CONTINUES BELOW
// ==========================================================
// ==========================================================
// RENDER PHOTO LAYOUT
// ==========================================================

function renderLayout(){

    status.innerText="Creating Photo Strip...";

    if(selectedLayout==="strip"){

        drawStrip();

    }else{

        drawGrid();

    }

}


// ==========================================================
// 4 PHOTO STRIP
// ==========================================================

function drawStrip(){

    canvas.width=700;
    canvas.height=2200;

    ctx.fillStyle="#ffffff";
    ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.fillStyle="#000000";
    ctx.font="bold 42px Arial";
    ctx.textAlign="center";
    ctx.fillText("DIGITAL PHOTOBOOTH",350,70);

    const margin=50;
    const photoWidth=600;
    const photoHeight=420;
    const gap=40;

    for(let i=0;i<4;i++){

        const y=120+i*(photoHeight+gap);

        ctx.fillStyle="#f8f8f8";
        ctx.fillRect(
            margin-5,
            y-5,
            photoWidth+10,
            photoHeight+10
        );

        drawCover(
            loadedImages[i],
            margin,
            y,
            photoWidth,
            photoHeight
        );

    }

    ctx.fillStyle="#000";
    ctx.font="26px Arial";

    const today=new Date();

    ctx.fillText(
        today.toLocaleDateString(),
        350,
        2140
    );

    finishRender();

}



// ==========================================================
// 2 x 2 GRID
// ==========================================================

function drawGrid(){

    canvas.width=1200;
    canvas.height=1200;

    ctx.fillStyle="#ffffff";
    ctx.fillRect(0,0,1200,1200);

    const padding=50;

    const size=500;

    drawCover(
        loadedImages[0],
        padding,
        padding,
        size,
        size
    );

    drawCover(
        loadedImages[1],
        650,
        padding,
        size,
        size
    );

    drawCover(
        loadedImages[2],
        padding,
        650,
        size,
        size
    );

    drawCover(
        loadedImages[3],
        650,
        650,
        size,
        size
    );

    ctx.strokeStyle="#ffffff";
    ctx.lineWidth=20;

    ctx.strokeRect(
        40,
        40,
        1120,
        1120
    );

    finishRender();

}



// ==========================================================
// FINALIZE IMAGE
// ==========================================================

function finishRender(){

    status.innerText="Finalizing...";

    finalImage=canvas.toDataURL(
        "image/png",
        1
    );

    startPrintingAnimation();

}



// ==========================================================
// PRINTING ANIMATION
// ==========================================================

async function startPrintingAnimation(){

    previewArea.classList.add("hidden");

    qrArea.classList.add("hidden");

    downloadBtn.classList.add("hidden");

    restartBtn.classList.add("hidden");

    printingArea.classList.remove("hidden");

    printingImage.src=finalImage;

    await sleep(300);

    printingImage.classList.add("printing");

    status.innerText="Printing...";

    await sleep(3300);

    printingImage.classList.remove("printing");

    showFinishedPhoto();

}



// ==========================================================
// PART 3 CONTINUES BELOW
// ==========================================================
// ==========================================================
// SHOW FINISHED PHOTO
// ==========================================================

function showFinishedPhoto(){

    printingArea.classList.add("hidden");

    previewArea.classList.remove("hidden");

    previewImage.src=finalImage;

    status.innerText="Your photo is ready!";

    generateQRCode();

    downloadBtn.classList.remove("hidden");

    restartBtn.classList.remove("hidden");

}



// ==========================================================
// QR CODE
// ==========================================================

function generateQRCode(){

    qrArea.classList.remove("hidden");

    qrCode.src =
        "https://api.qrserver.com/v1/create-qr-code/?" +
        "size=180x180&data=" +
        encodeURIComponent(finalImage);

}



// ==========================================================
// DOWNLOAD BUTTON
// ==========================================================

downloadBtn.addEventListener("click",()=>{

    const link=document.createElement("a");

    link.href=finalImage;

    link.download="DigitalPhotobooth.png";

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

});



// ==========================================================
// RESTART SESSION
// ==========================================================

restartBtn.addEventListener("click",()=>{

    welcomeScreen.classList.remove("hidden");

    boothScreen.classList.add("hidden");

    resetBooth();

});



// ==========================================================
// CLEAN OBJECT URLS
// ==========================================================

function cleanupImages(){

    imageFiles.forEach(file=>{

        try{

            URL.revokeObjectURL(file);

        }catch(e){}

    });

}



// ==========================================================
// KEYBOARD SHORTCUTS
// ==========================================================

document.addEventListener("keydown",(e)=>{

    if(e.key==="Escape"){

        welcomeScreen.classList.remove("hidden");

        boothScreen.classList.add("hidden");

        resetBooth();

    }

});



// ==========================================================
// OPTIONAL WATERMARK
// ==========================================================

function addWatermark(){

    ctx.save();

    ctx.globalAlpha=0.08;

    ctx.fillStyle="#000";

    ctx.font="bold 48px Arial";

    ctx.textAlign="center";

    ctx.translate(canvas.width/2,canvas.height/2);

    ctx.rotate(-0.5);

    ctx.fillText(

        "DIGITAL PHOTOBOOTH",

        0,

        0

    );

    ctx.restore();

}



// ==========================================================
// IMPROVED STRIP FINISH
// ==========================================================

const originalFinishRender=finishRender;

finishRender=function(){

    addWatermark();

    finalImage=canvas.toDataURL(

        "image/png",

        1

    );

    startPrintingAnimation();

};



// ==========================================================
// PREVENT IMAGE DRAGGING
// ==========================================================

document.addEventListener("dragstart",(e)=>{

    e.preventDefault();

});



// ==========================================================
// DISABLE DOUBLE TAP ZOOM
// ==========================================================

let lastTouchEnd=0;

document.addEventListener("touchend",(event)=>{

    const now=(new Date()).getTime();

    if(now-lastTouchEnd<=300){

        event.preventDefault();

    }

    lastTouchEnd=now;

},{passive:false});



// ==========================================================
// INITIAL STATUS
// ==========================================================

status.innerText="Waiting...";

welcomeScreen.classList.remove("hidden");

boothScreen.classList.add("hidden");



// ==========================================================
// END OF PHOTOBOOTH.JS
// ==========================================================
