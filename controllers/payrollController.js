import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
<<<<<<< HEAD
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { audit, getItem, listEmployees, putItem, putNew, queryBy, updateItem } from "../services/dbHelpers.js";
import { fail, monthEnd, nowParts, weekdays } from "../services/helpers.js";
=======
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { configureS3, getS3Client } from "../config/s3.js";
import { T } from "../config/tables.js";
import { audit, getEmployee, getItem, getOrg, listEmployees, notify, putItem, putNew, queryBy, updateItem } from "../services/dbHelpers.js";
import { addDays, fail, HR_ROLES, need, nowParts } from "../services/helpers.js";
import { mailErrorText, sendMail } from "../services/mailer.js";
import { calculate, currentPeriod, cycleRange, explain } from "../services/payCalc.js";
import { buildPayslipPdf } from "../services/payslipPdf.js";
>>>>>>> master

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);
<<<<<<< HEAD

const checkPeriod = (p) => { if (!/^\d{4}-\d{2}$/.test(p || "")) fail(422, "period must look like 2026-09"); };

// Example pay rules only. Replace PF, professional tax and tax with your own statutory rules.
const calculate = (emp, period, attendance, leaveDays, today) => {
  const { basic = 0, hra = 0, allowances = 0 } = emp.salary || {};
  const gross = basic + hra + allowances;
  const monthDays = weekdays(`${period}-01`, monthEnd(period));
  const elapsed = today < `${period}-01` ? 0 : weekdays(`${period}-01`, today < monthEnd(period) ? today : monthEnd(period));
  const worked = attendance.reduce((sum, r) => sum + (r.status === "HALF_DAY" ? 0.5 : 1), 0);
  const lopDays = Math.max(0, +(elapsed - worked - leaveDays).toFixed(1)); // days neither worked nor on approved leave
  const lopAmount = Math.round((gross / monthDays) * lopDays);
  const pf = Math.round(basic * 0.12);
  const professionalTax = gross > 25000 ? 200 : 0;
  const tds = Math.round((Math.max(0, gross * 12 - 700000) * 0.1) / 12);
  const deductions = pf + professionalTax + tds;
  return { basic, hra, allowances, gross, workingDays: monthDays, lopDays, lopAmount, pf, professionalTax, tds, deductions, net: Math.max(0, gross - lopAmount - deductions) };
};

export const runs = async (req, res) => {
  res.json({ data: await queryBy(dynamoDb, T.payrollRuns, "orgId", req.user.orgId, { desc: true }) });
};

export const create = async (req, res) => {
  checkPeriod(req.body.period);
  const run = {
    orgId: req.user.orgId, period: req.body.period, status: "DRAFT", employeeCount: 0, totalGross: 0, totalNet: 0,
=======
configureS3();
const s3 = getS3Client();
const BUCKET = process.env.S3_BUCKET;

const checkPeriod = (p) => { if (!/^\d{4}-\d{2}$/.test(p || "")) fail(422, "period must look like 2026-09"); };

// =====================================================================================================================
// The salary credit flow, in one table. Edit here to change who may do what and from which status.
//
//   DRAFT -> CALCULATED -> SUBMITTED -> APPROVED -> PAID -> PAYSLIPS_SENT        RETURNED = back to HR from SUBMITTED
//
//   HR   (HR_ADMIN) : calculate, submit, generate payslips        FINANCE : approve, return, record payments
//   Every move is ONE conditional update (the run must still be in a `from` status), so two people cannot both act.
// =====================================================================================================================
const TRANSITIONS = {
  calculate: { from: ["DRAFT", "CALCULATED", "RETURNED"], to: "CALCULATED", audit: "PAYROLL_CALCULATED" }, // HR_ADMIN
  submit: { from: ["CALCULATED"], to: "SUBMITTED", audit: "PAYROLL_SUBMITTED" }, // HR_ADMIN
  approve: { from: ["SUBMITTED"], to: "APPROVED", audit: "PAYROLL_APPROVED" }, // FINANCE
  return: { from: ["SUBMITTED"], to: "RETURNED", audit: "PAYROLL_RETURNED" }, // FINANCE, with a reason
  paid: { from: ["APPROVED"], to: "PAID", audit: "PAYROLL_PAID" }, // automatic when every line is PAID
  payslips: { from: ["PAID"], to: "PAYSLIPS_SENT", audit: "PAYROLL_PAYSLIPS_SENT" }, // automatic when every payslip is emailed
};
const PAY_STATUSES = ["PAID", "FAILED", "ON_HOLD"]; // a line starts as PENDING
const FINANCE_SEES = ["SUBMITTED", "RETURNED", "APPROVED", "PAID", "PAYSLIPS_SENT"]; // finance only sees runs after HR submitted them

// Runs made before this flow used these names
const LEGACY = { PROCESSING: "CALCULATED", FINALIZED: "PAYSLIPS_SENT" };
const statusOf = (run) => LEGACY[run.status] || run.status;
const withLegacy = (statuses) => [...statuses, ...Object.keys(LEGACY).filter((old) => statuses.includes(LEGACY[old]))];

const canSeeRun = (user, run) => user.role !== "FINANCE" || FINANCE_SEES.includes(statusOf(run));
const present = (run) => ({ ...run, status: statusOf(run) });

const getRun = async (user, period) => {
  checkPeriod(period);
  const run = await getItem(dynamoDb, T.payrollRuns, { orgId: user.orgId, period });
  if (!run) fail(404, "Payroll run not found");
  return run;
};

// The conditional update behind every transition. `extra` adds fields to set / remove and one more condition.
const move = async (user, run, name, { set = {}, remove = [], expr, names = {}, values = {} } = {}) => {
  const t = TRANSITIONS[name];
  const statuses = withLegacy(t.from);
  const inList = statuses.map((_, i) => `:c_st${i}`).join(", ");
  const updated = await updateItem(dynamoDb, T.payrollRuns, { orgId: run.orgId, period: run.period }, {
    set: { status: t.to, ...set }, remove,
    condition: {
      expr: `#c_s IN (${inList})${expr ? ` AND ${expr}` : ""}`,
      names: { "#c_s": "status", ...names },
      values: { ...Object.fromEntries(statuses.map((s, i) => [`:c_st${i}`, s])), ...values },
    },
  });
  if (!updated) fail(409, `This run is ${statusOf(run) === t.to ? "already" : "not"} ready for that step. Reload to see its current status.`);
  await audit(dynamoDb, user, t.audit, "PAYROLL", run.period);
  return present(updated);
};
const mustBe = (run, name, what) => {
  if (!TRANSITIONS[name].from.includes(statusOf(run))) fail(409, `${what} is not possible while the run is ${statusOf(run)}`);
};

const peopleWithRole = async (orgId, ...roles) => (await listEmployees(dynamoDb, orgId)).filter((e) => e.status === "ACTIVE" && roles.includes(e.role));
const notifyAll = (people, title, body) => Promise.all(people.map((p) => notify(dynamoDb, p.empId, title, body, "/payroll")));

// What the pay calculation needs for one person: attendance and approved leave inside the cycle, and the org's holidays
const payInputs = async (emp, org, cycle) => {
  const attendance = await queryBy(dynamoDb, T.attendance, "empId", emp.empId, { skName: "date", from: cycle.from, to: cycle.to });
  const paidByType = Object.fromEntries(org.leaveTypes.map((t) => [t.typeId, t.paid !== false])); // old leave types are paid
  const leaves = (await queryBy(dynamoDb, T.leaveRequests, "empId", emp.empId))
    .filter((l) => l.status === "APPROVED" && l.from <= cycle.to && l.to >= cycle.from)
    .map((l) => ({ from: l.from, to: l.to, paid: paidByType[l.typeId] !== false }));
  return { attendance, leaves, holidays: org.holidays.map((h) => h.date) };
};

// ---------- reading ----------
export const runs = async (req, res) => {
  const all = await queryBy(dynamoDb, T.payrollRuns, "orgId", req.user.orgId, { desc: true });
  res.json({ data: all.filter((r) => canSeeRun(req.user, r)).map(present) });
};

export const lines = async (req, res) => {
  const run = await getRun(req.user, req.params.period);
  if (!canSeeRun(req.user, run)) fail(404, "Payroll run not found"); // finance sees a run only after HR submitted it
  const items = await queryBy(dynamoDb, T.payrollLines, "runId", `${run.orgId}#${run.period}`);
  res.json({ data: { run: present(run), lines: items.sort((a, b) => a.name.localeCompare(b.name)) } });
};

// A payslip is the employee's once it was generated: its line has payslipSentAt (or it belongs to an older, completed run)
const released = (line, run) => !!line.payslipSentAt || statusOf(run) === "PAYSLIPS_SENT";

export const myPayslips = async (req, res) => {
  const mine = await queryBy(dynamoDb, T.payrollLines, "empId", req.user.empId, { index: "ByEmployee" });
  const slips = [];
  for (const line of mine) {
    const run = await getItem(dynamoDb, T.payrollRuns, { orgId: req.user.orgId, period: line.period });
    if (run && released(line, run)) slips.push(line);
  }
  res.json({ data: slips.sort((a, b) => b.period.localeCompare(a.period)) });
};

// Every payslip line of one person, for the employee card. HR sees all runs, finance runs after submit, the person only released payslips.
export const employeePayslips = async (req, res) => {
  const { user } = req;
  const empId = req.params.id;
  if (!(empId === user.empId || [...HR_ROLES, "FINANCE"].includes(user.role))) fail(403, "You do not have access to this");
  await getEmployee(dynamoDb, user.orgId, empId);
  const out = [];
  for (const line of await queryBy(dynamoDb, T.payrollLines, "empId", empId, { index: "ByEmployee" })) {
    const run = await getItem(dynamoDb, T.payrollRuns, { orgId: user.orgId, period: line.period });
    if (!run) continue;
    const visible = empId === user.empId && ![...HR_ROLES, "FINANCE"].includes(user.role) ? released(line, run) : canSeeRun(user, run);
    if (visible) out.push({ ...line, runStatus: statusOf(run) });
  }
  res.json({ data: out.sort((a, b) => b.period.localeCompare(a.period)) });
};

// ---------- HR: create, calculate, submit ----------
export const create = async (req, res) => {
  checkPeriod(req.body.period);
  const org = await getOrg(dynamoDb, req.user.orgId);
  const cycle = cycleRange(req.body.period, org.cycleStartDay); // saved on the run, so a later settings change cannot move an old run
  const run = {
    orgId: req.user.orgId, period: req.body.period, cycleFrom: cycle.from, cycleTo: cycle.to, status: "DRAFT", employeeCount: 0, totalGross: 0, totalNet: 0,
>>>>>>> master
    createdBy: req.user.name, createdAt: new Date().toISOString(),
  };
  await putNew(dynamoDb, T.payrollRuns, run, "orgId", `A payroll run for ${req.body.period} already exists`);
  await audit(dynamoDb, req.user, "PAYROLL_RUN_CREATED", "PAYROLL", req.body.period);
  res.status(201).json({ data: run });
};

<<<<<<< HEAD
// Works out every active employee's pay from attendance and approved leave. Can be repeated until the run is locked.
export const calculateRun = async (req, res) => {
  const { orgId } = req.user; const { period } = req.params;
  checkPeriod(period);
  const run = await getItem(dynamoDb, T.payrollRuns, { orgId, period });
  if (!run) fail(404, "Payroll run not found");
  if (run.status === "FINALIZED") fail(409, "This run is already locked");

  const today = nowParts().date;
  const people = (await listEmployees(dynamoDb, orgId)).filter((e) => e.status === "ACTIVE");
  const lines = await Promise.all(people.map(async (emp) => {
    const attendance = await queryBy(dynamoDb, T.attendance, "empId", emp.empId, { skName: "date", begins: period });
    const leaves = (await queryBy(dynamoDb, T.leaveRequests, "empId", emp.empId)).filter((l) => l.status === "APPROVED" && l.from.startsWith(period));
    return {
      runId: `${orgId}#${period}`, empId: emp.empId, period, orgId, empCode: emp.empCode, name: emp.name, designation: emp.designation,
      ...calculate(emp, period, attendance, leaves.reduce((sum, l) => sum + l.days, 0), today),
    };
  }));
  await Promise.all(lines.map((line) => putItem(dynamoDb, T.payrollLines, line)));

  const updated = await updateItem(dynamoDb, T.payrollRuns, { orgId, period }, {
    set: { status: "PROCESSING", employeeCount: lines.length, totalGross: lines.reduce((s, l) => s + l.gross, 0), totalNet: lines.reduce((s, l) => s + l.net, 0), processedAt: new Date().toISOString() },
  });
  await audit(dynamoDb, req.user, "PAYROLL_RUN_PROCESSED", "PAYROLL", period);
  res.json({ data: updated });
};

// Locks the run. The condition means a run can only be locked once, and only after it was calculated.
export const finalize = async (req, res) => {
  const { period } = req.params;
  checkPeriod(period);
  const updated = await updateItem(dynamoDb, T.payrollRuns, { orgId: req.user.orgId, period }, {
    set: { status: "FINALIZED", finalizedAt: new Date().toISOString(), finalizedBy: req.user.name },
    condition: { expr: "#c_s = :c_s", names: { "#c_s": "status" }, values: { ":c_s": "PROCESSING" } },
  });
  if (!updated) fail(409, "Only a run that has been calculated and not yet locked can be finalized");
  await audit(dynamoDb, req.user, "PAYROLL_RUN_FINALIZED", "PAYROLL", period);
  res.json({ data: updated });
};

export const lines = async (req, res) => {
  const { orgId } = req.user; const { period } = req.params;
  checkPeriod(period);
  const run = await getItem(dynamoDb, T.payrollRuns, { orgId, period });
  if (!run) fail(404, "Payroll run not found");
  const items = await queryBy(dynamoDb, T.payrollLines, "runId", `${orgId}#${period}`);
  res.json({ data: { run, lines: items.sort((a, b) => a.name.localeCompare(b.name)) } });
};

// My own payslips, only for months that have been locked
export const myPayslips = async (req, res) => {
  const mine = await queryBy(dynamoDb, T.payrollLines, "empId", req.user.empId, { index: "ByEmployee" });
  const slips = [];
  for (const line of mine) {
    const run = await getItem(dynamoDb, T.payrollRuns, { orgId: req.user.orgId, period: line.period });
    if (run?.status === "FINALIZED") slips.push(line);
  }
  res.json({ data: slips.sort((a, b) => b.period.localeCompare(a.period)) });
=======
// Works out every active employee's pay from attendance and approved leave. HR can repeat it until the run is submitted (or after it was returned).
export const calculateRun = async (req, res) => {
  const { orgId } = req.user;
  const run = await getRun(req.user, req.params.period);
  mustBe(run, "calculate", "Calculating");

  // claim the run first, so nobody submits or recalculates while the lines are being rewritten
  const statuses = withLegacy(TRANSITIONS.calculate.from);
  const claimed = await updateItem(dynamoDb, T.payrollRuns, { orgId, period: run.period }, {
    set: { calculatingAt: new Date().toISOString() },
    condition: { expr: `#c_s IN (${statuses.map((_, i) => `:c_st${i}`).join(", ")}) AND attribute_not_exists(#c_calc)`, names: { "#c_s": "status", "#c_calc": "calculatingAt" }, values: Object.fromEntries(statuses.map((s, i) => [`:c_st${i}`, s])) },
  });
  if (!claimed) fail(409, "This run is being calculated by someone else, or is no longer open for calculation");

  try {
    const org = await getOrg(dynamoDb, orgId);
    const cycle = run.cycleFrom ? { from: run.cycleFrom, to: run.cycleTo } : cycleRange(run.period, org.cycleStartDay); // runs made before cycles existed have no dates
    const today = nowParts(org.timezone).date;
    const people = (await listEmployees(dynamoDb, orgId)).filter((e) => e.status === "ACTIVE");
    const rows = await Promise.all(people.map(async (emp) => ({
      runId: `${orgId}#${run.period}`, empId: emp.empId, period: run.period, orgId, empCode: emp.empCode, name: emp.name, designation: emp.designation,
      payStatus: "PENDING", ...calculate({ emp, cycle, asOf: today, ...(await payInputs(emp, org, cycle)) }),
    })));
    await Promise.all(rows.map((row) => putItem(dynamoDb, T.payrollLines, row)));
    const updated = await move(req.user, run, "calculate", {
      set: { employeeCount: rows.length, totalGross: rows.reduce((s, l) => s + l.gross, 0), totalNet: rows.reduce((s, l) => s + l.net, 0), calculatedAt: new Date().toISOString() },
      remove: ["calculatingAt"],
    });
    res.json({ data: updated });
  } catch (e) {
    await updateItem(dynamoDb, T.payrollRuns, { orgId, period: run.period }, { remove: ["calculatingAt"] }); // do not leave the run stuck
    throw e;
  }
};

export const submit = async (req, res) => {
  const run = await getRun(req.user, req.params.period);
  mustBe(run, "submit", "Submitting");
  if (!run.employeeCount) fail(409, "Calculate the run first: there are no lines to submit");
  const updated = await move(req.user, run, "submit", {
    set: { submittedAt: new Date().toISOString(), submittedBy: req.user.name, submittedById: req.user.empId },
    remove: ["returnReason", "returnedBy", "returnedAt"], expr: "attribute_not_exists(#c_calc)", names: { "#c_calc": "calculatingAt" },
  });
  await notifyAll(await peopleWithRole(run.orgId, "FINANCE"), `Payroll ${run.period} is waiting for your approval`, `Submitted by ${req.user.name}.`);
  res.json({ data: updated });
};

// ---------- FINANCE: approve or return, then record payments ----------
export const approve = async (req, res) => {
  const run = await getRun(req.user, req.params.period);
  mustBe(run, "approve", "Approving");
  const updated = await move(req.user, run, "approve", { set: { approvedAt: new Date().toISOString(), approvedBy: req.user.name } });
  await notifyAll(await peopleWithRole(run.orgId, "HR_ADMIN"), `Payroll ${run.period} was approved`, `${req.user.name} approved it. Finance will record the payments.`);
  res.json({ data: updated });
};

export const returnRun = async (req, res) => {
  const reason = req.body.reason?.trim();
  if (!reason || reason.length < 3) fail(422, "Give a reason so HR knows what to fix");
  const run = await getRun(req.user, req.params.period);
  mustBe(run, "return", "Returning");
  const updated = await move(req.user, run, "return", { set: { returnReason: reason, returnedAt: new Date().toISOString(), returnedBy: req.user.name } });
  await notifyAll(await peopleWithRole(run.orgId, "HR_ADMIN"), `Payroll ${run.period} was returned to HR`, reason);
  res.json({ data: updated });
};

// Body: { empIds: [...] | all: true, payStatus: PAID | FAILED | ON_HOLD, transactionRef (needed for PAID), paidOn, note }
// One person or many in one call. A line that is already PAID is never changed. FAILED and ON_HOLD lines stay flagged until retried.
export const recordPayments = async (req, res) => {
  const { empIds, all, payStatus, transactionRef, note } = req.body;
  if (!PAY_STATUSES.includes(payStatus)) fail(422, `payStatus must be one of ${PAY_STATUSES.join(", ")}`);
  const ref = transactionRef?.trim();
  if (payStatus === "PAID" && !ref) fail(422, "Enter the transaction reference");
  const { date: today } = nowParts((await getOrg(dynamoDb, req.user.orgId)).timezone);
  const paidOn = req.body.paidOn || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || paidOn > addDays(today, 1)) fail(422, "paidOn must be a date that is not in the future");
  if (!all && !(Array.isArray(empIds) && empIds.length)) fail(422, "Choose who was paid (empIds), or send all: true");

  const run = await getRun(req.user, req.params.period);
  if (statusOf(run) !== "APPROVED") fail(409, `Payments can be recorded only on an approved run (this one is ${statusOf(run)})`);
  const items = await queryBy(dynamoDb, T.payrollLines, "runId", `${run.orgId}#${run.period}`);
  const targets = items.filter((l) => l.payStatus !== "PAID" && (all || empIds.includes(l.empId)));
  if (!targets.length) fail(409, "Nothing to update: those lines are already paid, or are not in this run");

  const results = await Promise.all(targets.map((l) => updateItem(dynamoDb, T.payrollLines, { runId: l.runId, empId: l.empId }, {
    set: { payStatus, payUpdatedAt: new Date().toISOString(), payUpdatedBy: req.user.name, ...(payStatus === "PAID" ? { transactionRef: ref, paidOn } : { payNote: note || "" }) },
    remove: payStatus === "PAID" ? ["payNote"] : ["transactionRef", "paidOn"],
    condition: { expr: "#c_p <> :c_paid", names: { "#c_p": "payStatus" }, values: { ":c_paid": "PAID" } }, // two people cannot overwrite a paid line
  })));
  await audit(dynamoDb, req.user, `PAYROLL_PAYMENT_${payStatus}`, "PAYROLL", `${run.period} (${results.filter(Boolean).length} lines)`);

  // when every line is paid the run itself is PAID, and HR can generate payslips
  const after = await queryBy(dynamoDb, T.payrollLines, "runId", `${run.orgId}#${run.period}`);
  let updated = present(run);
  if (after.every((l) => l.payStatus === "PAID")) {
    updated = await move(req.user, run, "paid", { set: { paidAt: new Date().toISOString() } });
    await notifyAll(await peopleWithRole(run.orgId, "HR_ADMIN"), `Payroll ${run.period} is fully paid`, "You can now generate and email the payslips.");
  }
  res.json({ data: { run: updated, updated: results.filter(Boolean).length, flagged: after.filter((l) => l.payStatus === "FAILED" || l.payStatus === "ON_HOLD").length } });
};

// ---------- HR: payslips (PDF), stored on the employee's documents and emailed ----------
const STALE_CLAIM_MS = 5 * 60 * 1000; // a half-finished attempt older than this may be tried again
const monthName = (period) => new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

// Build the PDF, save it to S3 as a "payslips" document, email it. Returns the document id.
const sendOnePayslip = async (user, org, run, line) => {
  const emp = await getEmployee(dynamoDb, run.orgId, line.empId);
  const pdf = await buildPayslipPdf({ orgName: org.name, line, run });
  const documentId = `doc_payslip_${run.period.replace("-", "")}`; // one per month, so a retry replaces the file instead of piling up copies
  const filename = `Payslip-${run.period}.pdf`;
  const key = `${run.orgId}/${line.empId}/payslips/${documentId}-${filename}`;
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: pdf, ContentType: "application/pdf" }));
  await putItem(dynamoDb, T.documents, { empId: line.empId, documentId, orgId: run.orgId, category: "payslips", filename, key, size: pdf.length, contentType: "application/pdf", uploadedBy: user.name, uploadedAt: new Date().toISOString() });
  await sendMail({
    to: emp.email, subject: `Your payslip for ${monthName(run.period)}`,
    text: `Hello ${emp.name},\n\nYour payslip for ${monthName(run.period)} is attached.\nNet pay: Rs. ${Math.round(line.net).toLocaleString("en-IN")}${line.paidOn ? `, paid on ${line.paidOn}` : ""}.\n\n${org.name}`,
    attachments: [{ filename, content: pdf, contentType: "application/pdf" }],
  });
  return documentId;
};

// Body (optional): { empId } retries one person. Running it again never emails someone who already has payslipSentAt.
export const sendPayslips = async (req, res) => {
  const run = await getRun(req.user, req.params.period);
  if (statusOf(run) === "PAYSLIPS_SENT") fail(409, "The payslips of this run were already sent");
  mustBe(run, "payslips", "Generating payslips");
  const org = await getOrg(dynamoDb, run.orgId);

  const items = await queryBy(dynamoDb, T.payrollLines, "runId", `${run.orgId}#${run.period}`);
  const todo = items.filter((l) => l.payStatus === "PAID" && !l.payslipSentAt && (!req.body.empId || l.empId === req.body.empId));
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < todo.length; i += 5) { // five at a time keeps us inside the mail provider's send rate
    await Promise.all(todo.slice(i, i + 5).map(async (line) => {
      const key = { runId: line.runId, empId: line.empId };
      // claim the line: if someone else is sending it right now (or it was just sent) we skip it, so nobody gets two emails
      const claimed = await updateItem(dynamoDb, T.payrollLines, key, {
        set: { payslipClaimedAt: new Date().toISOString() },
        condition: { expr: "attribute_not_exists(#c_sent) AND (attribute_not_exists(#c_claim) OR #c_claim < :c_stale)", names: { "#c_sent": "payslipSentAt", "#c_claim": "payslipClaimedAt" }, values: { ":c_stale": new Date(Date.now() - STALE_CLAIM_MS).toISOString() } },
      });
      if (!claimed) { skipped++; return; }
      try {
        const documentId = await sendOnePayslip(req.user, org, run, line);
        await updateItem(dynamoDb, T.payrollLines, key, { set: { payslipSentAt: new Date().toISOString(), payslipDocumentId: documentId }, remove: ["emailError", "payslipClaimedAt"] });
        await notify(dynamoDb, line.empId, `Your payslip for ${monthName(run.period)} is ready`, "It was also emailed to you.", "/payslips");
        sent++;
      } catch (e) {
        await updateItem(dynamoDb, T.payrollLines, key, { set: { emailError: mailErrorText(e) }, remove: ["payslipClaimedAt"] }); // shown to HR with a Retry button
        failed++;
      }
    }));
  }

  // every PAID line has its payslip -> the run is done
  const after = await queryBy(dynamoDb, T.payrollLines, "runId", `${run.orgId}#${run.period}`);
  let updated = present(run);
  if (after.filter((l) => l.payStatus === "PAID").every((l) => l.payslipSentAt)) {
    updated = await move(req.user, run, "payslips", { set: { payslipsSentAt: new Date().toISOString() } });
  }
  res.json({ data: { run: updated, sent, failed, skipped } });
};

// "My salary so far": ONLY the signed-in employee, from the start of the current pay cycle to today.
// An estimate, not a payslip. Today counts only once the person has checked in.
export const myEstimate = async (req, res) => {
  const org = await getOrg(dynamoDb, req.user.orgId);
  const emp = await getEmployee(dynamoDb, req.user.orgId, req.user.empId);
  const { date: today } = nowParts(org.timezone);
  const period = currentPeriod(today, org.cycleStartDay);
  const cycle = cycleRange(period, org.cycleStartDay);

  const inputs = await payInputs(emp, org, cycle);
  const asOf = inputs.attendance.some((r) => r.date === today) ? today : addDays(today, -1);
  const result = calculate({ emp, cycle, asOf, ...inputs });
  const { days, lines } = explain(result);
  res.json({ data: { label: "Estimate till today, not a payslip", period, cycle: { ...cycle, asOf }, days, lines, summary: result } });
>>>>>>> master
};
