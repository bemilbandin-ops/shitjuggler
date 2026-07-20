# ShitJuggler

Browser-based workspace for live and recorded juggling footage.

## Current scope: build step 7

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
- Confidence-aware neon motion trails driven by prop history, speed, size, and position
- Effect-specific controls for trail length, width, glow, opacity, head size, color response, and visibility
- Balanced, Comet, and Clean lines presets
- Local recording of the source video composited with the active effect
- Source, 1080p, 720p, and 480p export sizing without upscaling smaller footage
- 30 fps and 60 fps recording choices with browser-selected WebM or MP4 encoding
- Optional inclusion of the tracking diagnostics overlay in exported recordings
- Safe recording shutdown on source changes, seeking, playback completion, and page exit
- Optional detection-mask overlay and processing status
- Responsive desktop and mobile controls

Raw current-frame detections remain available through `window.shitJuggler.getCurrentDetections()` and the `shitjuggler:detections` event. The same event also includes a `tracks` array.

Stable tracked props are available through `window.shitJuggler.getCurrentTracks()`, `window.shitJuggler.getTrackingSnapshot()`, and the `shitjuggler:tracks` event. Each track includes a stable `id`, current position, normalized position, approximate size and length, velocity, speed, movement direction and angle, confidence, status, missed-frame count, contributing detection methods, and bounded recent `history`. History points may include `breakBefore: true` to prevent effects from drawing across a tracking gap.

## Neon motion trails

Build step 6 registers and selects `neon-motion-trails`, the first complete effect built on the independent runtime.

Approved effect brief:

- **Visual result:** each tracked prop becomes a bright moving head with a tapered neon ribbon behind it.
- **Movement connection:** tracked history shapes the ribbon while current position, speed, size, and confidence control its head, width, and visibility.
- **Behavior:** trails redraw from bounded recent history, fade toward older points, dim predicted tracks, and reset with the effect runtime.
- **Difference:** the effect converts movement into an expressive light path instead of duplicating detector boxes, IDs, or diagnostics.
- **Failure conditions:** trails must not cross explicit history breaks, retain stale paths after timeline resets, mutate tracking data, or perform unbounded per-frame work.

The interface exposes the effect selector, three presets, and effect-specific controls. Color can remain fixed, vary per tracked prop, or respond to speed. Selecting **No effect** clears the effect canvas without disabling tracking or detection.

## Rendered recording and export

Build step 7 adds local recording after detection, tracking, and effects have been composed. The recorder draws the original media frame into a dedicated export canvas, crops the display overlays to the actual contained video rectangle, scales them to the selected output dimensions, and records that canvas with `MediaRecorder`.

The active visual effect is always included. Tracking boxes, IDs, vectors, and diagnostic paths remain excluded unless **Include tracking diagnostics** is enabled. Letterbox regions are not exported.

The recorder:

- preserves the source aspect ratio
- never upscales footage smaller than the selected output size
- selects the first encoding supported by the browser from VP9 WebM, VP8 WebM, generic WebM, H.264/AAC MP4, and generic MP4
- includes uploaded-video audio when the browser exposes an audio track through media capture
- stops and finalizes when uploaded playback ends
- stops before a seek to avoid exporting unrelated timeline sections as one continuous movement
- discards an incomplete recording when the media source changes or the page exits
- retains the last completed recording as a local download until a new recording starts or the page closes

Recording state is available through `window.shitJugglerRecorder.getState()`. The same API exposes `start()`, `stop(options)`, and `download()` for browser-side integrations. Recording lifecycle events are emitted as `shitjuggler:recordingstart` and `shitjuggler:recordingstop`.

## Effect extension API

Effects can be added independently through `window.shitJugglerEffects`:

- `registerEffect(definition)` validates and registers one effect definition.
- `unregisterEffect(effectId)` removes an effect and cleans it up if active.
- `listEffects()` returns effect metadata without exposing runtime state.
- `selectEffect(effectId)` activates one registered effect; pass `null` to clear the active effect.
- `setControls(values)` updates only controls declared by the selected effect.
- `applyPreset(presetId)` applies a declared preset to the selected effect.
- `reset(reason)` clears stored effect data while preserving the selected effect and its current controls.
- `getState()` returns the selected effect, current controls, last runtime error, and registered metadata.

Every registered effect must provide a unique ID and name, visual description, movement inputs, the required effect brief, effect-specific controls, optional presets, and a `create()` factory. The factory returns an isolated instance with `draw()` and optional `activate()`, `controlsChanged()`, and `cleanup()` lifecycle methods. The runtime maps source coordinates into the contained video rectangle before calling `draw()`.

The runtime listens to `shitjuggler:tracks`, so new effects consume tracking output without modifying detection, tracking, media, playback, or recording code. A failing effect is cleaned up and deselected instead of breaking the frame-processing loop.

## Run locally

Camera access requires a secure context. `localhost` is treated as secure by modern browsers.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Validate core logic

The tracker, effect runtime, motion-trail effect, and recording geometry/format selection have dependency-free Node smoke tests:

```bash
node tracking.test.js
node effects.test.js
node motion-trails.test.js
node recording.test.js
```

## Browser notes

- Camera permission must be granted when prompted.
- Uploaded video support depends on the browser's available codecs.
- Background-difference detection works best when the camera is fixed and the reference frame contains no moving props.
- Detection processing uses only the current frame plus one optional captured background frame.
- Tracking retains only a short, bounded movement history for each active prop.
- Effect instances own their temporary state and must release it in `cleanup()`.
- The neon trail renderer respects `breakBefore` history markers and never joins separated track segments.
- Recording requires both `HTMLCanvasElement.captureStream()` and `MediaRecorder`.
- The downloaded container and codec depend on browser support; WebM is expected in most Chromium and Firefox configurations, while MP4 may be selected where supported.
- Uploaded-video audio export depends on the browser exposing audio through `HTMLMediaElement.captureStream()`.
- No uploaded file, captured frame, effect frame, or completed recording leaves the browser.
