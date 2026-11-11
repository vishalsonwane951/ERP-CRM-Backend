import crypto from "crypto";
import bcrypt from "bcryptjs";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import {
  audit,
  getEmployee,
  getOrg,
  listEmployees,
  listVisibleEmployees,
  putItem,
  queryBy,
  updateItem,
} from "../services/dbHelpers.js";
import {
  canViewEmployee,
  fail,
  HR_ROLES,
  need,
  pick,
} from "../services/helpers.js";

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

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
  if (!canViewEmployee(req.user, emp))
    fail(403, "You do not have access to this");
  res.json({ data: present(emp, req.user) });
};

export const create = async (req, res) => {
  need(req.body, [
    "name",
    "email",
    "role",
    "deptId",
    "designation",
    "joinDate",
    "salary",
  ]);
  if (!ROLES.includes(req.body.role))
    fail(422, `role must be one of ${ROLES.join(", ")}`);
  const { orgId } = req.user;
  const email = req.body.email.toLowerCase();
  if (
    (await queryBy(dynamoDb, T.employees, "email", email, { index: "ByEmail" }))
      .length
  )
    fail(409, "An employee with this email already exists");

  const empId = `emp_${crypto.randomBytes(5).toString("hex")}`;
  const tempPassword =
    req.body.password || `Muster@${crypto.randomBytes(3).toString("hex")}`;
  const count = (await listEmployees(dynamoDb, orgId)).length;
  const emp = {
    orgId,
    empId,
    empCode: `EMP-${String(count + 1).padStart(4, "0")}`,
    email,
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    ...pick(req.body, [
      "name",
      "phone",
      "role",
      "deptId",
      "designation",
      "managerId",
      "joinDate",
      "salary",
    ]),
    passwordHash: await bcrypt.hash(tempPassword, 10),
    bankAccountEnc: encrypt(req.body.bankAccount),
    nationalIdEnc: encrypt(req.body.nationalId),
  };
  await putItem(dynamoDb, T.employees, emp);

  // every leave type starts with its full yearly balance
  const org = await getOrg(dynamoDb, orgId);
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
  await audit(dynamoDb, req.user, "EMPLOYEE_CREATED", "EMPLOYEE", empId);
  res
    .status(201)
    .json({ data: { employee: present(emp, req.user), tempPassword } });
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
