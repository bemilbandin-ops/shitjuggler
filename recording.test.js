"use strict";

const assert = require("node:assert/strict");
const {
  calculateContainedRect,
  calculateOverlayCrop,
  chooseExportDimensions,
  chooseSupportedMimeType,
  createDownloadName,
  estimateVideoBitsPerSecond,
  extensionForMimeType,
  formatDuration,
} = require("./recording.js");

assert.deepEqual(chooseExportDimensions(1920, 1080, "source"), {
  width: 1920,
  height: 1080,
  scale: 1,
});
assert.deepEqual(chooseExportDimensions(1920, 1080, "720"), {
  width: 1280,
  height: 720,
  scale: 2 / 3,
});
assert.deepEqual(chooseExportDimensions(640, 360, "1080"), {
  width: 640,
  height: 360,
  scale: 1,
});
assert.deepEqual(chooseExportDimensions(853, 480, "source"), {
  width: 852,
  height: 480,
  scale: 1,
});

assert.deepEqual(calculateContainedRect(1000, 1000, 1920, 1080), {
  left: 0,
  top: 218.75,
  width: 1000,
  height: 562.5,
});
assert.deepEqual(calculateOverlayCrop(2000, 2000, 1000, 1000, 1920, 1080), {
  x: 0,
  y: 437.5,
  width: 2000,
  height: 1125,
});
assert.equal(calculateContainedRect(0, 1000, 1920, 1080), null);

class MockMediaRecorder {
  static isTypeSupported(type) {
    return type === "video/webm;codecs=vp8,opus";
  }
}
assert.equal(chooseSupportedMimeType(MockMediaRecorder), "video/webm;codecs=vp8,opus");
assert.equal(chooseSupportedMimeType(null), "");
assert.equal(extensionForMimeType("video/mp4;codecs=h264"), "mp4");
assert.equal(extensionForMimeType("video/webm"), "webm");

assert.equal(estimateVideoBitsPerSecond(320, 240, 15), 2_000_000);
assert.equal(estimateVideoBitsPerSecond(3840, 2160, 60), 24_000_000);
assert.equal(formatDuration(65_999), "1:05");
assert.equal(
  createDownloadName("webm", new Date("2026-07-20T12:34:56.789Z")),
  "shitjuggler-2026-07-20T12-34-56-789Z.webm",
);

console.log("recording smoke tests passed");
