import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { canViewEmployee, getEmployee, getItem, getOrg, listVisibleEmployees, notify, putNew, queryBy, updateItem } from "../services/dbHelpers.js";
import { fail, monthEnd, nowParts, toMinutes } from "../services/helpers.js";

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

// distance in metres between two lat/lng points
const metres = (a, b) => {
  const rad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};

// All attendance records of one employee for a month, plus totals
const monthData = async (empId, month) => {
  const records = await queryBy(dynamoDb, T.attendance, "empId", empId, { skName: "date", from: `${month}-01`, to: monthEnd(month) });
  const count = (s) => records.filter((r) => r.status === s).length;
  return {
    month, records,
    summary: { present: count("PRESENT"), late: count("LATE"), halfDay: count("HALF_DAY"), workedMinutes: records.reduce((a, r) => a + (r.workedMinutes || 0), 0) },
  };
};
const thisMonth = (tz) => nowParts(tz).date.slice(0, 7);

// ---------- breaks ----------
// Total minutes of the breaks so far. A break that is still open counts until `untilIso`.
const breakMinutes = (breaks = [], untilIso) =>
  Math.round(breaks.reduce((ms, b) => ms + (new Date(b.endAt || untilIso) - new Date(b.startAt)), 0) / 60000);

// The break rules in ONE place: /today uses it to show or hide the button, /break/start uses it to enforce.
// The numbers come from the organization settings (maxBreaksPerDay, breakAllowedAfterMinutes), never from the code.
const breakState = (record, org, nowMs) => {
  const used = record?.breaks?.length || 0;
  const onBreak = used > 0 && !record.breaks[used - 1].endAt;
  const max = org.maxBreaksPerDay;
  const after = org.breakAllowedAfterMinutes; // null = not set: allowed any time between check-in and check-out
  let reason;
  if (!max) reason = "Breaks are not enabled for your organization";
  else if (!record) reason = "Check in first";
  else if (record.checkOutAt) reason = "You have already checked out";
  else if (onBreak) reason = "You are already on a break";
  else if (used >= max) reason = `You have used all ${max} breaks today`;
  else if (after != null) {
    const wait = Math.ceil(after - (nowMs - new Date(record.checkInAt).getTime()) / 60000);
    if (wait > 0) reason = `Breaks open ${after} minutes after check-in (${wait} more minutes)`;
  }
  return { breaksUsed: used, onBreak, canBreakNow: !reason, breakBlockedReason: reason };
};

// Both break actions replace the list only if nobody changed it meanwhile and the day is not over (a double tap gets a 409)
const saveBreaks = async (record, breaks) => {
  const updated = await updateItem(dynamoDb, T.attendance, { empId: record.empId, date: record.date }, {
    set: { breaks },
    condition: {
      expr: "attribute_not_exists(#c_out) AND (attribute_not_exists(#c_breaks) OR size(#c_breaks) = :c_count)",
      names: { "#c_out": "checkOutAt", "#c_breaks": "breaks" },
      values: { ":c_count": record.breaks?.length || 0 },
    },
  });
  if (!updated) fail(409, "Your break status just changed. Refresh and try again.");
};

const todayRecord = async (user, org) => {
  const { date } = nowParts(org.timezone);
  return getItem(dynamoDb, T.attendance, { empId: user.empId, date });
};

export const startBreak = async (req, res) => {
  const org = await getOrg(dynamoDb, req.user.orgId);
  const record = await todayRecord(req.user, org);
  if (!record) fail(400, "Check in first, then take a break");
  const state = breakState(record, org, Date.now());
  if (!state.canBreakNow) fail(409, state.breakBlockedReason);
  await saveBreaks(record, [...(record.breaks || []), { startAt: new Date().toISOString() }]);
  res.status(201).json({ data: { breaksUsed: state.breaksUsed + 1, onBreak: true } });
};

export const endBreak = async (req, res) => {
  const org = await getOrg(dynamoDb, req.user.orgId);
  const record = await todayRecord(req.user, org);
  if (!record) fail(400, "Check in first");
  const breaks = record.breaks || [];
  if (!breaks.length || breaks[breaks.length - 1].endAt) fail(409, "You are not on a break");
  const endAt = new Date().toISOString();
  const closed = breaks.map((b, i) => (i === breaks.length - 1 ? { ...b, endAt } : b));
  await saveBreaks(record, closed);
  res.json({ data: { breaksUsed: closed.length, onBreak: false, breakMinutes: breakMinutes(closed, endAt) } });
};

export const today = async (req, res) => {
  const org = await getOrg(dynamoDb, req.user.orgId);
  const { date } = nowParts(org.timezone);
  const record = await getItem(dynamoDb, T.attendance, { empId: req.user.empId, date });
  res.json({
    data: {
      date, serverTime: new Date().toISOString(),
      shift: { name: org.shiftName, start: org.shiftStart, end: org.shiftEnd },
      policy: {
        graceMinutes: org.graceMinutes, halfDayAfterMinutes: org.halfDayAfterMinutes, geofence: org.geofence,
        maxBreaksPerDay: org.maxBreaksPerDay, breakAllowedAfterMinutes: org.breakAllowedAfterMinutes,
      },
      record: record || null,
      ...breakState(record, org, Date.now()), // breaksUsed, onBreak, canBreakNow, breakBlockedReason
    },
  });
};

export const checkIn = async (req, res) => {
  const { lat, lng, deviceId } = req.body;
  const { empId, orgId } = req.user;
  const org = await getOrg(dynamoDb, orgId);
  const emp = await getEmployee(dynamoDb, orgId, empId);

  if (org.geofence) {
    if (lat == null || lng == null) fail(400, "Turn on location to check in from the office");
    if (metres({ lat, lng }, org.geofence) > org.geofence.radiusMeters) fail(422, "You are outside the allowed check-in area");
  }

  const now = nowParts(org.timezone);
  const lateBy = now.minutes - toMinutes(org.shiftStart);
  const status = lateBy <= org.graceMinutes ? "PRESENT" : lateBy <= org.halfDayAfterMinutes ? "LATE" : "HALF_DAY";
  const record = {
    empId, date: now.date, orgId, orgDate: `${orgId}#${now.date}`, deptId: emp.deptId, status,
    checkInAt: new Date().toISOString(), lateByMinutes: Math.max(lateBy, 0), lat, lng, deviceId, breaks: [],
  };
  // one record per employee per day: a second check-in (or a retry) gets a 409 instead of a duplicate
  await putNew(dynamoDb, T.attendance, record, "empId", "You have already checked in today");

  if (status !== "PRESENT") await notify(dynamoDb, emp.managerId, `${emp.name} checked in late`, `${lateBy} minutes after shift start (${org.shiftStart}).`, "/attendance");
  res.status(201).json({ data: { date: now.date, status, checkInAt: record.checkInAt, lateByMinutes: record.lateByMinutes } });
};

export const checkOut = async (req, res) => {
  const org = await getOrg(dynamoDb, req.user.orgId);
  const { date } = nowParts(org.timezone);
  const record = await getItem(dynamoDb, T.attendance, { empId: req.user.empId, date });
  if (!record) fail(400, "Check in first, then check out");
  if (record.checkOutAt) fail(409, "You have already checked out today");

  // checking out ends a break that is still open; break time is not worked time
  const checkOutAt = new Date().toISOString();
  const breaks = (record.breaks || []).map((b) => (b.endAt ? b : { ...b, endAt: checkOutAt }));
  const breakTime = breakMinutes(breaks, checkOutAt);
  const workedMinutes = Math.max(0, Math.round((Date.now() - new Date(record.checkInAt).getTime()) / 60000) - breakTime);
  await updateItem(dynamoDb, T.attendance, { empId: record.empId, date }, { set: { checkOutAt, workedMinutes, breaks, breakMinutes: breakTime } });
  res.json({ data: { date, checkOutAt, workedMinutes, breakMinutes: breakTime } });
};

export const myMonth = async (req, res) => {
  const org = await getOrg(dynamoDb, req.user.orgId);
  res.json({ data: await monthData(req.user.empId, req.query.month || thisMonth(org.timezone)) });
};

export const employeeMonth = async (req, res) => {
  const emp = await getEmployee(dynamoDb, req.user.orgId, req.params.id);
  if (!(await canViewEmployee(dynamoDb, req.user, emp))) fail(403, "You do not have access to this");
  const org = await getOrg(dynamoDb, req.user.orgId);
  res.json({ data: await monthData(emp.empId, req.query.month || thisMonth(org.timezone)) });
};

// Everyone (HR, auditor) or the manager's / project manager's team, for one date
export const orgDay = async (req, res) => {
  if (!["HR_ADMIN", "HR_MANAGER", "AUDITOR", "MANAGER", "PROJECT_MANAGER", "SUPER_ADMIN"].includes(req.user.role)) fail(403, "You do not have access to this");
  const org = await getOrg(dynamoDb, req.user.orgId);
  const todayDate = nowParts(org.timezone).date;
  const date = req.query.date || todayDate;

  const people = (await listVisibleEmployees(dynamoDb, req.user)).filter((e) => e.status === "ACTIVE");
  const found = await queryBy(dynamoDb, T.attendance, "orgDate", `${req.user.orgId}#${date}`, { index: "ByOrgDate" });
  const records = Object.fromEntries(found.map((r) => [r.empId, r]));

  const rows = people.map((e) => {
    const r = records[e.empId];
    return {
      empId: e.empId, name: e.name, designation: e.designation, deptId: e.deptId,
      status: r?.status || (date < todayDate ? "ABSENT" : date === todayDate ? "NOT_YET" : "NONE"),
      checkInAt: r?.checkInAt, checkOutAt: r?.checkOutAt, workedMinutes: r?.workedMinutes, lateByMinutes: r?.lateByMinutes,
    };
  });
  const c = (s) => rows.filter((r) => r.status === s).length;
  res.json({ data: { date, rows, counts: { total: rows.length, present: c("PRESENT"), late: c("LATE"), halfDay: c("HALF_DAY"), absent: c("ABSENT"), notYet: c("NOT_YET") } } });
};
