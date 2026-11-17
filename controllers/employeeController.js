import crypto from "crypto";
import bcrypt from "bcryptjs";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import {
  audit,
<<<<<<< HEAD
  getEmployee,
=======
  canViewEmployee,
  getEmployee,
  getItem,
>>>>>>> master
  getOrg,
  listEmployees,
  listVisibleEmployees,
  putItem,
  queryBy,
  updateItem,
} from "../services/dbHelpers.js";
import {
<<<<<<< HEAD
  canViewEmployee,
  fail,
  HR_ROLES,
  need,
  pick,
} from "../services/helpers.js";
=======
  fail,
  HR_ROLES,
  monthEnd,
  need,
  nowParts,
  pick,
  shiftMonth,
  TENANT_ROLES as ROLES,
} from "../services/helpers.js";
import { decrypt, encrypt } from "../services/crypto.js";
import { scoreMonth } from "../services/performance.js";
>>>>>>> master

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

<<<<<<< HEAD
const ROLES = [
  "SUPER_ADMIN",
  "HR_ADMIN",
  "HR_MANAGER",
  "MANAGER",
  "FINANCE",
  "AUDITOR",
  "EMPLOYEE",
];
const KEY = Buffer.from(process.env.FIELD_ENCRYPTION_KEY, "hex");

// Bank account and national ID are encrypted (AES-256-GCM) before they are stored
const encrypt = (text) => {
  if (!text) return undefined;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const data = Buffer.concat([
    cipher.update(String(text), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString("base64"))
    .join(".");
};
const decrypt = (blob) => {
  if (!blob) return undefined;
  const [iv, tag, data] = blob.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
=======
// The plan (platform table) caps how many active people an organization may have
const checkPlanLimit = async (org, activeCount) => {
  if (!org.planId) return;
  const plan = await getItem(dynamoDb, T.plans, { planId: org.planId });
  if (plan?.maxEmployees && activeCount >= plan.maxEmployees)
    fail(403, `Your plan allows ${plan.maxEmployees} employees. Ask your account manager to upgrade.`);
>>>>>>> master
};

// What this viewer is allowed to see of an employee (never the password hash)
const present = (emp, viewer) => {
  const { passwordHash, bankAccountEnc, nationalIdEnc, ...rest } = emp;
  if (
    emp.empId !== viewer.empId &&
    ![...HR_ROLES, "FINANCE", "AUDITOR"].includes(viewer.role)
  )
    delete rest.salary;
  if (
    emp.empId === viewer.empId ||
    ["HR_ADMIN", "SUPER_ADMIN"].includes(viewer.role)
  ) {
    rest.bankAccount = decrypt(bankAccountEnc);
    rest.nationalId = decrypt(nationalIdEnc);
  }
  return rest;
};

export const list = async (req, res) => {
  const { q, status } = req.query;
  const people = (await listVisibleEmployees(dynamoDb, req.user))
    .filter((e) => !status || e.status === status)
    .filter(
      (e) =>
        !q ||
        [e.name, e.email, e.empCode, e.designation].some((v) =>
          v?.toLowerCase().includes(q.toLowerCase()),
        ),
    )
    .map((e) => present(e, req.user))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json({ data: people });
};

export const getOne = async (req, res) => {
  const emp = await getEmployee(dynamoDb, req.user.orgId, req.params.id);
<<<<<<< HEAD
  if (!canViewEmployee(req.user, emp))
=======
  if (!(await canViewEmployee(dynamoDb, req.user, emp)))
>>>>>>> master
    fail(403, "You do not have access to this");
  res.json({ data: present(emp, req.user) });
};

<<<<<<< HEAD
export const create = async (req, res) => {
  need(req.body, [
=======
// Used by the Add person form and by onboarding (turning a submitted invite into an employee)
export const createEmployee = async (user, body) => {
  need(body, [
>>>>>>> master
    "name",
    "email",
    "role",
    "deptId",
    "designation",
    "joinDate",
    "salary",
  ]);
<<<<<<< HEAD
  if (!ROLES.includes(req.body.role))
    fail(422, `role must be one of ${ROLES.join(", ")}`);
  const { orgId } = req.user;
  const email = req.body.email.toLowerCase();
=======
  if (!ROLES.includes(body.role))
    fail(422, `role must be one of ${ROLES.join(", ")}`);
  const { orgId } = user;
  const email = body.email.toLowerCase();
>>>>>>> master
  if (
    (await queryBy(dynamoDb, T.employees, "email", email, { index: "ByEmail" }))
      .length
  )
    fail(409, "An employee with this email already exists");

  const empId = `emp_${crypto.randomBytes(5).toString("hex")}`;
  const tempPassword =
<<<<<<< HEAD
    req.body.password || `Muster@${crypto.randomBytes(3).toString("hex")}`;
  const count = (await listEmployees(dynamoDb, orgId)).length;
=======
    body.password || `Muster@${crypto.randomBytes(3).toString("hex")}`;
  const everyone = await listEmployees(dynamoDb, orgId);
  const count = everyone.length;
  const org = await getOrg(dynamoDb, orgId);
  await checkPlanLimit(org, everyone.filter((e) => e.status === "ACTIVE").length);
>>>>>>> master
  const emp = {
    orgId,
    empId,
    empCode: `EMP-${String(count + 1).padStart(4, "0")}`,
    email,
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
<<<<<<< HEAD
    ...pick(req.body, [
=======
    ...pick(body, [
>>>>>>> master
      "name",
      "phone",
      "role",
      "deptId",
      "designation",
      "managerId",
      "joinDate",
      "salary",
<<<<<<< HEAD
    ]),
    passwordHash: await bcrypt.hash(tempPassword, 10),
    bankAccountEnc: encrypt(req.body.bankAccount),
    nationalIdEnc: encrypt(req.body.nationalId),
=======
      "dob",
      "address",
      "emergencyName",
      "emergencyPhone",
      "bankName",
      "bankIfsc",
    ]),
    passwordHash: await bcrypt.hash(tempPassword, 10),
    bankAccountEnc: encrypt(body.bankAccount),
    nationalIdEnc: encrypt(body.nationalId),
>>>>>>> master
  };
  await putItem(dynamoDb, T.employees, emp);

  // every leave type starts with its full yearly balance
<<<<<<< HEAD
  const org = await getOrg(dynamoDb, orgId);
=======
>>>>>>> master
  await Promise.all(
    org.leaveTypes.map((t) =>
      putItem(dynamoDb, T.leaveBalances, {
        empId,
        typeId: t.typeId,
        name: t.name,
        color: t.color,
        total: t.annualDays,
        used: 0,
        pending: 0,
      }),
    ),
  );
<<<<<<< HEAD
  await audit(dynamoDb, req.user, "EMPLOYEE_CREATED", "EMPLOYEE", empId);
  res
    .status(201)
    .json({ data: { employee: present(emp, req.user), tempPassword } });
=======
  await audit(dynamoDb, user, "EMPLOYEE_CREATED", "EMPLOYEE", empId);
  return { employee: present(emp, user), tempPassword };
};

export const create = async (req, res) => {
  res.status(201).json({ data: await createEmployee(req.user, req.body) });
>>>>>>> master
};

export const update = async (req, res) => {
  const emp = await getEmployee(dynamoDb, req.user.orgId, req.params.id);
  const body = req.body;
  const sensitive = ["role", "salary", "bankAccount", "nationalId"].filter(
    (k) => k in body,
  );
  if (sensitive.length && !["HR_ADMIN", "SUPER_ADMIN"].includes(req.user.role))
    fail(403, `Only HR admins can change ${sensitive.join(", ")}`);
  if (body.role && !ROLES.includes(body.role))
    fail(422, `role must be one of ${ROLES.join(", ")}`);

  const set = pick(body, [
    "name",
    "phone",
    "designation",
    "deptId",
    "status",
    "role",
    "salary",
  ]);
  if ("bankAccount" in body) set.bankAccountEnc = encrypt(body.bankAccount);
  if ("nationalId" in body) set.nationalIdEnc = encrypt(body.nationalId);
  const remove = [];
  if ("managerId" in body) {
    if (body.managerId) set.managerId = body.managerId;
    else remove.push("managerId"); // no manager: the employee also leaves the ByManager index
  }
  const updated = await updateItem(
    dynamoDb,
    T.employees,
    { orgId: emp.orgId, empId: emp.empId },
    { set, remove },
  );
  await audit(dynamoDb, req.user, "EMPLOYEE_UPDATED", "EMPLOYEE", emp.empId);
  res.json({ data: present(updated, req.user) });
};
<<<<<<< HEAD
=======

// ---------- performance ----------
// A score per month built from tasks, attendance and leave (the formula and weights live in services/performance.js)
const loadPerformanceInputs = async (empId, fromMonth, toMonth) => {
  const [tasks, attendance, leaves] = await Promise.all([
    queryBy(dynamoDb, T.tasks, "assigneeId", empId, { index: "ByAssignee" }),
    queryBy(dynamoDb, T.attendance, "empId", empId, { skName: "date", from: `${fromMonth}-01`, to: monthEnd(toMonth) }),
    queryBy(dynamoDb, T.leaveRequests, "empId", empId),
  ]);
  return { tasks, attendance, leaves: leaves.filter((l) => l.status === "APPROVED") };
};

// GET /employees/:id/performance?month=2026-11  ->  that month, plus the last six months as a trend
export const performance = async (req, res) => {
  const emp = await getEmployee(dynamoDb, req.user.orgId, req.params.id);
  if (!(await canViewEmployee(dynamoDb, req.user, emp))) fail(403, "You do not have access to this");
  const org = await getOrg(dynamoDb, req.user.orgId);
  const { date: today } = nowParts(org.timezone);
  const month = req.query.month || today.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) fail(422, "month must look like 2026-11");

  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5)); // oldest first, ends with `month`
  const inputs = await loadPerformanceInputs(emp.empId, months[0], month);
  const holidays = org.holidays.map((h) => h.date);
  const trend = months.map((m) => scoreMonth({ ...inputs, month: m, today, holidays }));
  res.json({ data: { employee: { empId: emp.empId, name: emp.name }, ...trend[trend.length - 1], trend: trend.map(({ month: m, score }) => ({ month: m, score })) } });
};

// GET /employees/performance?month=  ->  one row per person the caller may see (HR: everyone, managers: their team)
export const teamPerformance = async (req, res) => {
  const org = await getOrg(dynamoDb, req.user.orgId);
  const { date: today } = nowParts(org.timezone);
  const month = req.query.month || today.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) fail(422, "month must look like 2026-11");
  const holidays = org.holidays.map((h) => h.date);
  const people = (await listVisibleEmployees(dynamoDb, req.user)).filter((e) => e.status === "ACTIVE");
  const rows = await Promise.all(people.map(async (e) => {
    const result = scoreMonth({ ...(await loadPerformanceInputs(e.empId, month, month)), month, today, holidays });
    const { tasks, attendance, leaves } = result.components;
    return { empId: e.empId, name: e.name, designation: e.designation, score: result.score, label: result.label, tasksDue: tasks?.due, tasksOnTime: tasks?.onTime, absentDays: attendance?.absent, lateDays: attendance?.late, leaveDays: leaves?.days };
  }));
  res.json({ data: { month, rows: rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)) } });
};
>>>>>>> master
