# ShitJuggler

Browser-based workspace for live and recorded juggling footage.

## Current scope: build step 2

This implementation includes:

- Live camera capture through `getUserMedia`
- Local video-file upload
- Custom play and pause control for uploaded video
- Restart-from-beginning control
- Seekable playback timeline with current time and duration
- Click-on-video play and pause behavior
- Clean switching between live and uploaded sources
- Cleanup of camera tracks and temporary object URLs
- Responsive desktop and mobile layout

Detection, tracking, effects, and advanced playback tools such as frame stepping or playback speed are intentionally not included yet.

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
