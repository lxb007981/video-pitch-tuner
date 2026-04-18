const statusPill = document.getElementById("status-pill");
const statusMessage = document.getElementById("status-message");
const pitchDisplayValue = document.getElementById("pitch-display-value");
const decreaseButton = document.getElementById("decrease-button");
const increaseButton = document.getElementById("increase-button");
const resetButton = document.getElementById("reset-button");
const MIN_SEMITONES = -12;
const MAX_SEMITONES = 12;

const STATUS_META = {
  checking: {
    label: "Checking",
    message: "Inspecting the active tab.",
    interactive: false
  },
  ready: {
    label: "Ready",
    message: "Pitch changes apply to the active video in this tab.",
    interactive: true
  },
  no_video: {
    label: "No Video",
    message: "No active HTML5 video was found in the current tab.",
    interactive: false
  },
  unsupported: {
    label: "Unsupported",
    message: "The extension could not attach audio processing to this page's video.",
    interactive: false
  },
  unavailable: {
    label: "Unavailable",
    message: "The extension cannot access this tab.",
    interactive: false
  }
};

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  return tab ?? null;
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();

  if (!tab?.id) {
    return {
      status: "unavailable",
      semitones: 0,
      reason: "No active tab id."
    };
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    return {
      status: "unavailable",
      semitones: 0,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function formatSemitones(value) {
  const number = Number(value) || 0;
  return String(number);
}

function clampSemitones(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(MIN_SEMITONES, Math.min(MAX_SEMITONES, Math.round(number)));
}

function applyState(response) {
  const state = STATUS_META[response.status] ? response.status : "unsupported";
  const meta = STATUS_META[state];
  const semitones = clampSemitones(response.semitones);
  const message = response.reason || meta.message;

  statusPill.textContent = meta.label;
  statusPill.dataset.state = state;
  statusMessage.textContent = message;
  decreaseButton.disabled = !meta.interactive || semitones <= MIN_SEMITONES;
  increaseButton.disabled = !meta.interactive || semitones >= MAX_SEMITONES;
  resetButton.disabled = !meta.interactive;
  pitchDisplayValue.textContent = formatSemitones(semitones);
}

let writeLock = false;

async function refreshStatus() {
  applyState({ status: "checking", semitones: 0 });
  const response = await sendToActiveTab({ type: "GET_STATUS" });
  applyState(response);
}

async function commitPitch(semitones) {
  if (writeLock) {
    return;
  }

  writeLock = true;

  const response = await sendToActiveTab({
    type: "SET_PITCH",
    semitones
  });

  applyState(response);
  writeLock = false;
}

async function stepPitch(delta) {
  const currentSemitones = clampSemitones(pitchDisplayValue.textContent);
  const nextSemitones = clampSemitones(currentSemitones + delta);

  if (nextSemitones === currentSemitones) {
    return;
  }

  await commitPitch(nextSemitones);
}

decreaseButton.addEventListener("click", async () => {
  await stepPitch(-1);
});

increaseButton.addEventListener("click", async () => {
  await stepPitch(1);
});

resetButton.addEventListener("click", async () => {
  if (writeLock) {
    return;
  }

  writeLock = true;
  const response = await sendToActiveTab({ type: "RESET_PITCH" });
  applyState(response);
  writeLock = false;
});

refreshStatus();
