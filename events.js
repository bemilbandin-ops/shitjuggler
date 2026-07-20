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
      "Tracking paused",
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
    "Restart or seek to refresh tracking.",
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
      detail: "Tracking history was cleared to prevent paths across unrelated frames.",
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
  resetTrackingState("page-hidden");
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
  getCurrentTracks() {
    return getCurrentTracksSnapshot();
  },
  getTrackingSnapshot() {
    return {
      source: mediaState.source,
      mediaTime: Number.isFinite(mediaView.currentTime) ? mediaView.currentTime : 0,
      sourceWidth: mediaView.videoWidth || 0,
      sourceHeight: mediaView.videoHeight || 0,
      tracks: getCurrentTracksSnapshot(),
    };
  },
});

function loadRecordingFeature() {
  if (document.querySelector('script[data-shitjuggler-recording]')) return;

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "recording.css";
  stylesheet.dataset.shitjugglerRecording = "";
  document.head.append(stylesheet);

  const script = document.createElement("script");
  script.src = "recording.js";
  script.async = false;
  script.dataset.shitjugglerRecording = "";
  script.addEventListener("error", () => {
    console.error("ShitJuggler recording module could not be loaded.");
  });
  document.body.append(script);
}

updateControlOutputs();
updateDetectionCount(0);
stageDetectionCount.textContent = "0 tracked · 0 detected";
loadRecordingFeature();
