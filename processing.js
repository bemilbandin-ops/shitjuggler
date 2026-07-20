const PERFORMANCE_QUALITY_LEVELS = Object.freeze([
  Object.freeze({
    id: "high",
    label: "High quality",
    maxProcessingWidth: 480,
    minimumFrameIntervalMs: 0,
  }),
  Object.freeze({
    id: "balanced",
    label: "Balanced quality",
    maxProcessingWidth: 400,
    minimumFrameIntervalMs: 30,
  }),
  Object.freeze({
    id: "reduced",
    label: "Reduced quality",
    maxProcessingWidth: 320,
    minimumFrameIntervalMs: 45,
  }),
]);

function performanceClamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

class AdaptivePerformanceController {
  constructor({
    qualityLevels = PERFORMANCE_QUALITY_LEVELS,
    downgradeSampleCount = 10,
    upgradeSampleCount = 90,
    overloadedProcessingTimeMs = 26,
    overloadedFrameRate = 20,
    healthyProcessingTimeMs = 12,
    healthyFrameRate = 28,
  } = {}) {
    this.qualityLevels = qualityLevels.map((quality) => ({ ...quality }));
    this.downgradeSampleCount = downgradeSampleCount;
    this.upgradeSampleCount = upgradeSampleCount;
    this.overloadedProcessingTimeMs = overloadedProcessingTimeMs;
    this.overloadedFrameRate = overloadedFrameRate;
    this.healthyProcessingTimeMs = healthyProcessingTimeMs;
    this.healthyFrameRate = healthyFrameRate;
    this.reset();
  }

  reset(source = "none") {
    this.source = source;
    this.qualityIndex = 0;
    this.lastCallbackAtMs = null;
    this.lastProcessedAtMs = null;
    this.averageCallbackIntervalMs = null;
    this.averageProcessingTimeMs = null;
    this.overloadedSamples = 0;
    this.healthySamples = 0;
    this.processedFrames = 0;
    this.skippedFrames = 0;
    this.maximumPropCount = 0;
  }

  setSource(source = "none") {
    if (source !== this.source) {
      this.reset(source);
    }
  }

  get quality() {
    return this.qualityLevels[this.qualityIndex];
  }

  shouldProcessFrame(timestampMs, source = this.source) {
    this.setSource(source);
    const now = Number.isFinite(timestampMs) ? timestampMs : performance.now();

    if (this.lastCallbackAtMs !== null) {
      const callbackInterval = performanceClamp(now - this.lastCallbackAtMs, 1, 250);
      this.averageCallbackIntervalMs = this.averageCallbackIntervalMs === null
        ? callbackInterval
        : this.averageCallbackIntervalMs * 0.86 + callbackInterval * 0.14;
    }
    this.lastCallbackAtMs = now;

    const minimumInterval = this.quality.minimumFrameIntervalMs;
    const elapsedSinceProcessing = this.lastProcessedAtMs === null
      ? Number.POSITIVE_INFINITY
      : now - this.lastProcessedAtMs;

    if (minimumInterval > 0 && elapsedSinceProcessing < minimumInterval) {
      this.skippedFrames += 1;
      return false;
    }

    this.lastProcessedAtMs = now;
    return true;
  }

  recordFrame({
    processingTimeMs,
    propCount = 0,
    source = this.source,
    continuous = true,
  } = {}) {
    this.setSource(source);

    if (!continuous || !Number.isFinite(processingTimeMs)) {
      return this.createUpdate(false, null);
    }

    this.processedFrames += 1;
    this.maximumPropCount = Math.max(this.maximumPropCount, Math.max(0, propCount));
    this.averageProcessingTimeMs = this.averageProcessingTimeMs === null
      ? processingTimeMs
      : this.averageProcessingTimeMs * 0.82 + processingTimeMs * 0.18;

    const frameRate = this.averageCallbackIntervalMs
      ? 1000 / this.averageCallbackIntervalMs
      : null;
    const frameBudgetMs = this.averageCallbackIntervalMs || 1000 / 30;
    const loadRatio = this.averageProcessingTimeMs / Math.max(1, frameBudgetMs);
    const overloaded =
      this.processedFrames >= 3 &&
      (this.averageProcessingTimeMs >= this.overloadedProcessingTimeMs ||
        (frameRate !== null && frameRate < this.overloadedFrameRate) ||
        loadRatio >= 0.72);
    const healthy =
      this.processedFrames >= 12 &&
      this.averageProcessingTimeMs <= this.healthyProcessingTimeMs &&
      (frameRate === null || frameRate >= this.healthyFrameRate) &&
      loadRatio <= 0.45;

    if (overloaded) {
      this.overloadedSamples += 1;
      this.healthySamples = 0;
    } else if (healthy) {
      this.healthySamples += 1;
      this.overloadedSamples = 0;
    } else {
      this.overloadedSamples = Math.max(0, this.overloadedSamples - 1);
      this.healthySamples = Math.max(0, this.healthySamples - 1);
    }

    let changed = false;
    let reason = null;

    if (
      this.overloadedSamples >= this.downgradeSampleCount &&
      this.qualityIndex < this.qualityLevels.length - 1
    ) {
      this.qualityIndex += 1;
      this.overloadedSamples = 0;
      this.healthySamples = 0;
      changed = true;
      reason = "load-high";
    } else if (this.healthySamples >= this.upgradeSampleCount && this.qualityIndex > 0) {
      this.qualityIndex -= 1;
      this.overloadedSamples = 0;
      this.healthySamples = 0;
      changed = true;
      reason = "load-recovered";
    }

    return this.createUpdate(changed, reason);
  }

  createUpdate(changed, reason) {
    return {
      changed,
      reason,
      state: this.getState(),
    };
  }

  getState() {
    const quality = this.quality;
    const averageFrameRate = this.averageCallbackIntervalMs
      ? 1000 / this.averageCallbackIntervalMs
      : null;
    const frameBudgetMs = this.averageCallbackIntervalMs || 1000 / 30;

    return {
      source: this.source,
      qualityId: quality.id,
      qualityLabel: quality.label,
      maxProcessingWidth: quality.maxProcessingWidth,
      minimumFrameIntervalMs: quality.minimumFrameIntervalMs,
      averageFrameRate,
      averageProcessingTimeMs: this.averageProcessingTimeMs,
      loadRatio: this.averageProcessingTimeMs === null
        ? null
        : this.averageProcessingTimeMs / Math.max(1, frameBudgetMs),
      processedFrames: this.processedFrames,
      skippedFrames: this.skippedFrames,
      maximumPropCount: this.maximumPropCount,
    };
  }
}

const adaptivePerformance = new AdaptivePerformanceController();

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

  const trackingDiagnosticsToggle = document.querySelector("#show-tracking-diagnostics");
  if (trackingDiagnosticsToggle && !trackingDiagnosticsToggle.checked) {
    return;
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

  adaptivePerformance.setSource(mediaState.source);
  detector.maxProcessingWidth = adaptivePerformance.getState().maxProcessingWidth;
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
    const hadBackground = detector.hasBackground;
    const performanceUpdate = adaptivePerformance.recordFrame({
      processingTimeMs: result.processingTimeMs,
      propCount: tracks.length,
      source: mediaState.source,
      continuous: !pausedFrame,
    });

    if (performanceUpdate.changed) {
      detector.maxProcessingWidth = performanceUpdate.state.maxProcessingWidth;
      if (hadBackground) {
        detector.resetBackground();
        resetBackgroundButton.disabled = true;
      }
    }

    detectionState.lastResult = result;
    detectionState.detections = result.detections;
    updateDetectionCount(result.detections.length);
    stageDetectionCount.textContent = `${activeTrackCount} tracked · ${result.detections.length} detected`;
    renderDetectionOverlay();
    publishDetections(result);

    const performanceState = performanceUpdate.state;
    const resolution = `${result.sourceWidth}×${result.sourceHeight} → ${result.processingWidth}×${result.processingHeight}`;
    const frameRate = performanceState.averageFrameRate
      ? `${performanceState.averageFrameRate.toFixed(0)} fps`
      : "warming up";
    const performanceSummary = `${performanceState.qualityLabel} · ${frameRate}`;
    const missingBackground =
      backgroundMethod.checked && (!result.backgroundAvailable || (performanceUpdate.changed && hadBackground));
    const title = pausedFrame ? "Current frame tracked" : "Tracking active";
    const trackingSummary = `${tracks.length} track${tracks.length === 1 ? "" : "s"}`;
    const detail = missingBackground
      ? `${resolution} · ${result.processingTimeMs.toFixed(1)} ms · ${performanceSummary} · ${trackingSummary}. Capture a background reference to use that method.`
      : `${resolution} · ${result.processingTimeMs.toFixed(1)} ms · ${performanceSummary} · ${trackingSummary} · ${result.enabledMethods.join(", ") || "no methods enabled"}.`;
    const stageText = pausedFrame
      ? "Paused frame"
      : `Tracking · ${performanceState.qualityLabel.replace(" quality", "")}`;
    updateDetectionStatus(title, detail, stageText);
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
    detectionState.frameCallbackId = mediaView.requestVideoFrameCallback(async (now) => {
      detectionState.frameCallbackId = null;
      if (adaptivePerformance.shouldProcessFrame(now, mediaState.source)) {
        await processDetectionFrame();
      }
      scheduleDetectionFrame(generation);
    });
    return;
  }

  detectionState.animationFrameId = requestAnimationFrame(async (now) => {
    detectionState.animationFrameId = null;
    if (adaptivePerformance.shouldProcessFrame(now, mediaState.source)) {
      await processDetectionFrame();
    }
    scheduleDetectionFrame(generation);
  });
}

function startDetectionLoop() {
  stopDetectionLoop();

  if (!shouldProcessContinuously()) {
    return;
  }

  adaptivePerformance.setSource(mediaState.source);
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    AdaptivePerformanceController,
    PERFORMANCE_QUALITY_LEVELS,
  };
}
