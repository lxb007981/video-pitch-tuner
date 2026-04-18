# Video Pitch Tuner

An unpacked Microsoft Edge extension that changes the pitch of the active page video without changing playback speed.

## Load in Edge

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.

## Use

1. Open a page with an HTML5 video element.
2. Start playback.
3. Open the extension popup.
4. Move the semitone slider or click **Reset**.

## Notes

- This first version targets standard top-document `video` elements.
- State is per tab session and resets when the page reloads.
- Some sites with custom protected players or cross-origin iframes may show as unsupported.
