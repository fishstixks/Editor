/*
==================================================
DIGITAL PHOTOBOOTH
Version 2.0.2 Alpha
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


const printPreview = document.getElementById("printPreview");
const printingStatus = document.getElementById("printingStatus");


const resultImage = document.getElementById("resultImage");


const downloadBtn = document.getElementById("downloadBtn");
const retakeBtn = document.getElementById("retakeBtn");
const newSessionBtn = document.getElementById("newSession");


const exportCanvas = document.getElementById("exportCanvas");


// ==================================================
// APPLICATION STATE
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


// Camera resolution target
const CAMERA_WIDTH = 1280;
const CAMERA_HEIGHT = 1920;


// ==================================================
// SCREEN TRANSITION SYSTEM
// ==================================================

function showScreen(screen){

    const screens = [
        welcomeScreen,
        cameraScreen,
        previewScreen,
        processingScreen,
        printingScreen,
        resultScreen
    ];


    screens.forEach(item => {

        if(item){

            item.classList.remove("active");

        }

    });


    if(screen){

        setTimeout(()=>{

            screen.classList.add("active");

        },50);

    }

}


// ==================================================
// THEME SYSTEM
// ==================================================

themeSelector.addEventListener(
    "change",
    ()=>{

        selectedTheme = themeSelector.value;

        document.body.className =
        "theme-" + selectedTheme;

    }
);


// ==================================================
// SETTINGS UPDATE
// ==================================================

layoutSelector.addEventListener(
    "change",
    ()=>{

        selectedLayout = layoutSelector.value;

    }
);


filterSelector.addEventListener(
    "change",
    ()=>{

        selectedFilter = filterSelector.value;

    }
);


// ==================================================
// CAMERA START
// ==================================================

async function startCamera(){

    stopCamera();


    try{

        currentStream =
        await navigator.mediaDevices.getUserMedia({

            video:{

                facingMode:facingMode,

                width:{
                    ideal:CAMERA_WIDTH
                },

                height:{
                    ideal:CAMERA_HEIGHT
                }

            },

            audio:false

        });


        camera.srcObject = currentStream;


        await camera.play();


    }
    catch(error){

        console.error(
            "Camera error:",
            error
        );


        alert(
            "Unable to access camera. Please allow camera permissions."
        );

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
// CAMERA SWITCH
// ==================================================

switchCameraBtn.addEventListener(
    "click",
    async()=>{


        facingMode =
        facingMode === "user"
        ? "environment"
        : "user";


        await startCamera();


    }
);


// ==================================================
// CANCEL SESSION
// ==================================================

cancelSessionBtn.addEventListener(
    "click",
    ()=>{


        stopCamera();


        sessionActive = false;

        capturedPhotos = [];

        photoIndex = 0;


        showScreen(
            welcomeScreen
        );


    }
);


// ==================================================
// START SESSION
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

        photoIndex = 0;

        sessionActive = true;


        progressFill.style.width =
        "0%";


        photoCounter.textContent =
        "Photo 1 / 4";


        showScreen(
            cameraScreen
        );


        await startCamera();


        beginPhotoSequence();


    }
);
/*
==================================================
DIGITAL PHOTOBOOTH
Version 2.0.2 Alpha
PART 2 / 4
==================================================
*/


// ==================================================
// PHOTO SEQUENCE CONTROLLER
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

        photoCounter.textContent =
        `Photo ${photoIndex + 1} / 4`;


        await runCountdown();


        if(!sessionActive){
            return;
        }


        capturePhoto();


        updateProgress();


        await wait(1200);

    }


    await finishCaptureSequence();

}



// ==================================================
// COUNTDOWN SYSTEM
// ==================================================

function runCountdown(){

    return new Promise(resolve=>{


        let count = 3;


        countdownDisplay.textContent =
        count;


        const timer =
        setInterval(()=>{


            count--;


            if(count > 0){

                countdownDisplay.textContent =
                count;

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
// PHOTO CAPTURE
// ==================================================

function capturePhoto(){


    const canvas =
    document.createElement("canvas");


    const context =
    canvas.getContext("2d");


    canvas.width =
    camera.videoWidth;


    canvas.height =
    camera.videoHeight;



    context.save();



    /*
    Mirror front camera
    */

    if(facingMode === "user"){

        context.translate(
            canvas.width,
            0
        );

        context.scale(
            -1,
            1
        );

    }



    context.drawImage(
        camera,
        0,
        0,
        canvas.width,
        canvas.height
    );


    context.restore();



    applyCanvasFilter(
        context,
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


}



// ==================================================
// FILTER ENGINE
// ==================================================

function applyCanvasFilter(
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


    const data =
    imageData.data;



    for(
        let i = 0;
        i < data.length;
        i += 4
    ){


        let r =
        data[i];


        let g =
        data[i+1];


        let b =
        data[i+2];



        if(selectedFilter === "bw"){


            const gray =
            (r + g + b) / 3;


            data[i] =
            gray;


            data[i+1] =
            gray;


            data[i+2] =
            gray;


        }



        else if(selectedFilter === "warm"){


            data[i] =
            Math.min(
                255,
                r + 25
            );


            data[i+1] =
            Math.min(
                255,
                g + 10
            );


            data[i+2] =
            Math.max(
                0,
                b - 15
            );


        }



        else if(selectedFilter === "cool"){


            data[i] =
            Math.max(
                0,
                r - 15
            );


            data[i+1] =
            g + 5;


            data[i+2] =
            Math.min(
                255,
                b + 25
            );


        }



        else if(selectedFilter === "vintage"){


            data[i] =
            r * 0.9 + 30;


            data[i+1] =
            g * 0.85 + 25;


            data[i+2] =
            b * 0.7 + 10;


        }


    }



    ctx.putImageData(
        imageData,
        0,
        0
    );


}



// ==================================================
// FLASH EFFECT
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
// SHUTTER SOUND
// ==================================================

function playShutter(){


    if(shutter){


        shutter.currentTime =
        0;


        shutter.play()
        .catch(()=>{});


    }


}



// ==================================================
// PROGRESS BAR
// ==================================================

function updateProgress(){


    const progress =
    (
        capturedPhotos.length / 4
    ) * 100;



    progressFill.style.width =
    progress + "%";


}



// ==================================================
// WAIT HELPER
// ==================================================

function wait(ms){


    return new Promise(
        resolve =>
        setTimeout(
            resolve,
            ms
        )
    );


}



// ==================================================
// AFTER 4 PHOTOS
// ==================================================

async function finishCaptureSequence(){


    stopCamera();



    loadPreview();



    showScreen(
        previewScreen
    );



    await wait(2000);



    showScreen(
        processingScreen
    );



    await wait(1500);



    createFinalExport();


}
/*
==================================================
DIGITAL PHOTOBOOTH
Version 2.0.2 Alpha
PART 3 / 4
==================================================
*/


// ==================================================
// CONTACT SHEET PREVIEW
// ==================================================

function loadPreview(){


    previewImages.forEach(
        (img,index)=>{


            if(capturedPhotos[index]){

                img.src =
                capturedPhotos[index];

            }


        }
    );


}



// ==================================================
// EXPORT ENGINE
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



    const width =
    selectedLayout === "strip"
    ? 900
    : 1200;



    const height =
    selectedLayout === "strip"
    ? 2600
    : 1200;



    canvas.width =
    width;


    canvas.height =
    height;



    drawBackground(
        ctx,
        width,
        height
    );



    if(selectedLayout === "strip"){


        drawStrip(
            ctx,
            images,
            width,
            height
        );


    }
    else{


        drawGrid(
            ctx,
            images,
            width,
            height
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
// CANVAS BACKGROUND
// ==================================================

function drawBackground(
    ctx,
    width,
    height
){


    let color =
    "#ffffff";



    const themeColors = {

        classic:"#ffffff",

        black:"#111111",

        pink:"#fff1f5",

        blue:"#e0f2fe",

        mint:"#ecfdf5",

        cream:"#fffaf0"

    };



    color =
    themeColors[selectedTheme]
    ||
    color;



    ctx.fillStyle =
    color;


    ctx.fillRect(
        0,
        0,
        width,
        height
    );


}



// ==================================================
// STRIP EXPORT
// ==================================================

function drawStrip(
    ctx,
    images,
    width,
    height
){


    const padding =
    80;


    const photoWidth =
    width - (padding * 2);



    const photoHeight =
    480;



    images.forEach(
        (img,index)=>{


            const y =
            padding +
            (
                index *
                (
                    photoHeight +
                    70
                )
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

function drawGrid(
    ctx,
    images,
    width,
    height
){


    const padding =
    80;


    const gap =
    40;


    const size =
    (
        width -
        (padding * 2) -
        gap
    ) / 2;



    images.forEach(
        (img,index)=>{


            const column =
            index % 2;


            const row =
            Math.floor(index / 2);



            const x =
            padding +
            (
                column *
                (
                    size +
                    gap
                )
            );



            const y =
            padding +
            (
                row *
                (
                    size +
                    gap
                )
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
// IMAGE COVER DRAWING
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



    const newWidth =
    img.width * ratio;


    const newHeight =
    img.height * ratio;



    const offsetX =
    (
        width -
        newWidth
    ) / 2;



    const offsetY =
    (
        height -
        newHeight
    ) / 2;



    ctx.save();


    ctx.beginPath();


    ctx.roundRect(
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
        newWidth,
        newHeight
    );


    ctx.restore();


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
    "bold 42px Arial";


    ctx.fillStyle =
    "rgba(0,0,0,0.35)";



    ctx.textAlign =
    "center";



    ctx.fillText(
        "DIGITAL PHOTOBOOTH",
        width / 2,
        height - 45
    );



    ctx.restore();


}



// ==================================================
// LOAD IMAGE HELPER
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
Version 2.0.2 Alpha
PART 4 / 4
==================================================
*/


// ==================================================
// PRINTER PREPARATION
// ==================================================

function preparePrinter(){


    printPreview.src =
    finalImage;



    showScreen(
        printingScreen
    );


    printingStatus.textContent =
    "Printing...";



    setTimeout(()=>{


        printingStatus.textContent =
        "Almost ready...";


    },1500);



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
// DOWNLOAD IMAGE
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
        "digital-photobooth.jpg";



        document.body.appendChild(
            link
        );


        link.click();



        document.body.removeChild(
            link
        );


    }
);



// ==================================================
// RETAKE SESSION
// ==================================================

retakeBtn.addEventListener(
    "click",
    async()=>{


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



        await startCamera();



        beginPhotoSequence();


    }
);



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


    }
);



// ==================================================
// SESSION RESET
// ==================================================

function resetSession(){


    stopCamera();



    capturedPhotos = [];

    finalImage = null;

    photoIndex = 0;


    sessionActive = false;



    previewImages.forEach(
        img=>{

            img.src = "";

        }
    );



    resultImage.src = "";

    printPreview.src = "";



    progressFill.style.width =
    "0%";



    countdownDisplay.textContent =
    "";



    photoCounter.textContent =
    "Photo 1 / 4";


}



// ==================================================
// SAFARI PAGE CLEANUP
// ==================================================

window.addEventListener(
    "pagehide",
    ()=>{


        stopCamera();


    }
);



// ==================================================
// PREVENT MEMORY LEAKS
// ==================================================

window.addEventListener(
    "beforeunload",
    ()=>{


        stopCamera();


    }
);



// ==================================================
// INITIAL STATE
// ==================================================

document.addEventListener(
    "DOMContentLoaded",
    ()=>{


        document.body.className =
        "theme-classic";


        showScreen(
            welcomeScreen
        );


    }
);
