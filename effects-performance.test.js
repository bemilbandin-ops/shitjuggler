const assert = require("node:assert/strict");
const { EffectRegistry, EffectRuntime } = require("./effects.js");

function createFakeCanvas() {
  const operations = [];
  const context = {
    clearRect(...args) {
      operations.push(["clearRect", ...args]);
    },
    setTransform(...args) {
      operations.push(["setTransform", ...args]);
    },
    save() {
      operations.push(["save"]);
    },
    restore() {
      operations.push(["restore"]);
    },
  };

  return {
    width: 1,
    height: 1,
    clientWidth: 320,
    clientHeight: 180,
    style: {},
    operations,
    getContext(type) {
      assert.equal(type, "2d");
      return context;
    },
  };
}

const draws = [];
const registry = new EffectRegistry();
registry.register({
  id: "performance-probe",
  name: "Performance probe",
  description: "Verifies the shared effect runtime performance controls.",
  movementInputs: ["position"],
  brief: {
    visualResult: "A lightweight marker is drawn.",
    movementConnection: "The marker follows the current track.",
    behavior: "The runtime limits redraw frequency.",
    difference: "This definition only measures runtime behavior.",
    failureConditions: "Repeated sizes must not trigger repeated canvas transforms.",
  },
  controls: [],
  presets: [],
  create: () => ({
    draw(frame) {
      draws.push(frame.timestamp);
    },
  }),
});

const canvas = createFakeCanvas();
const runtime = new EffectRuntime({
  registry,
  canvas,
  pixelRatioLimit: 1.5,
  maxFramesPerSecond: 30,
});

runtime.resize(320, 180, 2);
assert.equal(runtime.getPerformanceState().pixelRatio, 1.5);
assert.equal(canvas.operations.filter(([name]) => name === "setTransform").length, 1);

runtime.resize(320, 180, 2);
assert.equal(canvas.operations.filter(([name]) => name === "setTransform").length, 1);

runtime.select("performance-probe");
const frame = { sourceWidth: 320, sourceHeight: 180, tracks: [] };
assert.equal(runtime.render({ ...frame, timestamp: 1 }), true);
assert.equal(runtime.render({ ...frame, timestamp: 1.01 }), false);
assert.equal(runtime.render({ ...frame, timestamp: 1.04 }), true);
assert.deepEqual(draws, [1, 1.04]);
assert.equal(runtime.getPerformanceState().renderedFrames, 2);
assert.equal(runtime.getPerformanceState().skippedRenderFrames, 1);

console.log("effects performance smoke tests passed");
