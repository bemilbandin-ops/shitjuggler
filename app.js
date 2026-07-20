
const cameraButton = document.querySelector("#camera-button");
const uploadInput = document.querySelector("#video-upload");
const mediaView = document.querySelector("#media-view");
const videoSurface = document.querySelector("#video-surface");
const emptyState = document.querySelector("#empty-state");
const detectionOverlay = document.querySelector("#detection-overlay");
const overlayContext = detectionOverlay.getContext("2d");
const statusDot = document.querySelector("#status-dot");
const statusTitle = document.querySelector("#status-title");
const statusDetail = document.querySelector("#status-detail");
const playbackControls = document.querySelector("#playback-controls");
const playPauseButton = document.querySelector("#play-pause-button");
const restartButton = document.querySelector("#restart-button");
const seekRange = document.querySelector("#seek-range");
const currentTimeLabel = document.querySelector("#current-time");
const durationTimeLabel = document.querySelector("#duration-time");
const detectionCount = document.querySelector("#detection-count");
const stageDetectionCount = document.querySelector("#stage-detection-count");
const stageProcessingStatus = document.querySelector("#stage-processing-status");
const detectionStatusTitle = document.querySelector("#detection-status-title");
const detectionStatusDetail = document.querySelector("#detection-status-detail");
const brightnessMethod = document.querySelector("#method-brightness");
const colorMethod = document.querySelector("#method-color");
const backgroundMethod = document.querySelector("#method-background");
const methodCombination = document.querySelector("#method-combination");
const sensitivityRange = document.querySelector("#sensitivity-range");
const sensitivityValue = document.querySelector("#sensitivity-value");
const brightnessRange = document.querySelector("#brightness-range");
const brightnessValue = document.querySelector("#brightness-value");
const targetColor = document.querySelector("#target-color");
const sampleColorButton = document.querySelector("#sample-color-button");
const sampleHelp = document.querySelector("#sample-help");
const colorToleranceRange = document.querySelector("#color-tolerance-range");
const colorToleranceValue = document.querySelector("#color-tolerance-value");
const backgroundStrengthRange = document.querySelector("#background-strength-range");
const backgroundStrengthValue = document.querySelector("#background-strength-value");
const captureBackgroundButton = document.querySelector("#capture-background-button");
const resetBackgroundButton = document.querySelector("#reset-background-button");
const minRegionRange = document.querySelector("#min-region-range");
const minRegionValue = document.querySelector("#min-region-value");
const maxRegionRange = document.querySelector("#max-region-range");
const maxRegionValue = document.querySelector("#max-region-value");
const showMask = document.querySelector("#show-mask");

const SEEK_MAX = 1000;
const detector = new PropDetector({ maxProcessingWidth: 480 });

const mediaState = {
  stream: null,
  objectUrl: null,
  source: "none",
};

const detectionState = {
  frameCallbackId: null,
  animationFrameId: null,
  singleFrameRequestId: null,
  singleFrameRequestType: null,
  loopGeneration: 0,
  processing: false,
  samplingColor: false,
  lastResult: null,
  detections: [],
};

function updateStatus(type, title, detail) {
  statusDot.className = "status-dot";

  if (type === "active") {
    statusDot.classList.add("is-active");
  }

  if (type === "error") {
    statusDot.classList.add("is-error");
  }

  statusTitle.textContent = title;
  statusDetail.textContent = detail;
}

function updateDetectionStatus(title, detail, stageText = title) {
  detectionStatusTitle.textContent = title;
  detectionStatusDetail.textContent = detail;
  stageProcessingStatus.textContent = stageText;
}

function showMedia() {
  emptyState.classList.add("is-hidden");
  mediaView.classList.add("is-visible");
  resizeOverlayCanvas();
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  const paddedSeconds = String(remainingSeconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
}

function updatePlayPauseButton() {
  const isPlaying = mediaState.source === "upload" && !mediaView.paused && !mediaView.ended;
  playPauseButton.textContent = isPlaying ? "Pause" : "Play";
  playPauseButton.setAttribute("aria-label", isPlaying ? "Pause video" : "Play video");
  playPauseButton.setAttribute("aria-pressed", String(isPlaying));
}

function updateTimeline() {
  const duration = mediaView.duration;
  const currentTime = mediaView.currentTime;

  currentTimeLabel.textContent = formatTime(currentTime);
  durationTimeLabel.textContent = formatTime(duration);

  if (!Number.isFinite(duration) || duration <= 0) {
    seekRange.value = "0";
    seekRange.disabled = true;
    return;
  }

  seekRange.disabled = false;
  seekRange.value = String(Math.round((currentTime / duration) * SEEK_MAX));
}

function showPlaybackControls() {
  playbackControls.hidden = false;
  updatePlayPauseButton();
  updateTimeline();
}

function hidePlaybackControls() {
  playbackControls.hidden = true;
}

function resetPlaybackControls() {
  seekRange.value = "0";
  seekRange.disabled = true;
  currentTimeLabel.textContent = "0:00";
  durationTimeLabel.textContent = "0:00";
  updatePlayPauseButton();
}

function stopCameraStream() {
  if (!mediaState.stream) {
    return;
  }

  for (const track of mediaState.stream.getTracks()) {
    track.stop();
  }

  mediaState.stream = null;
}

function releaseUploadedVideo() {
  if (!mediaState.objectUrl) {
    return;
  }

  URL.revokeObjectURL(mediaState.objectUrl);
  mediaState.objectUrl = null;
}

function resetVideoElement() {
  stopDetectionLoop();
  cancelSingleDetectionFrame();
  mediaView.pause();
  mediaView.removeAttribute("src");
  mediaView.srcObject = null;
  mediaView.muted = false;
  mediaView.load();
  mediaState.source = "none";
  hidePlaybackControls();
  resetPlaybackControls();
  resetDetectionForSourceChange();
}

function describeCameraError(error) {
  switch (error.name) {
    case "NotAllowedError":
      return "Camera permission was denied. Allow access in the browser and try again.";
    case "NotFoundError":
      return "No camera was found on this device.";
    case "NotReadableError":
      return "The camera is already in use or could not be started.";
    case "SecurityError":
      return "Camera access is blocked. Open the site over HTTPS or localhost.";
    default:
      return "The camera could not be started. Check browser permissions and try again.";
  }
}

function readDetectionSettings() {
  return {
    brightnessEnabled: brightnessMethod.checked,
    colorEnabled: colorMethod.checked,
    backgroundEnabled: backgroundMethod.checked,
    combination: methodCombination.value,
    sensitivity: Number(sensitivityRange.value),
    brightnessThreshold: Number(brightnessRange.value),
    targetColor: targetColor.value,
    colorTolerance: Number(colorToleranceRange.value),
    backgroundStrength: Number(backgroundStrengthRange.value),
    minRegionPercent: Number(minRegionRange.value),
    maxRegionPercent: Number(maxRegionRange.value),
    showMask: showMask.checked,
  };
}

function updateControlOutputs() {
  sensitivityValue.value = sensitivityRange.value;
  brightnessValue.value = brightnessRange.value;
  colorToleranceValue.value = colorToleranceRange.value;
  backgroundStrengthValue.value = backgroundStrengthRange.value;
  minRegionValue.value = `${Number(minRegionRange.value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
  maxRegionValue.value = `${maxRegionRange.value}%`;
}

function updateDetectionCount(count) {
  detectionCount.textContent = String(count);
  stageDetectionCount.textContent = `${count} detection${count === 1 ? "" : "s"}`;
}

function clearOverlay() {
  const bounds = videoSurface.getBoundingClientRect();
  overlayContext.clearRect(0, 0, bounds.width, bounds.height);
}

function clearCurrentDetections({ status = null } = {}) {
  detectionState.lastResult = null;
  detectionState.detections = [];
  updateDetectionCount(0);
  clearOverlay();

  if (status) {
    updateDetectionStatus(status.title, status.detail, status.stageText);
  }

  publishDetections(null);
}

function resetDetectionForSourceChange() {
  detector.reset();
  resetBackgroundButton.disabled = true;
  setSamplingMode(false);
  clearCurrentDetections({
    status: {
      title: "Detection idle",
      detail: "Choose a source to analyze frames.",
      stageText: "Idle",
    },
  });
}

function resizeOverlayCanvas() {
  const bounds = videoSurface.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(bounds.width * pixelRatio));
  const height = Math.max(1, Math.round(bounds.height * pixelRatio));

  if (detectionOverlay.width !== width || detectionOverlay.height !== height) {
    detectionOverlay.width = width;
    detectionOverlay.height = height;
    detectionOverlay.style.width = `${bounds.width}px`;
    detectionOverlay.style.height = `${bounds.height}px`;
  }

  overlayContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  renderDetectionOverlay();
}

function getVideoContentRect() {
  const bounds = videoSurface.getBoundingClientRect();
  const sourceWidth = mediaView.videoWidth;
  const sourceHeight = mediaView.videoHeight;

  if (!sourceWidth || !sourceHeight || !bounds.width || !bounds.height) {
    return null;
  }

  const scale = Math.min(bounds.width / sourceWidth, bounds.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    left: (bounds.width - width) / 2,
    top: (bounds.height - height) / 2,
    width,
    height,
    sourceWidth,
    sourceHeight,
  };
}
