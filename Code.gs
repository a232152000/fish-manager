/**
 * 喂魚小幫手 — Google Apps Script 後端（JSON API）
 * 前端放在 GitHub Pages，透過 fetch 呼叫這裡。
 *
 * 支援兩種類型 type：
 *   fish （餵魚）  → 分頁 checkins / settings
 *   water（澆花）  → 分頁 waterCheckins / waterSettings
 * 每個分頁欄位：
 *   checkin ：userId | timestamp(ISO) | date(yyyy-MM-dd)
 *   settings：userId | startDate | intervalDays | updatedAt(ISO)
 */

// 指定要寫入的 Google Sheet ID。
var SHEET_ID = '1FNkH2wPSOWe9cLnAHqnfWGexz0QenEF-Z5tLLFAG6bw';

var SHEETS = {
  fish:  { checkin: 'checkins',      settings: 'settings' },
  water: { checkin: 'waterCheckins', settings: 'waterSettings' }
};

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
      result = recordCheckin(userId, type);
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

/** 把 Sheet 值（Date 物件或字串）統一轉字串 */
function toDateStr_(value) {
  if (value && typeof value.getTime === 'function') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value);
}

/** 打卡（餵魚或澆花） */
function recordCheckin(userId, type) {
  if (!userId) throw new Error('缺少使用者資訊');
  type = type || 'fish';
  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var dateStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');

  var sheet = getSheet_(SHEETS[type].checkin, ['userId', 'timestamp', 'date']);
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

/** 讀取設定 */
function getSettings(userId, type) {
  if (!userId) throw new Error('缺少使用者資訊');
  type = type || 'fish';
  var sheet = getSheet_(SHEETS[type].settings, ['userId', 'startDate', 'intervalDays', 'updatedAt']);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === userId) {
      return { startDate: toDateStr_(data[i][1]), intervalDays: Number(data[i][2]) || 1 };
    }
  }
  return null;
}

/** 儲存設定（同一 userId 覆蓋更新） */
function saveSettings(userId, type, startDate, intervalDays) {
  if (!userId) throw new Error('缺少使用者資訊');
  if (!startDate) throw new Error('請選擇開始日期');
  type = type || 'fish';
  var interval = parseInt(intervalDays, 10);
  if (!interval || interval < 1) throw new Error('間隔天數需為 1 以上');

  var sheet = getSheet_(SHEETS[type].settings, ['userId', 'startDate', 'intervalDays', 'updatedAt']);
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
  return { ok: true };
}

/** 取某類型的所有打卡日期（去重） */
function getCheckinDates_(userId, type) {
  var sheet = getSheet_(SHEETS[type].checkin, ['userId', 'timestamp', 'date']);
  var data = sheet.getDataRange().getValues();
  var seen = {};
  var dates = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === userId) {
      var d = toDateStr_(data[i][2]);
      if (!seen[d]) { seen[d] = true; dates.push(d); }
    }
  }
  return dates;
}

/** 行事曆一次拿齊餵魚 + 澆花的設定與打卡紀錄 */
function getCalendarData(userId) {
  if (!userId) throw new Error('缺少使用者資訊');
  return {
    fish:  { settings: getSettings(userId, 'fish'),  checkins: getCheckinDates_(userId, 'fish') },
    water: { settings: getSettings(userId, 'water'), checkins: getCheckinDates_(userId, 'water') }
  };
}