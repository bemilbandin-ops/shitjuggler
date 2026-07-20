# ShitJuggler

Browser-based workspace for live and recorded juggling footage.

## Current scope: build step 1

This first implementation includes only:

- Live camera capture through `getUserMedia`
- Local video-file upload and playback
- Clean switching between live and uploaded sources
- Cleanup of camera tracks and temporary object URLs
- Responsive desktop and mobile layout

Tracking, detection, custom playback controls, and visual effects are intentionally not included yet.

## Run locally

Camera access requires a secure context. `localhost` is treated as secure by modern browsers.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Browser notes

- Camera permission must be granted when prompted.
- Uploaded video support depends on the browser's available codecs.
- No uploaded file leaves the browser; playback uses a temporary local object URL.
