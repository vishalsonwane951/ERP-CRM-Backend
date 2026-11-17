import test from "node:test";
import assert from "node:assert/strict";
import { T, all, call, get, put, status } from "./setup.js";

const payroll = await import("../controllers/payrollController.js");
const { sentLog } = await import("../services/mailer.js");

const HR = { empId: "emp_hr", orgId: "o", role: "HR_ADMIN", name: "Hema HR" };
const FIN = { empId: "emp_fin", orgId: "o", role: "FINANCE", name: "Farid Finance" };
const EMP = { empId: "emp_a", orgId: "o", role: "EMPLOYEE", name: "Asha" };

await put(T.organizations, { orgId: "o", name: "Test Co", timezone: "Asia/Kolkata", leaveTypes: [] });
const person = (id, name, role, basic) => put(T.employees, { orgId: "o", empId: id, empCode: id, name, email: `${id}@test.local`, role, status: "ACTIVE", designation: "x", salary: { basic, hra: basic / 2, allowances: 1000 } });
await person("emp_hr", "Hema HR", "HR_ADMIN", 50000);
await person("emp_fin", "Farid Finance", "FINANCE", 50000);
await person("emp_a", "Asha", "EMPLOYEE", 40000);
await person("emp_b", "Bilal", "EMPLOYEE", 42000);
const PEOPLE = 4;
const run = (period) => get(T.payrollRuns, (r) => r.period === period);
const lineOf = (empId, period) => get(T.payrollLines, (l) => l.empId === empId && l.period === period);

test("HR and Finance move a run through the whole credit flow, and every step is guarded", async () => {
  await call(payroll.create, HR, { body: { period: "2026-10" } });
  assert.equal(run("2026-10").status, "DRAFT");

  // finance sees nothing until HR submits; nobody can skip a step
  assert.equal((await call(payroll.runs, FIN)).length, 0);
  assert.equal(await status(call(payroll.approve, FIN, { params: { period: "2026-10" } })), 409);
  assert.equal(await status(call(payroll.submit, HR, { params: { period: "2026-10" } })), 409, "cannot submit before calculating");

  const calculated = await call(payroll.calculateRun, HR, { params: { period: "2026-10" } });
  assert.equal(calculated.status, "CALCULATED");
  assert.equal(calculated.employeeCount, PEOPLE);
  assert.equal(lineOf("emp_a", "2026-10").payStatus, "PENDING");
  assert.equal(run("2026-10").calculatingAt, undefined, "the claim is released");

  await call(payroll.submit, HR, { params: { period: "2026-10" } });
  assert.equal(run("2026-10").status, "SUBMITTED");
  assert.equal(await status(call(payroll.calculateRun, HR, { params: { period: "2026-10" } })), 409, "HR is locked out once submitted");
  assert.equal(await status(call(payroll.submit, HR, { params: { period: "2026-10" } })), 409, "cannot submit twice");
  assert.ok(all(T.notifications).some((n) => n.empId === "emp_fin"), "finance was notified");
  assert.equal((await call(payroll.runs, FIN)).length, 1, "finance sees it after HR submitted");

  // finance returns it with a reason; HR fixes and resubmits
  assert.equal(await status(call(payroll.returnRun, FIN, { params: { period: "2026-10" }, body: { reason: " " } })), 422);
  await call(payroll.returnRun, FIN, { params: { period: "2026-10" }, body: { reason: "Bilal's leave is missing" } });
  assert.equal(run("2026-10").status, "RETURNED");
  assert.equal(run("2026-10").returnReason, "Bilal's leave is missing");
  assert.ok(all(T.notifications).some((n) => n.empId === "emp_hr" && n.title.includes("returned")), "HR was told");
  assert.equal((await call(payroll.calculateRun, HR, { params: { period: "2026-10" } })).status, "CALCULATED", "HR can recalculate after a return");
  await call(payroll.submit, HR, { params: { period: "2026-10" } });
  assert.equal(run("2026-10").returnReason, undefined, "the old reason is cleared on resubmit");
  await call(payroll.approve, FIN, { params: { period: "2026-10" } });
  assert.equal(run("2026-10").status, "APPROVED");
  assert.equal(await status(call(payroll.approve, FIN, { params: { period: "2026-10" } })), 409, "cannot approve twice");

  // payments
  const pay = (body) => call(payroll.recordPayments, FIN, { params: { period: "2026-10" }, body });
  assert.equal(await status(pay({ all: true, payStatus: "PAID" })), 422, "a transaction reference is required");
  assert.equal(await status(pay({ payStatus: "PAID", transactionRef: "X" })), 422, "say who was paid");
  await pay({ empIds: ["emp_a"], payStatus: "FAILED", note: "Wrong IFSC" });
  const rest = await pay({ all: true, payStatus: "PAID", transactionRef: "NEFT-001" });
  assert.equal(rest.updated, PEOPLE, "all lines get a status");
  assert.equal(lineOf("emp_a", "2026-10").payStatus, "PAID", "bulk 'all' also overwrote the FAILED line");
  assert.equal(run("2026-10").status, "PAID", "every line PAID -> the run is PAID");
  assert.equal(await status(call(payroll.recordPayments, FIN, { params: { period: "2026-10" }, body: { all: true, payStatus: "FAILED" } })), 409, "a paid run takes no more payments");
});

test("a FAILED line keeps the run open until it is retried", async () => {
  await call(payroll.create, HR, { body: { period: "2026-11" } });
  for (const [fn, u] of [[payroll.calculateRun, HR], [payroll.submit, HR], [payroll.approve, FIN]]) await call(fn, u, { params: { period: "2026-11" } });
  const pay = (body) => call(payroll.recordPayments, FIN, { params: { period: "2026-11" }, body });
  await pay({ empIds: ["emp_a"], payStatus: "FAILED", note: "Bank rejected" });
  const r = await pay({ empIds: ["emp_b", "emp_hr", "emp_fin"], payStatus: "PAID", transactionRef: "NEFT-002" });
  assert.equal(r.run.status, "APPROVED");
  assert.equal(r.flagged, 1);
  assert.equal(lineOf("emp_a", "2026-11").payNote, "Bank rejected");
  assert.equal(await status(call(payroll.sendPayslips, HR, { params: { period: "2026-11" } })), 409, "no payslips before the run is PAID");
  const retried = await pay({ empIds: ["emp_a"], payStatus: "PAID", transactionRef: "NEFT-003" });
  assert.equal(retried.run.status, "PAID");
  assert.equal(lineOf("emp_a", "2026-11").payNote, undefined);
});

test("payslips: a failed email is stored and retried, and nobody is ever emailed twice", async () => {
  const slip = (empId = undefined) => call(payroll.sendPayslips, HR, { params: { period: "2026-10" }, body: empId ? { empId } : {} });
  assert.equal((await call(payroll.myPayslips, EMP)).length, 0, "an employee sees no payslip before it is generated");

  // email not configured: every line records the error, the run stays PAID, nothing is marked sent
  const from = process.env.MAIL_FROM; delete process.env.MAIL_FROM;
  const bad = await slip();
  assert.equal(bad.failed, PEOPLE);
  assert.equal(bad.run.status, "PAID");
  assert.match(lineOf("emp_a", "2026-10").emailError, /MAIL_FROM/);
  assert.equal(lineOf("emp_a", "2026-10").payslipSentAt, undefined);
  assert.equal(lineOf("emp_a", "2026-10").payslipClaimedAt, undefined, "the claim is released so Retry works");
  process.env.MAIL_FROM = from;

  // retry one person
  const mails = sentLog.length;
  assert.equal((await slip("emp_a")).sent, 1);
  assert.equal(sentLog.length, mails + 1);
  assert.deepEqual(sentLog.at(-1).attachments, ["Payslip-2026-10.pdf"]);
  assert.equal(lineOf("emp_a", "2026-10").emailError, undefined, "the error is cleared after a good send");
  assert.ok(get(T.documents, (d) => d.empId === "emp_a" && d.category === "payslips"), "the PDF is filed on the employee's documents");
  assert.equal((await call(payroll.myPayslips, EMP)).length, 1, "released to the employee");

  // the rest: Asha is skipped, because she already has payslipSentAt
  const rest = await slip();
  assert.equal(rest.sent, PEOPLE - 1);
  assert.equal(rest.run.status, "PAYSLIPS_SENT");
  assert.equal(sentLog.length, mails + PEOPLE, "exactly one email per person");
  assert.equal(await status(slip()), 409, "running it again is refused, no second email");
  assert.equal(sentLog.length, mails + PEOPLE);
});

test("two people pressing 'Generate payslips' at once cause no duplicate emails", async () => {
  const mails = sentLog.length;
  const [a, b] = await Promise.all([1, 2].map(() => call(payroll.sendPayslips, HR, { params: { period: "2026-11" } })));
  assert.equal(a.sent + b.sent, PEOPLE, "every line is sent exactly once across both calls");
  assert.equal(sentLog.length, mails + PEOPLE);
});

test("runs made before the flow existed keep working (PROCESSING / FINALIZED)", async () => {
  await put(T.payrollRuns, { orgId: "o", period: "2025-01", status: "FINALIZED", employeeCount: 1, totalGross: 1, totalNet: 1 });
  await put(T.payrollLines, { runId: "o#2025-01", empId: "emp_a", period: "2025-01", orgId: "o", name: "Asha", net: 100 });
  await put(T.payrollRuns, { orgId: "o", period: "2025-02", status: "PROCESSING", employeeCount: 0 });
  const list = await call(payroll.runs, HR);
  assert.equal(list.find((r) => r.period === "2025-01").status, "PAYSLIPS_SENT");
  assert.equal(list.find((r) => r.period === "2025-02").status, "CALCULATED");
  assert.ok((await call(payroll.myPayslips, EMP)).some((l) => l.period === "2025-01"), "an old locked payslip stays visible");
  assert.equal(await status(call(payroll.sendPayslips, HR, { params: { period: "2025-01" } })), 409, "old runs never trigger emails");
  assert.equal((await call(payroll.calculateRun, HR, { params: { period: "2025-02" } })).status, "CALCULATED", "an old PROCESSING run can be recalculated");
});

test("who may see whose payslips", async () => {
  const slips = (user, id) => call(payroll.employeePayslips, user, { params: { id } });
  assert.ok((await slips(HR, "emp_a")).length >= 2, "HR sees every run");
  assert.equal(await status(slips(EMP, "emp_b")), 403, "an employee cannot read a colleague's");
  assert.ok((await slips(EMP, "emp_a")).every((l) => l.runStatus === "PAYSLIPS_SENT" || l.payslipSentAt), "the person sees only released ones");
});
