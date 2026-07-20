const assert = require("node:assert/strict");
const { EffectRegistry, EffectRuntime } = require("./effects.js");

function createFakeCanvas(width = 200, height = 100) {
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
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    style: {},
    operations,
    getContext(type) {
      assert.equal(type, "2d");
      return context;
    },
  };
}

function createDefinition(log, id = "mapped-dots") {
  return {
    id,
    name: "Mapped dots",
    description: "Draws one mapped marker for every tracked prop.",
    movementInputs: ["position", "size", "history"],
    brief: {
      visualResult: "A marker appears at every tracked prop position.",
      movementConnection: "Tracked position, size, and history drive each marker.",
      behavior: "Markers update once per tracking frame and disappear during cleanup.",
      difference: "This test definition verifies the independent effect contract.",
      failureConditions: "Coordinates must not be mutated or mapped outside the contained video.",
    },
    controls: [
      { id: "size", label: "Size", type: "range", min: 1, max: 10, step: 1, defaultValue: 4 },
      { id: "enabled", label: "Enabled", type: "boolean", defaultValue: true },
    ],
    presets: [{ id: "large", name: "Large", values: { size: 9 } }],
    create() {
      log.push("create");
      return {
        activate({ controls }) {
          log.push(["activate", controls.size]);
        },
        controlsChanged(controls) {
          log.push(["controls", controls.size]);
        },
        draw(frame, { controls }) {
          log.push(["draw", frame.tracks[0].displayX, frame.tracks[0].history[0].display.x, controls.size]);
        },
        cleanup({ reason }) {
          log.push(["cleanup", reason]);
        },
      };
    },
  };
}

(function run() {
  const log = [];
  const registry = new EffectRegistry();
  const metadata = registry.register(createDefinition(log));

  assert.equal(metadata.id, "mapped-dots");
  assert.equal(registry.list().length, 1);
  assert.throws(() => registry.register(createDefinition(log)), /already registered/);
  assert.throws(
    () => registry.register({ ...createDefinition(log, "missing-brief"), brief: {} }),
    /brief\.visualResult/,
  );

  const runtime = new EffectRuntime({ registry, canvas: createFakeCanvas() });
  runtime.resize(200, 100, 1);
  runtime.select("mapped-dots");

  assert.deepEqual(runtime.getState().controls, { size: 4, enabled: true });
  assert.deepEqual(runtime.setControls({ size: 99 }), { size: 10, enabled: true });
  assert.deepEqual(runtime.applyPreset("large"), { size: 9, enabled: true });

  const originalTrack = {
    id: 1,
    x: 25,
    y: 50,
    width: 10,
    height: 20,
    methods: ["color"],
    history: [{ x: 10, y: 20, breakBefore: true }],
  };

  assert.equal(
    runtime.render({
      source: "upload",
      mediaTime: 1,
      sourceWidth: 100,
      sourceHeight: 100,
      timestamp: 2,
      tracks: [originalTrack],
    }),
    true,
  );

  assert.deepEqual(originalTrack.history[0], { x: 10, y: 20, breakBefore: true });
  assert.deepEqual(
    log.find((entry) => Array.isArray(entry) && entry[0] === "draw"),
    ["draw", 75, 60, 9],
  );

  runtime.reset("source-change");
  assert.equal(log.filter((entry) => entry === "create").length, 2);
  assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === "cleanup" && entry[1] === "source-change"));

  registry.unregister("mapped-dots");
  assert.equal(runtime.getState().selectedEffectId, null);
  assert.ok(
    log.some(
      (entry) => Array.isArray(entry) && entry[0] === "cleanup" && entry[1] === "effect-unregistered",
    ),
  );

  runtime.destroy();
  console.log("effects smoke tests passed");
})();
