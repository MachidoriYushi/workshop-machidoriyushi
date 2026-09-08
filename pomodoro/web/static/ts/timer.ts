const WORK_DURATION_SECONDS = 25 * 60;
const BREAK_DURATION_SECONDS = 5 * 60;

const STORAGE_KEYS = {
  settings: "pomodoro.settings",
  stats: "pomodoro.stats",
};

type TimerMode = "work" | "break";
type TimerStatus = "idle" | "running" | "paused" | "completed";
type TimerEventType = "START" | "PAUSE" | "RESUME" | "RESET" | "TICK" | "COMPLETE";

type TimerState = {
  mode: TimerMode;
  status: TimerStatus;
  durationSeconds: number;
  remainingSeconds: number;
  startedAt: number | null;
  pausedAt: number | null;
  completedAt: number | null;
  lastTickAt: number | null;
  nextMode: TimerMode | null;
};

type TimerEvent = {
  type: TimerEventType;
  now?: number;
};

type RemainingTimeInput = {
  durationSeconds: number;
  startedAt: number;
  now: number;
};

type StatsState = {
  completedWorkSessions: number;
  completedBreakSessions: number;
  totalFocusSeconds: number;
  totalBreakSeconds: number;
  todayCompletedWorkSessions: number;
  todayFocusSeconds: number;
  lastCompletedAt: number | null;
};

type SettingsState = {
  workDurationSeconds: number;
  breakDurationSeconds: number;
  soundEnabled: boolean;
};

type NotificationResult = "sent" | "fallback" | "skipped" | "failed";
type SoundResult = "played" | "disabled" | "skipped" | "failed";

type NotificationGateway = {
  permission: NotificationPermission;
  notify(title: string, options: NotificationOptions): void;
};

type SoundPlayer = {
  play(): void | Promise<void>;
};

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type TimerElements = {
  timerDisplay: HTMLElement;
  statusLabel: HTMLElement;
  startButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  progressRing: HTMLElement;
  todayCompletedCount: HTMLElement;
  todayFocusTime: HTMLElement;
  notificationButton: HTMLButtonElement;
  soundToggle: HTMLInputElement;
  notificationMessage: HTMLElement;
};

type CommonJSModule = {
  exports: Record<string, unknown>;
};

declare const module: CommonJSModule | undefined;

function createInitialState(): TimerState {
  return {
    mode: "work",
    status: "idle",
    durationSeconds: WORK_DURATION_SECONDS,
    remainingSeconds: WORK_DURATION_SECONDS,
    startedAt: null,
    pausedAt: null,
    completedAt: null,
    lastTickAt: null,
    nextMode: null,
  };
}

function reduceTimerState(state: TimerState, event: TimerEvent): TimerState {
  switch (event.type) {
    case "START":
      if ((state.status !== "idle" && state.status !== "paused") || state.remainingSeconds <= 0) {
        return state;
      }

      return {
        ...state,
        status: "running",
        startedAt: event.now ?? Date.now(),
        pausedAt: null,
        lastTickAt: event.now ?? Date.now(),
      };

    case "PAUSE":
      if (state.status !== "running" || state.remainingSeconds <= 0) {
        return state;
      }

      return {
        ...state,
        status: "paused",
        pausedAt: event.now ?? Date.now(),
        lastTickAt: null,
      };

    case "RESUME":
      if (state.status !== "paused" || state.remainingSeconds <= 0) {
        return state;
      }

      return {
        ...state,
        status: "running",
        startedAt: event.now ?? Date.now(),
        pausedAt: null,
        lastTickAt: event.now ?? Date.now(),
      };

    case "RESET":
      return {
        ...state,
        status: "idle",
        remainingSeconds: state.durationSeconds,
        startedAt: null,
        pausedAt: null,
        completedAt: null,
        lastTickAt: null,
        nextMode: null,
      };

    case "TICK": {
      if (state.status !== "running" || state.lastTickAt === null) {
        return state;
      }

      const now = event.now ?? Date.now();
      const elapsedSeconds = Math.floor((now - state.lastTickAt) / 1000);
      if (elapsedSeconds <= 0) {
        return state;
      }

      const remainingSeconds = Math.max(0, state.remainingSeconds - elapsedSeconds);
      if (remainingSeconds === 0) {
        return reduceTimerState(
          {
            ...state,
            remainingSeconds,
            lastTickAt: null,
          },
          { type: "COMPLETE", now },
        );
      }

      return {
        ...state,
        remainingSeconds,
        lastTickAt: state.lastTickAt + elapsedSeconds * 1000,
      };
    }

    case "COMPLETE":
      if (state.status !== "running") {
        return state;
      }

      return {
        ...state,
        status: "completed",
        remainingSeconds: 0,
        completedAt: event.now ?? Date.now(),
        lastTickAt: null,
        nextMode: state.mode === "work" ? "break" : "work",
      };
  }
}

function calculateRemainingSeconds(input: RemainingTimeInput): number {
  const elapsedSeconds = Math.floor((input.now - input.startedAt) / 1000);
  return Math.max(0, input.durationSeconds - elapsedSeconds);
}

function calculateProgressPercent(durationSeconds: number, remainingSeconds: number): number {
  if (durationSeconds <= 0) {
    return 0;
  }

  const clampedRemainingSeconds = Math.min(Math.max(remainingSeconds, 0), durationSeconds);
  return ((durationSeconds - clampedRemainingSeconds) / durationSeconds) * 100;
}

function createInitialStats(): StatsState {
  return {
    completedWorkSessions: 0,
    completedBreakSessions: 0,
    totalFocusSeconds: 0,
    totalBreakSeconds: 0,
    todayCompletedWorkSessions: 0,
    todayFocusSeconds: 0,
    lastCompletedAt: null,
  };
}

function createInitialSettings(): SettingsState {
  return {
    workDurationSeconds: WORK_DURATION_SECONDS,
    breakDurationSeconds: BREAK_DURATION_SECONDS,
    soundEnabled: true,
  };
}

function recordCompletedSession(stats: StatsState, state: TimerState): StatsState {
  if (state.status !== "completed" || state.completedAt === null || stats.lastCompletedAt === state.completedAt) {
    return stats;
  }

  if (state.mode === "work") {
    return {
      ...stats,
      completedWorkSessions: stats.completedWorkSessions + 1,
      totalFocusSeconds: stats.totalFocusSeconds + state.durationSeconds,
      todayCompletedWorkSessions: stats.todayCompletedWorkSessions + 1,
      todayFocusSeconds: stats.todayFocusSeconds + state.durationSeconds,
      lastCompletedAt: state.completedAt,
    };
  }

  return {
    ...stats,
    completedBreakSessions: stats.completedBreakSessions + 1,
    totalBreakSeconds: stats.totalBreakSeconds + state.durationSeconds,
    lastCompletedAt: state.completedAt,
  };
}

function saveSettings(storage: StorageLike | null, settings: SettingsState): void {
  if (storage === null) {
    return;
  }

  storage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

function loadSettings(storage: StorageLike | null): SettingsState {
  if (storage === null) {
    return createInitialSettings();
  }

  try {
    const storedValue = storage.getItem(STORAGE_KEYS.settings);
    if (storedValue === null) {
      return createInitialSettings();
    }

    const parsedValue = JSON.parse(storedValue);
    if (!isSettingsState(parsedValue)) {
      return createInitialSettings();
    }

    return parsedValue;
  } catch {
    return createInitialSettings();
  }
}

function saveStats(storage: StorageLike | null, stats: StatsState): void {
  if (storage === null) {
    return;
  }

  storage.setItem(STORAGE_KEYS.stats, JSON.stringify(stats));
}

function loadStats(storage: StorageLike | null): StatsState {
  if (storage === null) {
    return createInitialStats();
  }

  try {
    const storedValue = storage.getItem(STORAGE_KEYS.stats);
    if (storedValue === null) {
      return createInitialStats();
    }

    const parsedValue = JSON.parse(storedValue);
    if (!isStatsState(parsedValue)) {
      return createInitialStats();
    }

    return parsedValue;
  } catch {
    return createInitialStats();
  }
}

function isSettingsState(value: unknown): value is SettingsState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isPositiveNumber(value.workDurationSeconds) &&
    isPositiveNumber(value.breakDurationSeconds) &&
    typeof value.soundEnabled === "boolean"
  );
}

function isStatsState(value: unknown): value is StatsState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonNegativeNumber(value.completedWorkSessions) &&
    isNonNegativeNumber(value.completedBreakSessions) &&
    isNonNegativeNumber(value.totalFocusSeconds) &&
    isNonNegativeNumber(value.totalBreakSeconds) &&
    isNonNegativeNumber(value.todayCompletedWorkSessions) &&
    isNonNegativeNumber(value.todayFocusSeconds) &&
    (value.lastCompletedAt === null || isNonNegativeNumber(value.lastCompletedAt))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function notifyCompletion(gateway: NotificationGateway | null, state: TimerState): NotificationResult {
  if (state.status !== "completed") {
    return "skipped";
  }

  if (gateway === null || gateway.permission !== "granted") {
    return "fallback";
  }

  try {
    gateway.notify(getCompletionTitle(state), {
      body: state.mode === "work" ? "休憩を始めましょう。" : "次の作業を始められます。",
    });
    return "sent";
  } catch {
    return "failed";
  }
}

async function playCompletionSound(player: SoundPlayer | null, settings: SettingsState, state: TimerState): Promise<SoundResult> {
  if (state.status !== "completed") {
    return "skipped";
  }

  if (!settings.soundEnabled) {
    return "disabled";
  }

  if (player === null) {
    return "failed";
  }

  try {
    await player.play();
    return "played";
  } catch {
    return "failed";
  }
}

function getCompletionTitle(state: TimerState): string {
  return state.mode === "work" ? "作業タイマーが完了しました" : "休憩タイマーが完了しました";
}

function formatTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatFocusTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes}分`;
  }

  return `${hours}時間${remainingMinutes}分`;
}

function prepareNextSession(state: TimerState): TimerState {
  if (state.status !== "completed" || state.nextMode === null) {
    return state;
  }

  const durationSeconds = state.nextMode === "work" ? WORK_DURATION_SECONDS : BREAK_DURATION_SECONDS;
  return {
    mode: state.nextMode,
    status: "idle",
    durationSeconds,
    remainingSeconds: durationSeconds,
    startedAt: null,
    pausedAt: null,
    completedAt: null,
    lastTickAt: null,
    nextMode: null,
  };
}

function getStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getElement<T extends HTMLElement>(role: string): T {
  const element = document.querySelector<T>(`[data-role="${role}"]`);
  if (element === null) {
    throw new Error(`Missing element: ${role}`);
  }

  return element;
}

function getTimerElements(): TimerElements {
  return {
    timerDisplay: getElement("timer-display"),
    statusLabel: getElement("status-label"),
    startButton: getElement("start-button"),
    resetButton: getElement("reset-button"),
    progressRing: getElement("progress-ring"),
    todayCompletedCount: getElement("today-completed-count"),
    todayFocusTime: getElement("today-focus-time"),
    notificationButton: getElement("notification-button"),
    soundToggle: getElement("sound-toggle"),
    notificationMessage: getElement("notification-message"),
  };
}

function render(state: TimerState, stats: StatsState, settings: SettingsState, elements: TimerElements): void {
  const progressPercent = calculateProgressPercent(state.durationSeconds, state.remainingSeconds);
  const modeLabel = state.mode === "work" ? "作業中" : "休憩中";

  elements.timerDisplay.textContent = formatTime(state.remainingSeconds);
  elements.statusLabel.textContent = state.status === "paused" ? `${modeLabel}・一時停止` : modeLabel;
  elements.startButton.textContent = state.status === "running" ? "停止" : "開始";
  elements.resetButton.disabled = state.status === "idle" && state.remainingSeconds === state.durationSeconds;
  elements.progressRing.style.setProperty("--progress", `${progressPercent}%`);
  elements.todayCompletedCount.textContent = String(stats.todayCompletedWorkSessions);
  elements.todayFocusTime.textContent = formatFocusTime(stats.todayFocusSeconds);
  elements.soundToggle.checked = settings.soundEnabled;

  if (state.status === "running") {
    document.title = `${formatTime(state.remainingSeconds)} - ${modeLabel}`;
    return;
  }

  document.title = "ポモドーロタイマー";
}

function getBrowserNotificationGateway(): NotificationGateway | null {
  if (!("Notification" in window)) {
    return null;
  }

  return {
    permission: Notification.permission,
    notify(title: string, options: NotificationOptions): void {
      new Notification(title, options);
    },
  };
}

function createBeepPlayer(): SoundPlayer {
  return {
    play(): void {
      const AudioContextConstructor = window.AudioContext ?? getWebkitAudioContext();
      if (AudioContextConstructor === undefined) {
        throw new Error("AudioContext is not available");
      }

      const audioContext = new AudioContextConstructor();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, audioContext.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.45);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.5);
    },
  };
}

function getWebkitAudioContext(): typeof AudioContext | undefined {
  return (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function initializeTimerApp(): void {
  const storage = getStorage();
  let settings = loadSettings(storage);
  let stats = loadStats(storage);
  let state: TimerState = {
    ...createInitialState(),
    durationSeconds: settings.workDurationSeconds,
    remainingSeconds: settings.workDurationSeconds,
  };
  const elements = getTimerElements();
  let intervalId: number | null = null;

  const stopTicker = (): void => {
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };

  const commit = (nextState: TimerState): void => {
    state = nextState;

    if (state.status === "completed") {
      const notificationResult = notifyCompletion(getBrowserNotificationGateway(), state);
      elements.notificationMessage.textContent = notificationResult === "sent" ? "通知を送信しました" : getCompletionTitle(state);
      void playCompletionSound(createBeepPlayer(), settings, state);
      stats = recordCompletedSession(stats, state);
      saveStats(storage, stats);
      stopTicker();
      state = prepareNextSession(state);
    }

    render(state, stats, settings, elements);
  };

  const startTicker = (): void => {
    if (intervalId !== null) {
      return;
    }

    intervalId = window.setInterval(() => {
      commit(reduceTimerState(state, { type: "TICK" }));
    }, 250);
  };

  elements.startButton.addEventListener("click", () => {
    if (state.status === "running") {
      commit(reduceTimerState(state, { type: "PAUSE" }));
      stopTicker();
      return;
    }

    commit(reduceTimerState(state, { type: state.status === "paused" ? "RESUME" : "START" }));
    startTicker();
  });

  elements.resetButton.addEventListener("click", () => {
    commit(reduceTimerState(state, { type: "RESET" }));
    stopTicker();
  });

  elements.notificationButton.addEventListener("click", () => {
    if (!("Notification" in window) || Notification.permission !== "default") {
      elements.notificationMessage.textContent = "通知設定を確認しました";
      return;
    }

    void Notification.requestPermission().then((permission) => {
      elements.notificationMessage.textContent = permission === "granted" ? "ブラウザ通知を有効にしました" : "画面内通知を使います";
    });
  });

  elements.soundToggle.addEventListener("change", () => {
    settings = {
      ...settings,
      soundEnabled: elements.soundToggle.checked,
    };
    saveSettings(storage, settings);
    render(state, stats, settings, elements);
  });

  render(state, stats, settings, elements);
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", initializeTimerApp);
}

if (typeof module !== "undefined") {
  module.exports = {
    WORK_DURATION_SECONDS,
    BREAK_DURATION_SECONDS,
    STORAGE_KEYS,
    createInitialState,
    createInitialSettings,
    createInitialStats,
    calculateProgressPercent,
    calculateRemainingSeconds,
    notifyCompletion,
    playCompletionSound,
    loadSettings,
    loadStats,
    formatTime,
    recordCompletedSession,
    reduceTimerState,
    saveSettings,
    saveStats,
  };
}