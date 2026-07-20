# ShitJuggler

Browser-based workspace for live and recorded juggling footage.

## Current scope: build step 3

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
- A canvas overlay with current bounding boxes, center markers, confidence, and contributing methods
- Optional detection-mask overlay and basic processing status
- Cleanup of detections, masks, background references, camera tracks, and temporary object URLs when sources change
- Responsive desktop and mobile controls

Each current-frame detection is exposed through `window.shitJuggler.getCurrentDetections()` and the `shitjuggler:detections` window event. Detection objects include center `x`/`y`, bounding `width`/`height`, `area`, `score`/`confidence`, and contributing `method`/`methods`.

Stable multi-frame tracking, movement history, visual effects, presets, and interface refinement are intentionally not implemented yet. Build step 4 will consume the current-frame detections and add tracking separately.

## Run locally

Camera access requires a secure context. `localhost` is treated as secure by modern browsers.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Browser notes

- Camera permission must be granted when prompted.
- Uploaded video support depends on the browser's available codecs.
- Background-difference detection works best when the camera is fixed and the reference frame contains no moving props.
- Detection processing uses only the current frame plus one optional captured background frame; it does not retain unlimited footage.
- No uploaded file or captured frame leaves the browser.
