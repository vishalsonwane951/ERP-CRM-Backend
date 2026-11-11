import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { audit, getItem, listEmployees, putItem, putNew, queryBy, updateItem } from "../services/dbHelpers.js";
import { fail, monthEnd, nowParts, weekdays } from "../services/helpers.js";

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

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
    createdBy: req.user.name, createdAt: new Date().toISOString(),
  };
  await putNew(dynamoDb, T.payrollRuns, run, "orgId", `A payroll run for ${req.body.period} already exists`);
  await audit(dynamoDb, req.user, "PAYROLL_RUN_CREATED", "PAYROLL", req.body.period);
  res.status(201).json({ data: run });
};

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
};
