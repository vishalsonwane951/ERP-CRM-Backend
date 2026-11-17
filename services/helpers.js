import crypto from "crypto";

// ---------- errors & validation ----------
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };
export const need = (body, fields) => {
  for (const f of fields) if (body?.[f] === undefined || body[f] === null || body[f] === "") fail(422, `${f} is required`);
};

// ---------- objects ----------
export const makeId = (prefix) => `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
export const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
/** DynamoDB rejects undefined values, so remove them (deeply) before saving */
export const clean = (v) =>
  Array.isArray(v) ? v.map(clean)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, clean(x)]))
  : v;

<<<<<<< HEAD
// ---------- roles ----------
export const HR_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER"];
export const canViewEmployee = (user, emp) =>
  emp.empId === user.empId ||
  [...HR_ROLES, "FINANCE", "AUDITOR"].includes(user.role) ||
  (user.role === "MANAGER" && emp.managerId === user.empId);
=======
// ---------- roles & features ----------
export const HR_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER"];
// Roles a company can give its people (platform roles SALES and platform FINANCE are separate)
export const TENANT_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER", "MANAGER", "PROJECT_MANAGER", "FINANCE", "AUDITOR", "EMPLOYEE"];
export const TEAM_LEAD_ROLES = ["MANAGER", "PROJECT_MANAGER"]; // roles that see the people reporting to them
export const PLATFORM_ORG = "platform"; // platform staff (SUPER_ADMIN, SALES, platform FINANCE) live in this orgId

// Features an organization can have switched on or off. Add a name here to add a new switch.
export const FEATURES = ["payroll", "assets", "reports", "onboarding", "projects"];
/** ["payroll","assets"] -> { payroll: true, assets: true, reports: false, ... } */
export const featureFlags = (list = []) => Object.fromEntries(FEATURES.map((f) => [f, list.includes(f)]));
>>>>>>> master

// ---------- dates (all dates are YYYY-MM-DD strings) ----------
export const nowParts = (tz = "Asia/Kolkata", d = new Date()) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
};
export const toMinutes = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
export const addDays = (s, n) => new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
<<<<<<< HEAD
export const weekdays = (from, to) => {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); if (w && w !== 6) n++; }
  return n;
};
=======
// Mon to Fri, minus the optional list of holiday dates
export const weekdays = (from, to, holidays = []) => {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); if (w && w !== 6 && !holidays.includes(d)) n++; }
  return n;
};
export const shiftMonth = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
>>>>>>> master
export const monthEnd = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};
