const test = require("node:test");
const assert = require("node:assert/strict");

const {
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
  recordCompletedSession,
  reduceTimerState,
  saveSettings,
  saveStats,
} = require("./timer.js");

function createMemoryStorage(initialValues = {}) {
  const values = new Map(Object.entries(initialValues));

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("初期状態は作業タイマーの未開始状態である", () => {
  const state = createInitialState();

  assert.equal(state.mode, "work");
  assert.equal(state.status, "idle");
  assert.equal(state.durationSeconds, WORK_DURATION_SECONDS);
  assert.equal(state.remainingSeconds, WORK_DURATION_SECONDS);
});

test("STARTでidleからrunningへ遷移する", () => {
  const state = createInitialState();

  const nextState = reduceTimerState(state, { type: "START", now: 1000 });

  assert.equal(nextState.status, "running");
  assert.equal(nextState.startedAt, 1000);
});

test("PAUSEでrunningからpausedへ遷移し、残り時間を保持する", () => {
  const state = {
    ...createInitialState(),
    status: "running",
    startedAt: 1000,
    remainingSeconds: 1200,
  };

  const nextState = reduceTimerState(state, { type: "PAUSE", now: 2000 });

  assert.equal(nextState.status, "paused");
  assert.equal(nextState.remainingSeconds, 1200);
  assert.equal(nextState.pausedAt, 2000);
});

test("RESUMEでpausedからrunningへ遷移する", () => {
  const state = {
    ...createInitialState(),
    status: "paused",
    remainingSeconds: 1200,
    pausedAt: 2000,
  };

  const nextState = reduceTimerState(state, { type: "RESUME", now: 3000 });

  assert.equal(nextState.status, "running");
  assert.equal(nextState.startedAt, 3000);
  assert.equal(nextState.pausedAt, null);
});

test("RESETでidleへ戻り、残り時間が初期値に戻る", () => {
  const state = {
    ...createInitialState(),
    status: "paused",
    remainingSeconds: 900,
    startedAt: 1000,
    pausedAt: 2000,
  };

  const nextState = reduceTimerState(state, { type: "RESET" });

  assert.equal(nextState.status, "idle");
  assert.equal(nextState.remainingSeconds, WORK_DURATION_SECONDS);
  assert.equal(nextState.startedAt, null);
  assert.equal(nextState.pausedAt, null);
  assert.equal(nextState.completedAt, null);
});

test("COMPLETEでcompletedへ遷移し、残り時間が0になる", () => {
  const state = {
    ...createInitialState(),
    status: "running",
    remainingSeconds: 1,
    startedAt: 1000,
  };

  const nextState = reduceTimerState(state, { type: "COMPLETE", now: 2000 });

  assert.equal(nextState.status, "completed");
  assert.equal(nextState.remainingSeconds, 0);
  assert.equal(nextState.completedAt, 2000);
});

test("完了処理は同一セッションで2回実行されない", () => {
  const state = {
    ...createInitialState(),
    status: "completed",
    remainingSeconds: 0,
    completedAt: 2000,
  };

  const nextState = reduceTimerState(state, { type: "COMPLETE", now: 3000 });

  assert.equal(nextState.completedAt, 2000);
});

test("作業完了後の次モードは休憩である", () => {
  const state = {
    ...createInitialState(),
    status: "running",
    remainingSeconds: 1,
  };

  const nextState = reduceTimerState(state, { type: "COMPLETE", now: 2000 });

  assert.equal(nextState.nextMode, "break");
});

test("休憩完了後の次モードは作業である", () => {
  const state = {
    ...createInitialState(),
    mode: "break",
    status: "running",
    durationSeconds: BREAK_DURATION_SECONDS,
    remainingSeconds: 1,
  };

  const nextState = reduceTimerState(state, { type: "COMPLETE", now: 2000 });

  assert.equal(nextState.nextMode, "work");
});

test("残り時間は開始時刻と現在時刻の差分から計算する", () => {
  const remainingSeconds = calculateRemainingSeconds({
    durationSeconds: WORK_DURATION_SECONDS,
    startedAt: 1000,
    now: 31_000,
  });

  assert.equal(remainingSeconds, WORK_DURATION_SECONDS - 30);
});

test("経過時間が期間を超えた場合、残り時間は0になる", () => {
  const remainingSeconds = calculateRemainingSeconds({
    durationSeconds: 10,
    startedAt: 1000,
    now: 20_000,
  });

  assert.equal(remainingSeconds, 0);
});

test("進捗率は残り時間から計算する", () => {
  assert.equal(calculateProgressPercent(1500, 1500), 0);
  assert.equal(calculateProgressPercent(1500, 750), 50);
  assert.equal(calculateProgressPercent(1500, 0), 100);
});

test("進捗率は0から100の範囲に収める", () => {
  assert.equal(calculateProgressPercent(1500, 1800), 0);
  assert.equal(calculateProgressPercent(1500, -10), 100);
});

test("統計の初期状態は0で初期化される", () => {
  const stats = createInitialStats();

  assert.equal(stats.completedWorkSessions, 0);
  assert.equal(stats.completedBreakSessions, 0);
  assert.equal(stats.totalFocusSeconds, 0);
  assert.equal(stats.totalBreakSeconds, 0);
});

test("作業セッション完了時に作業統計を更新する", () => {
  const stats = createInitialStats();
  const completedState = {
    ...createInitialState(),
    status: "completed",
    remainingSeconds: 0,
    completedAt: 5000,
  };

  const nextStats = recordCompletedSession(stats, completedState);

  assert.equal(nextStats.completedWorkSessions, 1);
  assert.equal(nextStats.totalFocusSeconds, WORK_DURATION_SECONDS);
});

test("休憩セッション完了時に休憩統計を更新する", () => {
  const stats = createInitialStats();
  const completedState = {
    ...createInitialState(),
    mode: "break",
    status: "completed",
    durationSeconds: BREAK_DURATION_SECONDS,
    remainingSeconds: 0,
    completedAt: 5000,
  };

  const nextStats = recordCompletedSession(stats, completedState);

  assert.equal(nextStats.completedBreakSessions, 1);
  assert.equal(nextStats.totalBreakSeconds, BREAK_DURATION_SECONDS);
});

test("未完了セッションでは統計を更新しない", () => {
  const stats = createInitialStats();
  const pausedState = {
    ...createInitialState(),
    status: "paused",
    remainingSeconds: 1200,
  };

  const nextStats = recordCompletedSession(stats, pausedState);

  assert.deepEqual(nextStats, stats);
});

test("同じ完了セッションを二重に加算しない", () => {
  const stats = {
    ...createInitialStats(),
    completedWorkSessions: 1,
    totalFocusSeconds: WORK_DURATION_SECONDS,
    lastCompletedAt: 5000,
  };
  const completedState = {
    ...createInitialState(),
    status: "completed",
    remainingSeconds: 0,
    completedAt: 5000,
  };

  const nextStats = recordCompletedSession(stats, completedState);

  assert.deepEqual(nextStats, stats);
});

test("設定をJSONとして保存できる", () => {
  const storage = createMemoryStorage();
  const settings = {
    workDurationSeconds: 1800,
    breakDurationSeconds: 600,
    soundEnabled: false,
  };

  saveSettings(storage, settings);

  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.settings)), settings);
});

test("統計をJSONとして保存できる", () => {
  const storage = createMemoryStorage();
  const stats = {
    ...createInitialStats(),
    completedWorkSessions: 2,
    totalFocusSeconds: WORK_DURATION_SECONDS * 2,
  };

  saveStats(storage, stats);

  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.stats)), stats);
});

test("保存済み設定を復元できる", () => {
  const settings = {
    workDurationSeconds: 1800,
    breakDurationSeconds: 600,
    soundEnabled: false,
  };
  const storage = createMemoryStorage({
    [STORAGE_KEYS.settings]: JSON.stringify(settings),
  });

  assert.deepEqual(loadSettings(storage), settings);
});

test("保存済み統計を復元できる", () => {
  const stats = {
    ...createInitialStats(),
    completedWorkSessions: 3,
    totalFocusSeconds: WORK_DURATION_SECONDS * 3,
    lastCompletedAt: 9000,
  };
  const storage = createMemoryStorage({
    [STORAGE_KEYS.stats]: JSON.stringify(stats),
  });

  assert.deepEqual(loadStats(storage), stats);
});

test("不正な保存値の場合は既定値にフォールバックする", () => {
  const storage = createMemoryStorage({
    [STORAGE_KEYS.settings]: "not json",
    [STORAGE_KEYS.stats]: JSON.stringify({ completedWorkSessions: -1 }),
  });

  assert.deepEqual(loadSettings(storage), createInitialSettings());
  assert.deepEqual(loadStats(storage), createInitialStats());
});

test("localStorageが使えない場合でも既定値で動作できる", () => {
  assert.doesNotThrow(() => saveSettings(null, createInitialSettings()));
  assert.doesNotThrow(() => saveStats(null, createInitialStats()));
  assert.deepEqual(loadSettings(null), createInitialSettings());
  assert.deepEqual(loadStats(null), createInitialStats());
});

test("通知権限が許可されている場合、完了通知を送信する", () => {
  const sentNotifications = [];
  const gateway = {
    permission: "granted",
    notify(title, options) {
      sentNotifications.push({ title, options });
    },
  };
  const completedState = {
    ...createInitialState(),
    status: "completed",
    remainingSeconds: 0,
    completedAt: 5000,
  };

  const result = notifyCompletion(gateway, completedState);

  assert.equal(result, "sent");
  assert.equal(sentNotifications.length, 1);
  assert.equal(sentNotifications[0].title, "作業タイマーが完了しました");
});

test("通知権限が拒否されている場合、画面内表示へフォールバックする", () => {
  const gateway = {
    permission: "denied",
    notify() {
      throw new Error("should not notify");
    },
  };
  const completedState = {
    ...createInitialState(),
    status: "completed",
    remainingSeconds: 0,
    completedAt: 5000,
  };

  const result = notifyCompletion(gateway, completedState);

  assert.equal(result, "fallback");
});

test("完了していないセッションでは通知を送信しない", () => {
  const gateway = {
    permission: "granted",
    notify() {
      throw new Error("should not notify");
    },
  };

  const result = notifyCompletion(gateway, createInitialState());

  assert.equal(result, "skipped");
});

test("サウンド通知が有効な完了セッションでは音を再生する", async () => {
  let played = false;
  const player = {
    play() {
      played = true;
    },
  };
  const completedState = {
    ...createInitialState(),
    status: "completed",
    remainingSeconds: 0,
    completedAt: 5000,
  };

  const result = await playCompletionSound(player, createInitialSettings(), completedState);

  assert.equal(result, "played");
  assert.equal(played, true);
});

test("サウンド通知が無効な場合は音を再生しない", async () => {
  const player = {
    play() {
      throw new Error("should not play");
    },
  };
  const settings = {
    ...createInitialSettings(),
    soundEnabled: false,
  };
  const completedState = {
    ...createInitialState(),
    status: "completed",
    remainingSeconds: 0,
    completedAt: 5000,
  };

  const result = await playCompletionSound(player, settings, completedState);

  assert.equal(result, "disabled");
});

test("サウンド再生に失敗しても失敗結果として扱える", async () => {
  const player = {
    play() {
      throw new Error("blocked");
    },
  };
  const completedState = {
    ...createInitialState(),
    status: "completed",
    remainingSeconds: 0,
    completedAt: 5000,
  };

  const result = await playCompletionSound(player, createInitialSettings(), completedState);

  assert.equal(result, "failed");
});