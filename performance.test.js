const assert = require("node:assert/strict");
const { AdaptivePerformanceController } = require("./processing.js");
const { PropTracker } = require("./tracking.js");

const controller = new AdaptivePerformanceController({
  downgradeSampleCount: 4,
  upgradeSampleCount: 12,
});

let now = 0;
for (let frame = 0; frame < 36; frame += 1) {
  now += 1000 / 60;
  if (controller.shouldProcessFrame(now, "camera")) {
    controller.recordFrame({
      processingTimeMs: 42,
      propCount: 6,
      source: "camera",
    });
  }
}

let state = controller.getState();
assert.equal(state.qualityId, "reduced", "sustained load should lower processing quality");
assert.equal(state.maxProcessingWidth, 320);
assert.ok(state.skippedFrames > 0, "reduced quality should skip some analysis frames");
assert.equal(state.maximumPropCount, 6, "performance telemetry should include multi-prop load");

for (let frame = 0; frame < 240; frame += 1) {
  now += 1000 / 60;
  if (controller.shouldProcessFrame(now, "camera")) {
    controller.recordFrame({
      processingTimeMs: 5,
      propCount: 6,
      source: "camera",
    });
  }
}

state = controller.getState();
assert.equal(state.qualityId, "high", "sustained recovery should restore processing quality");
assert.ok(state.averageFrameRate > 50, "callback frame rate should be measured independently of skipped work");

controller.setSource("upload");
state = controller.getState();
assert.equal(state.qualityId, "high", "a new source should begin at full quality");
assert.equal(state.processedFrames, 0);
assert.equal(state.skippedFrames, 0);

function detection(x, y) {
  return {
    x,
    y,
    width: 24,
    height: 10,
    area: 210,
    score: 0.94,
    confidence: 0.94,
    method: "color",
    methods: ["color"],
  };
}

const tracker = new PropTracker({
  historyLength: 18,
  historyMaxAgeSeconds: 2,
  maxMissedFrames: 2,
});

let tracks = [];
for (let frame = 0; frame < 180; frame += 1) {
  const detections = Array.from({ length: 6 }, (_, propIndex) =>
    detection(
      70 + propIndex * 92 + Math.sin(frame / 12 + propIndex) * 14,
      55 + propIndex * 42 + Math.cos(frame / 15 + propIndex) * 8,
    ),
  );
  tracks = tracker.update(detections, {
    timestamp: frame / 60,
    mediaTime: frame / 60,
    source: "upload",
    sourceWidth: 640,
    sourceHeight: 360,
  });
}

assert.equal(tracks.length, 6, "multiple moving props should remain independently tracked");
assert.ok(
  tracks.every((track) => track.history.length <= 18),
  "multi-prop movement histories must remain bounded",
);
assert.equal(new Set(tracks.map((track) => track.id)).size, 6, "tracked props should retain unique IDs");

console.log("performance smoke tests passed");
