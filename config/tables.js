import "dotenv/config";

// Single source of truth for every table: its name, key attributes and indexes.
// Used by scripts/createTable.js (to create them) and by the controllers (T.employees, ...).
// pk = partition key attribute, sk = sort key attribute (null = none).
const prefix = process.env.TABLE_PREFIX || "erp";
const define = (key, pk, sk, indexes = []) => ({
  key,
  pk,
  sk,
  indexes,
  name: `${prefix}_${key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`, // leaveBalances -> erp_leave_balances
});

export const TABLES = [
  define("organizations", "orgId", null),
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
];

// T.employees === "erp_employees"
export const T = Object.fromEntries(TABLES.map((t) => [t.key, t.name]));
