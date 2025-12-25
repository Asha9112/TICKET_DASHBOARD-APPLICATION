// src/components/AgentTicketAgeTable/utils.js

/**
 * Convert a date string to "DD Month YYYY, HH:MM" format.
 * Supports:
 *  - "dd/mm/yyyy, hh:mm"
 *  - "dd-mm-yyyy, hh:mm"
 * Fallback: uses Date() parsing and then formats.
 */
export function formatDateWithMonthName(dateString) {
  if (!dateString) return "";
  let match = dateString.match(
  /^(\d{2})[/-](\d{2})[/-](\d{4}),?\s*(\d{2}):(\d{2})/);

  if (match) {
    const [_, dd, mm, yyyy, HH, MM] = match;
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const mIndex = parseInt(mm, 10) - 1;
    return `${dd} ${months[mIndex]} ${yyyy}, ${HH}:${MM}`;
  }

  const dt = new Date(dateString);
  if (!isNaN(dt)) {
    const day = dt.getDate().toString().padStart(2, "0");
    const month = dt.toLocaleString("default", { month: "long" });
    const year = dt.getFullYear();
    const hour = dt.getHours().toString().padStart(2, "0");
    const minute = dt.getMinutes().toString().padStart(2, "0");
    return `${day} ${month} ${year}, ${hour}:${minute}`;
  }
  return dateString;
}

/**
 * Given a start date string, calculate:
 *  - hm: "H:MM" duration from start time to now
 *  - days: "X Days"
 */
export function getDurationHMAndDays(fromDateString) {
  if (!fromDateString) return { hm: "", days: "" };

  const start = new Date(fromDateString);
  if (isNaN(start)) return { hm: "", days: "" };

  const now = new Date();
  const diffMs = now.getTime() - start.getTime();

  if (diffMs < 0) return { hm: "0:00", days: "0 Days" };

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const hh = hours.toString();
  const mm = minutes.toString().padStart(2, "0");

  return { hm: `${hh}:${mm}`, days: `${days} Days` };
}

/**
 * Convert Zoho-style "H:MM hrs" to "H:MM".
 */
export function fromZohoHrsToHM(hrsString) {
  if (!hrsString) return "";
  const m = String(hrsString).trim().match(/^(\d+):(\d{2})\s*hrs$/i);
  if (!m) return hrsString;
  const hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const hh = hours.toString();
  const mm = minutes.toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Convert Zoho-style "H:MM hrs" to total minutes.
 * Returns null if invalid.
 */
export function zohoHrsToMinutes(hrsString) {
  if (!hrsString) return null;
  const m = String(hrsString).trim().match(/^(\d+):(\d{2})\s*hrs$/i);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  return h * 60 + mm;
}

/**
 * Convert total minutes to "H:MM" format.
 */
export function minutesToHM(totalMinutes) {
  if (totalMinutes == null || isNaN(totalMinutes)) return "";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

/**
 * Convert total minutes to a "X Days" label.
 */
export function minutesToDaysLabel(totalMinutes) {
  if (totalMinutes == null || isNaN(totalMinutes)) return "";
  const days = Math.floor(totalMinutes / (60 * 24));
  return `${days} Days`;
}

/**
 * Convert any date string to IST formatted string.
 * Format: dd/mm/yyyy, hh:mm (IST)
 */
export function formatToIST(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (isNaN(d)) return dateString;
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * First Response exact datetime:
 * createdTime + firstResponseTime (in minutes)
 * - if < 1 minute → return "" (no datetime)
 */
export function getFirstResponseDateTime(createdTime, firstResponseHrsString) {
  if (!createdTime || !firstResponseHrsString) return "";

  const mins = zohoHrsToMinutes(firstResponseHrsString);
  if (mins == null || mins < 1) return "";

  const base = new Date(createdTime);
  if (isNaN(base)) return "";

  const dt = new Date(base.getTime() + mins * 60 * 1000);
  return formatToIST(dt);
}

/**
 * Normalize status text to canonical keys.
 * Examples:
 *  "On Hold" → "hold"
 *  "in-progress" → "inProgress"
 */
export function normalizeStatus(text) {
  if (!text) return "";
  const t = text.replace(/[\s\-_]/g, "").toLowerCase();
  if (t === "hold" || t === "onhold") return "hold";
  if (t === "inprogress" || t === "in-progress" || t === "in_progress")
    return "inProgress";
  if (t === "open") return "open";
  if (t === "escalated") return "escalated";
  return t;
}
