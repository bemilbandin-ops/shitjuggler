# ShitJuggler

Browser-based workspace for live and recorded juggling footage.

## Current scope: build step 5

This implementation includes:

- Live camera capture through `getUserMedia`
- Local video-file upload
- Custom play, pause, restart, seek, time-display, and click-video playback controls
- Current-frame prop detection for live camera and uploaded video sources
- Adjustable brightness, target-color, and captured-background-difference signals
- Any/all combination of enabled detection methods
- User-assisted target-color sampling by clicking or tapping the visible video
- Lower-resolution offscreen frame processing while the displayed video remains sharp
- Connected-region filtering by minimum/maximum size, fill, and aspect ratio
- Stable multi-frame prop IDs with motion-aware detection association
- Smoothed position, size, velocity, speed, direction, angle, length, and tracking confidence
- Bounded recent movement history for every tracked prop
- Short prediction and confidence fading when a prop is temporarily lost
- Explicit history breaks after loss, seeking, restart, source changes, or timeline jumps so unrelated positions are never joined
- A canvas overlay with tracked boxes, IDs, confidence, speed, movement vectors, and recent paths
- An independent visual-effect registry and runtime on a dedicated canvas
- Effect-definition validation for unique IDs, effect briefs, movement inputs, controls, presets, and lifecycle hooks
- Source-to-display coordinate mapping for current tracks and bounded movement history
- Effect cleanup on switching, unregistering, source changes, seeking, runtime reset, draw failure, and page exit
- Optional detection-mask overlay and processing status
- Responsive desktop and mobile controls

Raw current-frame detections remain available through `window.shitJuggler.getCurrentDetections()` and the `shitjuggler:detections` event. The same event also includes a `tracks` array.

Stable tracked props are available through `window.shitJuggler.getCurrentTracks()`, `window.shitJuggler.getTrackingSnapshot()`, and the `shitjuggler:tracks` event. Each track includes a stable `id`, current position, normalized position, approximate size and length, velocity, speed, movement direction and angle, confidence, status, missed-frame count, contributing detection methods, and bounded recent `history`. History points may include `breakBefore: true` to prevent effects from drawing across a tracking gap.

## Effect extension API

Build step 5 adds the structure for effects but intentionally does not bundle the first complete effect. Effects can be added independently through `window.shitJugglerEffects`:

- `registerEffect(definition)` validates and registers one effect definition.
- `unregisterEffect(effectId)` removes an effect and cleans it up if active.
- `listEffects()` returns effect metadata without exposing runtime state.
- `selectEffect(effectId)` activates one registered effect; pass `null` to clear the active effect.
- `setControls(values)` updates only controls declared by the selected effect.
- `applyPreset(presetId)` applies a declared preset to the selected effect.
- `reset(reason)` clears stored effect data while preserving the selected effect and its current controls.
- `getState()` returns the selected effect, current controls, last runtime error, and registered metadata.

Every registered effect must provide a unique ID and name, visual description, movement inputs, the required effect brief, effect-specific controls, optional presets, and a `create()` factory. The factory returns an isolated instance with `draw()` and optional `activate()`, `controlsChanged()`, and `cleanup()` lifecycle methods. The runtime maps source coordinates into the contained video rectangle before calling `draw()`.

The runtime listens to `shitjuggler:tracks`, so new effects consume tracking output without modifying detection, tracking, media, or playback code. A failing effect is cleaned up and deselected instead of breaking the frame-processing loop.

The first complete visual effect, its approved brief, and effect-specific interface controls remain intentionally deferred to build step 6.

## Run locally

Camera access requires a secure context. `localhost` is treated as secure by modern browsers.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Validate core logic

The tracker and effect runtime have dependency-free Node smoke tests:

```bash
node tracking.test.js
node effects.test.js
```

## Browser notes

- Camera permission must be granted when prompted.
- Uploaded video support depends on the browser's available codecs.
- Background-difference detection works best when the camera is fixed and the reference frame contains no moving props.
- Detection processing uses only the current frame plus one optional captured background frame.
- Tracking retains only a short, bounded movement history for each active prop.
- Effect instances own their temporary state and must release it in `cleanup()`.
- No uploaded file or captured frame leaves the browser.
