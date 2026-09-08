# ポモドーロタイマー Web アプリ アーキテクチャ

## 目的

このドキュメントは、Go の `net/http`、HTML、CSS、JavaScript を使用してポモドーロタイマー Web アプリを実装するための全体アーキテクチャを定義する。

本アプリは、25 分の作業タイマー、5 分の休憩タイマー、開始・停止・リセット、進捗表示、統計、ブラウザ通知、サウンド通知、レスポンシブ UI を提供する。

## 基本方針

- Go サーバーは HTML、CSS、JavaScript、画像、音声などの配信を担当する。
- タイマーの状態管理、画面更新、通知制御は JavaScript が担当する。
- サーバー側にユーザーごとのタイマー状態は保持しない。
- 統計や設定は初期実装では `localStorage` に保存する。
- 将来的に履歴同期や複数端末対応が必要になった場合のみ、API と永続化層を追加する。

## ディレクトリ構成

```text
pomodoro/
  go.mod
  main.go
  architecture.md
  features.md
  pomodoro.png
  internal/
    server/
      server.go
      handlers.go
    app/
      config.go
  web/
    templates/
      index.html
    static/
      css/
        styles.css
      js/
        timer.js
      assets/
        notification.mp3
```

## コンポーネント責務

### `main.go`

- アプリケーションのエントリーポイント。
- 設定値を読み込む。
- HTTP サーバーを生成する。
- `http.ListenAndServe` を呼び出す。

### `internal/app/config.go`

- ポート番号や初期タイマー値など、アプリケーション設定を定義する。
- 初期実装では以下の値を扱う。
  - 作業時間: 25 分
  - 休憩時間: 5 分
  - 静的ファイルディレクトリ
  - テンプレートディレクトリ

### `internal/server/server.go`

- `http.ServeMux` を生成する。
- ルーティングを登録する。
- 静的ファイル配信を設定する。

### `internal/server/handlers.go`

- `/` の HTML レンダリングを担当する。
- `/healthz` のヘルスチェックを担当する。
- 将来的な `/api/*` ハンドラーの追加地点になる。

### `web/templates/index.html`

- Web アプリの DOM 構造を定義する。
- UI モックに合わせて、ウィンドウ風コンテナ、タイトル、ステータス、円形進捗、タイマー表示、操作ボタン、統計表示を配置する。
- JavaScript が参照する要素には安定した `id` または `data-*` 属性を付与する。

### `web/static/css/styles.css`

- レスポンシブ UI とビジュアルデザインを定義する。
- UI モックに合わせ、中央配置のカード、紫系のアクセント、円形進捗、統計パネルを表現する。
- モバイル幅でもボタンや統計表示が崩れないようにする。

### `web/static/js/timer.js`

- タイマー状態管理を担当する。
- ユーザー操作をイベントとして受け取り、状態を更新する。
- 状態に基づいて UI を再描画する。
- `localStorage` に設定と統計を保存する。
- ブラウザ通知とサウンド通知を制御する。

## ルーティング設計

| メソッド | パス | 役割 |
| --- | --- | --- |
| `GET` | `/` | アプリ画面の HTML を返す |
| `GET` | `/static/*` | CSS、JavaScript、画像、音声ファイルを返す |
| `GET` | `/healthz` | サーバーの稼働確認を返す |

初期実装では API は不要とする。タイマー状態、統計、設定はブラウザ内で完結させる。

## 将来的な API 拡張

統計の永続化や複数端末同期が必要になった場合、以下の API を追加する。

| メソッド | パス | 役割 |
| --- | --- | --- |
| `GET` | `/api/settings` | 保存済み設定を取得する |
| `PUT` | `/api/settings` | 設定を保存する |
| `GET` | `/api/sessions` | 完了セッション履歴を取得する |
| `POST` | `/api/sessions` | 完了セッションを記録する |
| `DELETE` | `/api/sessions/{id}` | セッション履歴を削除する |

## クライアント状態設計

タイマー状態は `mode` と `status` を分けて管理する。

```js
const timerState = {
  mode: "work",
  status: "idle",
  durationSeconds: 25 * 60,
  remainingSeconds: 25 * 60,
  startedAt: null,
  pausedAt: null,
  completedAt: null,
  lastTickAt: null,
};
```

### `mode`

| 値 | 意味 | 初期時間 |
| --- | --- | --- |
| `work` | 作業タイマー | 25 分 |
| `break` | 休憩タイマー | 5 分 |

### `status`

| 値 | 意味 |
| --- | --- |
| `idle` | 未開始、またはリセット後 |
| `running` | 進行中 |
| `paused` | 一時停止中 |
| `completed` | 完了済み |

## 状態更新フロー

```text
ユーザー操作または tick
  -> イベントを発行する
  -> 事前条件を検証する
  -> 状態を更新する
  -> 事後条件を満たす
  -> UI を再描画する
  -> 必要に応じて localStorage に保存する
  -> 必要に応じて通知を実行する
```

DOM を直接操作する箇所は描画処理に集約し、イベント処理の中で複数箇所の表示を個別更新しない。

## タイマー精度の方針

タイマー進行は `setInterval` の呼び出し回数ではなく、時刻差分から計算する。

```text
残り時間 = 期間秒数 - 経過秒数
経過秒数 = 現在時刻 - 開始基準時刻
```

この方針により、ブラウザタブが非アクティブになった場合や `setInterval` が遅延した場合でも、表示される残り時間を実時間に近づける。

## UI アーキテクチャ

UI は以下の領域に分ける。

- アプリコンテナ
- ヘッダー
- 現在状態ラベル
- 円形進捗表示
- 残り時間表示
- 操作ボタン
- 今日の進捗・統計パネル
- 通知設定領域

画面幅に応じてカード幅、余白、ボタン配置、統計パネルを調整する。

## 通知アーキテクチャ

通知はタイマー完了処理から呼び出される副作用として扱う。

```text
タイマー完了
  -> 状態を completed にする
  -> 統計を更新する
  -> UI を再描画する
  -> ブラウザ通知を試行する
  -> サウンド通知を試行する
  -> 次モードを準備する
```

通知に失敗しても、タイマー状態や統計更新は失敗扱いにしない。

## 統計アーキテクチャ

統計は完了したセッションのみを対象にする。

```js
const statsState = {
  completedWorkSessions: 0,
  completedBreakSessions: 0,
  totalFocusSeconds: 0,
  totalBreakSeconds: 0,
  todayCompletedWorkSessions: 0,
  todayFocusSeconds: 0,
  lastCompletedAt: null,
};
```

リセット、一時停止、未完了の切り替えでは統計を増やさない。

## 永続化方針

初期実装では `localStorage` に以下を保存する。

- 作業時間設定
- 休憩時間設定
- サウンド通知の有効・無効
- 完了セッション数
- 合計集中時間
- 今日の完了数
- 今日の集中時間

実行中タイマーの復元は実装してもよいが、初期実装では統計と設定の永続化を優先する。

## エラーハンドリング方針

- テンプレート読み込みエラーはサーバー起動時またはリクエスト時にログ出力する。
- 静的ファイルが見つからない場合は `404` を返す。
- ブラウザ通知 API が利用できない場合は画面内表示にフォールバックする。
- サウンド再生に失敗してもタイマー完了処理は継続する。
- `localStorage` が利用できない場合はメモリ上の状態のみで動作する。

## 実装順序

1. Go サーバーで `/`、`/static/*`、`/healthz` を配信する。
2. HTML で UI モックに対応する構造を作る。
3. CSS でレスポンシブ UI と円形進捗を作る。
4. JavaScript で `idle`、`running`、`paused`、`completed` の状態遷移を実装する。
5. 進捗表示と統計表示を実装する。
6. `localStorage` に設定と統計を保存する。
7. ブラウザ通知とサウンド通知を追加する。
8. Go のハンドラテストとブラウザでの動作確認を行う。

## テスト方針

### Go

- `GET /` が `200 OK` を返すこと。
- `GET /static/*` が静的ファイルを返すこと。
- `GET /healthz` が `200 OK` を返すこと。

### JavaScript

- 初期状態が作業 25 分、`idle` であること。
- `start` で `running` へ遷移すること。
- `pause` で残り時間を保持して `paused` へ遷移すること。
- `reset` で初期時間に戻ること。
- 完了時に統計が 1 回だけ更新されること。
- 通知失敗時も状態更新が維持されること。
