const STATUS = {
  READY: "ready",
  NO_VIDEO: "no_video",
  UNSUPPORTED: "unsupported"
};

class VideoPitchController {
  constructor() {
    this.audioContext = null;
    this.workletNode = null;
    this.mediaSourceNode = null;
    this.currentVideo = null;
    this.activeVideo = null;
    this.sourceNodes = new WeakMap();
    this.knownVideos = new Set();
    this.semitones = 0;
    this.supportError = "";
    this.scanQueued = false;
    this.workletLoaded = false;

    this.boundOnPlay = (event) => this.onVideoPlaying(event);
    this.boundOnPause = (event) => this.onVideoPaused(event);
    this.boundOnEnded = (event) => this.onVideoPaused(event);
    this.boundOnVolumeChange = () => {
      if (this.workletNode && this.activeVideo) {
        this.syncVideoProperties(this.activeVideo);
      }
    };
    this.boundOnVisibilityChange = () => this.queueScan();

    this.observeDom();
    this.scanForVideos();
    document.addEventListener("visibilitychange", this.boundOnVisibilityChange);
  }

  observeDom() {
    this.observer = new MutationObserver(() => this.queueScan());
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  queueScan() {
    if (this.scanQueued) {
      return;
    }

    this.scanQueued = true;
    queueMicrotask(() => {
      this.scanQueued = false;
      this.scanForVideos();
    });
  }

  scanForVideos() {
    const videos = Array.from(document.querySelectorAll("video"));
    const nextSet = new Set(videos);

    for (const video of this.knownVideos) {
      if (!nextSet.has(video)) {
        this.detachVideoListeners(video);
      }
    }

    for (const video of videos) {
      if (!this.knownVideos.has(video)) {
        this.attachVideoListeners(video);
      }
    }

    this.knownVideos = nextSet;

    if (this.activeVideo && !this.knownVideos.has(this.activeVideo)) {
      this.activeVideo = null;
      this.releaseCurrentGraph();
    }

    if (!this.activeVideo) {
      const candidate = this.findPreferredVideo(videos);
      if (candidate) {
        this.setActiveVideo(candidate);
      }
    }
  }

  attachVideoListeners(video) {
    video.addEventListener("play", this.boundOnPlay);
    video.addEventListener("playing", this.boundOnPlay);
    video.addEventListener("pause", this.boundOnPause);
    video.addEventListener("ended", this.boundOnEnded);
    video.addEventListener("volumechange", this.boundOnVolumeChange);
  }

  detachVideoListeners(video) {
    video.removeEventListener("play", this.boundOnPlay);
    video.removeEventListener("playing", this.boundOnPlay);
    video.removeEventListener("pause", this.boundOnPause);
    video.removeEventListener("ended", this.boundOnEnded);
    video.removeEventListener("volumechange", this.boundOnVolumeChange);
  }

  findPreferredVideo(videos = Array.from(this.knownVideos)) {
    return (
      videos.find((video) => !video.paused && !video.ended && video.readyState > 0) ||
      videos.find((video) => video.readyState > 0) ||
      videos[0] ||
      null
    );
  }

  onVideoPlaying(event) {
    const video = event.currentTarget;
    this.setActiveVideo(video);
  }

  onVideoPaused(event) {
    const video = event.currentTarget;

    if (this.activeVideo !== video) {
      return;
    }

    const replacement = this.findPreferredVideo(
      Array.from(this.knownVideos).filter((candidate) => candidate !== video)
    );

    if (replacement) {
      this.setActiveVideo(replacement);
      return;
    }

    this.releaseCurrentGraph();
    this.activeVideo = video.isConnected ? video : null;
  }

  setActiveVideo(video) {
    if (!video || video === this.activeVideo) {
      return;
    }

    this.activeVideo = video;
    this.supportError = "";

    if (this.currentVideo && this.currentVideo !== video) {
      this.releaseCurrentGraph();
    }
  }

  async ensureAudioGraph() {
    if (this.workletNode && this.currentVideo === this.activeVideo) {
      await this.resumeAudioContext();
      this.syncVideoProperties(this.activeVideo);
      return;
    }

    if (!window.AudioContext) {
      throw new Error("Web Audio API is not available.");
    }

    if (!this.activeVideo) {
      throw new Error("No active video found.");
    }

    this.releaseCurrentGraph();

    if (!this.audioContext) {
      this.audioContext = new AudioContext({
        latencyHint: "interactive"
      });
    }

    if (!this.audioContext.audioWorklet) {
      throw new Error("AudioWorklet is not available.");
    }

    if (!this.workletLoaded) {
      await this.audioContext.audioWorklet.addModule(
        chrome.runtime.getURL("audio/pitch-shift-worklet.js")
      );
      this.workletLoaded = true;
    }

    let mediaSourceNode = this.sourceNodes.get(this.activeVideo);

    if (!mediaSourceNode) {
      mediaSourceNode = this.audioContext.createMediaElementSource(this.activeVideo);
      this.sourceNodes.set(this.activeVideo, mediaSourceNode);
    }

    this.mediaSourceNode = mediaSourceNode;
    this.workletNode = new AudioWorkletNode(this.audioContext, "pitch-shift-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2]
    });
    this.workletNode.connect(this.audioContext.destination);
    this.mediaSourceNode.connect(this.workletNode);
    this.currentVideo = this.activeVideo;

    this.syncVideoProperties(this.activeVideo);
    this.setPitchValue(this.semitones);
    await this.resumeAudioContext();
  }

  async resumeAudioContext() {
    if (this.audioContext?.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  syncVideoProperties(video) {
    if (!this.workletNode || !video) {
      return;
    }

    this.workletNode.port.postMessage({
      type: "sync-media-state",
      muted: video.muted,
      volume: video.volume
    });
  }

  setPitchValue(semitones) {
    this.semitones = clampSemitones(semitones);

    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: "set-semitones",
        semitones: this.semitones
      });
    }
  }

  releaseCurrentGraph() {
    if (this.mediaSourceNode) {
      try {
        this.mediaSourceNode.disconnect();
      } catch (error) {
        void error;
      }
    }

    if (this.workletNode) {
      try {
        this.workletNode.disconnect();
      } catch (error) {
        void error;
      }
    }

    this.mediaSourceNode = null;
    this.workletNode = null;
    this.currentVideo = null;
  }

  statusResponse(status, reason = "") {
    return {
      status,
      semitones: this.semitones,
      hasActiveVideo: Boolean(this.activeVideo),
      reason
    };
  }

  getStatus() {
    this.scanForVideos();

    if (this.supportError) {
      return this.statusResponse(STATUS.UNSUPPORTED, this.supportError);
    }

    if (!this.activeVideo) {
      return this.statusResponse(STATUS.NO_VIDEO);
    }

    return this.statusResponse(STATUS.READY);
  }

  async applyPitch(semitones) {
    this.scanForVideos();
    this.setPitchValue(semitones);

    if (!this.activeVideo) {
      return this.statusResponse(STATUS.NO_VIDEO);
    }

    this.supportError = "";

    try {
      await this.ensureAudioGraph();
      return this.statusResponse(STATUS.READY);
    } catch (error) {
      this.supportError = error instanceof Error ? error.message : String(error);
      this.releaseCurrentGraph();
      return this.statusResponse(STATUS.UNSUPPORTED, this.supportError);
    }
  }

  async resetPitch() {
    return this.applyPitch(0);
  }
}

function clampSemitones(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(-12, Math.min(12, Math.round(numeric)));
}

const controller = new VideoPitchController();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type) {
    sendResponse(controller.statusResponse(STATUS.UNSUPPORTED, "Unknown request."));
    return false;
  }

  if (message.type === "GET_STATUS") {
    sendResponse(controller.getStatus());
    return false;
  }

  if (message.type === "SET_PITCH") {
    controller.applyPitch(message.semitones).then(sendResponse);
    return true;
  }

  if (message.type === "RESET_PITCH") {
    controller.resetPitch().then(sendResponse);
    return true;
  }

  sendResponse(controller.statusResponse(STATUS.UNSUPPORTED, "Unsupported message type."));
  return false;
});
