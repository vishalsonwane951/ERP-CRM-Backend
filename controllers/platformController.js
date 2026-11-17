import crypto from "crypto";
import bcrypt from "bcryptjs";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { audit, getItem, getOrg, putItem, putNew, queryBy, scanAll, updateItem } from "../services/dbHelpers.js";
import { fail, FEATURES, featureFlags, makeId, need, PLATFORM_ORG, pick } from "../services/helpers.js";

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

// Platform staff who can be created from the API (SUPER_ADMIN is created with `npm run create:superadmin`)
const STAFF_ROLES = ["SALES", "FINANCE"];

// ---------- small helpers ----------
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);

const getPlan = async (planId) => {
  const plan = planId && (await getItem(dynamoDb, T.plans, { planId }));
  if (!plan) fail(404, "Plan not found");
  return plan;
};

// Platform actions on an organization are written to THAT organization's audit log, so the audit screen can filter by org
const auditOrg = (req, orgId, action) => audit(dynamoDb, { ...req.user, orgId }, action, "ORG", orgId);

const checkFeatureList = (list) => {
  if (!Array.isArray(list) || list.some((f) => !FEATURES.includes(f))) fail(422, `features must be a list of: ${FEATURES.join(", ")}`);
};

// One row per organization with its plan and headcount. Used by the list screen and by reports.
const summarize = async () => {
  const [orgs, plans, people] = await Promise.all([
    scanAll(dynamoDb, T.organizations),
    scanAll(dynamoDb, T.plans),
    scanAll(dynamoDb, T.employees, ["orgId", "status"]),
  ]);
  const planById = Object.fromEntries(plans.map((p) => [p.planId, p]));
  const headcount = {};
  for (const e of people) if (e.status === "ACTIVE") headcount[e.orgId] = (headcount[e.orgId] || 0) + 1;

  const rows = orgs
    .map((o) => ({
      orgId: o.orgId, name: o.name, status: o.status || "ACTIVE", timezone: o.timezone, createdAt: o.createdAt,
      planId: o.planId, planName: planById[o.planId]?.name, price: planById[o.planId]?.price || 0, maxEmployees: planById[o.planId]?.maxEmployees,
      features: { ...featureFlags(FEATURES), ...o.features }, employeeCount: headcount[o.orgId] || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { rows, plans, headcount };
};

// ---------- dashboard and reports ----------
export const dashboard = async (req, res) => {
  const { rows, plans } = await summarize();
  const active = rows.filter((o) => o.status === "ACTIVE");
  res.json({
    data: {
      organizations: { total: rows.length, active: active.length, suspended: rows.length - active.length },
      employees: rows.reduce((sum, o) => sum + o.employeeCount, 0),
      activePlans: plans.filter((p) => p.status !== "ARCHIVED").length,
      byPlan: plans.map((p) => ({ planId: p.planId, name: p.name, organizations: active.filter((o) => o.planId === p.planId).length })),
    },
  });
};

// Read-only money view for platform FINANCE. There is no invoices table yet, so this is plan price x active organizations.
export const reports = async (req, res) => {
  const { rows, plans } = await summarize();
  const active = rows.filter((o) => o.status === "ACTIVE");
  const byPlan = plans.map((p) => {
    const orgs = active.filter((o) => o.planId === p.planId);
    return { planId: p.planId, name: p.name, price: p.price, organizations: orgs.length, monthlyRevenue: orgs.length * p.price };
  });
  res.json({ data: { note: "Estimated from plan price x active organizations (no invoices yet)", monthlyRevenue: byPlan.reduce((s, p) => s + p.monthlyRevenue, 0), byPlan, organizations: rows } });
};

// Audit log of one organization (default: the platform's own actions). ?orgId=kestrel&limit=100
export const auditLogs = async (req, res) => {
  const orgId = req.query.orgId || PLATFORM_ORG;
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  res.json({ data: await queryBy(dynamoDb, T.auditLogs, "orgId", orgId, { desc: true, limit }) });
};

// ---------- organizations ----------
export const listOrganizations = async (req, res) => {
  res.json({ data: (await summarize()).rows });
};

// Creates the organization with the features of its plan. Optionally creates its first HR admin so someone can sign in.
export const createOrganization = async (req, res) => {
  need(req.body, ["name", "planId"]);
  const plan = await getPlan(req.body.planId);
  const orgId = slug(req.body.name);
  if (!orgId || orgId === PLATFORM_ORG) fail(422, "Choose a different organization name");

  const { adminName, adminEmail } = req.body;
  if (adminEmail && !adminName) fail(422, "adminName is required with adminEmail");
  const email = adminEmail?.toLowerCase();
  if (email && (await queryBy(dynamoDb, T.employees, "email", email, { index: "ByEmail" })).length) fail(409, "An employee with this email already exists");

  const org = {
    orgId, name: req.body.name, status: "ACTIVE", planId: plan.planId, features: featureFlags(plan.features),
    timezone: req.body.timezone || "Asia/Kolkata", departments: [], leaveTypes: [], createdAt: new Date().toISOString(),
  };
  await putNew(dynamoDb, T.organizations, org, "orgId", "An organization with this name already exists");

  let tempPassword;
  if (email) {
    tempPassword = req.body.adminPassword || `Muster@${crypto.randomBytes(3).toString("hex")}`;
    await putItem(dynamoDb, T.employees, {
      orgId, empId: makeId("emp"), empCode: "EMP-0001", name: adminName, email, role: "HR_ADMIN", designation: "HR Admin",
      status: "ACTIVE", joinDate: org.createdAt.slice(0, 10), createdAt: org.createdAt, salary: {}, passwordHash: await bcrypt.hash(tempPassword, 10),
    });
  }
  await auditOrg(req, orgId, "ORG_CREATED");
  res.status(201).json({ data: { organization: org, tempPassword } });
};

export const updateOrganization = async (req, res) => {
  await getOrg(dynamoDb, req.params.orgId); // 404 when it does not exist
  const fields = pick(req.body, ["name", "timezone"]);
  const org = await updateItem(dynamoDb, T.organizations, { orgId: req.params.orgId }, { set: fields });
  await auditOrg(req, req.params.orgId, "ORG_UPDATED");
  res.json({ data: org });
};

// Suspended organizations cannot sign in, and requireFeature() blocks the ones already signed in
const setStatus = (status) => async (req, res) => {
  await getOrg(dynamoDb, req.params.orgId);
  const org = await updateItem(dynamoDb, T.organizations, { orgId: req.params.orgId }, { set: { status } });
  await auditOrg(req, req.params.orgId, status === "SUSPENDED" ? "ORG_SUSPENDED" : "ORG_REACTIVATED");
  res.json({ data: org });
};
export const suspend = setStatus("SUSPENDED");
export const reactivate = setStatus("ACTIVE");

// Body: { features: { payroll: false } }. Only the named switches change.
export const setFeatures = async (req, res) => {
  const org = await getOrg(dynamoDb, req.params.orgId);
  const changes = req.body.features;
  if (!changes || typeof changes !== "object") fail(422, "features is required");
  for (const [name, on] of Object.entries(changes)) {
    if (!FEATURES.includes(name)) fail(422, `Unknown feature ${name}. Use: ${FEATURES.join(", ")}`);
    if (typeof on !== "boolean") fail(422, `${name} must be true or false`);
  }
  const updated = await updateItem(dynamoDb, T.organizations, { orgId: org.orgId }, { set: { features: { ...org.features, ...changes } } });
  await auditOrg(req, org.orgId, "ORG_FEATURES_UPDATED");
  res.json({ data: updated });
};

// Moving an organization to a plan also sets its feature switches to that plan's features. Change single switches afterwards with setFeatures.
export const setOrganizationPlan = async (req, res) => {
  need(req.body, ["planId"]);
  const org = await getOrg(dynamoDb, req.params.orgId);
  const plan = await getPlan(req.body.planId);
  const updated = await updateItem(dynamoDb, T.organizations, { orgId: org.orgId }, { set: { planId: plan.planId, features: featureFlags(plan.features) } });
  await auditOrg(req, org.orgId, "ORG_PLAN_CHANGED");
  res.json({ data: updated });
};

// ---------- plans ----------
export const listPlans = async (req, res) => {
  res.json({ data: (await scanAll(dynamoDb, T.plans)).sort((a, b) => a.price - b.price) });
};

export const createPlan = async (req, res) => {
  need(req.body, ["name", "price", "maxEmployees"]);
  checkFeatureList(req.body.features || []);
  const plan = {
    planId: makeId("plan"), name: req.body.name, price: Number(req.body.price), maxEmployees: Number(req.body.maxEmployees),
    features: req.body.features || [], status: "ACTIVE", createdAt: new Date().toISOString(),
  };
  if (!(plan.price >= 0) || !(plan.maxEmployees > 0)) fail(422, "price must be 0 or more and maxEmployees more than 0");
  await putItem(dynamoDb, T.plans, plan);
  await audit(dynamoDb, req.user, "PLAN_CREATED", "PLAN", plan.planId);
  res.status(201).json({ data: plan });
};

// Changing a plan does not touch organizations already on it. Assign the plan again to apply new features.
export const updatePlan = async (req, res) => {
  await getPlan(req.params.planId);
  const fields = pick(req.body, ["name", "price", "maxEmployees", "features", "status"]);
  if (fields.features) checkFeatureList(fields.features);
  if (fields.status && !["ACTIVE", "ARCHIVED"].includes(fields.status)) fail(422, "status must be ACTIVE or ARCHIVED");
  if ("price" in fields) fields.price = Number(fields.price);
  if ("maxEmployees" in fields) fields.maxEmployees = Number(fields.maxEmployees);
  const plan = await updateItem(dynamoDb, T.plans, { planId: req.params.planId }, { set: fields });
  await audit(dynamoDb, req.user, "PLAN_UPDATED", "PLAN", req.params.planId);
  res.json({ data: plan });
};

// ---------- platform staff (SALES, FINANCE) ----------
export const listStaff = async (req, res) => {
  const people = await queryBy(dynamoDb, T.employees, "orgId", PLATFORM_ORG);
  res.json({ data: people.map(({ passwordHash, ...safe }) => safe) });
};

export const createStaff = async (req, res) => {
  need(req.body, ["name", "email", "role"]);
  if (!STAFF_ROLES.includes(req.body.role)) fail(422, `role must be one of ${STAFF_ROLES.join(", ")}`);
  const email = req.body.email.toLowerCase();
  if ((await queryBy(dynamoDb, T.employees, "email", email, { index: "ByEmail" })).length) fail(409, "An employee with this email already exists");
  const tempPassword = req.body.password || `Muster@${crypto.randomBytes(3).toString("hex")}`;
  const { passwordHash, ...staff } = {
    orgId: PLATFORM_ORG, empId: makeId("emp"), name: req.body.name, email, role: req.body.role, designation: req.body.designation || "Platform staff",
    status: "ACTIVE", createdAt: new Date().toISOString(), passwordHash: await bcrypt.hash(tempPassword, 10),
  };
  await putItem(dynamoDb, T.employees, { ...staff, passwordHash });
  await audit(dynamoDb, req.user, "PLATFORM_STAFF_CREATED", "EMPLOYEE", staff.empId);
  res.status(201).json({ data: { staff, tempPassword } });
};
