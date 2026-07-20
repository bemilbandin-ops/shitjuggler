const assert = require("node:assert/strict");
const { PropTracker } = require("./tracking.js");

function detection(x, y, overrides = {}) {
  return {
    x,
    y,
    width: 20,
    height: 8,
    area: 140,
    score: 0.92,
    confidence: 0.92,
    method: "color",
    methods: ["color"],
    ...overrides,
  };
}

function context(timestamp, mediaTime) {
  return {
    timestamp,
    mediaTime,
    source: "upload",
    sourceWidth: 640,
    sourceHeight: 360,
  };
}

const tracker = new PropTracker({
  maxMissedFrames: 2,
  historyLength: 4,
  historyMaxAgeSeconds: 10,
});

let tracks = tracker.update([detection(100, 100)], context(0, 0));
assert.equal(tracks.length, 1);
assert.equal(tracks[0].id, 1);
assert.equal(tracks[0].history.length, 1);

tracks = tracker.update([detection(112, 100)], context(1 / 30, 1 / 30));
assert.equal(tracks.length, 1);
assert.equal(tracks[0].id, 1, "nearby detections should retain a stable track ID");
assert.ok(tracks[0].x > 100 && tracks[0].x < 112, "position should be smoothed");
assert.ok(tracks[0].speed > 0, "movement should produce a speed estimate");
assert.equal(tracks[0].history.length, 2);

tracks = tracker.update([], context(2 / 30, 2 / 30));
assert.equal(tracks.length, 1);
assert.equal(tracks[0].status, "predicted");
assert.equal(tracks[0].missedFrames, 1);

tracks = tracker.update([detection(123, 101)], context(3 / 30, 3 / 30));
assert.equal(tracks.length, 1);
assert.equal(tracks[0].id, 1, "a short detection loss should preserve the track ID");
assert.equal(tracks[0].status, "active");
assert.equal(tracks[0].history.at(-1).breakBefore, true, "reacquisition must break the path");

tracker.update([], context(4 / 30, 4 / 30));
tracker.update([], context(5 / 30, 5 / 30));
tracks = tracker.update([], context(6 / 30, 6 / 30));
assert.equal(tracks.length, 0, "expired tracks should be removed");

tracks = tracker.update([detection(300, 150)], context(7 / 30, 7 / 30));
assert.equal(tracks[0].id, 2);

tracks = tracker.update([detection(50, 50)], context(8 / 30, 0.01));
assert.equal(tracks.length, 1);
assert.equal(tracks[0].id, 1, "a backwards timeline jump should reset tracking state");
assert.equal(tracks[0].history.length, 1);

for (let frame = 1; frame <= 8; frame += 1) {
  tracks = tracker.update(
    [detection(50 + frame * 3, 50)],
    context(8 / 30 + frame / 30, 0.01 + frame / 30),
  );
}
assert.ok(tracks[0].history.length <= 4, "history must remain bounded");

const snapshot = tracker.getTracks();
snapshot[0].history[0].x = -999;
assert.notEqual(tracker.getTracks()[0].history[0].x, -999, "snapshots must not mutate tracker state");

console.log("tracking smoke tests passed");
