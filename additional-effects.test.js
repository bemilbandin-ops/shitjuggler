const assert = require("node:assert/strict");
const effects = require("./motion-trails.js");

function createContext() {
  const operations = [];
  const context = { operations };
  [
    "beginPath", "moveTo", "lineTo", "stroke", "arc", "fill", "save", "restore",
    "translate", "rotate", "scale", "fillRect", "fillText",
  ].forEach((method) => {
    context[method] = (...args) => operations.push([method, ...args]);
  });
  return context;
}

function defaults(definition) {
  return Object.fromEntries(definition.controls.map((control) => [control.id, control.defaultValue]));
}

function sampleTrack(overrides = {}) {
  return {
    id: 2,
    displayX: 100,
    displayY: 70,
    displayLength: 28,
    speed: 480,
    angle: Math.PI / 4,
    directionX: Math.SQRT1_2,
    directionY: Math.SQRT1_2,
    trackingConfidence: 0.92,
    status: "active",
    history: [
      { display: { x: 20, y: 70 }, confidence: 0.9, breakBefore: true },
      { display: { x: 45, y: 70 }, confidence: 0.9, breakBefore: false },
      { display: { x: 70, y: 70 }, confidence: 0.9, breakBefore: false },
    ],
    ...overrides,
  };
}

(function run() {
  const definitions = [
    effects.createMotionTrailsDefinition(),
    effects.createEndpointSparksDefinition(),
    effects.createOrbitingEchoesDefinition(),
    effects.createPathSymbolsDefinition(),
  ];
  assert.equal(new Set(definitions.map((definition) => definition.id)).size, 4);
  definitions.forEach((definition) => {
    assert.ok(definition.name);
    assert.ok(definition.description);
    assert.ok(definition.movementInputs.length > 0);
    assert.ok(definition.brief.visualResult);
    assert.ok(definition.brief.movementConnection);
    assert.ok(definition.brief.behavior);
    assert.ok(definition.brief.difference);
    assert.ok(definition.brief.failureConditions);
    assert.equal(typeof definition.create, "function");
  });

  const sparkDefinition = effects.createEndpointSparksDefinition();
  const sparkInstance = effects.createEndpointSparksInstance();
  const sparkContext = createContext();
  const sparkControls = {
    ...defaults(sparkDefinition),
    density: 8,
    lifetime: 1.4,
  };
  for (let frameNumber = 0; frameNumber < 120; frameNumber += 1) {
    sparkInstance.draw(
      { deltaTime: 0.1, tracks: [sampleTrack()] },
      { context: sparkContext, controls: sparkControls },
    );
  }
  assert.ok(sparkInstance.getParticleCount() > 0);
  assert.ok(sparkInstance.getParticleCount() <= effects.MAX_SPARKS);
  assert.ok(sparkContext.operations.some((operation) => operation[0] === "stroke"));
  sparkInstance.cleanup();
  assert.equal(sparkInstance.getParticleCount(), 0);

  const predictedSparkInstance = effects.createEndpointSparksInstance();
  predictedSparkInstance.draw(
    { deltaTime: 0.1, tracks: [sampleTrack({ status: "predicted" })] },
    { context: createContext(), controls: defaults(sparkDefinition) },
  );
  assert.equal(predictedSparkInstance.getParticleCount(), 0);

  const orbitContext = createContext();
  const orbitDefinition = effects.createOrbitingEchoesDefinition();
  effects.drawOrbitingEchoesFrame(
    { timestamp: 2, tracks: [sampleTrack()] },
    orbitContext,
    defaults(orbitDefinition),
  );
  assert.equal(
    orbitContext.operations.filter((operation) => operation[0] === "fillRect").length,
    defaults(orbitDefinition).copies,
  );
  assert.ok(orbitContext.operations.some((operation) => operation[0] === "rotate"));

  const placements = effects.collectSymbolPlacements(
    sampleTrack({
      displayX: 105,
      history: [
        { display: { x: 0, y: 0 }, confidence: 1, breakBefore: true },
        { display: { x: 50, y: 0 }, confidence: 1, breakBefore: false },
        { display: { x: 100, y: 0 }, confidence: 1, breakBefore: true },
      ],
    }),
    20,
  );
  assert.ok(placements.length > 0);
  assert.ok(placements.every((placement) => placement.x <= 50 || placement.x >= 100));

  const symbolContext = createContext();
  const symbolDefinition = effects.createPathSymbolsDefinition();
  effects.drawPathSymbolsFrame(
    { tracks: [sampleTrack()] },
    symbolContext,
    { ...defaults(symbolDefinition), text: "AB" },
  );
  assert.ok(symbolContext.operations.some((operation) => operation[0] === "fillText"));

  console.log("additional effects smoke tests passed");
})();
