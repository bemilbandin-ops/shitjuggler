const assert = require("node:assert/strict");
const effectModule = require("./motion-trails.js");
const { buildPresetDefinitions, findMatchingPreset } = require("./presets.js");

function defaults(definition) {
  return Object.fromEntries(definition.controls.map((control) => [control.id, control.defaultValue]));
}

(function run() {
  const definitions = buildPresetDefinitions(effectModule);
  assert.equal(definitions.length, 4);

  definitions.forEach((definition) => {
    assert.equal(definition.presets.length, 4, `${definition.id} should expose four presets`);

    const controlIds = new Set(definition.controls.map((control) => control.id));
    const presetIds = new Set();
    const presetNames = new Set();

    definition.presets.forEach((preset) => {
      assert.ok(!presetIds.has(preset.id), `${definition.id} repeats preset id ${preset.id}`);
      assert.ok(!presetNames.has(preset.name), `${definition.id} repeats preset name ${preset.name}`);
      presetIds.add(preset.id);
      presetNames.add(preset.name);
      assert.deepEqual(
        new Set(Object.keys(preset.values)),
        controlIds,
        `${definition.id}/${preset.id} should define every effect control`,
      );
    });

    const defaultControls = defaults(definition);
    assert.ok(findMatchingPreset(definition, defaultControls), `${definition.id} defaults should match a preset`);

    const firstControl = definition.controls[0];
    const customControls = { ...defaultControls };
    customControls[firstControl.id] = firstControl.type === "range"
      ? Math.min(firstControl.max, Number(firstControl.defaultValue) + Number(firstControl.step))
      : `${firstControl.defaultValue}-custom`;
    assert.equal(findMatchingPreset(definition, customControls), null);
  });

  const trails = definitions.find((definition) => definition.id === "neon-motion-trails");
  assert.deepEqual(
    trails.presets.map((preset) => preset.name),
    ["Soft silk", "Electric band", "Heavy paint", "Transparent glass"],
  );

  console.log("effect preset smoke tests passed");
})();
