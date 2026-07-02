# 喂魚小幫手 · LINE LIFF Demo

三個 LIFF 頁面：
1. **喂魚打卡** — 記錄 userId + 打卡時間
2. **喂魚設定** — 設定開始日期與餵魚間隔天數
3. **喂魚日曆** — 月曆上顯示「該餵魚（灰魚）」與「已餵魚（金魚）」

所有資料以 LINE `userId` 為主鍵。

## 架構

```
GitHub Pages  →  index.html（前端，LIFF 在此初始化、取得 userId）
      │ fetch(POST, JSON)
      ▼
GAS Web App   →  Code.gs（JSON API：doPost）
      │
      ▼
Google Sheet  →  checkins / settings 兩個分頁（自動建立）
```

> ⚠️ 為什麼前端不放 GAS？因為 GAS 網頁會被包在 iframe 裡跑，LIFF 在 LINE App 內無法初始化（`liff.init` 卡死）。所以前端改放 GitHub Pages（頂層執行），GAS 只當後端 API。

## 檔案
| 檔案 | 說明 |
|------|------|
| `index.html` | 前端單頁 App，放 **GitHub Pages** |
| `Code.gs` | 後端 JSON API，貼到 **GAS** |
| `appsscript.json` | GAS 專案設定（時區 / 權限） |

---

## 部署步驟

### 步驟 1：建立 Google Sheet 並複製 Sheet ID
1. 到 <https://sheets.new> 建立空白試算表。
2. 從網址複製 **Sheet ID**：`docs.google.com/spreadsheets/d/`**`這段就是 ID`**`/edit`
3. 分頁不用自己建，程式第一次寫入會自動建立 `checkins` / `settings`。

### 步驟 2：部署 GAS 後端 API
1. 到 <https://script.google.com> 新增專案。
2. 把 `Code.gs` 貼進去，確認最上方 `SHEET_ID` 已填步驟 1 的 ID。
3. （可選）專案設定勾「顯示 appsscript.json」貼上內容，或確認時區為 `Asia/Taipei`。
4. **部署 → 新增部署作業 → 網頁應用程式**：
   - 執行身分：**我**
   - 誰可以存取：**所有人**
5. 首次部署會要求授權 → 允許存取試算表。
6. 複製 **/exec 網址**（形如 `https://script.google.com/macros/s/XXXX/exec`）。
7. 用瀏覽器打開該網址，應看到 `{"ok":true,"msg":"喂魚小幫手 API 運作中"}`，代表 API 活著。

### 步驟 3：建立 LINE LIFF（先隨便填 Endpoint，步驟 5 再改）
1. <https://developers.line.biz/console/> → 建立 Provider → 新增 **LINE Login** channel。
2. 該 channel → **LIFF → Add**：
   - Endpoint URL：先暫時填任何 https 網址（步驟 5 會改成 GitHub Pages 網址）
   - Size：**Full**
   - Scopes：勾 **profile**、**openid**
3. 複製 **LIFF ID**（形如 `1234567890-abcdEFGh`）。

### 步驟 4：填入前端設定並發佈 GitHub Pages
1. 編輯 `index.html` 最上方的兩個變數：
   ```js
   var LIFF_ID = '你的 LIFF ID';
   var GAS_URL = '步驟 2 的 /exec 網址';
   ```
2. 把專案推上 GitHub，開啟 **GitHub Pages**：
   - GitHub repo → **Settings → Pages**
   - Source 選 **Deploy from a branch**，Branch 選 `main` / 根目錄 `/ (root)`，Save。
   - 等一兩分鐘，會得到網址：`https://<你的帳號>.github.io/<repo 名>/`
3. 你的頁面網址就是上面那個 + `index.html`（通常直接根網址即可）。

### 步驟 5：把 LIFF Endpoint 改成 GitHub Pages 網址
1. 回 LINE LIFF 設定，Endpoint URL 改成步驟 4 的 GitHub Pages 網址。
2. 存檔。

### 步驟 6：測試
- 用**手機 LINE App** 開 `https://liff.line.me/{你的LIFF_ID}`
- 深連結指定功能：
  - `https://liff.line.me/{LIFF_ID}?page=checkin`
  - `https://liff.line.me/{LIFF_ID}?page=settings`
  - `https://liff.line.me/{LIFF_ID}?page=calendar`
- 可把三個連結放到 **Rich Menu** 三顆按鈕。

---

## 改東西後要重新發佈
- 改 **`index.html`** → git push（GitHub Pages 幾分鐘後自動更新；LINE 可能有快取，網址後加 `?t=2` 之類避開）。
- 改 **`Code.gs`** → GAS「部署 → 管理部署作業 → 編輯 → 新版本 → 部署」。

## 小提醒
- 一定要用**手機 LINE App** 內開啟測試，才能取得 `userId`。
- 資料都在你的 Google Sheet，可隨時打開檢查。