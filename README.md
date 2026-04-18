# Video Pitch Tuner

A Microsoft Edge extension that changes the pitch of the active page video without changing playback speed.

The extension ships as plain Manifest V3 files, so you can load it directly in Edge with no build step.

## Load in Edge

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.

## Use

1. Open a page with an HTML5 video element.
2. Start playback.
3. Open the extension popup.
4. Use `-` or `+` to lower or raise the pitch in one-semitone steps.
5. Use **Reset** to return to the original pitch.

## Behavior

- Pitch range is `-12` to `+12` semitones.
- Adjustments are whole semitones only.
- The popup shows `Ready`, `No Video`, or `Unsupported` depending on the active tab state.
- The extension tracks the active page video and prefers the currently playing one if multiple `video` elements exist.

## Notes

- This version targets standard top-document HTML5 `video` elements.
- State is per tab session and resets when the tab reloads or closes.
- Some sites with custom protected players, unusual audio pipelines, or cross-origin iframe players may show as unsupported.
