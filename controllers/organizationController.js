import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { audit, getOrg, updateItem } from "../services/dbHelpers.js";
import { fail, makeId, need, pick } from "../services/helpers.js";

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

// Departments and leave types are small lists, so they are stored inside the organization record
export const getMine = async (req, res) => {
  res.json({ data: await getOrg(dynamoDb, req.user.orgId) });
};

const whole = (value, min, max, message) => {
  const n = Number(value);
  if (value === "" || value === null || !Number.isInteger(n) || n < min || n > max) fail(422, message);
  return n;
};

// Checks the break, pay-cycle and holiday settings. Throws 422 with a plain message.
const checkSettings = (f) => {
  if ("maxBreaksPerDay" in f) f.maxBreaksPerDay = whole(f.maxBreaksPerDay, 0, 10, "maxBreaksPerDay must be a whole number from 0 to 10 (0 means no breaks)");
  if ("breakAllowedAfterMinutes" in f) // empty = not set: a break is allowed any time after check-in
    f.breakAllowedAfterMinutes = f.breakAllowedAfterMinutes === "" || f.breakAllowedAfterMinutes === null ? null : whole(f.breakAllowedAfterMinutes, 0, 720, "breakAllowedAfterMinutes must be a whole number of minutes, or empty");
  if ("cycleStartDay" in f) f.cycleStartDay = whole(f.cycleStartDay, 1, 28, "cycleStartDay must be a day from 1 to 28 (1 = calendar month)");
  if ("holidays" in f) {
    if (!Array.isArray(f.holidays) || f.holidays.some((h) => !/^\d{4}-\d{2}-\d{2}$/.test(h?.date || "") || !h?.name)) fail(422, "holidays must be a list of { date: YYYY-MM-DD, name }");
    f.holidays = [...new Map(f.holidays.map((h) => [h.date, { date: h.date, name: String(h.name) }])).values()].sort((a, b) => a.date.localeCompare(b.date));
  }
};

// Shift times, grace period, half-day cut-off, optional geofence { lat, lng, radiusMeters },
// breaks (maxBreaksPerDay, breakAllowedAfterMinutes), pay cycle (cycleStartDay) and holidays
export const updateSettings = async (req, res) => {
  const fields = pick(req.body, ["shiftName", "shiftStart", "shiftEnd", "graceMinutes", "halfDayAfterMinutes", "geofence", "timezone", "maxBreaksPerDay", "breakAllowedAfterMinutes", "cycleStartDay", "holidays"]);
  checkSettings(fields);
  const org = await updateItem(dynamoDb, T.organizations, { orgId: req.user.orgId }, { set: fields });
  await audit(dynamoDb, req.user, "SETTINGS_UPDATED", "ORG", req.user.orgId);
  res.json({ data: org });
};

export const listDepartments = async (req, res) => {
  res.json({ data: (await getOrg(dynamoDb, req.user.orgId)).departments });
};

export const addDepartment = async (req, res) => {
  need(req.body, ["name"]);
  const org = await getOrg(dynamoDb, req.user.orgId);
  const department = { deptId: makeId("dept"), name: req.body.name };
  await updateItem(dynamoDb, T.organizations, { orgId: org.orgId }, { set: { departments: [...org.departments, department] } });
  res.status(201).json({ data: department });
};

export const listLeaveTypes = async (req, res) => {
  res.json({ data: (await getOrg(dynamoDb, req.user.orgId)).leaveTypes });
};

export const addLeaveType = async (req, res) => {
  need(req.body, ["name", "annualDays"]);
  const org = await getOrg(dynamoDb, req.user.orgId);
  // paid: false = without-pay leave (WPL). Approved days are deducted from salary and shown separately from absence.
  const leaveType = { typeId: makeId("lt"), name: req.body.name, annualDays: Number(req.body.annualDays), color: req.body.color || "#0B6E75", paid: req.body.paid !== false };
  await updateItem(dynamoDb, T.organizations, { orgId: org.orgId }, { set: { leaveTypes: [...org.leaveTypes, leaveType] } });
  res.status(201).json({ data: leaveType });
};
