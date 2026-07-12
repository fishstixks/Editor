// Version 2: Isolated template library for editing and adding visual styles
window.VideoTemplates = {
  beatDrop: (ctx, canvas, clipProgress, currentFrame, fps) => {
    let scale = 1.0;
    let flash = 0;

    if (clipProgress < 0.2) {
      scale = 1.3 - (clipProgress * 1.5); // Fast scale pop down
      flash = (0.2 - clipProgress) * 5;   // High exposure white burst
    } else {
      scale = 1.0 + (clipProgress * 0.05); // Subtle continuous push
    }

    return { scale, shakeX: 0, shakeY: 0, flash, customFilter: null };
  },

  vlogFade: (ctx, canvas, clipProgress, currentFrame, fps) => {
    // Smooth, slow cinematic pulling zoom
    let scale = 1.12 - (clipProgress * 0.12);
    let flash = 0;

    // Simulate dark frame-edge vignette grading dynamically at clip boundaries
    if (clipProgress > 0.85) {
      flash = -(1.0 - ((1.0 - clipProgress) / 0.15)) * 0.4;
    }

    return { scale, shakeX: 0, shakeY: 0, flash, customFilter: 'warm' };
  },

  cyberGlitch: (ctx, canvas, clipProgress, currentFrame, fps) => {
    let scale = 1.03 + Math.sin(clipProgress * Math.PI * 2) * 0.02;
    let shakeX = 0;
    let shakeY = 0;

    // Trigger tracking displacement errors at the breakdown margins
    if (clipProgress < 0.12 || clipProgress > 0.88) {
      shakeX = (Math.random() - 0.5) * 30;
      shakeY = (Math.random() - 0.5) * 15;
    }

    return { scale, shakeX, shakeY, flash: 0, customFilter: 'rgbSplit' };
  }
};
