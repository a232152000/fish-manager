/**
 * 喂魚小幫手 — Google Apps Script 後端（JSON API）
 * 前端放在 GitHub Pages，透過 fetch 呼叫這裡。
 *
 * 資料合併為兩張分頁，以 type 欄位區分 fish（餵魚）/ water（澆花）：
 *   checkins：userId | type | timestamp(ISO) | date(yyyy-MM-dd)
 *   settings：userId | type | startDate | intervalDays | updatedAt(ISO)
 */

// 指定要寫入的 Google Sheet ID。
var SHEET_ID = '1FNkH2wPSOWe9cLnAHqnfWGexz0QenEF-Z5tLLFAG6bw';

var CHECKIN_SHEET = 'checkins';
var SETTINGS_SHEET = 'settings';
var CHECKIN_HEADERS = ['userId', 'type', 'timestamp', 'date'];
var SETTINGS_HEADERS = ['userId', 'type', 'startDate', 'intervalDays', 'updatedAt'];

/** 用瀏覽器打開 /exec 時回一句話確認 API 活著 */
function doGet() {
  return json_({ ok: true, msg: '喂魚小幫手 API 運作中' });
}

/** 前端所有請求走這裡（POST，body 為 JSON 字串，用 text/plain 避開 CORS preflight） */
function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var action = req.action;
    var userId = req.userId;
    var type = req.type || 'fish';
    var result;

    if (action === 'checkin') {
      result = recordCheckin(userId, type, req.date);
    } else if (action === 'getSettings') {
      result = { settings: getSettings(userId, type) };
    } else if (action === 'saveSettings') {
      result = saveSettings(userId, type, req.startDate, req.intervalDays);
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

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 快取「已開啟的試算表」，單次請求內只開一次檔（不快取資料列） */
var _ss = null;
function ss_() {
  if (!_ss) _ss = SpreadsheetApp.openById(SHEET_ID);
  return _ss;
}

/** 取得（必要時建立）指定分頁，並確保有表頭 */
function getSheet_(name, headers) {
  var ss = ss_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

/** 把 Sheet 值（Date 物件或字串）統一轉字串 */
function toDateStr_(value) {
  if (value && typeof value.getTime === 'function') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value);
}

/** 打卡（餵魚或澆花）；date 由前端傳入（預設今天） */
function recordCheckin(userId, type, date) {
  if (!userId) throw new Error('缺少使用者資訊');
  type = type || 'fish';
  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var dateStr = date || Utilities.formatDate(now, tz, 'yyyy-MM-dd');

  var sheet = getSheet_(CHECKIN_SHEET, CHECKIN_HEADERS);
  var data = sheet.getDataRange().getValues();
  var already = false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === userId && String(data[i][1]) === type && toDateStr_(data[i][3]) === dateStr) {
      already = true;
      break;
    }
  }
  sheet.appendRow([userId, type, now.toISOString(), dateStr]);

  return {
    ok: true,
    alreadyChecked: already,
    date: dateStr,
    time: Utilities.formatDate(now, tz, 'HH:mm')
  };
}

/** 讀取設定 */
function getSettings(userId, type) {
  if (!userId) throw new Error('缺少使用者資訊');
  type = type || 'fish';
  var sheet = getSheet_(SETTINGS_SHEET, SETTINGS_HEADERS);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === userId && String(data[i][1]) === type) {
      return { startDate: toDateStr_(data[i][2]), intervalDays: Number(data[i][3]) || 1 };
    }
  }
  return null;
}

/** 儲存設定（同一 userId + type 覆蓋更新） */
function saveSettings(userId, type, startDate, intervalDays) {
  if (!userId) throw new Error('缺少使用者資訊');
  if (!startDate) throw new Error('請選擇開始日期');
  type = type || 'fish';
  var interval = parseInt(intervalDays, 10);
  if (!interval || interval < 1) throw new Error('間隔天數需為 1 以上');

  var sheet = getSheet_(SETTINGS_SHEET, SETTINGS_HEADERS);
  var data = sheet.getDataRange().getValues();
  var now = new Date().toISOString();
  var row = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === userId && String(data[i][1]) === type) { row = i + 1; break; }
  }
  var values = [[userId, type, startDate, interval, now]];
  if (row === -1) {
    sheet.appendRow(values[0]);
  } else {
    sheet.getRange(row, 1, 1, values[0].length).setValues(values);
  }
  return { ok: true };
}

/** 行事曆一次拿齊餵魚 + 澆花的設定與打卡紀錄（每張表只讀一次） */
function getCalendarData(userId) {
  if (!userId) throw new Error('缺少使用者資訊');
  var out = {
    fish:  { settings: null, checkins: [] },
    water: { settings: null, checkins: [] }
  };

  // 設定：一次讀完，依 type 分流
  var sData = getSheet_(SETTINGS_SHEET, SETTINGS_HEADERS).getDataRange().getValues();
  for (var i = 1; i < sData.length; i++) {
    if (String(sData[i][0]) !== userId) continue;
    var t = String(sData[i][1]);
    if (out[t]) out[t].settings = { startDate: toDateStr_(sData[i][2]), intervalDays: Number(sData[i][3]) || 1 };
  }

  // 打卡：一次讀完，依 type 分流並去重
  var cData = getSheet_(CHECKIN_SHEET, CHECKIN_HEADERS).getDataRange().getValues();
  var seen = { fish: {}, water: {} };
  for (var j = 1; j < cData.length; j++) {
    if (String(cData[j][0]) !== userId) continue;
    var ct = String(cData[j][1]);
    if (!out[ct]) continue;
    var d = toDateStr_(cData[j][3]);
    if (!seen[ct][d]) { seen[ct][d] = true; out[ct].checkins.push(d); }
  }
  return out;
}
