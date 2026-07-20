cameraButton.addEventListener("click", startCamera);
playPauseButton.addEventListener("click", togglePlayback);
restartButton.addEventListener("click", restartPlayback);
seekRange.addEventListener("input", seekPlayback);
videoSurface.addEventListener("click", handleVideoSurfaceClick);
sampleColorButton.addEventListener("click", () => {
  if (mediaState.source === "none") {
    updateDetectionStatus(
      "No frame to sample",
      "Choose a camera or uploaded video first.",
      "No source",
    );
    return;
  }

  setSamplingMode(!detectionState.samplingColor);
});
captureBackgroundButton.addEventListener("click", captureBackgroundReference);
resetBackgroundButton.addEventListener("click", resetBackgroundReference);

[
  brightnessMethod,
  colorMethod,
  backgroundMethod,
  methodCombination,
  sensitivityRange,
  brightnessRange,
  targetColor,
  colorToleranceRange,
  backgroundStrengthRange,
  minRegionRange,
  maxRegionRange,
  showMask,
].forEach((control) => control.addEventListener("input", handleDetectionControlInput));

mediaView.addEventListener("play", () => {
  updatePlayPauseButton();
  startDetectionLoop();
});
mediaView.addEventListener("pause", () => {
  updatePlayPauseButton();
  stopDetectionLoop();

  if (mediaState.source === "upload" && !mediaView.ended) {
    updateDetectionStatus(
      "Detection paused",
      "Continuous processing is stopped. Change a setting or seek to analyze one frame.",
      "Paused",
    );
  }
});
mediaView.addEventListener("ended", () => {
  updatePlayPauseButton();
  stopDetectionLoop();
  updateDetectionStatus(
    "Playback ended",
    "Restart or seek to refresh detection.",
    "Ended",
  );
});
mediaView.addEventListener("timeupdate", updateTimeline);
mediaView.addEventListener("durationchange", updateTimeline);
mediaView.addEventListener("seeking", () => {
  stopDetectionLoop();
  clearCurrentDetections({
    status: {
      title: "Seeking",
      detail: "Waiting for the selected frame.",
      stageText: "Seeking",
    },
  });
});
mediaView.addEventListener("seeked", () => {
  requestSingleDetectionFrame();
  if (!mediaView.paused) {
    startDetectionLoop();
  }
});

uploadInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  loadUploadedVideo(file);
  event.target.value = "";
});

const resizeObserver = new ResizeObserver(resizeOverlayCanvas);
resizeObserver.observe(videoSurface);
window.addEventListener("resize", resizeOverlayCanvas);

window.addEventListener("pagehide", () => {
  stopDetectionLoop();
  stopCameraStream();
  releaseUploadedVideo();
});

window.shitJuggler = Object.freeze({
  getCurrentDetections() {
    return detectionState.detections.map((detection) => ({
      ...detection,
      methods: [...detection.methods],
    }));
  },
});

updateControlOutputs();
updateDetectionCount(0);
