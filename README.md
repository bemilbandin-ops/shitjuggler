# ShitJuggler

Browser-based workspace for live and recorded juggling footage.

## Current scope: build step 4

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
- Optional detection-mask overlay and processing status
- Cleanup of detections, tracks, histories, masks, background references, camera tracks, and temporary object URLs when sources change
- Responsive desktop and mobile controls

Raw current-frame detections remain available through `window.shitJuggler.getCurrentDetections()` and the `shitjuggler:detections` event. The same event now also includes a `tracks` array.

Stable tracked props are available through `window.shitJuggler.getCurrentTracks()`, `window.shitJuggler.getTrackingSnapshot()`, and the `shitjuggler:tracks` event. Each track includes a stable `id`, current position, normalized position, approximate size and length, velocity, speed, movement direction and angle, confidence, status, missed-frame count, contributing detection methods, and bounded recent `history`. History points may include `breakBefore: true` to prevent effects from drawing across a tracking gap.

Visual effects, effect-specific controls, presets, performance adaptation, and interface refinement are intentionally not implemented yet. Build step 5 can consume the tracked-prop API without rebuilding detection or tracking.

## Run locally

Camera access requires a secure context. `localhost` is treated as secure by modern browsers.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Validate tracking logic

The tracker has a dependency-free Node smoke test:

```bash
node tracking.test.js
```

## Browser notes

- Camera permission must be granted when prompted.
- Uploaded video support depends on the browser's available codecs.
- Background-difference detection works best when the camera is fixed and the reference frame contains no moving props.
- Detection processing uses only the current frame plus one optional captured background frame.
- Tracking retains only a short, bounded movement history for each active prop.
- No uploaded file or captured frame leaves the browser.
