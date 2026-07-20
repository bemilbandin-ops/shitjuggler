(function initializePresetFeature(globalScope) {
  "use strict";

  const PRESET_COLLECTIONS = Object.freeze({
    "neon-motion-trails": [
      { id: "soft-silk", name: "Soft silk", values: { "trail-length": 42, "trail-width": 5.5, glow: 10, opacity: 0.55, "head-size": 4, color: "#9bdcff", "color-mode": "single", "show-head": false } },
      { id: "electric-band", name: "Electric band", values: { "trail-length": 32, "trail-width": 4, glow: 14, opacity: 0.85, "head-size": 7, color: "#7c6cff", "color-mode": "single", "show-head": true } },
      { id: "heavy-paint", name: "Heavy paint", values: { "trail-length": 22, "trail-width": 10, glow: 4, opacity: 0.95, "head-size": 11, color: "#ff5d73", "color-mode": "prop", "show-head": true } },
      { id: "transparent-glass", name: "Transparent glass", values: { "trail-length": 46, "trail-width": 7, glow: 24, opacity: 0.3, "head-size": 5, color: "#d9f7ff", "color-mode": "speed", "show-head": false } },
    ],
    "endpoint-sparks": [
      { id: "responsive-sparks", name: "Responsive sparks", values: { density: 4, lifetime: 0.7, size: 3, spread: 0.65, drift: 50, gravity: 30, opacity: 0.9, color: "#ffd166", "color-mode": "speed" } },
      { id: "ember-fall", name: "Ember fall", values: { density: 3, lifetime: 1.3, size: 4, spread: 0.35, drift: 30, gravity: 100, opacity: 0.8, color: "#ff7a3d", "color-mode": "single" } },
      { id: "firework-burst", name: "Firework burst", values: { density: 8, lifetime: 0.6, size: 5, spread: 1, drift: 115, gravity: 10, opacity: 1, color: "#fff1a8", "color-mode": "prop" } },
      { id: "zero-gravity", name: "Zero gravity", values: { density: 5, lifetime: 1.2, size: 2.5, spread: 0.8, drift: 65, gravity: -20, opacity: 0.65, color: "#8be9fd", "color-mode": "speed" } },
    ],
    "orbiting-echoes": [
      { id: "balanced-orbit", name: "Balanced orbit", values: { copies: 7, radius: 34, "rotation-speed": 0.9, "scale-spread": 0.45, thickness: 5, opacity: 0.6, color: "#5de4c7", "color-mode": "prop" } },
      { id: "tight-halo", name: "Tight halo", values: { copies: 12, radius: 16, "rotation-speed": 1.8, "scale-spread": 0.2, thickness: 3, opacity: 0.45, color: "#b8f2e6", "color-mode": "single" } },
      { id: "wide-carousel", name: "Wide carousel", values: { copies: 8, radius: 78, "rotation-speed": 0.5, "scale-spread": 0.65, thickness: 8, opacity: 0.7, color: "#7aa2ff", "color-mode": "speed" } },
      { id: "reverse-spiral", name: "Reverse spiral", values: { copies: 10, radius: 50, "rotation-speed": -1.4, "scale-spread": 0.75, thickness: 4, opacity: 0.75, color: "#ff79c6", "color-mode": "prop" } },
    ],
    "path-symbols": [
      { id: "starlight", name: "Starlight", values: { text: "✦", spacing: 24, "font-size": 18, opacity: 0.8, orientation: "path", color: "#ff7ab6", "color-mode": "single" } },
      { id: "kinetic-type", name: "Kinetic type", values: { text: "MOVE", spacing: 42, "font-size": 14, opacity: 0.75, orientation: "path", color: "#f8f8f2", "color-mode": "speed" } },
      { id: "confetti-marks", name: "Confetti marks", values: { text: "◆●▲", spacing: 18, "font-size": 13, opacity: 0.95, orientation: "upright", color: "#ffd166", "color-mode": "prop" } },
      { id: "upright-notes", name: "Upright notes", values: { text: "♪♫", spacing: 34, "font-size": 24, opacity: 0.65, orientation: "upright", color: "#8be9fd", "color-mode": "single" } },
    ],
  });

  const DEFAULT_OVERRIDES = Object.freeze({
    "endpoint-sparks": { drift: 50, gravity: 30 },
    "orbiting-echoes": { opacity: 0.6 },
    "path-symbols": { opacity: 0.8 },
  });

  function clonePreset(preset) {
    return { ...preset, values: { ...preset.values } };
  }

  function applyDefaultOverrides(definition) {
    const overrides = DEFAULT_OVERRIDES[definition.id] || {};
    return definition.controls.map((control) => (
      Object.prototype.hasOwnProperty.call(overrides, control.id)
        ? { ...control, defaultValue: overrides[control.id] }
        : { ...control }
    ));
  }

  function buildPresetDefinitions(effectModule) {
    if (!effectModule) throw new Error("The effect module is required.");
    const definitions = [
      effectModule.createMotionTrailsDefinition(),
      effectModule.createEndpointSparksDefinition(),
      effectModule.createOrbitingEchoesDefinition(),
      effectModule.createPathSymbolsDefinition(),
    ];

    return definitions.map((definition) => ({
      ...definition,
      controls: applyDefaultOverrides(definition),
      presets: (PRESET_COLLECTIONS[definition.id] || []).map(clonePreset),
    }));
  }

  function valuesMatch(first, second) {
    if (typeof first === "number" || typeof second === "number") {
      return Number.isFinite(Number(first))
        && Number.isFinite(Number(second))
        && Math.abs(Number(first) - Number(second)) < 1e-8;
    }
    return first === second;
  }

  function findMatchingPreset(effect, controls) {
    if (!effect || !controls) return null;
    return (effect.presets || []).find((preset) => {
      const entries = Object.entries(preset.values || {});
      return entries.length > 0
        && entries.every(([controlId, value]) => valuesMatch(controls[controlId], value));
    }) || null;
  }

  function enhancePresetInterface(api) {
    const effectSelect = document.querySelector("#effect-select");
    const presetSelect = document.querySelector("#effect-preset");
    const controls = document.querySelector("#effect-controls");
    const statusDetail = document.querySelector("#effect-status-detail");
    if (!effectSelect || !presetSelect || !controls || !statusDetail) return;

    if (!controls.previousElementSibling?.classList.contains("effect-adjust-label")) {
      const adjustLabel = document.createElement("p");
      adjustLabel.className = "section-label effect-adjust-label";
      adjustLabel.textContent = "Adjust current settings";
      controls.before(adjustLabel);
    }

    function syncPresetState() {
      const state = api.getState();
      const effect = state.effects.find((item) => item.id === state.selectedEffectId) || null;
      const presetLabel = presetSelect.closest("label");

      if (!effect) {
        presetSelect.replaceChildren();
        presetSelect.disabled = true;
        if (presetLabel) presetLabel.hidden = true;
        return;
      }

      const matchingPreset = findMatchingPreset(effect, state.controls);
      let customOption = Array.from(presetSelect.options).find((option) => option.value === "");
      if (!customOption) {
        customOption = new Option("Custom settings", "");
        presetSelect.add(customOption, 0);
      }
      customOption.disabled = Boolean(matchingPreset);
      presetSelect.value = matchingPreset?.id || "";
      presetSelect.disabled = effect.presets.length === 0;
      if (presetLabel) presetLabel.hidden = effect.presets.length === 0;
      statusDetail.textContent = matchingPreset
        ? `${matchingPreset.name} preset selected. Adjust any setting to make a custom variation.`
        : "Custom settings active. Choose a preset to replace the current effect settings.";
    }

    const syncAfterCurrentEvent = () => queueMicrotask(syncPresetState);
    effectSelect.addEventListener("change", syncAfterCurrentEvent);
    presetSelect.addEventListener("change", syncAfterCurrentEvent);
    controls.addEventListener("input", syncAfterCurrentEvent);
    controls.addEventListener("change", syncAfterCurrentEvent);
    window.addEventListener("shitjuggler:effectchange", syncAfterCurrentEvent);
    window.addEventListener("shitjuggler:effectcontrols", syncAfterCurrentEvent);
    syncPresetState();
  }

  function installBrowserFeature() {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (window.__shitJugglerPresetsInstalled) return;

    const api = window.shitJugglerEffects;
    const effectModule = window.ShitJugglerMotionTrails;
    if (!api || !effectModule) return;
    window.__shitJugglerPresetsInstalled = true;

    const selectedEffectId = api.getState().selectedEffectId || effectModule.EFFECT_ID;
    const definitions = buildPresetDefinitions(effectModule);
    definitions.forEach((definition) => api.unregisterEffect(definition.id));
    definitions.forEach((definition) => api.registerEffect(definition));

    const nextEffectId = definitions.some((definition) => definition.id === selectedEffectId)
      ? selectedEffectId
      : definitions[0]?.id || null;
    api.selectEffect(nextEffectId);

    const scope = document.querySelector(".scope-label");
    const headerCopy = document.querySelector(".app-header p");
    if (scope) scope.textContent = "Build step 9";
    if (headerCopy) headerCopy.textContent = "Movement-driven effects with selectable presets and live custom controls.";
    document.title = "ShitJuggler — Effect Presets";
    enhancePresetInterface(api);
  }

  const exported = { PRESET_COLLECTIONS, buildPresetDefinitions, findMatchingPreset };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  if (globalScope) globalScope.ShitJugglerPresets = Object.freeze(exported);
  installBrowserFeature();
})(typeof globalThis !== "undefined" ? globalThis : this);
