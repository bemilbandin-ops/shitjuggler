function mapSourcePointToOverlay(x, y, result, contentRect) {
  return {
    x: contentRect.left + (x / result.sourceWidth) * contentRect.width,
    y: contentRect.top + (y / result.sourceHeight) * contentRect.height,
  };
}

function renderTrackHistory(track, result, contentRect) {
  if (track.history.length < 2) {
    return;
  }

  const maximumSourceJump = Math.max(result.sourceWidth, result.sourceHeight) * 0.22;
  const trackOpacity = track.status === "predicted"
    ? trackerClamp(track.trackingConfidence * 0.62, 0.08, 0.35)
    : trackerClamp(track.trackingConfidence * 0.82, 0.18, 0.82);

  overlayContext.save();
  overlayContext.strokeStyle = `rgba(124, 246, 255, ${trackOpacity})`;
  overlayContext.lineWidth = 2.5;
  overlayContext.lineCap = "round";
  overlayContext.lineJoin = "round";
  overlayContext.beginPath();

  let previousPoint = null;
  let segmentStarted = false;

  for (const point of track.history) {
    const mappedPoint = mapSourcePointToOverlay(point.x, point.y, result, contentRect);
    const sourceJump = previousPoint
      ? trackerDistance(previousPoint.x, previousPoint.y, point.x, point.y)
      : 0;
    const shouldBreak = point.breakBefore || sourceJump > maximumSourceJump;

    if (!segmentStarted || shouldBreak) {
      overlayContext.moveTo(mappedPoint.x, mappedPoint.y);
      segmentStarted = true;
    } else {
      overlayContext.lineTo(mappedPoint.x, mappedPoint.y);
    }

    previousPoint = point;
  }

  overlayContext.stroke();
  overlayContext.restore();
}

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

  trackingState.tracks.forEach((track) => renderTrackHistory(track, result, contentRect));

  overlayContext.save();
  overlayContext.lineWidth = 2;
  overlayContext.font = "600 11px ui-sans-serif, system-ui, sans-serif";
  overlayContext.textBaseline = "top";

  trackingState.tracks.forEach((track) => {
    const left = contentRect.left + ((track.x - track.width / 2) / result.sourceWidth) * contentRect.width;
    const top = contentRect.top + ((track.y - track.height / 2) / result.sourceHeight) * contentRect.height;
    const width = (track.width / result.sourceWidth) * contentRect.width;
    const height = (track.height / result.sourceHeight) * contentRect.height;
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    const opacity = track.status === "predicted"
      ? trackerClamp(track.trackingConfidence * 0.75, 0.12, 0.5)
      : trackerClamp(track.trackingConfidence, 0.35, 1);
    const strokeColor = `rgba(124, 246, 255, ${opacity})`;

    overlayContext.strokeStyle = strokeColor;
    overlayContext.fillStyle = strokeColor;
    overlayContext.setLineDash(track.status === "predicted" ? [6, 4] : []);
    overlayContext.strokeRect(left, top, width, height);

    overlayContext.beginPath();
    overlayContext.moveTo(centerX - 6, centerY);
    overlayContext.lineTo(centerX + 6, centerY);
    overlayContext.moveTo(centerX, centerY - 6);
    overlayContext.lineTo(centerX, centerY + 6);
    overlayContext.stroke();

    if (track.speed >= 8) {
      const vectorLength = Math.min(Math.max(track.length * 0.8, 22), track.speed * 0.1, 72);
      const vectorEnd = mapSourcePointToOverlay(
        track.x + track.directionX * vectorLength,
        track.y + track.directionY * vectorLength,
        result,
        contentRect,
      );
      overlayContext.beginPath();
      overlayContext.moveTo(centerX, centerY);
      overlayContext.lineTo(vectorEnd.x, vectorEnd.y);
      overlayContext.stroke();
    }

    overlayContext.setLineDash([]);
    const stateLabel = track.status === "predicted" ? " fading" : "";
    const label = `#${track.id} ${Math.round(track.trackingConfidence * 100)}% ${Math.round(track.speed)} px/s${stateLabel}`;
    const labelWidth = overlayContext.measureText(label).width + 10;
    const labelTop = Math.max(contentRect.top, top - 20);
    const labelLeft = Math.min(
      Math.max(contentRect.left, left),
      contentRect.left + contentRect.width - labelWidth,
    );
    overlayContext.fillStyle = "rgba(5, 12, 16, 0.84)";
    overlayContext.fillRect(labelLeft, labelTop, labelWidth, 18);
    overlayContext.fillStyle = `rgba(189, 251, 255, ${Math.max(0.55, opacity)})`;
    overlayContext.fillText(label, labelLeft + 5, labelTop + 3);
  });

  overlayContext.restore();
}

function publishDetections(result) {
  if (!result) {
    resetTrackingState("detections-cleared");
  }

  const tracks = getCurrentTracksSnapshot();
  const detail = {
    source: mediaState.source,
    mediaTime: Number.isFinite(mediaView.currentTime) ? mediaView.currentTime : 0,
    detections: detectionState.detections.map((detection) => ({
      ...detection,
      methods: [...detection.methods],
    })),
    tracks,
    sourceWidth: result?.sourceWidth ?? mediaView.videoWidth ?? 0,
    sourceHeight: result?.sourceHeight ?? mediaView.videoHeight ?? 0,
  };

  window.dispatchEvent(new CustomEvent("shitjuggler:detections", { detail }));
  window.dispatchEvent(
    new CustomEvent("shitjuggler:tracks", {
      detail: {
        source: detail.source,
        mediaTime: detail.mediaTime,
        tracks,
        sourceWidth: detail.sourceWidth,
        sourceHeight: detail.sourceHeight,
      },
    }),
  );
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

    const timestamp = performance.now() / 1000;
    const tracks = updateTrackingState(result.detections, {
      timestamp,
      mediaTime: Number.isFinite(mediaView.currentTime) ? mediaView.currentTime : null,
      source: mediaState.source,
      sourceWidth: result.sourceWidth,
      sourceHeight: result.sourceHeight,
    });
    const activeTrackCount = tracks.filter((track) => track.status === "active").length;

    detectionState.lastResult = result;
    detectionState.detections = result.detections;
    updateDetectionCount(result.detections.length);
    stageDetectionCount.textContent = `${activeTrackCount} tracked · ${result.detections.length} detected`;
    renderDetectionOverlay();
    publishDetections(result);

    const resolution = `${result.sourceWidth}×${result.sourceHeight} → ${result.processingWidth}×${result.processingHeight}`;
    const missingBackground = backgroundMethod.checked && !result.backgroundAvailable;
    const title = pausedFrame ? "Current frame tracked" : "Tracking active";
    const trackingSummary = `${tracks.length} track${tracks.length === 1 ? "" : "s"}`;
    const detail = missingBackground
      ? `${resolution} · ${result.processingTimeMs.toFixed(1)} ms · ${trackingSummary}. Capture a background reference to use that method.`
      : `${resolution} · ${result.processingTimeMs.toFixed(1)} ms · ${trackingSummary} · ${result.enabledMethods.join(", ") || "no methods enabled"}.`;
    updateDetectionStatus(title, detail, pausedFrame ? "Paused frame" : "Tracking");
  } catch (error) {
    clearCurrentDetections();
    updateDetectionStatus(
      "Tracking error",
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
