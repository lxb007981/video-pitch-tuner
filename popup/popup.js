const statusPill = document.getElementById("status-pill");
const statusMessage = document.getElementById("status-message");
const pitchSlider = document.getElementById("pitch-slider");
const pitchValue = document.getElementById("pitch-value");
const resetButton = document.getElementById("reset-button");

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
  return `${number.toFixed(1)} st`;
}

function applyState(response) {
  const state = STATUS_META[response.status] ? response.status : "unsupported";
  const meta = STATUS_META[state];
  const semitones = Number(response.semitones) || 0;
  const message = response.reason || meta.message;

  statusPill.textContent = meta.label;
  statusPill.dataset.state = state;
  statusMessage.textContent = message;
  pitchSlider.disabled = !meta.interactive;
  resetButton.disabled = !meta.interactive;
  pitchSlider.value = String(semitones);
  pitchValue.textContent = formatSemitones(semitones);
}

let writeLock = false;

async function refreshStatus() {
  applyState({ status: "checking", semitones: Number(pitchSlider.value) || 0 });
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

pitchSlider.addEventListener("input", () => {
  pitchValue.textContent = formatSemitones(pitchSlider.value);
});

pitchSlider.addEventListener("change", async () => {
  await commitPitch(Number(pitchSlider.value));
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
