const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../../templates/index.html"), "utf8");

test("レスポンシブ用のビューポートとメディアクエリがある", () => {
  assert.match(html, /<meta name="viewport"/);
  assert.match(css, /@media \(max-width: 480px\)/);
});

test("モバイルで横スクロールを抑止する", () => {
  assert.match(css, /overflow-x:\s*hidden/);
});

test("主要操作ボタンはタッチ操作しやすい高さを持つ", () => {
  assert.match(css, /min-height:\s*52px/);
});

test("通知とサウンドの操作要素がHTMLに存在する", () => {
  assert.match(html, /data-role="notification-button"/);
  assert.match(html, /data-role="sound-toggle"/);
  assert.match(html, /data-role="notification-message"/);
});