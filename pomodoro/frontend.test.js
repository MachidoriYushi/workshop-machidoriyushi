const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("pomodoro image exists", () => {
  const stats = fs.statSync("pomodoro/pomodoro.png");
  assert.ok(stats.isFile());
  assert.ok(stats.size > 0);
});
