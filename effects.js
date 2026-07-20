(function initializeEffectModule(globalScope) {
  "use strict";

  const EFFECT_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const CONTROL_TYPES = new Set(["range", "number", "boolean", "color", "select", "text"]);
  const REQUIRED_BRIEF_FIELDS = [
    "visualResult",
    "movementConnection",
    "behavior",
    "difference",
    "failureConditions",
  ];

  function assertEffect(condition, message) {
    if (!condition) throw new Error(message);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
    }
    return value;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function requiredString(value, label) {
    assertEffect(typeof value === "string" && value.trim(), `${label} must be a non-empty string.`);
    return value.trim();
  }

  function sanitizeControlValue(control, value) {
    if (control.type === "range" || control.type === "number") {
      const numeric = Number(value);
      const safe = Number.isFinite(numeric) ? numeric : control.defaultValue;
      const clamped = clamp(safe, control.min, control.max);
      const stepped = control.min + Math.round((clamped - control.min) / control.step) * control.step;
      return Number(clamp(stepped, control.min, control.max).toFixed(8));
    }

    if (control.type === "boolean") return Boolean(value);
    if (control.type === "select") {
      return control.options.some((option) => option.value === value) ? value : control.defaultValue;
    }
    if (control.type === "color") {
      return /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : control.defaultValue;
    }
    return String(value ?? "");
  }

  function normalizeControl(control, effectId) {
    assertEffect(control && typeof control === "object", `Effect "${effectId}" has an invalid control.`);
    const id = requiredString(control.id, `Effect "${effectId}" control id`);
    assertEffect(EFFECT_ID_PATTERN.test(id), `Effect "${effectId}" control id "${id}" is invalid.`);

    const type = control.type || "range";
    assertEffect(CONTROL_TYPES.has(type), `Effect "${effectId}" control "${id}" has unsupported type "${type}".`);

    const normalized = {
      id,
      label: requiredString(control.label || id, `Effect "${effectId}" control "${id}" label`),
      type,
      defaultValue: control.defaultValue,
    };

    if (type === "range" || type === "number") {
      normalized.min = Number.isFinite(control.min) ? control.min : 0;
      normalized.max = Number.isFinite(control.max) ? control.max : 1;
      normalized.step = Number.isFinite(control.step) && control.step > 0 ? control.step : 0.01;
      assertEffect(normalized.max >= normalized.min, `Effect "${effectId}" control "${id}" must have max >= min.`);
      normalized.defaultValue = Number.isFinite(control.defaultValue)
        ? clamp(control.defaultValue, normalized.min, normalized.max)
        : normalized.min;
    } else if (type === "boolean") {
      normalized.defaultValue = Boolean(control.defaultValue);
    } else if (type === "select") {
      assertEffect(Array.isArray(control.options) && control.options.length, `Effect "${effectId}" select control "${id}" requires options.`);
      normalized.options = control.options.map((option) => {
        if (typeof option === "string") return { value: option, label: option };
        assertEffect(option && typeof option === "object", `Effect "${effectId}" control "${id}" has an invalid option.`);
        return {
          value: requiredString(option.value, `Effect "${effectId}" control "${id}" option value`),
          label: requiredString(option.label || option.value, `Effect "${effectId}" control "${id}" option label`),
        };
      });
      normalized.defaultValue = normalized.options.some((option) => option.value === control.defaultValue)
        ? control.defaultValue
        : normalized.options[0].value;
    } else if (type === "color") {
      normalized.defaultValue = /^#[0-9a-f]{6}$/i.test(control.defaultValue || "")
        ? control.defaultValue
        : "#ffffff";
    } else {
      normalized.defaultValue = String(control.defaultValue ?? "");
    }

    return deepFreeze(normalized);
  }

  function normalizePreset(preset, controls, effectId) {
    assertEffect(preset && typeof preset === "object", `Effect "${effectId}" has an invalid preset.`);
    const id = requiredString(preset.id, `Effect "${effectId}" preset id`);
    assertEffect(EFFECT_ID_PATTERN.test(id), `Effect "${effectId}" preset id "${id}" is invalid.`);
    const controlMap = new Map(controls.map((control) => [control.id, control]));
    const values = {};

    Object.entries(preset.values || {}).forEach(([controlId, value]) => {
      assertEffect(controlMap.has(controlId), `Effect "${effectId}" preset "${id}" uses unknown control "${controlId}".`);
      values[controlId] = sanitizeControlValue(controlMap.get(controlId), value);
    });

    return deepFreeze({
      id,
      name: requiredString(preset.name || id, `Effect "${effectId}" preset "${id}" name`),
      values,
    });
  }

  function normalizeDefinition(definition) {
    assertEffect(definition && typeof definition === "object", "Effect definition must be an object.");
    const id = requiredString(definition.id, "Effect id");
    assertEffect(EFFECT_ID_PATTERN.test(id), `Effect id "${id}" is invalid.`);
    assertEffect(typeof definition.create === "function", `Effect "${id}" must define create().`);

    const brief = definition.brief || {};
    REQUIRED_BRIEF_FIELDS.forEach((field) => requiredString(brief[field], `Effect "${id}" brief.${field}`));

    const controls = (definition.controls || []).map((control) => normalizeControl(control, id));
    const controlIds = new Set();
    controls.forEach((control) => {
      assertEffect(!controlIds.has(control.id), `Effect "${id}" repeats control id "${control.id}".`);
      controlIds.add(control.id);
    });

    return deepFreeze({
      id,
      name: requiredString(definition.name, `Effect "${id}" name`),
      description: requiredString(definition.description, `Effect "${id}" description`),
      movementInputs: deepFreeze(
        (definition.movementInputs || []).map((input) => requiredString(input, `Effect "${id}" movement input`)),
      ),
      brief: deepFreeze(
        Object.fromEntries(REQUIRED_BRIEF_FIELDS.map((field) => [field, brief[field].trim()])),
      ),
      controls: deepFreeze(controls),
      presets: deepFreeze((definition.presets || []).map((preset) => normalizePreset(preset, controls, id))),
      clearBeforeDraw: definition.clearBeforeDraw !== false,
      create: definition.create,
    });
  }

  function publicMetadata(definition) {
    return clone({
      id: definition.id,
      name: definition.name,
      description: definition.description,
      movementInputs: definition.movementInputs,
      brief: definition.brief,
      controls: definition.controls,
      presets: definition.presets,
      clearBeforeDraw: definition.clearBeforeDraw,
    });
  }

  class EffectRegistry {
    constructor() {
      this.effects = new Map();
      this.listeners = new Set();
    }

    register(definition) {
      const normalized = normalizeDefinition(definition);
      assertEffect(!this.effects.has(normalized.id), `Effect id "${normalized.id}" is already registered.`);
      this.effects.set(normalized.id, normalized);
      this.notify({ type: "registered", effectId: normalized.id });
      return publicMetadata(normalized);
    }

    unregister(effectId) {
      if (!this.effects.has(effectId)) return false;
      this.effects.delete(effectId);
      this.notify({ type: "unregistered", effectId });
      return true;
    }

    get(effectId) {
      return this.effects.get(effectId) || null;
    }

    list() {
      return Array.from(this.effects.values(), publicMetadata);
    }

    subscribe(listener) {
      assertEffect(typeof listener === "function", "Registry listener must be a function.");
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    notify(event) {
      this.listeners.forEach((listener) => listener({ ...event }));
    }
  }

  function cloneTrack(track) {
    return {
      ...track,
      direction: track.direction ? { ...track.direction } : undefined,
      size: track.size ? { ...track.size } : undefined,
      methods: Array.isArray(track.methods) ? [...track.methods] : [],
      history: Array.isArray(track.history) ? track.history.map((point) => ({ ...point })) : [],
    };
  }

  class EffectRuntime {
    constructor({ registry, canvas, pixelRatioLimit = 2, onError = null } = {}) {
      assertEffect(registry instanceof EffectRegistry, "EffectRuntime requires an EffectRegistry.");
      assertEffect(canvas && typeof canvas.getContext === "function", "EffectRuntime requires a canvas.");
      const context = canvas.getContext("2d");
      assertEffect(context, "EffectRuntime could not obtain a 2D canvas context.");

      this.registry = registry;
      this.canvas = canvas;
      this.context = context;
      this.pixelRatioLimit = Math.max(1, pixelRatioLimit);
      this.onError = typeof onError === "function" ? onError : null;
      this.displayWidth = 1;
      this.displayHeight = 1;
      this.pixelRatio = 1;
      this.active = null;
      this.controls = {};
      this.lastTimestamp = null;
      this.frameNumber = 0;
      this.lastError = null;
      this.destroyed = false;
      this.unsubscribeRegistry = registry.subscribe((event) => {
        if (event.type === "unregistered" && this.active?.definition.id === event.effectId) {
          this.select(null, "effect-unregistered");
        }
      });
    }

    resize(width = this.canvas.clientWidth, height = this.canvas.clientHeight, pixelRatio = 1) {
      const safeWidth = Math.max(1, Number(width) || 1);
      const safeHeight = Math.max(1, Number(height) || 1);
      const safeRatio = clamp(Number(pixelRatio) || 1, 1, this.pixelRatioLimit);
      const bitmapWidth = Math.max(1, Math.round(safeWidth * safeRatio));
      const bitmapHeight = Math.max(1, Math.round(safeHeight * safeRatio));

      this.displayWidth = safeWidth;
      this.displayHeight = safeHeight;
      this.pixelRatio = safeRatio;
      if (this.canvas.width !== bitmapWidth || this.canvas.height !== bitmapHeight) {
        this.canvas.width = bitmapWidth;
        this.canvas.height = bitmapHeight;
      }
      if (this.canvas.style) {
        this.canvas.style.width = `${safeWidth}px`;
        this.canvas.style.height = `${safeHeight}px`;
      }
      this.context.setTransform?.(safeRatio, 0, 0, safeRatio, 0, 0);
      return { width: safeWidth, height: safeHeight, pixelRatio: safeRatio };
    }

    clear() {
      this.context.clearRect(0, 0, this.displayWidth, this.displayHeight);
    }

    createActive(definition) {
      const instance = definition.create({
        canvas: this.canvas,
        context: this.context,
        clear: () => this.clear(),
      });
      assertEffect(instance && typeof instance.draw === "function", `Effect "${definition.id}" create() must return an object with draw().`);
      instance.activate?.({ canvas: this.canvas, context: this.context, controls: clone(this.controls) });
      return { definition, instance };
    }

    select(effectId, reason = "effect-switch") {
      assertEffect(!this.destroyed, "EffectRuntime has been destroyed.");
      if (effectId === null || effectId === undefined || effectId === "") {
        this.disposeActive(reason);
        this.controls = {};
        this.clear();
        return this.getState();
      }

      const definition = this.registry.get(effectId);
      assertEffect(definition, `Effect "${effectId}" is not registered.`);
      if (this.active?.definition.id === effectId) return this.getState();

      this.disposeActive(reason);
      this.controls = Object.fromEntries(
        definition.controls.map((control) => [control.id, clone(control.defaultValue)]),
      );
      this.active = this.createActive(definition);
      this.lastTimestamp = null;
      this.frameNumber = 0;
      this.clear();
      return this.getState();
    }

    setControls(values) {
      assertEffect(this.active, "Select an effect before changing controls.");
      assertEffect(values && typeof values === "object", "Effect controls must be an object.");
      const controlMap = new Map(this.active.definition.controls.map((control) => [control.id, control]));

      Object.entries(values).forEach(([controlId, value]) => {
        assertEffect(controlMap.has(controlId), `Effect "${this.active.definition.id}" has no control "${controlId}".`);
        this.controls[controlId] = sanitizeControlValue(controlMap.get(controlId), value);
      });
      this.active.instance.controlsChanged?.(clone(this.controls));
      return clone(this.controls);
    }

    applyPreset(presetId) {
      assertEffect(this.active, "Select an effect before applying a preset.");
      const preset = this.active.definition.presets.find((item) => item.id === presetId);
      assertEffect(preset, `Effect "${this.active.definition.id}" has no preset "${presetId}".`);
      return this.setControls(preset.values);
    }

    getContainRect(sourceWidth, sourceHeight) {
      if (!sourceWidth || !sourceHeight) {
        return { left: 0, top: 0, width: this.displayWidth, height: this.displayHeight };
      }
      const scale = Math.min(this.displayWidth / sourceWidth, this.displayHeight / sourceHeight);
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      return {
        left: (this.displayWidth - width) / 2,
        top: (this.displayHeight - height) / 2,
        width,
        height,
      };
    }

    prepareFrame(frame) {
      const sourceWidth = Math.max(0, Number(frame.sourceWidth) || 0);
      const sourceHeight = Math.max(0, Number(frame.sourceHeight) || 0);
      const timestamp = Number.isFinite(frame.timestamp)
        ? frame.timestamp
        : typeof performance !== "undefined"
          ? performance.now() / 1000
          : Date.now() / 1000;
      const deltaTime = this.lastTimestamp === null
        ? 1 / 60
        : clamp(timestamp - this.lastTimestamp, 1 / 240, 0.25);
      this.lastTimestamp = timestamp;
      this.frameNumber += 1;

      const videoRect = this.getContainRect(sourceWidth, sourceHeight);
      const mapPoint = (x, y) => ({
        x: videoRect.left + (sourceWidth > 0 ? x / sourceWidth : 0) * videoRect.width,
        y: videoRect.top + (sourceHeight > 0 ? y / sourceHeight : 0) * videoRect.height,
      });

      const tracks = (frame.tracks || []).map((sourceTrack) => {
        const track = cloneTrack(sourceTrack);
        const center = mapPoint(track.x || 0, track.y || 0);
        const width = sourceWidth > 0 ? ((track.width || 0) / sourceWidth) * videoRect.width : 0;
        const height = sourceHeight > 0 ? ((track.height || 0) / sourceHeight) * videoRect.height : 0;
        return {
          ...track,
          displayX: center.x,
          displayY: center.y,
          displayWidth: width,
          displayHeight: height,
          displayLength: Math.max(width, height),
          display: { x: center.x, y: center.y, width, height, length: Math.max(width, height) },
          history: track.history.map((point) => ({
            ...point,
            display: mapPoint(point.x || 0, point.y || 0),
          })),
        };
      });

      return {
        source: frame.source || "none",
        mediaTime: Number.isFinite(frame.mediaTime) ? frame.mediaTime : 0,
        sourceWidth,
        sourceHeight,
        timestamp,
        deltaTime,
        frameNumber: this.frameNumber,
        canvasWidth: this.displayWidth,
        canvasHeight: this.displayHeight,
        pixelRatio: this.pixelRatio,
        videoRect,
        tracks,
        mapPoint,
      };
    }

    render(frame = {}) {
      if (this.destroyed) return false;
      if (!this.active) {
        this.clear();
        return false;
      }

      const preparedFrame = this.prepareFrame(frame);
      if (this.active.definition.clearBeforeDraw) this.clear();

      try {
        this.context.save();
        this.active.instance.draw(preparedFrame, {
          canvas: this.canvas,
          context: this.context,
          controls: clone(this.controls),
          clear: () => this.clear(),
        });
        this.context.restore();
        this.lastError = null;
        return true;
      } catch (error) {
        try {
          this.context.restore();
        } catch {
          // A custom effect may leave canvas state unbalanced; cleanup still isolates it.
        }
        this.lastError = error instanceof Error ? error : new Error(String(error));
        const failedEffectId = this.active.definition.id;
        this.disposeActive("draw-error");
        this.controls = {};
        this.clear();
        this.onError?.(this.lastError, failedEffectId);
        return false;
      }
    }

    reset(reason = "runtime-reset") {
      if (!this.active) {
        this.lastTimestamp = null;
        this.frameNumber = 0;
        this.clear();
        return this.getState();
      }

      const definition = this.active.definition;
      const preservedControls = clone(this.controls);
      this.disposeActive(reason);
      this.controls = preservedControls;
      this.active = this.createActive(definition);
      this.lastTimestamp = null;
      this.frameNumber = 0;
      this.clear();
      return this.getState();
    }

    disposeActive(reason) {
      if (!this.active) return;
      this.active.instance.cleanup?.({
        reason,
        canvas: this.canvas,
        context: this.context,
        controls: clone(this.controls),
      });
      this.active = null;
    }

    getState() {
      return {
        selectedEffectId: this.active?.definition.id || null,
        controls: clone(this.controls),
        lastError: this.lastError?.message || null,
      };
    }

    destroy() {
      if (this.destroyed) return;
      this.disposeActive("runtime-destroyed");
      this.unsubscribeRegistry?.();
      this.clear();
      this.destroyed = true;
    }
  }

  function installBrowserHost() {
    if (typeof document === "undefined" || typeof window === "undefined") return null;
    const videoSurface = document.querySelector("#video-surface");
    if (!videoSurface) return null;

    let canvas = document.querySelector("#effect-overlay");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "effect-overlay";
      canvas.setAttribute("aria-hidden", "true");
      videoSurface.insertBefore(canvas, document.querySelector("#detection-overlay") || null);
    }

    Object.assign(canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      zIndex: "1",
      pointerEvents: "none",
    });

    const registry = new EffectRegistry();
    const runtime = new EffectRuntime({
      registry,
      canvas,
      onError(error, effectId) {
        window.dispatchEvent(
          new CustomEvent("shitjuggler:effecterror", {
            detail: { effectId, message: error.message, error },
          }),
        );
      },
    });

    let lastSource = null;
    let lastMediaTime = null;
    const resize = () => {
      const bounds = videoSurface.getBoundingClientRect();
      runtime.resize(bounds.width, bounds.height, Math.min(window.devicePixelRatio || 1, 2));
    };

    const resetForMediaChange = () => {
      lastSource = null;
      lastMediaTime = null;
      runtime.reset("media-change");
    };

    window.addEventListener("shitjuggler:tracks", (event) => {
      const detail = event.detail || {};
      const source = detail.source || "none";
      const mediaTime = Number.isFinite(detail.mediaTime) ? detail.mediaTime : null;
      const sourceChanged = lastSource !== null && source !== lastSource;
      const movedBackward = mediaTime !== null && lastMediaTime !== null && mediaTime < lastMediaTime - 0.04;
      const jumpedForward =
        source === "upload" && mediaTime !== null && lastMediaTime !== null && mediaTime - lastMediaTime > 0.75;

      if (source === "none" || sourceChanged || movedBackward || jumpedForward) {
        runtime.reset(source === "none" ? "source-cleared" : "timeline-reset");
      }

      lastSource = source;
      lastMediaTime = mediaTime;
      resize();
      runtime.render({
        ...detail,
        timestamp: typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000,
      });
    });

    window.addEventListener("resize", resize);
    window.addEventListener("pagehide", () => runtime.destroy(), { once: true });
    const mediaView = document.querySelector("#media-view");
    mediaView?.addEventListener("seeking", resetForMediaChange);
    mediaView?.addEventListener("emptied", resetForMediaChange);
    if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(videoSurface);
    resize();

    const api = Object.freeze({
      registerEffect: (definition) => registry.register(definition),
      unregisterEffect: (effectId) => registry.unregister(effectId),
      listEffects: () => registry.list(),
      selectEffect(effectId) {
        const state = runtime.select(effectId);
        window.dispatchEvent(new CustomEvent("shitjuggler:effectchange", { detail: state }));
        return state;
      },
      setControls(values) {
        const controls = runtime.setControls(values);
        window.dispatchEvent(
          new CustomEvent("shitjuggler:effectcontrols", {
            detail: { selectedEffectId: runtime.getState().selectedEffectId, controls },
          }),
        );
        return controls;
      },
      applyPreset: (presetId) => runtime.applyPreset(presetId),
      reset: (reason) => runtime.reset(reason),
      getState: () => ({ ...runtime.getState(), effects: registry.list() }),
    });

    window.shitJugglerEffects = api;
    window.dispatchEvent(new CustomEvent("shitjuggler:effectsready", { detail: { api } }));
    return { registry, runtime, api };
  }

  const exported = { EffectRegistry, EffectRuntime };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  if (globalScope) globalScope.ShitJugglerEffectCore = Object.freeze(exported);
  installBrowserHost();
})(typeof globalThis !== "undefined" ? globalThis : this);
