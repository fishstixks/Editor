/*
==================================================
DIGITAL PHOTOBOOTH
Version 2.0.3 Alpha
PART 1 / 4
==================================================
*/


// ==================================================
// DOM ELEMENTS
// ==================================================

const welcomeScreen = document.getElementById("welcomeScreen");
const cameraScreen = document.getElementById("cameraScreen");
const previewScreen = document.getElementById("previewScreen");
const processingScreen = document.getElementById("processingScreen");
const printingScreen = document.getElementById("printingScreen");
const resultScreen = document.getElementById("resultScreen");


const startBtn = document.getElementById("startBtn");

const camera = document.getElementById("camera");

const switchCameraBtn = document.getElementById("switchCamera");
const cancelSessionBtn = document.getElementById("cancelSession");


const countdownDisplay = document.getElementById("countdown");
const photoCounter = document.getElementById("photoCounter");
const progressFill = document.getElementById("progressFill");


const flash = document.getElementById("flash");
const shutter = document.getElementById("shutter");


const themeSelector = document.getElementById("theme");
const layoutSelector = document.getElementById("layout");
const filterSelector = document.getElementById("filter");


const previewImages = [
    document.getElementById("preview1"),
    document.getElementById("preview2"),
    document.getElementById("preview3"),
    document.getElementById("preview4")
];


const exportCanvas =
document.getElementById("exportCanvas");


const printPreview =
document.getElementById("printPreview");


const printingStatus =
document.getElementById("printingStatus");


const resultImage =
document.getElementById("resultImage");


const downloadBtn =
document.getElementById("downloadBtn");


const retakeBtn =
document.getElementById("retakeBtn");


const newSessionBtn =
document.getElementById("newSession");



// ==================================================
// STATE
// ==================================================

let currentStream = null;

let facingMode = "user";

let capturedPhotos = [];

let finalImage = null;

let photoIndex = 0;

let sessionActive = false;


let selectedTheme = "classic";

let selectedLayout = "strip";

let selectedFilter = "none";



let captureLock = false;



const CAMERA_WIDTH = 1280;

const CAMERA_HEIGHT = 1920;



// ==================================================
// SCREEN CONTROL
// ==================================================

function showScreen(target){


    const screens = [

        welcomeScreen,
        cameraScreen,
        previewScreen,
        processingScreen,
        printingScreen,
        resultScreen

    ];


    screens.forEach(screen=>{

        if(screen){

            screen.classList.remove("active");

        }

    });


    if(target){

        requestAnimationFrame(()=>{

            target.classList.add("active");

        });

    }

}



// ==================================================
// SETTINGS
// ==================================================

themeSelector.addEventListener(
"change",
()=>{


    selectedTheme =
    themeSelector.value;


    document.body.className =
    "theme-" + selectedTheme;


});


layoutSelector.addEventListener(
"change",
()=>{

    selectedLayout =
    layoutSelector.value;

});


filterSelector.addEventListener(
"change",
()=>{

    selectedFilter =
    filterSelector.value;

});



// ==================================================
// CAMERA START
// ==================================================

async function startCamera(){


    stopCamera();



    if(!navigator.mediaDevices ||
       !navigator.mediaDevices.getUserMedia){


        alert(
        "Camera is not supported on this browser."
        );


        return false;

    }



    try{


        currentStream =
        await navigator.mediaDevices.getUserMedia({

            video:{

                facingMode:{
                    ideal:facingMode
                },

                width:{
                    ideal:CAMERA_WIDTH
                },

                height:{
                    ideal:CAMERA_HEIGHT
                }

            },

            audio:false

        });



        camera.srcObject =
        currentStream;



        await camera.play();



        return true;


    }
    catch(error){


        console.error(
        "Camera error:",
        error
        );


        alert(
        "Please allow camera access to use the photobooth."
        );


        return false;


    }


}



// ==================================================
// CAMERA CLEANUP
// ==================================================

function stopCamera(){


    if(currentStream){


        currentStream
        .getTracks()
        .forEach(track=>{

            track.stop();

        });


        currentStream = null;


    }



    camera.srcObject = null;


}



// ==================================================
// SWITCH CAMERA
// ==================================================

switchCameraBtn.addEventListener(
"click",
async()=>{


    facingMode =
    facingMode === "user"
    ? "environment"
    : "user";


    await startCamera();


});



// ==================================================
// START BUTTON FIX
// ==================================================

startBtn.addEventListener(
"click",
async()=>{


    selectedTheme =
    themeSelector.value;


    selectedLayout =
    layoutSelector.value;


    selectedFilter =
    filterSelector.value;



    document.body.className =
    "theme-" + selectedTheme;



    capturedPhotos = [];

    finalImage = null;

    photoIndex = 0;

    sessionActive = true;



    progressFill.style.width =
    "0%";


    photoCounter.textContent =
    "Photo 1 / 4";



    showScreen(
        cameraScreen
    );



    const started =
    await startCamera();



    if(started){


        beginPhotoSequence();


    }
    else{


        showScreen(
        welcomeScreen
        );


    }


});



// ==================================================
// CANCEL
// ==================================================

cancelSessionBtn.addEventListener(
"click",
()=>{


    sessionActive = false;


    stopCamera();


    resetSession();


    showScreen(
    welcomeScreen
    );


});
/*
==================================================
DIGITAL PHOTOBOOTH
Version 2.0.3 Alpha
PART 2 / 4
==================================================
*/


// ==================================================
// PHOTO SEQUENCE
// ==================================================

async function beginPhotoSequence(){


    if(!sessionActive){
        return;
    }



    for(
        photoIndex = 0;
        photoIndex < 4;
        photoIndex++
    ){


        if(!sessionActive){
            return;
        }



        photoCounter.textContent =
        `Photo ${photoIndex + 1} / 4`;



        await countdown();



        if(!sessionActive){
            return;
        }



        await capturePhoto();



        updateProgress();



        await wait(1200);


    }



    finishCapture();


}



// ==================================================
// COUNTDOWN
// ==================================================

function countdown(){


    return new Promise(resolve=>{


        let number = 3;



        countdownDisplay.textContent =
        number;



        const timer =
        setInterval(()=>{


            number--;



            if(number > 0){


                countdownDisplay.textContent =
                number;


            }
            else{


                clearInterval(timer);


                countdownDisplay.textContent =
                "";


                resolve();


            }


        },1000);



    });


}



// ==================================================
// CAPTURE PHOTO
// ==================================================

async function capturePhoto(){


    if(captureLock){
        return;
    }


    captureLock = true;



    const canvas =
    document.createElement("canvas");



    const width =
    camera.videoWidth;


    const height =
    camera.videoHeight;



    canvas.width =
    width;


    canvas.height =
    height;



    const ctx =
    canvas.getContext(
        "2d",
        {
            willReadFrequently:true
        }
    );



    ctx.save();



    // Front camera mirror correction

    if(facingMode === "user"){


        ctx.translate(
            width,
            0
        );


        ctx.scale(
            -1,
            1
        );


    }



    ctx.drawImage(
        camera,
        0,
        0,
        width,
        height
    );



    ctx.restore();



    applyFilter(
        ctx,
        canvas
    );



    const image =
    canvas.toDataURL(
        "image/jpeg",
        0.95
    );



    capturedPhotos.push(
        image
    );



    triggerFlash();


    playShutter();



    captureLock = false;


}



// ==================================================
// FILTER SYSTEM
// ==================================================

function applyFilter(
    ctx,
    canvas
){


    if(selectedFilter === "none"){
        return;
    }



    const imageData =
    ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
    );



    const pixels =
    imageData.data;



    for(
        let i = 0;
        i < pixels.length;
        i += 4
    ){


        let r =
        pixels[i];


        let g =
        pixels[i+1];


        let b =
        pixels[i+2];



        switch(selectedFilter){



            case "bw":


                let gray =
                (r + g + b) / 3;


                pixels[i] =
                gray;


                pixels[i+1] =
                gray;


                pixels[i+2] =
                gray;


            break;



            case "warm":


                pixels[i] =
                Math.min(
                    255,
                    r + 25
                );


                pixels[i+1] =
                Math.min(
                    255,
                    g + 12
                );


                pixels[i+2] =
                Math.max(
                    0,
                    b - 20
                );


            break;



            case "cool":


                pixels[i] =
                Math.max(
                    0,
                    r - 15
                );


                pixels[i+1] =
                g;


                pixels[i+2] =
                Math.min(
                    255,
                    b + 25
                );


            break;



            case "vintage":


                pixels[i] =
                Math.min(
                    255,
                    r * 0.9 + 35
                );


                pixels[i+1] =
                Math.min(
                    255,
                    g * 0.85 + 25
                );


                pixels[i+2] =
                Math.min(
                    255,
                    b * 0.7 + 10
                );


            break;


        }


    }



    ctx.putImageData(
        imageData,
        0,
        0
    );


}



// ==================================================
// FLASH
// ==================================================

function triggerFlash(){


    flash.classList.remove(
        "active"
    );


    void flash.offsetWidth;


    flash.classList.add(
        "active"
    );


}



// ==================================================
// SHUTTER
// ==================================================

function playShutter(){


    if(!shutter){
        return;
    }



    shutter.currentTime = 0;



    shutter.play()
    .catch(()=>{});


}



// ==================================================
// PROGRESS
// ==================================================

function updateProgress(){


    const value =
    (
        capturedPhotos.length / 4
    ) * 100;



    progressFill.style.width =
    value + "%";


}



// ==================================================
// COMPLETE CAPTURE
// ==================================================

async function finishCapture(){


    stopCamera();



    loadPreview();



    showScreen(
        previewScreen
    );



    await wait(2000);



    showScreen(
        processingScreen
    );



    await wait(1200);



    createFinalExport();


}



// ==================================================
// PREVIEW
// ==================================================

function loadPreview(){


    previewImages.forEach(
        (image,index)=>{


            image.src =
            capturedPhotos[index]
            ||
            "";


        }
    );


}



// ==================================================
// WAIT
// ==================================================

function wait(ms){


    return new Promise(
        resolve=>
        setTimeout(
            resolve,
            ms
        )
    );


}
/*
==================================================
DIGITAL PHOTOBOOTH
Version 2.0.3 Alpha
PART 3 / 4
==================================================
*/


// ==================================================
// EXPORT CREATION
// ==================================================

async function createFinalExport(){


    const images =
    await Promise.all(

        capturedPhotos.map(
            src=>loadImage(src)
        )

    );



    const canvas =
    exportCanvas;


    const ctx =
    canvas.getContext("2d");



    let width;
    let height;



    if(selectedLayout === "strip"){


        width = 900;

        height = 2800;


    }
    else{


        width = 1400;

        height = 1400;


    }



    canvas.width =
    width;


    canvas.height =
    height;



    drawCanvasBackground(
        ctx,
        width,
        height
    );



    if(selectedLayout === "strip"){


        drawPhotoStrip(
            ctx,
            images,
            width
        );


    }
    else{


        drawPhotoGrid(
            ctx,
            images,
            width
        );


    }



    drawWatermark(
        ctx,
        width,
        height
    );



    finalImage =
    canvas.toDataURL(
        "image/jpeg",
        0.95
    );



    preparePrinter();


}



// ==================================================
// BACKGROUND THEMES
// ==================================================

function drawCanvasBackground(
    ctx,
    width,
    height
){


    const backgrounds = {


        classic:"#ffffff",

        black:"#111111",

        pink:"#fff1f5",

        blue:"#e0f2fe",

        mint:"#ecfdf5",

        cream:"#fffaf0"


    };



    ctx.fillStyle =
    backgrounds[selectedTheme]
    ||
    "#ffffff";



    ctx.fillRect(
        0,
        0,
        width,
        height
    );


}



// ==================================================
// PHOTO STRIP
// ==================================================

function drawPhotoStrip(
    ctx,
    images,
    width
){


    const padding = 80;


    const photoWidth =
    width - padding * 2;


    const photoHeight = 560;



    images.forEach(
        (img,index)=>{


            const y =
            padding +
            index *
            (
                photoHeight + 70
            );



            drawImageCover(
                ctx,
                img,
                padding,
                y,
                photoWidth,
                photoHeight
            );


        }
    );


}



// ==================================================
// GRID EXPORT
// ==================================================

function drawPhotoGrid(
    ctx,
    images,
    width
){


    const padding = 80;

    const gap = 40;


    const size =
    (
        width -
        padding * 2 -
        gap
    ) / 2;



    images.forEach(
        (img,index)=>{


            const column =
            index % 2;


            const row =
            Math.floor(
                index / 2
            );



            const x =
            padding +
            column *
            (
                size + gap
            );


            const y =
            padding +
            row *
            (
                size + gap
            );



            drawImageCover(
                ctx,
                img,
                x,
                y,
                size,
                size
            );


        }
    );


}



// ==================================================
// SAFARI SAFE IMAGE DRAW
// ==================================================

function drawImageCover(
    ctx,
    img,
    x,
    y,
    width,
    height
){


    const ratio =
    Math.max(
        width / img.width,
        height / img.height
    );



    const renderWidth =
    img.width *
    ratio;


    const renderHeight =
    img.height *
    ratio;



    const offsetX =
    (
        width -
        renderWidth
    ) / 2;



    const offsetY =
    (
        height -
        renderHeight
    ) / 2;



    ctx.save();



    roundedRectangle(
        ctx,
        x,
        y,
        width,
        height,
        24
    );



    ctx.clip();



    ctx.drawImage(
        img,
        x + offsetX,
        y + offsetY,
        renderWidth,
        renderHeight
    );



    ctx.restore();


}



// ==================================================
// ROUNDED RECTANGLE FIX
// ==================================================

function roundedRectangle(
    ctx,
    x,
    y,
    width,
    height,
    radius
){


    ctx.beginPath();



    ctx.moveTo(
        x + radius,
        y
    );


    ctx.lineTo(
        x + width - radius,
        y
    );


    ctx.quadraticCurveTo(
        x + width,
        y,
        x + width,
        y + radius
    );


    ctx.lineTo(
        x + width,
        y + height - radius
    );


    ctx.quadraticCurveTo(
        x + width,
        y + height,
        x + width - radius,
        y + height
    );


    ctx.lineTo(
        x + radius,
        y + height
    );


    ctx.quadraticCurveTo(
        x,
        y + height,
        x,
        y + height - radius
    );


    ctx.lineTo(
        x,
        y + radius
    );


    ctx.quadraticCurveTo(
        x,
        y,
        x + radius,
        y
    );


    ctx.closePath();


}



// ==================================================
// WATERMARK
// ==================================================

function drawWatermark(
    ctx,
    width,
    height
){


    ctx.save();



    ctx.font =
    "bold 44px Arial";



    ctx.textAlign =
    "center";



    ctx.fillStyle =
    "rgba(0,0,0,0.35)";



    ctx.fillText(
        "DIGITAL PHOTOBOOTH",
        width / 2,
        height - 45
    );



    ctx.restore();


}



// ==================================================
// IMAGE LOADER
// ==================================================

function loadImage(src){


    return new Promise(
        resolve=>{


            const img =
            new Image();



            img.onload =
            ()=>resolve(img);



            img.src =
            src;


        }
    );


}
/*
==================================================
DIGITAL PHOTOBOOTH
Version 2.0.3 Alpha
PART 4 / 4
==================================================
*/


// ==================================================
// PRINTER ANIMATION
// ==================================================

function preparePrinter(){


    if(!finalImage){
        return;
    }



    printPreview.src =
    finalImage;



    showScreen(
        printingScreen
    );



    printingStatus.textContent =
    "Printing...";



    setTimeout(()=>{


        printingStatus.textContent =
        "Developing photo...";


    },1200);



    setTimeout(()=>{


        printingStatus.textContent =
        "Complete!";


    },2400);



    setTimeout(()=>{


        showResult();


    },3200);


}



// ==================================================
// RESULT SCREEN
// ==================================================

function showResult(){


    resultImage.src =
    finalImage;



    showScreen(
        resultScreen
    );


}



// ==================================================
// DOWNLOAD
// ==================================================

downloadBtn.addEventListener(
"click",
()=>{


    if(!finalImage){
        return;
    }



    const link =
    document.createElement(
        "a"
    );



    link.href =
    finalImage;



    link.download =
    "digital-photobooth-photo.jpg";



    document.body.appendChild(
        link
    );



    link.click();



    link.remove();


});



// ==================================================
// RETAKE
// ==================================================

retakeBtn.addEventListener(
"click",
async()=>{


    stopCamera();



    capturedPhotos = [];

    finalImage = null;

    photoIndex = 0;



    progressFill.style.width =
    "0%";



    photoCounter.textContent =
    "Photo 1 / 4";



    sessionActive = true;



    showScreen(
        cameraScreen
    );



    const started =
    await startCamera();



    if(started){


        beginPhotoSequence();


    }



});



// ==================================================
// NEW SESSION
// ==================================================

newSessionBtn.addEventListener(
"click",
()=>{


    resetSession();



    showScreen(
        welcomeScreen
    );


});



// ==================================================
// RESET
// ==================================================

function resetSession(){


    stopCamera();



    capturedPhotos = [];

    finalImage = null;

    photoIndex = 0;



    sessionActive = false;



    captureLock = false;



    previewImages.forEach(
        image=>{


            image.src =
            "";


        }
    );



    resultImage.src =
    "";



    printPreview.src =
    "";



    countdownDisplay.textContent =
    "";



    progressFill.style.width =
    "0%";



    photoCounter.textContent =
    "Photo 1 / 4";


}



// ==================================================
// CLEANUP
// ==================================================

window.addEventListener(
"pagehide",
()=>{


    stopCamera();


});



window.addEventListener(
"beforeunload",
()=>{


    stopCamera();


});



// ==================================================
// INITIAL LOAD
// ==================================================

showScreen(
    welcomeScreen
);
