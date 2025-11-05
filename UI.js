const SHEET_USERS = "User";
const SHEET_JOBS  = "คิวงาน";   // ← ชื่อชีตงานของคุณ

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("KK Wedding – ตารางงานทีม")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ดึงผู้ใช้จากชีต User (A=ชื่อจริง, B=ชื่อเล่น, E=Gmail, F=สิทธิ์)
function getCurrentUser() {
  const email = (Session.getActiveUser().getEmail() || "").trim();
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_USERS);
  if (!sh) {
    return { email: email || "unknown", name: "ผู้ใช้", role: "STAFF" };
  }

  const rows = sh.getDataRange().getValues();
  let user = { email: email || "unknown", name: "ผู้ใช้", role: "STAFF" };

  for (let i = 1; i < rows.length; i++) {
    const rEmail = (rows[i][4] || "").toString().trim().toLowerCase(); // E = Gmail
    const rRole  = (rows[i][5] || "STAFF").toString().trim().toUpperCase(); // F = สิทธิ์
    if (email && rEmail === email.toLowerCase()) {
      const name = rows[i][1] || rows[i][0] || email; // B (ชื่อเล่น) > A (ชื่อจริง)
      user = { email, name, role: rRole };
      break;
    }
  }
  return user;
}

function getWeddingJobs() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_JOBS);
  const data = sh.getDataRange().getValues();

  const user = getCurrentUser();
  const userName = (user.name || "").trim();               // เราจะใช้ชื่อที่อยู่ในช่อง H เทียบ
  const userRole = (user.role || "STAFF").toUpperCase();

  // ฟังก์ชันรวม "วันที่" + "เวลา" ให้เป็นตัวเดียว
  function mergeDateTime(dateObj, timeVal) {
    if (!timeVal) return dateObj;
    const d = new Date(dateObj);

    // ❗ กรณีเวลาเป็น Date (มาจาก dropdown)
    if (timeVal instanceof Date) {
      d.setHours(timeVal.getHours(), timeVal.getMinutes(), 0, 0);
      return d;
    }

    // ❗ กรณีเวลาเป็น "06:00" หรือ "06:00:00"
    const parts = timeVal.toString().split(":");
    const h = Number(parts[0]) || 0;
    const m = Number(parts[1]) || 0;
    d.setHours(h, m, 0, 0);
    return d;
  }

  const out = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue; // A ต้องมีวันที่

    // A = วันที่
    const dateObj   = row[0] instanceof Date ? row[0] : new Date(row[0]);
    // B,C = เวลา (แบบ dropdown)
    const startDate = mergeDateTime(dateObj, row[1]);
    const endDate   = mergeDateTime(dateObj, row[2]);

    // H = ทีมรันคิว
    const teamStr = (row[7] || "").toString();
    const teamArr = teamStr
      .split(/[, ]+/)              // คั่นด้วยคอมมาหรือช่องว่าง
      .map(s => s.trim())
      .filter(Boolean);

    // 🔒 ถ้าไม่ใช่ ADMIN → ให้เห็นเฉพาะงานที่มีชื่อตัวเองเท่านั้น
    if (userRole !== "ADMIN" && !teamArr.includes(userName)) {
      continue;
    }

    out.push({
      row: i + 1,
      date: Utilities.formatDate(dateObj, "Asia/Bangkok", "yyyy-MM-dd"),
      timeStart: Utilities.formatDate(startDate, "Asia/Bangkok", "HH:mm"),
      timeEnd: Utilities.formatDate(endDate, "Asia/Bangkok", "HH:mm"),
      couple: row[3] || "",          // D
      place: row[4] || "",           // E
      mc: row[5] || "",              // F
      host: row[6] || "",            // G
      team: teamStr,                 // H
      customer: row[8] || "",        // I
      note: row[9] || "",            // J
      eventId: row[10] || ""         // K
    });
  }

  return out;
}
