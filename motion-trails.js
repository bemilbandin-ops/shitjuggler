(function initializeMotionTrails(globalScope) {
  "use strict";

  const EFFECT_ID = "neon-motion-trails";
  const DEFAULT_EFFECT_COLOR = "#7c6cff";

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function finiteNumber(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function pointDistance(first, second) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function isDisplayPoint(point) {
    return point && Number.isFinite(point.x) && Number.isFinite(point.y);
  }

  function colorForTrack(track, controls) {
    const mode = controls["color-mode"] || "single";
    if (mode === "prop") {
      const hue = ((finiteNumber(track.id, 1) * 137.508) % 360 + 360) % 360;
      return `hsl(${hue.toFixed(1)} 92% 68%)`;
    }

    if (mode === "speed") {
      const speedMix = clamp(finiteNumber(track.speed) / 900, 0, 1);
      const hue = 205 - speedMix * 185;
      const lightness = 64 + speedMix * 8;
      return `hsl(${hue.toFixed(1)} 96% ${lightness.toFixed(1)}%)`;
    }

    return /^#[0-9a-f]{6}$/i.test(controls.color || "")
      ? controls.color
      : DEFAULT_EFFECT_COLOR;
  }

  function collectTrailPoints(track, trailLength) {
    const history = Array.isArray(track.history) ? track.history : [];
    const points = history
      .slice(-Math.max(2, Math.round(trailLength)))
      .map((point) => ({
        x: finiteNumber(point.display?.x, NaN),
        y: finiteNumber(point.display?.y, NaN),
        confidence: clamp(finiteNumber(point.confidence, track.trackingConfidence ?? track.confidence ?? 1), 0, 1),
        breakBefore: Boolean(point.breakBefore),
      }))
      .filter(isDisplayPoint);

    const current = {
      x: finiteNumber(track.displayX, NaN),
      y: finiteNumber(track.displayY, NaN),
      confidence: clamp(finiteNumber(track.trackingConfidence, track.confidence ?? 1), 0, 1),
      breakBefore: false,
    };

    if (isDisplayPoint(current)) {
      const previous = points.at(-1);
      if (!previous || pointDistance(previous, current) > 0.5) points.push(current);
    }

    return points;
  }

  function drawTrailSegment(context, first, second, options) {
    context.beginPath();
    context.moveTo(first.x, first.y);
    context.lineTo(second.x, second.y);
    context.globalAlpha = options.alpha;
    context.lineWidth = options.lineWidth;
    context.strokeStyle = options.color;
    context.shadowColor = options.color;
    context.shadowBlur = options.shadowBlur;
    context.stroke();
  }

  function drawHead(context, track, options) {
    if (!Number.isFinite(track.displayX) || !Number.isFinite(track.displayY)) return;

    const sizeScale = clamp(finiteNumber(track.displayLength, 12) / 36, 0.7, 1.8);
    const radius = options.headSize * sizeScale;
    context.globalAlpha = options.alpha;
    context.fillStyle = options.color;
    context.shadowColor = options.color;
    context.shadowBlur = options.shadowBlur * 1.25;
    context.beginPath();
    context.arc(track.displayX, track.displayY, radius, 0, Math.PI * 2);
    context.fill();

    context.globalAlpha = options.alpha * 0.9;
    context.fillStyle = "#ffffff";
    context.shadowBlur = 0;
    context.beginPath();
    context.arc(track.displayX, track.displayY, Math.max(1.2, radius * 0.3), 0, Math.PI * 2);
    context.fill();
  }

  function drawMotionTrailsFrame(frame, context, controls) {
    const tracks = Array.isArray(frame.tracks) ? frame.tracks : [];
    const trailLength = finiteNumber(controls["trail-length"], 32);
    const baseWidth = finiteNumber(controls["trail-width"], 4);
    const glow = finiteNumber(controls.glow, 14);
    const opacity = clamp(finiteNumber(controls.opacity, 0.86), 0.05, 1);
    const headSize = finiteNumber(controls["head-size"], 7);
    const showHead = controls["show-head"] !== false;

    context.globalCompositeOperation = "lighter";
    context.lineCap = "round";
    context.lineJoin = "round";

    tracks.forEach((track) => {
      const points = collectTrailPoints(track, trailLength);
      const color = colorForTrack(track, controls);
      const trackConfidence = clamp(
        finiteNumber(track.trackingConfidence, track.confidence ?? 1),
        0,
        1,
      );
      const statusAlpha = track.status === "predicted" ? 0.42 : 1;
      const speedWidth = 1 + clamp(finiteNumber(track.speed) / 1200, 0, 0.7);

      for (let index = 1; index < points.length; index += 1) {
        const first = points[index - 1];
        const second = points[index];
        if (second.breakBefore) continue;

        const progress = index / Math.max(1, points.length - 1);
        const fade = Math.pow(progress, 1.65);
        const confidence = Math.min(first.confidence, second.confidence, trackConfidence);
        const alpha = opacity * fade * confidence * statusAlpha;
        if (alpha < 0.012) continue;

        drawTrailSegment(context, first, second, {
          alpha,
          color,
          lineWidth: Math.max(0.75, baseWidth * (0.38 + fade * 0.62) * speedWidth),
          shadowBlur: glow * (0.35 + fade * 0.65),
        });
      }

      if (showHead && trackConfidence > 0.05) {
        drawHead(context, track, {
          alpha: opacity * trackConfidence * statusAlpha,
          color,
          headSize,
          shadowBlur: glow,
        });
      }
    });

    context.globalAlpha = 1;
    context.shadowBlur = 0;
  }

  function createMotionTrailsDefinition() {
    return {
      id: EFFECT_ID,
      name: "Neon motion trails",
      description: "Glowing, confidence-aware ribbons follow each tracked prop without crossing tracking gaps.",
      movementInputs: ["position", "history", "speed", "size", "tracking confidence"],
      brief: {
        visualResult: "Each tracked prop becomes a bright moving head with a tapered neon ribbon behind it.",
        movementConnection: "Tracked history shapes the ribbon while current position, speed, size, and confidence control its head, width, and visibility.",
        behavior: "Trails redraw from bounded recent history on every tracking frame, fade toward older points, dim predicted tracks, and reset with the effect runtime.",
        difference: "The effect converts motion into an expressive light path rather than duplicating detector boxes, IDs, or diagnostics.",
        failureConditions: "It must never connect across history breaks, retain stale paths after timeline resets, mutate tracking data, or perform unbounded per-frame work.",
      },
      controls: [
        {
          id: "trail-length",
          label: "Trail length",
          type: "range",
          min: 4,
          max: 48,
          step: 1,
          defaultValue: 32,
        },
        {
          id: "trail-width",
          label: "Trail width",
          type: "range",
          min: 1,
          max: 12,
          step: 0.5,
          defaultValue: 4,
        },
        {
          id: "glow",
          label: "Glow strength",
          type: "range",
          min: 0,
          max: 30,
          step: 1,
          defaultValue: 14,
        },
        {
          id: "opacity",
          label: "Opacity",
          type: "range",
          min: 0.1,
          max: 1,
          step: 0.05,
          defaultValue: 0.85,
        },
        {
          id: "head-size",
          label: "Head size",
          type: "range",
          min: 2,
          max: 18,
          step: 1,
          defaultValue: 7,
        },
        {
          id: "color",
          label: "Trail color",
          type: "color",
          defaultValue: DEFAULT_EFFECT_COLOR,
        },
        {
          id: "color-mode",
          label: "Color response",
          type: "select",
          defaultValue: "single",
          options: [
            { value: "single", label: "Single color" },
            { value: "prop", label: "Different per prop" },
            { value: "speed", label: "Change with speed" },
          ],
        },
        {
          id: "show-head",
          label: "Show glowing head",
          type: "boolean",
          defaultValue: true,
        },
      ],
      presets: [
        {
          id: "balanced",
          name: "Balanced",
          values: {
            "trail-length": 32,
            "trail-width": 4,
            glow: 14,
            opacity: 0.85,
            "head-size": 7,
            "color-mode": "single",
            "show-head": true,
          },
        },
        {
          id: "comet",
          name: "Comet",
          values: {
            "trail-length": 46,
            "trail-width": 7,
            glow: 25,
            opacity: 0.95,
            "head-size": 11,
            "color-mode": "speed",
            "show-head": true,
          },
        },
        {
          id: "clean-lines",
          name: "Clean lines",
          values: {
            "trail-length": 22,
            "trail-width": 2,
            glow: 3,
            opacity: 0.72,
            "head-size": 4,
            "color-mode": "prop",
            "show-head": false,
          },
        },
      ],
      clearBeforeDraw: true,
      create() {
        return {
          draw(frame, { context, controls }) {
            drawMotionTrailsFrame(frame, context, controls);
          },
        };
      },
    };
  }

  function installEffectInterface(api) {
    const select = document.querySelector("#effect-select");
    if (!select) return;

    const preset = document.querySelector("#effect-preset");
    const description = document.querySelector("#effect-description");
    const statusBadge = document.querySelector("#effect-status-badge");
    const statusTitle = document.querySelector("#effect-status-title");
    const statusDetail = document.querySelector("#effect-status-detail");
    const controlsContainer = document.querySelector("#effect-controls");
    const controlElements = Array.from(document.querySelectorAll("[data-effect-control]"));
    const outputElements = Array.from(document.querySelectorAll("[data-effect-output]"));

    const metadata = api.listEffects();
    select.replaceChildren(new Option("No effect", ""));
    metadata.forEach((effect) => select.add(new Option(effect.name, effect.id)));

    const effect = metadata.find((item) => item.id === EFFECT_ID);
    if (!effect) return;
    description.textContent = effect.description;
    preset.replaceChildren(...effect.presets.map((item) => new Option(item.name, item.id)));

    function formatOutput(controlId, value) {
      if (controlId === "trail-width" || controlId === "glow" || controlId === "head-size") {
        return `${value}px`;
      }
      if (controlId === "opacity") return `${Math.round(Number(value) * 100)}%`;
      return String(value);
    }

    function setInterfaceEnabled(enabled) {
      controlsContainer?.toggleAttribute("data-disabled", !enabled);
      controlElements.forEach((element) => {
        element.disabled = !enabled;
      });
      preset.disabled = !enabled;
    }

    function syncControls(values) {
      controlElements.forEach((element) => {
        const controlId = element.dataset.effectControl;
        if (!(controlId in values)) return;
        if (element.type === "checkbox") element.checked = Boolean(values[controlId]);
        else element.value = String(values[controlId]);
      });
      outputElements.forEach((element) => {
        const controlId = element.dataset.effectOutput;
        if (controlId in values) element.value = formatOutput(controlId, values[controlId]);
      });
    }

    function showState(state) {
      const active = state.selectedEffectId === EFFECT_ID;
      select.value = state.selectedEffectId || "";
      setInterfaceEnabled(active);
      if (active) syncControls(state.controls || {});
      statusBadge.textContent = active ? "On" : "Off";
      statusBadge.classList.toggle("is-active", active);
      statusTitle.textContent = active ? "Motion trails active" : "Effect disabled";
      statusDetail.textContent = active
        ? "Tracked movement now drives the effect canvas. Detection diagnostics remain separate."
        : "Select Neon motion trails to render tracked movement.";
    }

    select.addEventListener("change", () => {
      try {
        showState(api.selectEffect(select.value || null));
      } catch (error) {
        statusBadge.textContent = "Error";
        statusBadge.classList.remove("is-active");
        statusTitle.textContent = "Effect could not start";
        statusDetail.textContent = error.message;
      }
    });

    controlElements.forEach((element) => {
      const eventName = element.type === "range" ? "input" : "change";
      element.addEventListener(eventName, () => {
        const controlId = element.dataset.effectControl;
        const value = element.type === "checkbox"
          ? element.checked
          : element.type === "range" || element.type === "number"
            ? Number(element.value)
            : element.value;
        try {
          const controls = api.setControls({ [controlId]: value });
          syncControls(controls);
        } catch (error) {
          statusTitle.textContent = "Control update failed";
          statusDetail.textContent = error.message;
        }
      });
    });

    preset.addEventListener("change", () => {
      if (!preset.value) return;
      try {
        syncControls(api.applyPreset(preset.value));
      } catch (error) {
        statusTitle.textContent = "Preset could not be applied";
        statusDetail.textContent = error.message;
      }
    });

    window.addEventListener("shitjuggler:effectchange", (event) => showState(event.detail || {}));
    window.addEventListener("shitjuggler:effectcontrols", (event) => syncControls(event.detail?.controls || {}));
    window.addEventListener("shitjuggler:effecterror", (event) => {
      statusBadge.textContent = "Error";
      statusBadge.classList.remove("is-active");
      statusTitle.textContent = "Effect stopped safely";
      statusDetail.textContent = event.detail?.message || "The effect failed while drawing and was disabled.";
      setInterfaceEnabled(false);
      select.value = "";
    });

    const currentState = api.getState();
    showState(
      currentState.selectedEffectId
        ? currentState
        : api.selectEffect(EFFECT_ID),
    );
  }

  function installBrowserEffect() {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const api = window.shitJugglerEffects;
    if (!api) return;

    if (!api.listEffects().some((effect) => effect.id === EFFECT_ID)) {
      api.registerEffect(createMotionTrailsDefinition());
    }
    installEffectInterface(api);
  }

  const exported = {
    EFFECT_ID,
    collectTrailPoints,
    colorForTrack,
    createMotionTrailsDefinition,
    drawMotionTrailsFrame,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  if (globalScope) globalScope.ShitJugglerMotionTrails = Object.freeze(exported);
  installBrowserEffect();
})(typeof globalThis !== "undefined" ? globalThis : this);
