function renderDetectionOverlay() {
  const bounds = videoSurface.getBoundingClientRect();
  overlayContext.clearRect(0, 0, bounds.width, bounds.height);

  const result = detectionState.lastResult;
  const contentRect = getVideoContentRect();

  if (!result || !contentRect) {
    return;
  }

  if (showMask.checked && result.maskCanvas) {
    overlayContext.save();
    overlayContext.globalAlpha = 0.42;
    overlayContext.imageSmoothingEnabled = false;
    overlayContext.drawImage(
      result.maskCanvas,
      contentRect.left,
      contentRect.top,
      contentRect.width,
      contentRect.height,
    );
    overlayContext.restore();
  }

  overlayContext.save();
  overlayContext.strokeStyle = "#7cf6ff";
  overlayContext.fillStyle = "#7cf6ff";
  overlayContext.lineWidth = 2;
  overlayContext.font = "600 11px ui-sans-serif, system-ui, sans-serif";
  overlayContext.textBaseline = "top";

  result.detections.forEach((detection, index) => {
    const left = contentRect.left + ((detection.x - detection.width / 2) / result.sourceWidth) * contentRect.width;
    const top = contentRect.top + ((detection.y - detection.height / 2) / result.sourceHeight) * contentRect.height;
    const width = (detection.width / result.sourceWidth) * contentRect.width;
    const height = (detection.height / result.sourceHeight) * contentRect.height;
    const centerX = left + width / 2;
    const centerY = top + height / 2;

    overlayContext.strokeRect(left, top, width, height);
    overlayContext.beginPath();
    overlayContext.moveTo(centerX - 6, centerY);
    overlayContext.lineTo(centerX + 6, centerY);
    overlayContext.moveTo(centerX, centerY - 6);
    overlayContext.lineTo(centerX, centerY + 6);
    overlayContext.stroke();

    const label = `${index + 1} ${Math.round(detection.score * 100)}% ${detection.methods.join("+")}`;
    const labelWidth = overlayContext.measureText(label).width + 10;
    const labelTop = Math.max(contentRect.top, top - 20);
    const labelLeft = Math.min(
      Math.max(contentRect.left, left),
      contentRect.left + contentRect.width - labelWidth,
    );
    overlayContext.fillStyle = "rgba(5, 12, 16, 0.84)";
    overlayContext.fillRect(labelLeft, labelTop, labelWidth, 18);
    overlayContext.fillStyle = "#bdfbff";
    overlayContext.fillText(label, labelLeft + 5, labelTop + 3);
  });

  overlayContext.restore();
}

function publishDetections(result) {
  const detail = {
    source: mediaState.source,
    mediaTime: Number.isFinite(mediaView.currentTime) ? mediaView.currentTime : 0,
    detections: detectionState.detections.map((detection) => ({ ...detection, methods: [...detection.methods] })),
    sourceWidth: result?.sourceWidth ?? mediaView.videoWidth ?? 0,
    sourceHeight: result?.sourceHeight ?? mediaView.videoHeight ?? 0,
  };

  window.dispatchEvent(new CustomEvent("shitjuggler:detections", { detail }));
}

async function processDetectionFrame({ pausedFrame = false } = {}) {
  if (
    detectionState.processing ||
    mediaState.source === "none" ||
    mediaView.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    !mediaView.videoWidth ||
    !mediaView.videoHeight
  ) {
    return;
  }

  detectionState.processing = true;

  try {
    const result = detector.detect(mediaView, readDetectionSettings());

    if (!result) {
      return;
    }

    detectionState.lastResult = result;
    detectionState.detections = result.detections;
    updateDetectionCount(result.detections.length);
    renderDetectionOverlay();
    publishDetections(result);

    const resolution = `${result.sourceWidth}×${result.sourceHeight} → ${result.processingWidth}×${result.processingHeight}`;
    const missingBackground = backgroundMethod.checked && !result.backgroundAvailable;
    const title = pausedFrame ? "Current frame analyzed" : "Detection active";
    const detail = missingBackground
      ? `${resolution} · ${result.processingTimeMs.toFixed(1)} ms. Capture a background reference to use that method.`
      : `${resolution} · ${result.processingTimeMs.toFixed(1)} ms · ${result.enabledMethods.join(", ") || "no methods enabled"}.`;
    updateDetectionStatus(title, detail, pausedFrame ? "Paused frame" : "Processing");
  } catch (error) {
    clearCurrentDetections();
    updateDetectionStatus(
      "Detection error",
      error instanceof Error ? error.message : "The current frame could not be processed.",
      "Error",
    );
  } finally {
    detectionState.processing = false;
  }
}

function shouldProcessContinuously() {
  if (mediaState.source === "camera") {
    return !mediaView.paused && !mediaView.ended;
  }

  if (mediaState.source === "upload") {
    return !mediaView.paused && !mediaView.ended;
  }

  return false;
}

function stopDetectionLoop() {
  detectionState.loopGeneration += 1;

  if (
    detectionState.frameCallbackId !== null &&
    typeof mediaView.cancelVideoFrameCallback === "function"
  ) {
    mediaView.cancelVideoFrameCallback(detectionState.frameCallbackId);
  }

  if (detectionState.animationFrameId !== null) {
    cancelAnimationFrame(detectionState.animationFrameId);
  }

  detectionState.frameCallbackId = null;
  detectionState.animationFrameId = null;
}

function scheduleDetectionFrame(generation) {
  if (generation !== detectionState.loopGeneration || !shouldProcessContinuously()) {
    return;
  }

  if (typeof mediaView.requestVideoFrameCallback === "function") {
    detectionState.frameCallbackId = mediaView.requestVideoFrameCallback(async () => {
      detectionState.frameCallbackId = null;
      await processDetectionFrame();
      scheduleDetectionFrame(generation);
    });
    return;
  }

  detectionState.animationFrameId = requestAnimationFrame(async () => {
    detectionState.animationFrameId = null;
    await processDetectionFrame();
    scheduleDetectionFrame(generation);
  });
}

function startDetectionLoop() {
  stopDetectionLoop();

  if (!shouldProcessContinuously()) {
    return;
  }

  const generation = detectionState.loopGeneration;
  scheduleDetectionFrame(generation);
}

function cancelSingleDetectionFrame() {
  if (detectionState.singleFrameRequestId === null) {
    return;
  }

  cancelAnimationFrame(detectionState.singleFrameRequestId);
  detectionState.singleFrameRequestId = null;
  detectionState.singleFrameRequestType = null;
}

function requestSingleDetectionFrame() {
  if (mediaState.source === "none") {
    return;
  }

  cancelSingleDetectionFrame();
  detectionState.singleFrameRequestType = "animation";
  detectionState.singleFrameRequestId = requestAnimationFrame(() => {
    detectionState.singleFrameRequestId = requestAnimationFrame(async () => {
      detectionState.singleFrameRequestId = null;
      detectionState.singleFrameRequestType = null;
      await processDetectionFrame({ pausedFrame: mediaView.paused || mediaView.ended });
    });
  });
}

function setSamplingMode(active) {
  detectionState.samplingColor = active;
  sampleColorButton.setAttribute("aria-pressed", String(active));
  sampleColorButton.textContent = active ? "Tap a point…" : "Sample from video";
  sampleHelp.textContent = active
    ? "Tap inside the visible video image."
    : "Select the button, then tap a visible prop.";
  videoSurface.classList.toggle("is-sampling", active);
}
