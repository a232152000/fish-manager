/**
 * 喂魚小幫手 — Google Apps Script 後端（JSON API）
 * 前端放在 GitHub Pages，透過 fetch 呼叫這裡。
 * 資料存於指定試算表的兩個分頁：
 *   checkins：userId | timestamp(ISO) | date(yyyy-MM-dd)
 *   settings：userId | startDate(yyyy-MM-dd) | intervalDays | updatedAt(ISO)
 */

// 指定要寫入的 Google Sheet ID。
// 打開試算表看網址：docs.google.com/spreadsheets/d/【這一段就是 ID】/edit
var SHEET_ID = '1FNkH2wPSOWe9cLnAHqnfWGexz0QenEF-Z5tLLFAG6bw';

var CHECKIN_SHEET = 'checkins';
var SETTINGS_SHEET = 'settings';

/** 打開 /exec 直接用瀏覽器測試時，回一句話確認 API 活著 */
function doGet() {
  return json_({ ok: true, msg: '喂魚小幫手 API 運作中' });
}

/**
 * 前端所有請求都走這裡（POST，body 為 JSON 字串）。
 * body 格式：{ action, userId, ...payload }
 * 用 text/plain 送出可避開 CORS preflight。
 */
function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var action = req.action;
    var userId = req.userId;
    var result;

    if (action === 'checkin') {
      result = recordCheckin(userId);
    } else if (action === 'getSettings') {
      result = { settings: getSettings(userId) };
    } else if (action === 'saveSettings') {
      result = saveSettings(userId, req.startDate, req.intervalDays);
    } else if (action === 'getCalendarData') {
      result = getCalendarData(userId);
    } else {
      throw new Error('未知的 action：' + action);
    }
    return json_({ ok: true, data: result });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/** 統一輸出 JSON */
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 取得（必要時建立）指定分頁，並確保有表頭 */
function getSheet_(name, headers) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

/** 把 Sheet 值（可能是 Date 物件或字串）統一轉成 yyyy-MM-dd */
function toDateStr_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value);
}

/** 功能一：餵魚打卡 —— 記錄一筆 log */
function recordCheckin(userId) {
  if (!userId) throw new Error('缺少使用者資訊');
  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var dateStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');

  var sheet = getSheet_(CHECKIN_SHEET, ['userId', 'timestamp', 'date']);

  // 判斷今天是否已打過卡
  var data = sheet.getDataRange().getValues();
  var already = false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === userId && toDateStr_(data[i][2]) === dateStr) {
      already = true;
      break;
    }
  }

  sheet.appendRow([userId, now.toISOString(), dateStr]);

  return {
    ok: true,
    alreadyCheckedToday: already,
    date: dateStr,
    time: Utilities.formatDate(now, tz, 'HH:mm')
  };
}

/** 功能二：讀取使用者設定（給設定頁預填） */
function getSettings(userId) {
  if (!userId) throw new Error('缺少使用者資訊');
  var sheet = getSheet_(SETTINGS_SHEET, ['userId', 'startDate', 'intervalDays', 'updatedAt']);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === userId) {
      return {
        startDate: toDateStr_(data[i][1]),
        intervalDays: Number(data[i][2]) || 1
      };
    }
  }
  return null;
}

/** 功能二：儲存設定（同一 userId 覆蓋更新） */
function saveSettings(userId, startDate, intervalDays) {
  if (!userId) throw new Error('缺少使用者資訊');
  if (!startDate) throw new Error('請選擇開始日期');
  var interval = parseInt(intervalDays, 10);
  if (!interval || interval < 1) throw new Error('間隔天數需為 1 以上');

  var sheet = getSheet_(SETTINGS_SHEET, ['userId', 'startDate', 'intervalDays', 'updatedAt']);
  var data = sheet.getDataRange().getValues();
  var now = new Date().toISOString();
  var row = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === userId) { row = i + 1; break; }
  }
  var values = [[userId, startDate, interval, now]];
  if (row === -1) {
    sheet.appendRow(values[0]);
  } else {
    sheet.getRange(row, 1, 1, 4).setValues(values);
  }
  return { ok: true, startDate: startDate, intervalDays: interval };
}

/** 功能三：行事曆一次拿齊設定 + 打卡日期清單 */
function getCalendarData(userId) {
  if (!userId) throw new Error('缺少使用者資訊');
  var settings = getSettings(userId);

  var sheet = getSheet_(CHECKIN_SHEET, ['userId', 'timestamp', 'date']);
  var data = sheet.getDataRange().getValues();
  var seen = {};
  var dates = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === userId) {
      var d = toDateStr_(data[i][2]);
      if (!seen[d]) { seen[d] = true; dates.push(d); }
    }
  }
  return { settings: settings, checkins: dates };
}
