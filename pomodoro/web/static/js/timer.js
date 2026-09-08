"use strict";
const WORK_DURATION_SECONDS = 25 * 60;
const BREAK_DURATION_SECONDS = 5 * 60;
const STORAGE_KEYS = {
    settings: "pomodoro.settings",
    stats: "pomodoro.stats",
};
function createInitialState() {
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
function reduceTimerState(state, event) {
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
                return reduceTimerState({
                    ...state,
                    remainingSeconds,
                    lastTickAt: null,
                }, { type: "COMPLETE", now });
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
function calculateRemainingSeconds(input) {
    const elapsedSeconds = Math.floor((input.now - input.startedAt) / 1000);
    return Math.max(0, input.durationSeconds - elapsedSeconds);
}
function calculateProgressPercent(durationSeconds, remainingSeconds) {
    if (durationSeconds <= 0) {
        return 0;
    }
    const clampedRemainingSeconds = Math.min(Math.max(remainingSeconds, 0), durationSeconds);
    return ((durationSeconds - clampedRemainingSeconds) / durationSeconds) * 100;
}
function createInitialStats() {
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
function createInitialSettings() {
    return {
        workDurationSeconds: WORK_DURATION_SECONDS,
        breakDurationSeconds: BREAK_DURATION_SECONDS,
        soundEnabled: true,
    };
}
function recordCompletedSession(stats, state) {
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
function saveSettings(storage, settings) {
    if (storage === null) {
        return;
    }
    storage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}
function loadSettings(storage) {
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
    }
    catch {
        return createInitialSettings();
    }
}
function saveStats(storage, stats) {
    if (storage === null) {
        return;
    }
    storage.setItem(STORAGE_KEYS.stats, JSON.stringify(stats));
}
function loadStats(storage) {
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
    }
    catch {
        return createInitialStats();
    }
}
function isSettingsState(value) {
    if (!isRecord(value)) {
        return false;
    }
    return (isPositiveNumber(value.workDurationSeconds) &&
        isPositiveNumber(value.breakDurationSeconds) &&
        typeof value.soundEnabled === "boolean");
}
function isStatsState(value) {
    if (!isRecord(value)) {
        return false;
    }
    return (isNonNegativeNumber(value.completedWorkSessions) &&
        isNonNegativeNumber(value.completedBreakSessions) &&
        isNonNegativeNumber(value.totalFocusSeconds) &&
        isNonNegativeNumber(value.totalBreakSeconds) &&
        isNonNegativeNumber(value.todayCompletedWorkSessions) &&
        isNonNegativeNumber(value.todayFocusSeconds) &&
        (value.lastCompletedAt === null || isNonNegativeNumber(value.lastCompletedAt)));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isPositiveNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function isNonNegativeNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function notifyCompletion(gateway, state) {
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
    }
    catch {
        return "failed";
    }
}
async function playCompletionSound(player, settings, state) {
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
    }
    catch {
        return "failed";
    }
}
function getCompletionTitle(state) {
    return state.mode === "work" ? "作業タイマーが完了しました" : "休憩タイマーが完了しました";
}
function formatTime(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
function formatFocusTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours === 0) {
        return `${remainingMinutes}分`;
    }
    return `${hours}時間${remainingMinutes}分`;
}
function prepareNextSession(state) {
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
function getStorage() {
    try {
        return window.localStorage;
    }
    catch {
        return null;
    }
}
function getElement(role) {
    const element = document.querySelector(`[data-role="${role}"]`);
    if (element === null) {
        throw new Error(`Missing element: ${role}`);
    }
    return element;
}
function getTimerElements() {
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
function render(state, stats, settings, elements) {
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
function getBrowserNotificationGateway() {
    if (!("Notification" in window)) {
        return null;
    }
    return {
        permission: Notification.permission,
        notify(title, options) {
            new Notification(title, options);
        },
    };
}
function createBeepPlayer() {
    return {
        play() {
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
function getWebkitAudioContext() {
    return window.webkitAudioContext;
}
function initializeTimerApp() {
    const storage = getStorage();
    let settings = loadSettings(storage);
    let stats = loadStats(storage);
    let state = {
        ...createInitialState(),
        durationSeconds: settings.workDurationSeconds,
        remainingSeconds: settings.workDurationSeconds,
    };
    const elements = getTimerElements();
    let intervalId = null;
    const stopTicker = () => {
        if (intervalId !== null) {
            window.clearInterval(intervalId);
            intervalId = null;
        }
    };
    const commit = (nextState) => {
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
    const startTicker = () => {
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
