import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { getOrg, listVisibleEmployees, queryBy } from "../services/dbHelpers.js";
import { getPendingFor } from "../services/approvalHelpers.js";
import { addDays, nowParts } from "../services/helpers.js";

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

const ORG_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER", "FINANCE", "AUDITOR"];
const attendanceOn = (orgId, date) => queryBy(dynamoDb, T.attendance, "orgDate", `${orgId}#${date}`, { index: "ByOrgDate" });

// Today's numbers: the whole company for HR / finance / auditors, the team for a manager
export const dashboard = async (req, res) => {
  const org = await getOrg(dynamoDb, req.user.orgId);
  const { date } = nowParts(org.timezone);
  const pendingMine = (await getPendingFor(dynamoDb, req.user)).length;
  const scope = req.user.role === "MANAGER" ? "team" : ORG_ROLES.includes(req.user.role) ? "org" : "self";
  if (scope === "self") return res.json({ data: { scope, date, pendingMine } });

  const people = (await listVisibleEmployees(dynamoDb, req.user)).filter((e) => e.status === "ACTIVE");
  const ids = new Set(people.map((e) => e.empId));
  const today = (await attendanceOn(req.user.orgId, date)).filter((r) => ids.has(r.empId));
  const count = (s) => today.filter((r) => r.status === s).length;

  const data = { scope, date, headcount: people.length, present: count("PRESENT") + count("HALF_DAY"), late: count("LATE"), absent: Math.max(people.length - today.length, 0), pendingMine };
  if (scope === "org") data.openRequests = (await queryBy(dynamoDb, T.approvals, "orgStatus", `${req.user.orgId}#PENDING`, { index: "ByOrgStatus" })).length;
  res.json({ data });
};

// Daily on-time / late / half-day counts for the last N days (7 to 60)
export const trend = async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 14, 7), 60);
  const org = await getOrg(dynamoDb, req.user.orgId);
  const end = nowParts(org.timezone).date;
  const dates = Array.from({ length: days }, (_, i) => addDays(end, i - days + 1));
  const data = await Promise.all(dates.map(async (date) => {
    const rows = await attendanceOn(req.user.orgId, date);
    const count = (s) => rows.filter((r) => r.status === s).length;
    return { date, present: count("PRESENT"), late: count("LATE"), halfDay: count("HALF_DAY") };
  }));
  res.json({ data });
};

export const audit = async (req, res) => {
  res.json({ data: await queryBy(dynamoDb, T.auditLogs, "orgId", req.user.orgId, { desc: true, limit: 50 }) });
};
