(function initEffects(globalScope) {
  "use strict";

  const EFFECT_ID = "neon-motion-trails";
  const SPARK_EFFECT_ID = "endpoint-sparks";
  const ORBIT_EFFECT_ID = "orbiting-echoes";
  const SYMBOL_EFFECT_ID = "path-symbols";
  const MAX_SPARKS = 900;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const confidence = (track) => clamp(number(track.trackingConfidence, track.confidence ?? 1), 0, 1);
  const validPoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y);
  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  function colorForTrack(track, controls, fallback = "#7c6cff") {
    const mode = controls["color-mode"] || "single";
    if (mode === "prop") {
      const hue = ((number(track.id, 1) * 137.508) % 360 + 360) % 360;
      return `hsl(${hue.toFixed(1)} 92% 68%)`;
    }
    if (mode === "speed") {
      const mix = clamp(number(track.speed) / 900, 0, 1);
      return `hsl(${(205 - mix * 185).toFixed(1)} 96% ${(64 + mix * 8).toFixed(1)}%)`;
    }
    return /^#[0-9a-f]{6}$/i.test(controls.color || "") ? controls.color : fallback;
  }

  function collectTrailPoints(track, trailLength) {
    const points = (Array.isArray(track.history) ? track.history : [])
      .slice(-Math.max(2, Math.round(trailLength)))
      .map((point) => ({
        x: number(point.display?.x, NaN),
        y: number(point.display?.y, NaN),
        confidence: clamp(number(point.confidence, confidence(track)), 0, 1),
        breakBefore: Boolean(point.breakBefore),
      }))
      .filter(validPoint);
    const current = {
      x: number(track.displayX, NaN),
      y: number(track.displayY, NaN),
      confidence: confidence(track),
      breakBefore: false,
    };
    if (validPoint(current) && (!points.at(-1) || distance(points.at(-1), current) > 0.5)) points.push(current);
    return points;
  }

  function drawMotionTrailsFrame(frame, context, controls) {
    const length = number(controls["trail-length"], 32);
    const width = number(controls["trail-width"], 4);
    const glow = number(controls.glow, 14);
    const opacity = clamp(number(controls.opacity, 0.85), 0.05, 1);
    context.globalCompositeOperation = "lighter";
    context.lineCap = "round";
    context.lineJoin = "round";
    (frame.tracks || []).forEach((track) => {
      const points = collectTrailPoints(track, length);
      const trackConfidence = confidence(track);
      const color = colorForTrack(track, controls);
      const statusAlpha = track.status === "predicted" ? 0.42 : 1;
      const speedWidth = 1 + clamp(number(track.speed) / 1200, 0, 0.7);
      for (let index = 1; index < points.length; index += 1) {
        const first = points[index - 1];
        const second = points[index];
        if (second.breakBefore) continue;
        const progress = index / Math.max(1, points.length - 1);
        const fade = Math.pow(progress, 1.65);
        const alpha = opacity * fade * Math.min(first.confidence, second.confidence, trackConfidence) * statusAlpha;
        if (alpha < 0.012) continue;
        context.beginPath();
        context.moveTo(first.x, first.y);
        context.lineTo(second.x, second.y);
        context.globalAlpha = alpha;
        context.lineWidth = Math.max(0.75, width * (0.38 + fade * 0.62) * speedWidth);
        context.strokeStyle = color;
        context.shadowColor = color;
        context.shadowBlur = glow * (0.35 + fade * 0.65);
        context.stroke();
      }
      if (controls["show-head"] !== false && trackConfidence > 0.05) {
        const radius = number(controls["head-size"], 7) * clamp(number(track.displayLength, 12) / 36, 0.7, 1.8);
        context.globalAlpha = opacity * trackConfidence * statusAlpha;
        context.fillStyle = color;
        context.shadowColor = color;
        context.shadowBlur = glow * 1.25;
        context.beginPath();
        context.arc(track.displayX, track.displayY, radius, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha *= 0.9;
        context.fillStyle = "#ffffff";
        context.shadowBlur = 0;
        context.beginPath();
        context.arc(track.displayX, track.displayY, Math.max(1.2, radius * 0.3), 0, Math.PI * 2);
        context.fill();
      }
    });
    context.globalAlpha = 1;
    context.shadowBlur = 0;
  }

  const colorControl = (label, value) => ({ id: "color", label, type: "color", defaultValue: value });
  const colorModeControl = (defaultValue = "single") => ({
    id: "color-mode", label: "Color response", type: "select", defaultValue,
    options: [
      { value: "single", label: "Single color" },
      { value: "prop", label: "Different per prop" },
      { value: "speed", label: "Change with speed" },
    ],
  });

  function createMotionTrailsDefinition() {
    return {
      id: EFFECT_ID,
      name: "Neon motion trails",
      description: "Glowing, confidence-aware ribbons follow each tracked prop without crossing tracking gaps.",
      movementInputs: ["position", "history", "speed", "size", "tracking confidence"],
      brief: {
        visualResult: "Each tracked prop becomes a bright moving head with a tapered neon ribbon behind it.",
        movementConnection: "Tracked history shapes the ribbon while position, speed, size, and confidence control its head and visibility.",
        behavior: "Trails redraw from bounded history, fade toward older points, dim predicted tracks, and reset with the runtime.",
        difference: "It creates one connected light path rather than particles, prop copies, text, or diagnostics.",
        failureConditions: "It must never connect across history breaks, retain stale paths, mutate tracking data, or perform unbounded work.",
      },
      controls: [
        { id: "trail-length", label: "Trail length", type: "range", min: 4, max: 48, step: 1, defaultValue: 32 },
        { id: "trail-width", label: "Trail width", type: "range", min: 1, max: 12, step: 0.5, defaultValue: 4 },
        { id: "glow", label: "Glow strength", type: "range", min: 0, max: 30, step: 1, defaultValue: 14 },
        { id: "opacity", label: "Opacity", type: "range", min: 0.1, max: 1, step: 0.05, defaultValue: 0.85 },
        { id: "head-size", label: "Head size", type: "range", min: 2, max: 18, step: 1, defaultValue: 7 },
        colorControl("Trail color", "#7c6cff"),
        colorModeControl("single"),
        { id: "show-head", label: "Show glowing head", type: "boolean", defaultValue: true },
      ],
      presets: [
        { id: "balanced", name: "Balanced", values: { "trail-length": 32, "trail-width": 4, glow: 14, opacity: 0.85, "head-size": 7, "color-mode": "single", "show-head": true } },
        { id: "comet", name: "Comet", values: { "trail-length": 46, "trail-width": 7, glow: 25, opacity: 0.95, "head-size": 11, "color-mode": "speed", "show-head": true } },
        { id: "clean-lines", name: "Clean lines", values: { "trail-length": 22, "trail-width": 2, glow: 3, opacity: 0.72, "head-size": 4, "color-mode": "prop", "show-head": false } },
      ],
      clearBeforeDraw: true,
      create: () => ({ draw: (frame, tools) => drawMotionTrailsFrame(frame, tools.context, tools.controls), cleanup() {} }),
    };
  }

  const noise = (seed) => {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
  };

  function createEndpointSparksInstance() {
    const particles = [];
    const carry = new Map();
    let sequence = 0;
    function cleanup() { particles.length = 0; carry.clear(); }
    function emit(track, controls, dt) {
      if (track.status === "predicted" || confidence(track) < 0.12) return;
      const speed = number(track.speed);
      const total = (carry.get(track.id) || 0) + number(controls.density, 4) * (5 + clamp(speed / 90, 0, 18)) * dt;
      const count = Math.min(18, Math.floor(total));
      carry.set(track.id, total - count);
      const angle = number(track.angle, track.direction?.angle || 0);
      const halfLength = Math.max(4, number(track.displayLength, 18) * 0.5);
      const directionX = number(track.directionX, track.direction?.x || 0);
      const directionY = number(track.directionY, track.direction?.y || 0);
      for (let index = 0; index < count; index += 1) {
        const sign = index % 2 ? 1 : -1;
        const a = noise(track.id * 1009 + sequence * 17);
        const b = noise(track.id * 2081 + sequence * 29);
        const burstAngle = angle + sign * Math.PI * 0.5 + (a - 0.5) * Math.PI * number(controls.spread, 0.65);
        const burstSpeed = number(controls.drift, 48) * (0.55 + b * 0.9) + clamp(speed * 0.1, 0, 90);
        particles.push({
          x: track.displayX + Math.cos(angle) * halfLength * sign,
          y: track.displayY + Math.sin(angle) * halfLength * sign,
          vx: Math.cos(burstAngle) * burstSpeed + directionX * speed * 0.08,
          vy: Math.sin(burstAngle) * burstSpeed + directionY * speed * 0.08,
          age: 0,
          life: number(controls.lifetime, 0.7) * (0.7 + a * 0.6),
          size: number(controls.size, 3) * (0.65 + b * 0.8),
          color: colorForTrack(track, controls, "#ffd166"),
          confidence: confidence(track),
        });
        sequence += 1;
      }
    }
    function draw(frame, { context, controls }) {
      const dt = clamp(number(frame.deltaTime, 1 / 60), 1 / 240, 0.1);
      const tracks = frame.tracks || [];
      const activeIds = new Set(tracks.map((track) => track.id));
      Array.from(carry.keys()).forEach((id) => { if (!activeIds.has(id)) carry.delete(id); });
      tracks.forEach((track) => emit(track, controls, dt));
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.age += dt;
        if (particle.age >= particle.life) { particles.splice(index, 1); continue; }
        particle.vy += number(controls.gravity, 28) * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
      }
      if (particles.length > MAX_SPARKS) particles.splice(0, particles.length - MAX_SPARKS);
      context.globalCompositeOperation = "lighter";
      context.lineCap = "round";
      particles.forEach((particle) => {
        const remaining = 1 - particle.age / particle.life;
        context.globalAlpha = number(controls.opacity, 0.9) * particle.confidence * remaining * remaining;
        context.strokeStyle = particle.color;
        context.shadowColor = particle.color;
        context.shadowBlur = particle.size * 2.5;
        context.lineWidth = Math.max(0.6, particle.size * remaining);
        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(particle.x - particle.vx * dt * 1.8, particle.y - particle.vy * dt * 1.8);
        context.stroke();
      });
      context.globalAlpha = 1;
      context.shadowBlur = 0;
    }
    return { draw, cleanup, getParticleCount: () => particles.length };
  }

  function createEndpointSparksDefinition() {
    return {
      id: SPARK_EFFECT_ID,
      name: "Endpoint sparks",
      description: "Short-lived sparks burst from both ends of each moving prop and fade under gravity.",
      movementInputs: ["position", "angle", "length", "speed", "direction", "tracking confidence"],
      brief: {
        visualResult: "Bright sparks spray from both ends of each tracked prop instead of forming a connected trail.",
        movementConnection: "Angle and length locate the emitters; speed and direction influence emission and velocity.",
        behavior: "Active confident tracks emit bounded short-lived particles that move independently and fade.",
        difference: "It creates detached ballistic particles rather than a ribbon, repeated copies, or text.",
        failureConditions: "Predicted tracks must not emit, particles must remain capped, and cleanup must discard all state.",
      },
      controls: [
        { id: "density", label: "Spark density", type: "range", min: 1, max: 8, step: 1, defaultValue: 4 },
        { id: "lifetime", label: "Spark lifetime", type: "range", min: 0.2, max: 1.4, step: 0.1, defaultValue: 0.7 },
        { id: "size", label: "Spark size", type: "range", min: 1, max: 7, step: 0.5, defaultValue: 3 },
        { id: "spread", label: "Burst spread", type: "range", min: 0.1, max: 1, step: 0.05, defaultValue: 0.65 },
        { id: "drift", label: "Burst speed", type: "range", min: 15, max: 120, step: 5, defaultValue: 48 },
        { id: "gravity", label: "Gravity", type: "range", min: -80, max: 140, step: 5, defaultValue: 28 },
        { id: "opacity", label: "Opacity", type: "range", min: 0.1, max: 1, step: 0.05, defaultValue: 0.9 },
        colorControl("Spark color", "#ffd166"),
        colorModeControl("speed"),
      ],
      presets: [], clearBeforeDraw: true, create: createEndpointSparksInstance,
    };
  }

  function drawOrbitingEchoesFrame(frame, context, controls) {
    const copies = Math.round(number(controls.copies, 7));
    context.globalCompositeOperation = "lighter";
    (frame.tracks || []).forEach((track) => {
      const trackConfidence = confidence(track);
      if (trackConfidence < 0.05) return;
      const color = colorForTrack(track, controls, "#5de4c7");
      const length = Math.max(8, number(track.displayLength, 20));
      for (let index = 0; index < copies; index += 1) {
        const progress = copies <= 1 ? 0 : index / (copies - 1);
        const orbitAngle = number(frame.timestamp) * number(controls["rotation-speed"], 0.9) + track.id * 0.73 + progress * Math.PI * 2;
        const radius = number(controls.radius, 34) * (0.35 + progress * 0.65);
        const scale = 1 - progress * number(controls["scale-spread"], 0.45);
        context.save();
        context.translate(track.displayX + Math.cos(orbitAngle) * radius, track.displayY + Math.sin(orbitAngle) * radius);
        context.rotate(number(track.angle, track.direction?.angle || 0) + orbitAngle * 0.35);
        context.scale(scale, scale);
        context.globalAlpha = number(controls.opacity, 0.62) * trackConfidence * (track.status === "predicted" ? 0.3 : 1) * (1 - progress * 0.65);
        context.fillStyle = color;
        context.shadowColor = color;
        context.shadowBlur = 8 * (1 - progress * 0.5);
        context.fillRect(-length * 0.5, -number(controls.thickness, 5) * 0.5, length, number(controls.thickness, 5));
        context.restore();
      }
    });
    context.globalAlpha = 1;
    context.shadowBlur = 0;
  }

  function createOrbitingEchoesDefinition() {
    return {
      id: ORBIT_EFFECT_ID,
      name: "Orbiting echoes",
      description: "Copies of each prop revolve and shrink around its current position as a moving sculpture.",
      movementInputs: ["position", "angle", "length", "tracking confidence", "time"],
      brief: {
        visualResult: "Several luminous copies of each prop orbit its current position at different radii and scales.",
        movementConnection: "Position anchors the sculpture while angle, length, time, and confidence shape the copies.",
        behavior: "Copies revolve locally and disappear immediately when the track or effect clears.",
        difference: "It builds a rotating sculpture from prop silhouettes rather than history, particles, or text.",
        failureConditions: "Copies must remain local, bounded, readable, and clear cleanly on switch or loss.",
      },
      controls: [
        { id: "copies", label: "Number of copies", type: "range", min: 3, max: 12, step: 1, defaultValue: 7 },
        { id: "radius", label: "Orbit radius", type: "range", min: 8, max: 90, step: 2, defaultValue: 34 },
        { id: "rotation-speed", label: "Rotation speed", type: "range", min: -3, max: 3, step: 0.1, defaultValue: 0.9 },
        { id: "scale-spread", label: "Scale spread", type: "range", min: 0, max: 0.8, step: 0.05, defaultValue: 0.45 },
        { id: "thickness", label: "Copy thickness", type: "range", min: 2, max: 14, step: 1, defaultValue: 5 },
        { id: "opacity", label: "Opacity", type: "range", min: 0.1, max: 1, step: 0.05, defaultValue: 0.62 },
        colorControl("Echo color", "#5de4c7"), colorModeControl("prop"),
      ],
      presets: [], clearBeforeDraw: true,
      create: () => ({ draw: (frame, tools) => drawOrbitingEchoesFrame(frame, tools.context, tools.controls), cleanup() {} }),
    };
  }

  function collectSymbolPlacements(track, spacing, maximum = 80) {
    const points = collectTrailPoints(track, 48);
    const placements = [];
    const gap = Math.max(1, number(spacing, 24));
    let toNext = gap;
    for (let index = points.length - 1; index > 0 && placements.length < maximum; index -= 1) {
      const current = points[index];
      const previous = points[index - 1];
      if (current.breakBefore) { toNext = gap; continue; }
      let x = current.x;
      let y = current.y;
      let remaining = distance(previous, current);
      const angle = Math.atan2(current.y - previous.y, current.x - previous.x);
      while (remaining >= toNext && placements.length < maximum) {
        const ratio = toNext / remaining;
        x += (previous.x - x) * ratio;
        y += (previous.y - y) * ratio;
        placements.push({ x, y, angle, confidence: Math.min(current.confidence, previous.confidence) });
        remaining -= toNext;
        toNext = gap;
      }
      toNext -= remaining;
    }
    return placements;
  }

  function drawPathSymbolsFrame(frame, context, controls) {
    const symbols = Array.from(String(controls.text || "✦").trim() || "✦").slice(0, 12);
    const size = number(controls["font-size"], 18);
    context.globalCompositeOperation = "lighter";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `700 ${size}px system-ui, sans-serif`;
    (frame.tracks || []).forEach((track) => {
      const trackConfidence = confidence(track);
      const color = colorForTrack(track, controls, "#ff7ab6");
      const placements = collectSymbolPlacements(track, number(controls.spacing, 24));
      placements.forEach((placement, index) => {
        context.save();
        context.translate(placement.x, placement.y);
        if (controls.orientation === "path") context.rotate(placement.angle);
        context.globalAlpha = number(controls.opacity, 0.82) * trackConfidence * placement.confidence * (track.status === "predicted" ? 0.35 : 1) * (1 - index / Math.max(1, placements.length + 2));
        context.fillStyle = color;
        context.shadowColor = color;
        context.shadowBlur = size * 0.45;
        context.fillText(symbols[index % symbols.length], 0, 0);
        context.restore();
      });
    });
    context.globalAlpha = 1;
    context.shadowBlur = 0;
  }

  function createPathSymbolsDefinition() {
    return {
      id: SYMBOL_EFFECT_ID,
      name: "Path symbols",
      description: "Custom words or symbols are stamped at even intervals along each recent movement path.",
      movementInputs: ["history", "position", "movement direction", "tracking confidence"],
      brief: {
        visualResult: "Letters or symbols appear as separate readable marks following each recent prop path.",
        movementConnection: "History determines placement, path direction can rotate marks, and confidence controls fading.",
        behavior: "Marks are recomputed from bounded history, stop at breaks, fade backward, and vanish on reset.",
        difference: "It turns movement into typography rather than a continuous ribbon, particles, or prop copies.",
        failureConditions: "Text must not bridge gaps, become a solid line, persist after cleanup, or grow unbounded.",
      },
      controls: [
        { id: "text", label: "Words or symbols", type: "text", defaultValue: "✦" },
        { id: "spacing", label: "Symbol spacing", type: "range", min: 10, max: 64, step: 2, defaultValue: 24 },
        { id: "font-size", label: "Symbol size", type: "range", min: 8, max: 40, step: 1, defaultValue: 18 },
        { id: "opacity", label: "Opacity", type: "range", min: 0.1, max: 1, step: 0.05, defaultValue: 0.82 },
        { id: "orientation", label: "Orientation", type: "select", defaultValue: "path", options: [{ value: "path", label: "Follow path" }, { value: "upright", label: "Stay upright" }] },
        colorControl("Symbol color", "#ff7ab6"), colorModeControl("single"),
      ],
      presets: [], clearBeforeDraw: true,
      create: () => ({ draw: (frame, tools) => drawPathSymbolsFrame(frame, tools.context, tools.controls), cleanup() {} }),
    };
  }

  function buildControl(control, value, update) {
    const id = `effect-${control.id}`;
    if (control.type === "boolean") {
      const label = document.createElement("label"); label.className = "check-control effect-toggle";
      const input = document.createElement("input"); input.type = "checkbox"; input.id = id; input.checked = Boolean(value);
      const text = document.createElement("span"); text.textContent = control.label;
      input.addEventListener("change", () => update(control.id, input.checked)); label.append(input, text); return label;
    }
    if (control.type === "select") {
      const label = document.createElement("label"); label.className = "select-control"; label.htmlFor = id;
      const text = document.createElement("span"); text.textContent = control.label;
      const input = document.createElement("select"); input.id = id;
      control.options.forEach((option) => input.add(new Option(option.label, option.value))); input.value = String(value);
      input.addEventListener("change", () => update(control.id, input.value)); label.append(text, input); return label;
    }
    if (control.type === "color" || control.type === "text") {
      const label = document.createElement("label"); label.className = control.type === "text" ? "select-control" : "color-control"; label.htmlFor = id;
      const text = document.createElement(control.type === "text" ? "span" : "label"); text.textContent = control.label;
      const input = document.createElement("input"); input.type = control.type; input.id = id; input.value = String(value); input.maxLength = 24;
      input.addEventListener(control.type === "text" ? "input" : "change", () => update(control.id, input.value)); label.append(text, input); return label;
    }
    const wrapper = document.createElement("div"); wrapper.className = "range-control";
    const row = document.createElement("div"); row.className = "control-label-row";
    const label = document.createElement("label"); label.htmlFor = id; label.textContent = control.label;
    const output = document.createElement("output"); output.value = String(value);
    const input = document.createElement("input"); input.type = control.type; input.id = id; input.min = control.min; input.max = control.max; input.step = control.step; input.value = value;
    input.addEventListener(control.type === "range" ? "input" : "change", () => { output.value = input.value; update(control.id, Number(input.value)); });
    row.append(label, output); wrapper.append(row, input); return wrapper;
  }

  function installInterface(api) {
    const select = document.querySelector("#effect-select");
    const controls = document.querySelector("#effect-controls");
    if (!select || !controls) return;
    const heading = document.querySelector("#effect-heading");
    const description = document.querySelector("#effect-description");
    const preset = document.querySelector("#effect-preset");
    const badge = document.querySelector("#effect-status-badge");
    const statusTitle = document.querySelector("#effect-status-title");
    const statusDetail = document.querySelector("#effect-status-detail");
    const metadata = () => api.listEffects();
    const find = (id) => metadata().find((effect) => effect.id === id) || null;
    select.replaceChildren(new Option("No effect", ""));
    metadata().forEach((effect) => select.add(new Option(effect.name, effect.id)));

    function render(state) {
      const effect = find(state.selectedEffectId);
      select.value = effect?.id || "";
      heading.textContent = effect?.name || "Visual effects";
      description.textContent = effect?.description || "Select an effect to turn tracked movement into visuals.";
      badge.textContent = effect ? "On" : "Off";
      badge.classList.toggle("is-active", Boolean(effect));
      statusTitle.textContent = effect ? `${effect.name} active` : "Effect disabled";
      statusDetail.textContent = effect ? "Only controls declared by this effect are shown; switching clears temporary state." : "Tracking remains active while the effect canvas is clear.";
      const presets = effect?.presets || [];
      preset.replaceChildren(...presets.map((item) => new Option(item.name, item.id)));
      preset.disabled = presets.length === 0;
      if (preset.closest("label")) preset.closest("label").hidden = presets.length === 0;
      controls.replaceChildren();
      (effect?.controls || []).forEach((control) => controls.append(buildControl(control, state.controls[control.id], (id, value) => api.setControls({ [id]: value }))));
    }

    select.addEventListener("change", () => render(api.selectEffect(select.value || null)));
    preset.addEventListener("change", () => { if (preset.value) render({ ...api.getState(), controls: api.applyPreset(preset.value) }); });
    window.addEventListener("shitjuggler:effectchange", (event) => render(event.detail || {}));
    window.addEventListener("shitjuggler:effecterror", (event) => {
      badge.textContent = "Error"; badge.classList.remove("is-active"); statusTitle.textContent = "Effect stopped safely";
      statusDetail.textContent = event.detail?.message || "The effect failed while drawing and was disabled.";
    });
    const state = api.getState();
    render(state.selectedEffectId ? state : api.selectEffect(EFFECT_ID));
  }

  function installBrowser() {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const api = window.shitJugglerEffects;
    if (!api) return;
    [createMotionTrailsDefinition(), createEndpointSparksDefinition(), createOrbitingEchoesDefinition(), createPathSymbolsDefinition()]
      .forEach((definition) => { if (!api.listEffects().some((effect) => effect.id === definition.id)) api.registerEffect(definition); });
    const scope = document.querySelector(".scope-label"); if (scope) scope.textContent = "Build step 8";
    const copy = document.querySelector(".app-header p"); if (copy) copy.textContent = "Local prop tracking with several movement-driven visual effects.";
    document.title = "ShitJuggler — Movement Effects";
    installInterface(api);
  }

  const exported = {
    EFFECT_ID, SPARK_EFFECT_ID, ORBIT_EFFECT_ID, SYMBOL_EFFECT_ID, MAX_SPARKS,
    collectTrailPoints, collectSymbolPlacements, colorForTrack,
    createMotionTrailsDefinition, createEndpointSparksDefinition, createEndpointSparksInstance,
    createOrbitingEchoesDefinition, createPathSymbolsDefinition,
    drawMotionTrailsFrame, drawOrbitingEchoesFrame, drawPathSymbolsFrame,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  if (globalScope) globalScope.ShitJugglerMotionTrails = Object.freeze(exported);
  installBrowser();
})(typeof globalThis !== "undefined" ? globalThis : this);
