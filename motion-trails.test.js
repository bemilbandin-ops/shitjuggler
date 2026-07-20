const assert = require("node:assert/strict");
const { EffectRegistry, EffectRuntime } = require("./effects.js");
const {
  collectTrailPoints,
  createMotionTrailsDefinition,
  drawMotionTrailsFrame,
} = require("./motion-trails.js");

function createRecordingContext() {
  const operations = [];
  const context = {
    operations,
    clearRect(...args) { operations.push(["clearRect", ...args]); },
    setTransform(...args) { operations.push(["setTransform", ...args]); },
    save() { operations.push(["save"]); },
    restore() { operations.push(["restore"]); },
    beginPath() { operations.push(["beginPath"]); },
    moveTo(...args) { operations.push(["moveTo", ...args]); },
    lineTo(...args) { operations.push(["lineTo", ...args]); },
    stroke() { operations.push(["stroke"]); },
    arc(...args) { operations.push(["arc", ...args]); },
    fill() { operations.push(["fill"]); },
  };
  return context;
}

function createFakeCanvas(width = 240, height = 120) {
  const context = createRecordingContext();
  return {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    style: {},
    context,
    getContext(type) {
      assert.equal(type, "2d");
      return context;
    },
  };
}

function defaultControls(definition) {
  return Object.fromEntries(definition.controls.map((control) => [control.id, control.defaultValue]));
}

(function run() {
  const definition = createMotionTrailsDefinition();
  assert.equal(definition.id, "neon-motion-trails");
  assert.equal(definition.presets.length, 3);
  assert.match(definition.brief.failureConditions, /never connect across history breaks/i);

  const points = collectTrailPoints(
    {
      displayX: 90,
      displayY: 90,
      confidence: 1,
      history: [
        { display: { x: 10, y: 10 }, confidence: 1, breakBefore: true },
        { display: { x: 20, y: 20 }, confidence: 1, breakBefore: false },
        { display: { x: 70, y: 70 }, confidence: 1, breakBefore: true },
        { display: { x: 80, y: 80 }, confidence: 1, breakBefore: false },
      ],
    },
    48,
  );
  assert.deepEqual(points.map(({ x, y, breakBefore }) => ({ x, y, breakBefore })), [
    { x: 10, y: 10, breakBefore: true },
    { x: 20, y: 20, breakBefore: false },
    { x: 70, y: 70, breakBefore: true },
    { x: 80, y: 80, breakBefore: false },
    { x: 90, y: 90, breakBefore: false },
  ]);

  const directContext = createRecordingContext();
  drawMotionTrailsFrame(
    {
      tracks: [{
        id: 1,
        displayX: 90,
        displayY: 90,
        displayLength: 18,
        speed: 300,
        trackingConfidence: 1,
        status: "active",
        history: points.slice(0, -1).map((point) => ({
          display: { x: point.x, y: point.y },
          confidence: point.confidence,
          breakBefore: point.breakBefore,
        })),
      }],
    },
    directContext,
    defaultControls(definition),
  );

  const lineEndpoints = directContext.operations
    .filter((operation) => operation[0] === "lineTo")
    .map((operation) => operation.slice(1));
  assert.deepEqual(lineEndpoints, [[20, 20], [80, 80], [90, 90]]);
  assert.ok(directContext.operations.some((operation) => operation[0] === "arc"));

  const registry = new EffectRegistry();
  registry.register(definition);
  const canvas = createFakeCanvas();
  const runtime = new EffectRuntime({ registry, canvas });
  runtime.resize(240, 120, 1);
  runtime.select(definition.id);
  runtime.applyPreset("comet");
  assert.equal(runtime.getState().controls["color-mode"], "speed");

  assert.equal(runtime.render({
    source: "upload",
    mediaTime: 1,
    sourceWidth: 120,
    sourceHeight: 120,
    timestamp: 1,
    tracks: [{
      id: 3,
      x: 60,
      y: 60,
      width: 12,
      height: 12,
      speed: 500,
      confidence: 0.9,
      trackingConfidence: 0.9,
      status: "active",
      history: [
        { x: 30, y: 50, confidence: 0.8, breakBefore: true },
        { x: 45, y: 55, confidence: 0.9, breakBefore: false },
      ],
    }],
  }), true);
  assert.ok(canvas.context.operations.some((operation) => operation[0] === "stroke"));

  runtime.destroy();
  console.log("motion trails smoke tests passed");
})();
