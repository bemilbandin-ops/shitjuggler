const TRACKER_DEFAULTS = Object.freeze({
  positionSmoothing: 0.46,
  sizeSmoothing: 0.34,
  velocitySmoothing: 0.3,
  minAssociationDistance: 36,
  maxAssociationDistance: 260,
  maxSizeRatio: 4.5,
  maxMissedFrames: 6,
  historyLength: 48,
  historyMaxAgeSeconds: 1.8,
  maxMediaGapSeconds: 0.75,
  minimumDirectionSpeed: 8,
});

function trackerClamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function trackerDistance(firstX, firstY, secondX, secondY) {
  return Math.hypot(secondX - firstX, secondY - firstY);
}

function trackerLerp(first, second, amount) {
  return first + (second - first) * amount;
}

function trackerLerpAngle(first, second, amount) {
  let difference = second - first;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  return first + difference * amount;
}

function cloneTrackedProp(track) {
  return {
    ...track,
    methods: [...track.methods],
    direction: { ...track.direction },
    size: { ...track.size },
    history: track.history.map((point) => ({ ...point })),
  };
}

class PropTracker {
  constructor(options = {}) {
    this.settings = { ...TRACKER_DEFAULTS, ...options };
    this.reset();
  }

  reset() {
    this.tracks = [];
    this.nextTrackId = 1;
    this.lastTimestamp = null;
    this.lastMediaTime = null;
    this.lastSource = null;
    this.sourceWidth = 0;
    this.sourceHeight = 0;
  }

  update(detections = [], context = {}) {
    const timestamp = Number.isFinite(context.timestamp)
      ? context.timestamp
      : performance.now() / 1000;
    const mediaTime = Number.isFinite(context.mediaTime) ? context.mediaTime : null;
    const source = context.source || "none";
    const sourceWidth = Number.isFinite(context.sourceWidth) ? context.sourceWidth : 0;
    const sourceHeight = Number.isFinite(context.sourceHeight) ? context.sourceHeight : 0;

    const sourceChanged = this.lastSource !== null && source !== this.lastSource;
    const timelineMovedBackward =
      mediaTime !== null && this.lastMediaTime !== null && mediaTime < this.lastMediaTime - 0.04;
    const timelineJumpedForward =
      source === "upload" &&
      mediaTime !== null &&
      this.lastMediaTime !== null &&
      mediaTime - this.lastMediaTime > this.settings.maxMediaGapSeconds;

    if (source === "none") {
      this.reset();
      return [];
    }

    if (sourceChanged || timelineMovedBackward || timelineJumpedForward) {
      this.reset();
    }

    const rawDelta = this.lastTimestamp === null ? 1 / 30 : timestamp - this.lastTimestamp;
    const deltaTime = trackerClamp(Number.isFinite(rawDelta) ? rawDelta : 1 / 30, 1 / 120, 0.25);
    const sameMediaFrame =
      source === "upload" &&
      mediaTime !== null &&
      this.lastMediaTime !== null &&
      Math.abs(mediaTime - this.lastMediaTime) < 0.001;

    this.lastTimestamp = timestamp;
    this.lastMediaTime = mediaTime;
    this.lastSource = source;
    this.sourceWidth = sourceWidth;
    this.sourceHeight = sourceHeight;

    const normalizedDetections = detections
      .filter(
        (detection) =>
          Number.isFinite(detection.x) &&
          Number.isFinite(detection.y) &&
          Number.isFinite(detection.width) &&
          Number.isFinite(detection.height),
      )
      .map((detection) => ({
        ...detection,
        confidence: trackerClamp(
          Number.isFinite(detection.confidence) ? detection.confidence : detection.score || 0,
          0,
          1,
        ),
        methods: Array.isArray(detection.methods) ? [...detection.methods] : [],
      }));

    const candidates = [];

    this.tracks.forEach((track, trackIndex) => {
      const predictedX = track.x + track.velocityX * deltaTime;
      const predictedY = track.y + track.velocityY * deltaTime;

      normalizedDetections.forEach((detection, detectionIndex) => {
        const distance = trackerDistance(predictedX, predictedY, detection.x, detection.y);
        const sizeScale = Math.max(
          12,
          track.width,
          track.height,
          detection.width,
          detection.height,
        );
        const motionAllowance = Math.hypot(track.velocityX, track.velocityY) * deltaTime * 1.7;
        const associationDistance = trackerClamp(
          sizeScale * 2.35 + motionAllowance,
          this.settings.minAssociationDistance,
          this.settings.maxAssociationDistance,
        );
        const trackArea = Math.max(1, track.area);
        const detectionArea = Math.max(1, detection.area || detection.width * detection.height);
        const sizeRatio = Math.max(trackArea, detectionArea) / Math.min(trackArea, detectionArea);

        if (distance > associationDistance || sizeRatio > this.settings.maxSizeRatio) {
          return;
        }

        const sizePenalty = Math.abs(Math.log(sizeRatio));
        const confidencePenalty = 1 - detection.confidence;
        const cost =
          distance / associationDistance +
          sizePenalty * 0.24 +
          confidencePenalty * 0.08 +
          track.missedFrames * 0.05;

        candidates.push({
          trackIndex,
          detectionIndex,
          cost,
          predictedX,
          predictedY,
          associationDistance,
        });
      });
    });

    candidates.sort((first, second) => first.cost - second.cost);

    const matchedTrackIndexes = new Set();
    const matchedDetectionIndexes = new Set();

    for (const candidate of candidates) {
      if (
        matchedTrackIndexes.has(candidate.trackIndex) ||
        matchedDetectionIndexes.has(candidate.detectionIndex)
      ) {
        continue;
      }

      matchedTrackIndexes.add(candidate.trackIndex);
      matchedDetectionIndexes.add(candidate.detectionIndex);
      this.updateMatchedTrack(
        this.tracks[candidate.trackIndex],
        normalizedDetections[candidate.detectionIndex],
        candidate,
        timestamp,
        deltaTime,
        sameMediaFrame,
      );
    }

    this.tracks.forEach((track, trackIndex) => {
      if (!matchedTrackIndexes.has(trackIndex)) {
        this.updateMissingTrack(track, deltaTime);
      }
    });

    normalizedDetections.forEach((detection, detectionIndex) => {
      if (!matchedDetectionIndexes.has(detectionIndex)) {
        this.tracks.push(this.createTrack(detection, timestamp));
      }
    });

    this.tracks = this.tracks.filter(
      (track) =>
        track.missedFrames <= this.settings.maxMissedFrames && track.trackingConfidence >= 0.04,
    );
    this.tracks.sort((first, second) => first.id - second.id);

    return this.getTracks();
  }

  updateMatchedTrack(track, detection, candidate, timestamp, deltaTime, sameMediaFrame) {
    const wasMissing = track.missedFrames > 0;
    const residual = trackerDistance(
      candidate.predictedX,
      candidate.predictedY,
      detection.x,
      detection.y,
    );
    const positionAmount = trackerClamp(
      this.settings.positionSmoothing + detection.confidence * 0.16,
      0.3,
      0.72,
    );
    const previousX = track.x;
    const previousY = track.y;
    const smoothedX = trackerLerp(candidate.predictedX, detection.x, positionAmount);
    const smoothedY = trackerLerp(candidate.predictedY, detection.y, positionAmount);

    if (!sameMediaFrame) {
      const measuredVelocityX = (smoothedX - previousX) / deltaTime;
      const measuredVelocityY = (smoothedY - previousY) / deltaTime;
      track.velocityX = trackerLerp(
        track.velocityX,
        measuredVelocityX,
        this.settings.velocitySmoothing,
      );
      track.velocityY = trackerLerp(
        track.velocityY,
        measuredVelocityY,
        this.settings.velocitySmoothing,
      );
    }

    track.x = smoothedX;
    track.y = smoothedY;
    track.width = trackerLerp(track.width, detection.width, this.settings.sizeSmoothing);
    track.height = trackerLerp(track.height, detection.height, this.settings.sizeSmoothing);
    track.area = trackerLerp(
      track.area,
      detection.area || detection.width * detection.height,
      this.settings.sizeSmoothing,
    );
    track.length = Math.max(track.width, track.height);
    track.speed = Math.hypot(track.velocityX, track.velocityY);

    const movementAngle = Math.atan2(track.velocityY, track.velocityX);
    const shapeAngle = track.width >= track.height ? 0 : Math.PI / 2;
    const targetAngle =
      track.speed >= this.settings.minimumDirectionSpeed ? movementAngle : shapeAngle;
    track.angle = trackerLerpAngle(
      track.angle,
      targetAngle,
      track.speed >= this.settings.minimumDirectionSpeed ? 0.36 : 0.16,
    );
    track.angleDegrees = (track.angle * 180) / Math.PI;

    if (track.speed > 0.001) {
      track.directionX = track.velocityX / track.speed;
      track.directionY = track.velocityY / track.speed;
    } else {
      track.directionX = 0;
      track.directionY = 0;
    }

    const residualQuality = 1 - trackerClamp(residual / candidate.associationDistance, 0, 1);
    const ageQuality = Math.min(1, (track.age + 1) / 8);
    track.detectionConfidence = detection.confidence;
    track.trackingConfidence = trackerClamp(
      detection.confidence * 0.56 + residualQuality * 0.24 + ageQuality * 0.2,
      0,
      1,
    );
    track.confidence = track.trackingConfidence;
    track.methods = [...detection.methods];
    track.method = detection.method || track.methods.join("+") || "combined";
    track.missedFrames = 0;
    track.status = "active";
    track.age += sameMediaFrame ? 0 : 1;
    track.lastSeenAt = timestamp;
    track.confirmed = track.age >= 2;
    track.normalizedX = this.sourceWidth > 0 ? track.x / this.sourceWidth : 0;
    track.normalizedY = this.sourceHeight > 0 ? track.y / this.sourceHeight : 0;
    track.direction = {
      x: track.directionX,
      y: track.directionY,
      angle: track.angle,
      angleDegrees: track.angleDegrees,
    };
    track.size = {
      width: track.width,
      height: track.height,
      length: track.length,
      area: track.area,
    };

    if (!sameMediaFrame) {
      this.appendHistoryPoint(track, timestamp, wasMissing);
    }
  }

  updateMissingTrack(track, deltaTime) {
    track.x += track.velocityX * deltaTime;
    track.y += track.velocityY * deltaTime;
    track.velocityX *= 0.9;
    track.velocityY *= 0.9;
    track.speed = Math.hypot(track.velocityX, track.velocityY);
    track.missedFrames += 1;
    track.status = "predicted";
    track.trackingConfidence *= 0.74;
    track.confidence = track.trackingConfidence;
    track.normalizedX = this.sourceWidth > 0 ? track.x / this.sourceWidth : 0;
    track.normalizedY = this.sourceHeight > 0 ? track.y / this.sourceHeight : 0;
    track.direction = {
      x: track.directionX,
      y: track.directionY,
      angle: track.angle,
      angleDegrees: track.angleDegrees,
    };
  }

  createTrack(detection, timestamp) {
    const width = Math.max(1, detection.width);
    const height = Math.max(1, detection.height);
    const length = Math.max(width, height);
    const angle = width >= height ? 0 : Math.PI / 2;
    const confidence = trackerClamp(detection.confidence * 0.82, 0, 1);
    const track = {
      id: this.nextTrackId,
      x: detection.x,
      y: detection.y,
      normalizedX: this.sourceWidth > 0 ? detection.x / this.sourceWidth : 0,
      normalizedY: this.sourceHeight > 0 ? detection.y / this.sourceHeight : 0,
      width,
      height,
      length,
      area: detection.area || width * height,
      velocityX: 0,
      velocityY: 0,
      speed: 0,
      directionX: 0,
      directionY: 0,
      angle,
      angleDegrees: (angle * 180) / Math.PI,
      direction: { x: 0, y: 0, angle, angleDegrees: (angle * 180) / Math.PI },
      size: { width, height, length, area: detection.area || width * height },
      detectionConfidence: detection.confidence,
      trackingConfidence: confidence,
      confidence,
      method: detection.method || detection.methods.join("+") || "combined",
      methods: [...detection.methods],
      age: 1,
      missedFrames: 0,
      confirmed: false,
      status: "active",
      createdAt: timestamp,
      lastSeenAt: timestamp,
      history: [],
    };

    this.nextTrackId += 1;
    this.appendHistoryPoint(track, timestamp, true);
    return track;
  }

  appendHistoryPoint(track, timestamp, breakBefore) {
    track.history.push({
      x: track.x,
      y: track.y,
      timestamp,
      confidence: track.trackingConfidence,
      breakBefore: Boolean(breakBefore),
    });

    const oldestAllowedTimestamp = timestamp - this.settings.historyMaxAgeSeconds;
    track.history = track.history
      .filter((point) => point.timestamp >= oldestAllowedTimestamp)
      .slice(-this.settings.historyLength);
  }

  getTracks() {
    return this.tracks.map(cloneTrackedProp);
  }
}

const propTracker = new PropTracker();
const trackingState = {
  tracks: [],
  lastResetReason: "initial",
  lastUpdatedAt: null,
};

function resetTrackingState(reason = "reset") {
  propTracker.reset();
  trackingState.tracks = [];
  trackingState.lastResetReason = reason;
  trackingState.lastUpdatedAt = null;
}

function updateTrackingState(detections, context) {
  trackingState.tracks = propTracker.update(detections, context);
  trackingState.lastUpdatedAt = context.timestamp;
  return trackingState.tracks;
}

function getCurrentTracksSnapshot() {
  return trackingState.tracks.map(cloneTrackedProp);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PropTracker };
}
