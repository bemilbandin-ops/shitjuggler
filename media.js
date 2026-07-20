async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    updateStatus(
      "error",
      "Camera unavailable",
      "This browser does not support camera capture, or the page is not in a secure context.",
    );
    return;
  }

  cameraButton.disabled = true;
  cameraButton.textContent = "Starting camera…";
  updateStatus("idle", "Requesting camera", "Waiting for browser permission.");

  stopCameraStream();
  releaseUploadedVideo();
  resetVideoElement();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });

    mediaState.stream = stream;
    mediaState.source = "camera";
    mediaView.srcObject = stream;
    mediaView.muted = true;
    await mediaView.play();

    showMedia();
    hidePlaybackControls();
    updateStatus("active", "Live camera active", "Frames stay local and are analyzed in this browser.");
    startDetectionLoop();
  } catch (error) {
    resetVideoElement();
    updateStatus("error", "Camera could not start", describeCameraError(error));
  } finally {
    cameraButton.disabled = false;
    cameraButton.textContent = "Use live camera";
  }
}

function loadUploadedVideo(file) {
  if (!file) {
    return;
  }

  if (!file.type.startsWith("video/")) {
    updateStatus("error", "Unsupported file", "Choose a file recognized by the browser as video.");
    return;
  }

  stopCameraStream();
  releaseUploadedVideo();
  resetVideoElement();

  mediaState.source = "upload";
  mediaState.objectUrl = URL.createObjectURL(file);
  mediaView.src = mediaState.objectUrl;
  mediaView.muted = false;

  mediaView.addEventListener(
    "loadedmetadata",
    () => {
      showMedia();
      showPlaybackControls();
      updateStatus(
        "active",
        "Uploaded video ready",
        `${file.name} is loaded. Detection runs during playback and refreshes after seeking.`,
      );
    },
    { once: true },
  );

  mediaView.addEventListener(
    "loadeddata",
    () => {
      resizeOverlayCanvas();
      requestSingleDetectionFrame();
      window.setTimeout(requestSingleDetectionFrame, 120);
    },
    { once: true },
  );

  mediaView.addEventListener(
    "error",
    () => {
      hidePlaybackControls();
      clearCurrentDetections();
      updateStatus(
        "error",
        "Video could not load",
        "The file format or codec may not be supported by this browser.",
      );
    },
    { once: true },
  );

  mediaView.load();
}

async function togglePlayback() {
  if (mediaState.source !== "upload") {
    return;
  }

  if (mediaView.ended) {
    mediaView.currentTime = 0;
  }

  if (mediaView.paused) {
    try {
      await mediaView.play();
    } catch {
      updateStatus("error", "Playback could not start", "The browser blocked or could not start this video.");
    }
    return;
  }

  mediaView.pause();
}

async function restartPlayback() {
  if (mediaState.source !== "upload") {
    return;
  }

  clearCurrentDetections({
    status: {
      title: "Restarting video",
      detail: "Waiting for the first frame.",
      stageText: "Restarting",
    },
  });
  mediaView.currentTime = 0;

  try {
    await mediaView.play();
  } catch {
    updateTimeline();
    updatePlayPauseButton();
    requestSingleDetectionFrame();
  }
}

function seekPlayback() {
  if (mediaState.source !== "upload" || !Number.isFinite(mediaView.duration)) {
    return;
  }

  mediaView.currentTime = (Number(seekRange.value) / SEEK_MAX) * mediaView.duration;
  updateTimeline();
}

function handleDetectionControlInput() {
  updateControlOutputs();

  if (Number(minRegionRange.value) > Number(maxRegionRange.value)) {
    maxRegionRange.value = minRegionRange.value;
    updateControlOutputs();
  }

  requestSingleDetectionFrame();
}

function captureBackgroundReference() {
  if (
    mediaState.source === "none" ||
    mediaView.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    updateDetectionStatus(
      "Background not captured",
      "Choose a source and wait for a visible frame first.",
      "No frame",
    );
    return;
  }

  try {
    if (detector.captureBackground(mediaView)) {
      backgroundMethod.checked = true;
      resetBackgroundButton.disabled = false;
      clearCurrentDetections();
      updateDetectionStatus(
        "Background captured",
        "Move props into view or continue playback to detect changes from this frame.",
        "Reference ready",
      );
      requestSingleDetectionFrame();
    }
  } catch (error) {
    updateDetectionStatus(
      "Background capture failed",
      error instanceof Error ? error.message : "The current frame could not be captured.",
      "Error",
    );
  }
}

function resetBackgroundReference() {
  detector.resetBackground();
  resetBackgroundButton.disabled = true;
  requestSingleDetectionFrame();
  updateDetectionStatus(
    "Background reset",
    "Capture a new reference frame before using background difference.",
    "Reference cleared",
  );
}

function handleVideoSurfaceClick(event) {
  if (mediaState.source === "none") {
    return;
  }

  if (!detectionState.samplingColor) {
    if (mediaState.source === "upload") {
      togglePlayback();
    }
    return;
  }

  const contentRect = getVideoContentRect();
  if (!contentRect) {
    return;
  }

  const bounds = videoSurface.getBoundingClientRect();
  const pointX = event.clientX - bounds.left;
  const pointY = event.clientY - bounds.top;
  const insideVideo =
    pointX >= contentRect.left &&
    pointX <= contentRect.left + contentRect.width &&
    pointY >= contentRect.top &&
    pointY <= contentRect.top + contentRect.height;

  if (!insideVideo) {
    sampleHelp.textContent = "Tap inside the visible video image, not the letterbox area.";
    return;
  }

  try {
    const sampledColor = detector.sampleColor(
      mediaView,
      (pointX - contentRect.left) / contentRect.width,
      (pointY - contentRect.top) / contentRect.height,
    );

    if (sampledColor) {
      targetColor.value = sampledColor;
      colorMethod.checked = true;
      setSamplingMode(false);
      sampleHelp.textContent = `Sampled ${sampledColor.toUpperCase()} from the current frame.`;
      requestSingleDetectionFrame();
    }
  } catch (error) {
    setSamplingMode(false);
    sampleHelp.textContent = error instanceof Error ? error.message : "Color sampling failed.";
  }
}
