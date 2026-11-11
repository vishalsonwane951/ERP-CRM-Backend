import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { getEmployee, getOrg, queryBy } from "../services/dbHelpers.js";
import { fail, need } from "../services/helpers.js";

// ---------- Setup ----------
configureDynamoDB();
const dynamoDb = DynamoDBDocumentClient.from(getDynamoDBClient());

// ---------- Helpers ----------

// Create a JWT token for an employee
function createToken(employee, secret, expiresIn) {
  const payload = {
    sub: employee.empId,
    orgId: employee.orgId,
    role: employee.role,
    name: employee.name,
  };
  return jwt.sign(payload, secret, { expiresIn });
}

// Build the user object the frontend needs
async function buildUser(employee) {
  // Super admin has no organization row
  const org =
    employee.role === "SUPER_ADMIN"
      ? { name: "Platform", timezone: "Asia/Kolkata" }
      : await getOrg(dynamoDb, employee.orgId);
      
  return {
    empId: employee.empId,
    orgId: employee.orgId,
    orgName: org.name,
    timezone: org.timezone,
    name: employee.name,
    email: employee.email,
    role: employee.role,
    designation: employee.designation,
    deptId: employee.deptId,
    empCode: employee.empCode,
    managerId: employee.managerId,
  };
}

// Tokens + user, returned on login and refresh
async function startSession(employee) {
  return {
    accessToken: createToken(employee, process.env.JWT_ACCESS_SECRET, "15m"),
    refreshToken: createToken(employee, process.env.JWT_REFRESH_SECRET, "7d"),
    user: await buildUser(employee),
  };
}


export const login = async (req, res) => {
  need(req.body, ["email", "password"]);
  const { email, password } = req.body;

  // Find the employee by email
  const [employee] = await queryBy(
    dynamoDb,
    T.employees,
    "email",
    email.toLowerCase(),
    { index: "ByEmail" },
  );

  // Same error for unknown email and wrong password (so attackers can't tell which)
  const passwordOk =
    employee && (await bcrypt.compare(password, employee.passwordHash));
  if (!passwordOk) {
    fail(401, "Email or password is incorrect");
  }

  if (employee.status !== "ACTIVE") {
    fail(403, "This account is not active. Contact HR.");
  }

  res.json({ data: await startSession(employee) });
};

export const refresh = async (req, res) => {
  need(req.body, ["refreshToken"]);

  // Check the refresh token is valid
  let payload;
  try {
    payload = jwt.verify(req.body.refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    fail(401, "Your session expired. Sign in again.");
  }

  // Load the employee fresh from the DB, so role changes apply on refresh
  const employee = await getEmployee(dynamoDb, payload.orgId, payload.sub);
  if (employee.status !== "ACTIVE") {
    fail(401, "This account is not active.");
  }

  res.json({ data: await startSession(employee) });
};

export const me = async (req, res) => {
  const employee = await getEmployee(dynamoDb, req.user.orgId, req.user.empId);
  res.json({ data: await buildUser(employee) });
};


// Create a new employee with the ADMIN role (only an existing admin can do this)
export const createAdmin = async (req, res) => {
  // Only admins can create admins
  if (req.user.role !== "ADMIN") {
    fail(403, "Only an admin can create another admin.");
  }


  need(req.body, ["name", "email", "password"]);
  const { name, password } = req.body;
  const email = req.body.email.toLowerCase();

  // Make sure the email is not already used
  const [existing] = await queryBy(dynamoDb, T.employees, "email", email, {
    index: "ByEmail",
  });
  if (existing) {
    fail(409, "An employee with this email already exists.");
  }

  // Build the new admin (same organization as the person creating it)
  const admin = {
    orgId: req.user.orgId,
    empId: randomUUID(),
    name,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: "ADMIN",
    status: "ACTIVE",
    designation: req.body.designation ?? "Administrator",
    deptId: req.body.deptId ?? null,
    empCode: req.body.empCode ?? null,
    managerId: null,
  };

  await dynamoDb.send(new PutCommand({ TableName: T.employees, Item: admin }));

  // Return the user object (never the passwordHash)
  res.status(201).json({ data: await buildUser(admin) });
};