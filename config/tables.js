import "dotenv/config";

// Single source of truth for every table: its name, key attributes and indexes.
// Used by scripts/createTable.js (to create them) and by the controllers (T.employees, ...).
// pk = partition key attribute, sk = sort key attribute (null = none).
const prefix = process.env.TABLE_PREFIX || "erp";
<<<<<<< HEAD
const define = (key, pk, sk, indexes = []) => ({
=======
// ttl = an attribute holding an expiry time (epoch seconds). DynamoDB deletes the item some time after that moment.
const define = (key, pk, sk, indexes = [], ttl = null) => ({
>>>>>>> master
  key,
  pk,
  sk,
  indexes,
<<<<<<< HEAD
=======
  ttl,
>>>>>>> master
  name: `${prefix}_${key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`, // leaveBalances -> erp_leave_balances
});

export const TABLES = [
  define("organizations", "orgId", null),
<<<<<<< HEAD
=======
  define("plans", "planId", null), // platform price plans: name, price, maxEmployees, features[]
>>>>>>> master
  define("employees", "orgId", "empId", [
    { name: "ByManager", pk: "managerId", sk: "empId" }, // a manager's direct reports
    { name: "ByEmail", pk: "email", sk: null }, // sign-in lookup
  ]),
  define("attendance", "empId", "date", [
    { name: "ByOrgDate", pk: "orgDate", sk: "empId" }, // everyone in a company on one day
  ]),
  define("leaveBalances", "empId", "typeId"),
  define("leaveRequests", "empId", "reqId"),
  define("expenses", "empId", "reqId"),
  define("approvals", "reqId", null, [
    { name: "ByApprover", pk: "approverKey", sk: "createdAt" }, // an approver's inbox (open requests only)
    { name: "ByOrgStatus", pk: "orgStatus", sk: "createdAt" }, // company requests by status
  ]),
  define("assets", "orgId", "assetId"),
  define("payrollRuns", "orgId", "period"),
  define("payrollLines", "runId", "empId", [
    { name: "ByEmployee", pk: "empId", sk: "period" }, // my payslips
  ]),
  define("documents", "empId", "documentId"),
  define("notifications", "empId", "notificationId"),
  define("auditLogs", "orgId", "auditId"),
<<<<<<< HEAD
=======
  // candidate onboarding links: the token IS the key, and it expires
  define(
    "onboardingInvites",
    "token",
    null,
    [
      { name: "ByOrg", pk: "orgId", sk: "createdAt" }, // HR's list of invites
    ],
    "expiresAt",
  ),
  // projects (Phase 3 builds the manager / project manager screens on these)
  define("projects", "orgId", "projectId"), // name, status, managerId, pmId, startDate, endDate
  define("projectMembers", "projectId", "empId", [
    { name: "ByEmployee", pk: "empId", sk: "projectId" }, // the projects one person works on
  ]),
  define("tasks", "projectId", "taskId", [
    { name: "ByAssignee", pk: "assigneeId", sk: "dueDate" }, // "my tasks", ordered by due date
  ]),
>>>>>>> master
];

// T.employees === "erp_employees"
export const T = Object.fromEntries(TABLES.map((t) => [t.key, t.name]));
