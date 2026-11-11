import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { getEmployee, getItem, getOrg, listVisibleEmployees, notify, putNew, queryBy, updateItem } from "../services/dbHelpers.js";
import { canViewEmployee, fail, monthEnd, nowParts, toMinutes } from "../services/helpers.js";

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

export const today = async (req, res) => {
  const org = await getOrg(dynamoDb, req.user.orgId);
  const { date } = nowParts(org.timezone);
  const record = await getItem(dynamoDb, T.attendance, { empId: req.user.empId, date });
  res.json({
    data: {
      date, serverTime: new Date().toISOString(),
      shift: { name: org.shiftName, start: org.shiftStart, end: org.shiftEnd },
      policy: { graceMinutes: org.graceMinutes, halfDayAfterMinutes: org.halfDayAfterMinutes, geofence: org.geofence },
      record: record || null,
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
    checkInAt: new Date().toISOString(), lateByMinutes: Math.max(lateBy, 0), lat, lng, deviceId,
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

  const workedMinutes = Math.round((Date.now() - new Date(record.checkInAt).getTime()) / 60000);
  const checkOutAt = new Date().toISOString();
  await updateItem(dynamoDb, T.attendance, { empId: record.empId, date }, { set: { checkOutAt, workedMinutes } });
  res.json({ data: { date, checkOutAt, workedMinutes } });
};

export const myMonth = async (req, res) => {
  const org = await getOrg(dynamoDb, req.user.orgId);
  res.json({ data: await monthData(req.user.empId, req.query.month || thisMonth(org.timezone)) });
};

export const employeeMonth = async (req, res) => {
  const emp = await getEmployee(dynamoDb, req.user.orgId, req.params.id);
  if (!canViewEmployee(req.user, emp)) fail(403, "You do not have access to this");
  const org = await getOrg(dynamoDb, req.user.orgId);
  res.json({ data: await monthData(emp.empId, req.query.month || thisMonth(org.timezone)) });
};

// Everyone (HR, auditor) or the manager's team, for one date
export const orgDay = async (req, res) => {
  if (!["HR_ADMIN", "HR_MANAGER", "AUDITOR", "MANAGER", "SUPER_ADMIN"].includes(req.user.role)) fail(403, "You do not have access to this");
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
