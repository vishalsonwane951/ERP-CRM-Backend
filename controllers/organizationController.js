import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { audit, getOrg, updateItem } from "../services/dbHelpers.js";
import { makeId, need, pick } from "../services/helpers.js";

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

// Departments and leave types are small lists, so they are stored inside the organization record
export const getMine = async (req, res) => {
  res.json({ data: await getOrg(dynamoDb, req.user.orgId) });
};

// Shift times, grace period, half-day cut-off and optional geofence { lat, lng, radiusMeters }
export const updateSettings = async (req, res) => {
  const fields = pick(req.body, ["shiftName", "shiftStart", "shiftEnd", "graceMinutes", "halfDayAfterMinutes", "geofence", "timezone"]);
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
  const leaveType = { typeId: makeId("lt"), name: req.body.name, annualDays: Number(req.body.annualDays), color: req.body.color || "#0B6E75" };
  await updateItem(dynamoDb, T.organizations, { orgId: org.orgId }, { set: { leaveTypes: [...org.leaveTypes, leaveType] } });
  res.status(201).json({ data: leaveType });
};
