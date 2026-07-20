const cameraButton = document.querySelector("#camera-button");
const uploadInput = document.querySelector("#video-upload");
const mediaView = document.querySelector("#media-view");
const emptyState = document.querySelector("#empty-state");
const statusDot = document.querySelector("#status-dot");
const statusTitle = document.querySelector("#status-title");
const statusDetail = document.querySelector("#status-detail");
const playbackControls = document.querySelector("#playback-controls");
const playPauseButton = document.querySelector("#play-pause-button");
const restartButton = document.querySelector("#restart-button");
const seekRange = document.querySelector("#seek-range");
const currentTimeLabel = document.querySelector("#current-time");
const durationTimeLabel = document.querySelector("#duration-time");

const SEEK_MAX = 1000;

const mediaState = {
  stream: null,
  objectUrl: null,
  source: "none",
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

function showMedia() {
  emptyState.classList.add("is-hidden");
  mediaView.classList.add("is-visible");
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
  mediaView.pause();
  mediaView.removeAttribute("src");
  mediaView.srcObject = null;
  mediaView.muted = false;
  mediaView.load();
  mediaState.source = "none";
  hidePlaybackControls();
  resetPlaybackControls();
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
    updateStatus("active", "Live camera active", "The camera feed is ready for future tracking work.");
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
        `${file.name} is loaded. Use the playback controls below the video.`,
      );
    },
    { once: true },
  );

  mediaView.addEventListener(
    "error",
    () => {
      hidePlaybackControls();
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

  mediaView.currentTime = 0;

  try {
    await mediaView.play();
  } catch {
    updateTimeline();
    updatePlayPauseButton();
  }
}

function seekPlayback() {
  if (mediaState.source !== "upload" || !Number.isFinite(mediaView.duration)) {
    return;
  }

  mediaView.currentTime = (Number(seekRange.value) / SEEK_MAX) * mediaView.duration;
  updateTimeline();
}

cameraButton.addEventListener("click", startCamera);
playPauseButton.addEventListener("click", togglePlayback);
restartButton.addEventListener("click", restartPlayback);
seekRange.addEventListener("input", seekPlayback);

mediaView.addEventListener("play", updatePlayPauseButton);
mediaView.addEventListener("pause", updatePlayPauseButton);
mediaView.addEventListener("ended", updatePlayPauseButton);
mediaView.addEventListener("timeupdate", updateTimeline);
mediaView.addEventListener("durationchange", updateTimeline);

mediaView.addEventListener("click", () => {
  if (mediaState.source === "upload") {
    togglePlayback();
  }
});

uploadInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  loadUploadedVideo(file);
  event.target.value = "";
});

window.addEventListener("pagehide", () => {
  stopCameraStream();
  releaseUploadedVideo();
});
