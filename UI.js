/***** == CONFIG == *****/
const SHEET_USERS = "User";      // ชีทเก็บผู้ใช้ A:ชื่อจริง B:ชื่อเล่น C:Lv D:?? E:Gmail F:สิทธิ์
const SHEET_JOBS  = "คิวงาน";    // ชีทงานหลัก

/***** == ENTRY == *****/
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile("index")  // ← ชื่อไฟล์หน้าเว็บ (ไม่ต้องมี .html)
    .setTitle("KK Wedding – ตารางงานทีม")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/***** == AUTH == *****/
// รับ id_token จากหน้าเว็บ → ตรวจกับ Google → คืนข้อมูลผู้ใช้ (email/name/pic/role/nick)
function verifyIdToken(idToken) {
  if (!idToken) throw new Error("Missing id_token");

  // ตรวจ token กับ Google
  const url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken);
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error("Token verify failed: " + res.getContentText());
  }
  const payload = JSON.parse(res.getContentText());


  // 🔐 ป้องกัน client id ผิดตัว
    const EXPECTED_AUD = "https://n-duylqi4n4qtj3fszgap7eh2d3brdza3jb7gdmqq-0lu-script.googleusercontent.com"; // (ตัวใหม่จาก Error)(นี่คือตัวใหม่ล่าสุด)แก้เป็นของคุณ
  if (payload.aud !== EXPECTED_AUD) {
    throw new Error("Invalid audience");
  }
  if (String(payload.email_verified) !== "true") {
    throw new Error("Email not verified");
  }

  const email = String(payload.email || "").toLowerCase().trim();
  const name  = payload.name || "";
  const pic   = payload.picture || "";

  // map สิทธิ์จากชีท User
  const u = lookupUserByEmail_(email);
  if (!u) throw new Error("ยังไม่มีอีเมลนี้ในระบบ: " + email);

  return {
    email: email,
    name: name,
    picture: pic,
    role: (u.role || "STAFF").toUpperCase(),
    nick: u.nick || "",
    level: u.level || ""
  };
}

/***** == USER DIRECTORY HELPERS == *****/
// หา user จากอีเมลในชีท User
function lookupUserByEmail_(email) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_USERS);
  if (!sh) return null;
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const em = String(rows[i][4] || "").toLowerCase().trim(); // E = Gmail
    if (em && em === email) {
      return {
        name: rows[i][0] || "",
        nick: rows[i][1] || "",
        level: rows[i][2] || "",
        role:  rows[i][5] || "STAFF"
      };
    }
  }
  return null;
}

// คืน map: ชื่อ (จริง/เล่น) → อีเมล  เพื่อแปลงทีมที่พิมพ์เป็นชื่อ ให้กลายเป็นอีเมลจริง
function getUserDirectory_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_USERS);
  if (!sh) return {};
  const rows = sh.getDataRange().getValues();
  const byName = {};
  for (let i = 1; i < rows.length; i++) {
    const real  = (rows[i][0] || "").toString().trim();               // A ชื่อจริง
    const nick  = (rows[i][1] || "").toString().trim();               // B ชื่อเล่น
    const email = (rows[i][4] || "").toString().trim().toLowerCase(); // E Gmail
    if (!email) continue;
    [real, nick].forEach(n => {
      const key = (n || "").trim();
      if (key) byName[key] = email;
    });
  }
  return byName;
}

/***** == DATA == *****/
// รวม วันที่ + เวลา ให้เป็น Date เดียว
function _mergeDateTime(dateObj, timeVal) {
  if (!timeVal) return dateObj;
  const d = new Date(dateObj);
  if (timeVal instanceof Date) {
    d.setHours(timeVal.getHours(), timeVal.getMinutes(), 0, 0);
    return d;
  }
  const parts = timeVal.toString().split(":");
  d.setHours(Number(parts[0]) || 0, Number(parts[1]) || 0, 0, 0);
  return d;
}

/**
 * ดึงงาน โดยกรองด้วยอีเมลผู้ใช้ (ส่งมาจากฝั่งหน้าเว็บหลังล็อกอิน)
 * @param {string} email - อีเมลผู้ใช้
 * @return {Array<Object>}
 */
function getWeddingJobs(email) {
  const userEmail = String(email || "").toLowerCase().trim();
  if (!userEmail) throw new Error("Missing user email");

  // role ดูใหม่ทุกครั้งจากชีท (กัน client spoof)
  const current = lookupUserByEmail_(userEmail);
  const userRole = (current?.role || "STAFF").toUpperCase();

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_JOBS);
  if (!sh) return [];
  const data = sh.getDataRange().getValues();

  const directory = getUserDirectory_(); // map ชื่อ → อีเมล

  const out = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue; // ต้องมีวันที่

    const dateObj   = row[0] instanceof Date ? row[0] : new Date(row[0]); // A
    const startDate = _mergeDateTime(dateObj, row[1]); // B
    const endDate   = _mergeDateTime(dateObj, row[2]); // C

    const teamStr = (row[7] || "").toString(); // H
    const teamArr = teamStr.split(/[, ]+/).map(s => s.trim()).filter(Boolean);
    const teamEmails = teamArr
      .map(n => (directory[n] || "").toLowerCase())
      .filter(Boolean);

    // ❗ STAFF เห็นเฉพาะงานที่มีอีเมลตนเองอยู่ในทีม
    if (userRole !== "ADMIN" && !teamEmails.includes(userEmail)) continue;

    out.push({
      row: i + 1,
      date: Utilities.formatDate(dateObj, "Asia/Bangkok", "yyyy-MM-dd"),
      timeStart: Utilities.formatDate(startDate, "Asia/Bangkok", "HH:mm"),
      timeEnd: Utilities.formatDate(endDate, "Asia/Bangkok", "HH:mm"),
      couple: row[3] || "",      // D
      place: row[4] || "",       // E
      mc: row[5] || "",          // F
      host: row[6] || "",        // G
      team: teamStr,             // H
      customer: row[8] || "",    // I
      note: row[9] || "",        // J
      eventId: row[10] || ""     // K
    });
  }
  return out;
}
