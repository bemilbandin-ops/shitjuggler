const cameraButton = document.querySelector("#camera-button");
const uploadInput = document.querySelector("#video-upload");
const mediaView = document.querySelector("#media-view");
const emptyState = document.querySelector("#empty-state");
const statusDot = document.querySelector("#status-dot");
const statusTitle = document.querySelector("#status-title");
const statusDetail = document.querySelector("#status-detail");

const mediaState = {
  stream: null,
  objectUrl: null,
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
  mediaView.controls = false;
  mediaView.muted = false;
  mediaView.load();
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
    mediaView.srcObject = stream;
    mediaView.muted = true;
    mediaView.controls = false;
    await mediaView.play();

    showMedia();
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

  mediaState.objectUrl = URL.createObjectURL(file);
  mediaView.src = mediaState.objectUrl;
  mediaView.controls = true;
  mediaView.muted = false;

  mediaView.addEventListener(
    "loadedmetadata",
    () => {
      showMedia();
      updateStatus(
        "active",
        "Uploaded video ready",
        `${file.name} is loaded. Use the browser video controls to play it.`,
      );
    },
    { once: true },
  );

  mediaView.addEventListener(
    "error",
    () => {
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

cameraButton.addEventListener("click", startCamera);

uploadInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  loadUploadedVideo(file);
  event.target.value = "";
});

window.addEventListener("pagehide", () => {
  stopCameraStream();
  releaseUploadedVideo();
});
