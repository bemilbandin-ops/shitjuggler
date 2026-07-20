(function initializeRecordingModule(globalScope) {
  "use strict";

  const DEFAULT_FRAME_RATE = 30;
  const MIME_CANDIDATES = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
  ];

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function finiteNumber(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function cleanFloat(value) {
    if (Math.abs(value) < 1e-10) return 0;
    return Number(value.toFixed(10));
  }

  function evenDimension(value) {
    const rounded = Math.max(2, Math.round(finiteNumber(value, 2)));
    return rounded % 2 === 0 ? rounded : rounded - 1;
  }

  function chooseExportDimensions(sourceWidth, sourceHeight, requestedHeight = "source") {
    const width = Math.max(2, finiteNumber(sourceWidth, 2));
    const height = Math.max(2, finiteNumber(sourceHeight, 2));
    const limit = requestedHeight === "source"
      ? height
      : Math.min(height, Math.max(2, finiteNumber(requestedHeight, height)));
    const scale = Math.min(1, limit / height);

    return {
      width: evenDimension(width * scale),
      height: evenDimension(height * scale),
      scale,
    };
  }

  function calculateContainedRect(containerWidth, containerHeight, sourceWidth, sourceHeight) {
    const safeContainerWidth = Math.max(0, finiteNumber(containerWidth));
    const safeContainerHeight = Math.max(0, finiteNumber(containerHeight));
    const safeSourceWidth = Math.max(0, finiteNumber(sourceWidth));
    const safeSourceHeight = Math.max(0, finiteNumber(sourceHeight));

    if (!safeContainerWidth || !safeContainerHeight || !safeSourceWidth || !safeSourceHeight) {
      return null;
    }

    const scale = Math.min(
      safeContainerWidth / safeSourceWidth,
      safeContainerHeight / safeSourceHeight,
    );
    const width = safeSourceWidth * scale;
    const height = safeSourceHeight * scale;

    return {
      left: cleanFloat((safeContainerWidth - width) / 2),
      top: cleanFloat((safeContainerHeight - height) / 2),
      width: cleanFloat(width),
      height: cleanFloat(height),
    };
  }

  function calculateOverlayCrop(
    overlayWidth,
    overlayHeight,
    containerWidth,
    containerHeight,
    sourceWidth,
    sourceHeight,
  ) {
    const content = calculateContainedRect(
      containerWidth,
      containerHeight,
      sourceWidth,
      sourceHeight,
    );
    if (!content || !overlayWidth || !overlayHeight) return null;

    const scaleX = overlayWidth / containerWidth;
    const scaleY = overlayHeight / containerHeight;
    return {
      x: cleanFloat(content.left * scaleX),
      y: cleanFloat(content.top * scaleY),
      width: cleanFloat(content.width * scaleX),
      height: cleanFloat(content.height * scaleY),
    };
  }

  function chooseSupportedMimeType(MediaRecorderClass) {
    if (!MediaRecorderClass) return "";
    if (typeof MediaRecorderClass.isTypeSupported !== "function") {
      return "";
    }
    return MIME_CANDIDATES.find((type) => MediaRecorderClass.isTypeSupported(type)) || "";
  }

  function estimateVideoBitsPerSecond(width, height, frameRate) {
    const pixelsPerSecond = Math.max(1, finiteNumber(width, 1280))
      * Math.max(1, finiteNumber(height, 720))
      * clamp(finiteNumber(frameRate, DEFAULT_FRAME_RATE), 1, 120);
    return Math.round(clamp(pixelsPerSecond * 0.14, 2_000_000, 24_000_000));
  }

  function extensionForMimeType(mimeType) {
    return String(mimeType).toLowerCase().includes("mp4") ? "mp4" : "webm";
  }

  function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(finiteNumber(milliseconds) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function createDownloadName(extension, date = new Date()) {
    const timestamp = date.toISOString().replace(/[:.]/g, "-");
    return `shitjuggler-${timestamp}.${extension}`;
  }

  function installBrowserRecorder() {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const media = document.querySelector("#media-view");
    const surface = document.querySelector("#video-surface");
    const effectOverlay = document.querySelector("#effect-overlay");
    const detectionOverlay = document.querySelector("#detection-overlay");
    const sourcePanel = document.querySelector(".source-panel");
    const sourceStatus = document.querySelector(".source-status");
    if (!media || !surface || !effectOverlay || !detectionOverlay || !sourcePanel) return;

    document.title = "ShitJuggler — Record Motion Effects";
    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (descriptionMeta) {
      descriptionMeta.content = "Track juggling props, render motion-driven effects, and record the composed result locally in the browser.";
    }
    const scopeLabel = document.querySelector(".scope-label");
    if (scopeLabel) scopeLabel.textContent = "Build step 7";
    const headerCopy = document.querySelector(".app-header p");
    if (headerCopy) headerCopy.textContent = "Local prop tracking, responsive motion effects, and rendered video capture.";

    const panel = document.createElement("section");
    panel.className = "panel-section recording-settings";
    panel.setAttribute("aria-labelledby", "recording-heading");
    panel.innerHTML = `
      <div class="section-heading-row">
        <div>
          <p class="section-label">Export</p>
          <h2 id="recording-heading">Record result</h2>
        </div>
        <span class="recording-status-badge" id="recording-status-badge">Idle</span>
      </div>
      <p class="section-copy">
        Capture the visible video and active effect into a local downloadable file.
      </p>
      <div class="recording-option-grid">
        <label class="select-control" for="recording-resolution">
          <span>Resolution</span>
          <select id="recording-resolution">
            <option value="source">Source resolution</option>
            <option value="1080">Up to 1080p</option>
            <option value="720" selected>Up to 720p</option>
            <option value="480">Up to 480p</option>
          </select>
        </label>
        <label class="select-control" for="recording-frame-rate">
          <span>Frame rate</span>
          <select id="recording-frame-rate">
            <option value="30" selected>30 fps</option>
            <option value="60">60 fps</option>
          </select>
        </label>
      </div>
      <label class="check-control recording-toggle">
        <input id="recording-include-diagnostics" type="checkbox" />
        <span>Include tracking diagnostics</span>
      </label>
      <div class="recording-actions">
        <button class="primary-action recording-button" id="recording-toggle-button" type="button" disabled>
          Start recording
        </button>
        <button class="small-button" id="recording-download-button" type="button" disabled>
          Download last recording
        </button>
      </div>
      <div class="detection-status recording-runtime-status" aria-live="polite">
        <p id="recording-status-title">No source ready</p>
        <p id="recording-status-detail">Choose a camera or video before recording.</p>
      </div>
    `;
    sourcePanel.insertBefore(panel, sourceStatus || null);

    const recordingCanvas = document.createElement("canvas");
    recordingCanvas.id = "recording-composite-canvas";
    recordingCanvas.setAttribute("aria-hidden", "true");
    document.body.append(recordingCanvas);

    const context = recordingCanvas.getContext("2d", { alpha: false });
    const toggleButton = panel.querySelector("#recording-toggle-button");
    const downloadButton = panel.querySelector("#recording-download-button");
    const resolutionSelect = panel.querySelector("#recording-resolution");
    const frameRateSelect = panel.querySelector("#recording-frame-rate");
    const includeDiagnostics = panel.querySelector("#recording-include-diagnostics");
    const badge = panel.querySelector("#recording-status-badge");
    const statusTitle = panel.querySelector("#recording-status-title");
    const statusDetail = panel.querySelector("#recording-status-detail");

    const supported = Boolean(
      context
      && typeof recordingCanvas.captureStream === "function"
      && typeof window.MediaRecorder === "function",
    );

    const state = {
      status: "idle",
      recorder: null,
      stream: null,
      animationFrameId: null,
      timerId: null,
      startedAt: 0,
      chunks: [],
      discardOnStop: false,
      stopReason: "",
      downloadUrl: null,
      downloadName: "",
      mimeType: "",
      dimensions: null,
    };

    function sourceReady() {
      return media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        && media.videoWidth > 0
        && media.videoHeight > 0;
    }

    function updateAvailability() {
      if (state.status === "recording" || state.status === "stopping") return;
      toggleButton.disabled = !supported || !sourceReady();
      resolutionSelect.disabled = !supported || !sourceReady();
      frameRateSelect.disabled = !supported || !sourceReady();
      includeDiagnostics.disabled = !supported || !sourceReady();

      if (!supported) {
        badge.textContent = "Unavailable";
        badge.className = "recording-status-badge is-error";
        statusTitle.textContent = "Recording is unsupported";
        statusDetail.textContent = "Use a browser with Canvas captureStream and MediaRecorder support.";
      } else if (!sourceReady()) {
        badge.textContent = "Idle";
        badge.className = "recording-status-badge";
        statusTitle.textContent = "No source ready";
        statusDetail.textContent = "Choose a camera or video before recording.";
      } else if (state.downloadUrl) {
        badge.textContent = "Ready";
        badge.className = "recording-status-badge is-ready";
        statusTitle.textContent = "Recording ready";
        statusDetail.textContent = "Download the last recording or start a new one.";
      } else {
        badge.textContent = "Ready";
        badge.className = "recording-status-badge is-ready";
        statusTitle.textContent = "Ready to record";
        statusDetail.textContent = "The active effect is always included. Diagnostics are optional.";
      }
    }

    function revokeDownload() {
      if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
      state.downloadUrl = null;
      state.downloadName = "";
      downloadButton.disabled = true;
    }

    function drawOverlay(overlay) {
      const bounds = surface.getBoundingClientRect();
      const crop = calculateOverlayCrop(
        overlay.width,
        overlay.height,
        bounds.width,
        bounds.height,
        media.videoWidth,
        media.videoHeight,
      );
      if (!crop || crop.width <= 0 || crop.height <= 0) return;
      context.drawImage(
        overlay,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        recordingCanvas.width,
        recordingCanvas.height,
      );
    }

    function drawCompositeFrame() {
      if (state.status !== "recording") return;
      if (sourceReady()) {
        context.save();
        context.globalCompositeOperation = "source-over";
        context.globalAlpha = 1;
        context.fillStyle = "#000000";
        context.fillRect(0, 0, recordingCanvas.width, recordingCanvas.height);
        context.drawImage(media, 0, 0, recordingCanvas.width, recordingCanvas.height);
        drawOverlay(effectOverlay);
        if (includeDiagnostics.checked) drawOverlay(detectionOverlay);
        context.restore();
      }
      state.animationFrameId = window.requestAnimationFrame(drawCompositeFrame);
    }

    function cloneSourceAudioTracks() {
      let sourceStream = null;
      if (typeof MediaStream !== "undefined" && media.srcObject instanceof MediaStream) {
        sourceStream = media.srcObject;
      } else {
        const capture = media.captureStream || media.mozCaptureStream;
        if (typeof capture === "function") {
          try {
            sourceStream = capture.call(media);
          } catch {
            sourceStream = null;
          }
        }
      }
      return sourceStream
        ? sourceStream.getAudioTracks().map((track) => (typeof track.clone === "function" ? track.clone() : track))
        : [];
    }

    function updateRecordingTimer() {
      const elapsed = Date.now() - state.startedAt;
      badge.textContent = formatDuration(elapsed);
      statusDetail.textContent = `${state.dimensions.width}×${state.dimensions.height} · ${frameRateSelect.value} fps · recording locally`;
    }

    function createRecorder(stream, options) {
      try {
        return new window.MediaRecorder(stream, options);
      } catch {
        const fallbackOptions = state.mimeType ? { mimeType: state.mimeType } : undefined;
        return new window.MediaRecorder(stream, fallbackOptions);
      }
    }

    function finalizeRecording() {
      window.cancelAnimationFrame(state.animationFrameId);
      window.clearInterval(state.timerId);
      state.animationFrameId = null;
      state.timerId = null;

      if (state.stream) {
        state.stream.getTracks().forEach((track) => track.stop());
      }

      const chunks = state.chunks;
      const shouldDiscard = state.discardOnStop || chunks.length === 0;
      const reason = state.stopReason;
      state.recorder = null;
      state.stream = null;
      state.chunks = [];
      state.status = "idle";
      state.discardOnStop = false;
      state.stopReason = "";
      toggleButton.textContent = "Start recording";
      toggleButton.classList.remove("is-recording");

      if (shouldDiscard) {
        badge.textContent = "Idle";
        badge.className = "recording-status-badge";
        statusTitle.textContent = reason === "source-change" ? "Recording discarded" : "Recording stopped";
        statusDetail.textContent = reason === "source-change"
          ? "The source changed before the recording could be completed."
          : "No recording data was produced.";
        updateAvailability();
        return;
      }

      const blob = new Blob(chunks, { type: state.mimeType || chunks[0].type || "video/webm" });
      revokeDownload();
      state.downloadUrl = URL.createObjectURL(blob);
      state.downloadName = createDownloadName(extensionForMimeType(blob.type));
      downloadButton.disabled = false;
      badge.textContent = "Ready";
      badge.className = "recording-status-badge is-ready";
      statusTitle.textContent = reason === "playback-ended" ? "Full playback captured" : "Recording ready";
      statusDetail.textContent = `${(blob.size / (1024 * 1024)).toFixed(1)} MB · ${state.downloadName}`;
      updateAvailability();
    }

    async function startRecording() {
      if (!supported || !sourceReady() || state.status === "recording" || state.status === "stopping") return;

      if (media.ended) media.currentTime = 0;
      if (media.paused) {
        try {
          await media.play();
        } catch {
          statusTitle.textContent = "Playback could not start";
          statusDetail.textContent = "Start the uploaded video, then try recording again.";
          return;
        }
      }

      revokeDownload();
      const frameRate = clamp(finiteNumber(frameRateSelect.value, DEFAULT_FRAME_RATE), 1, 60);
      state.dimensions = chooseExportDimensions(
        media.videoWidth,
        media.videoHeight,
        resolutionSelect.value,
      );
      recordingCanvas.width = state.dimensions.width;
      recordingCanvas.height = state.dimensions.height;

      const stream = recordingCanvas.captureStream(frameRate);
      cloneSourceAudioTracks().forEach((track) => stream.addTrack(track));
      state.mimeType = chooseSupportedMimeType(window.MediaRecorder);
      const options = {
        videoBitsPerSecond: estimateVideoBitsPerSecond(
          state.dimensions.width,
          state.dimensions.height,
          frameRate,
        ),
      };
      if (state.mimeType) options.mimeType = state.mimeType;

      state.stream = stream;
      state.chunks = [];
      state.discardOnStop = false;
      state.stopReason = "";
      state.recorder = createRecorder(stream, options);
      state.recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) state.chunks.push(event.data);
      });
      state.recorder.addEventListener("stop", finalizeRecording, { once: true });
      state.recorder.addEventListener("error", (event) => {
        state.discardOnStop = true;
        badge.textContent = "Error";
        badge.className = "recording-status-badge is-error";
        statusTitle.textContent = "Recording failed";
        statusDetail.textContent = event.error?.message || "The browser could not continue recording.";
      });

      state.status = "recording";
      state.startedAt = Date.now();
      toggleButton.disabled = false;
      toggleButton.textContent = "Stop recording";
      toggleButton.classList.add("is-recording");
      resolutionSelect.disabled = true;
      frameRateSelect.disabled = true;
      badge.className = "recording-status-badge is-recording";
      statusTitle.textContent = "Recording composed output";
      updateRecordingTimer();
      state.timerId = window.setInterval(updateRecordingTimer, 250);
      drawCompositeFrame();
      state.recorder.start(1000);
      window.dispatchEvent(new CustomEvent("shitjuggler:recordingstart", {
        detail: getState(),
      }));
    }

    function stopRecording({ discard = false, reason = "user" } = {}) {
      if (state.status !== "recording" || !state.recorder) return false;
      state.status = "stopping";
      state.discardOnStop = Boolean(discard);
      state.stopReason = reason;
      toggleButton.disabled = true;
      statusTitle.textContent = "Finishing recording";
      statusDetail.textContent = "Encoding the final buffered frames.";
      try {
        state.recorder.stop();
      } catch {
        finalizeRecording();
      }
      window.dispatchEvent(new CustomEvent("shitjuggler:recordingstop", {
        detail: { reason, discard: Boolean(discard) },
      }));
      return true;
    }

    function downloadRecording() {
      if (!state.downloadUrl) return false;
      const anchor = document.createElement("a");
      anchor.href = state.downloadUrl;
      anchor.download = state.downloadName;
      anchor.rel = "noopener";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      return true;
    }

    function getState() {
      return {
        status: state.status,
        recording: state.status === "recording",
        mimeType: state.mimeType,
        dimensions: state.dimensions ? { ...state.dimensions } : null,
        hasDownload: Boolean(state.downloadUrl),
        downloadName: state.downloadName,
      };
    }

    toggleButton.addEventListener("click", () => {
      if (state.status === "recording") stopRecording({ reason: "user" });
      else startRecording();
    });
    downloadButton.addEventListener("click", downloadRecording);

    ["loadedmetadata", "loadeddata", "canplay", "emptied", "error"].forEach((eventName) => {
      media.addEventListener(eventName, () => {
        if (eventName === "emptied" && state.status === "recording") {
          stopRecording({ discard: true, reason: "source-change" });
        }
        window.setTimeout(updateAvailability, 0);
      });
    });
    media.addEventListener("ended", () => {
      if (state.status === "recording") stopRecording({ reason: "playback-ended" });
    });
    media.addEventListener("seeking", () => {
      if (state.status === "recording") stopRecording({ reason: "timeline-change" });
    });
    window.addEventListener("pagehide", () => {
      if (state.status === "recording") stopRecording({ discard: true, reason: "page-hidden" });
      revokeDownload();
    });

    globalScope.shitJugglerRecorder = Object.freeze({
      start: startRecording,
      stop: stopRecording,
      download: downloadRecording,
      getState,
    });

    updateAvailability();
  }

  const exported = {
    MIME_CANDIDATES,
    calculateContainedRect,
    calculateOverlayCrop,
    chooseExportDimensions,
    chooseSupportedMimeType,
    createDownloadName,
    estimateVideoBitsPerSecond,
    extensionForMimeType,
    formatDuration,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  if (globalScope) globalScope.ShitJugglerRecording = Object.freeze(exported);
  installBrowserRecorder();
})(typeof globalThis !== "undefined" ? globalThis : this);
