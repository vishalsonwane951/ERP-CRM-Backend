import test from "node:test";
import assert from "node:assert/strict";
import { T, all, call, get, put, status } from "./setup.js";

const leave = await import("../controllers/leaveController.js");
const approvals = await import("../controllers/approvalController.js");

await put(T.organizations, { orgId: "o", name: "Test Co", timezone: "Asia/Kolkata", leaveTypes: [] });
const emp = (id, role, managerId) => put(T.employees, { orgId: "o", empId: id, name: id, role, managerId, status: "ACTIVE", email: `${id}@t` });
await emp("ceo", "SUPER_ADMIN"); await emp("kavya", "MANAGER", "ceo"); await emp("pooja", "PROJECT_MANAGER", "kavya");
await emp("sanjay", "EMPLOYEE", "pooja"); await emp("loner", "EMPLOYEE"); await emp("hr", "HR_ADMIN"); await emp("hrm", "HR_MANAGER");
for (const id of ["sanjay", "loner"]) await put(T.leaveBalances, { empId: id, typeId: "lt", name: "Casual", color: "#000", total: 10, used: 0, pending: 0 });
const U = (empId, role) => ({ empId, orgId: "o", role, name: empId });
const [SANJAY, LONER, POOJA, KAVYA, HR, HRM] = [U("sanjay", "EMPLOYEE"), U("loner", "EMPLOYEE"), U("pooja", "PROJECT_MANAGER"), U("kavya", "MANAGER"), U("hr", "HR_ADMIN"), U("hrm", "HR_MANAGER")];
const monday = "2026-11-16";

test("the bug: a request never goes to HR before the project manager", async () => {
  const lr = await call(leave.apply, SANJAY, { body: { typeId: "lt", from: monday, to: monday } });
  const a = get(T.approvals, (x) => x.reqId === lr.reqId);
  assert.equal(a.approver.approverId, "pooja", "stage 1 is the project manager");
  assert.equal(a.currentStage, 1);
  assert.equal((await call(approvals.pending, HR)).length, 0, "HR's inbox is empty at stage 1");
  assert.equal(await status(call(approvals.act, HR, { params: { id: lr.reqId }, body: { action: "approve" } })), 403, "HR cannot approve at stage 1");
  assert.equal((await call(approvals.detail, HR, { params: { id: lr.reqId } })).canAct, false, "no Approve button for HR yet");

  await call(approvals.act, POOJA, { params: { id: lr.reqId }, body: { action: "approve", comment: "Fine by me" } });
  assert.equal((await call(approvals.pending, HR)).length, 1, "after the PM approved, HR gets it");
  assert.equal((await call(approvals.pending, HRM)).length, 1, "HR managers see the HR stage too");
  const d = await call(approvals.detail, HR, { params: { id: lr.reqId } });
  assert.equal(d.canAct, true);
  assert.equal(d.stages[0].decision.comment, "Fine by me", "HR sees the PM's decision and comment");
  assert.equal(d.stages[0].decision.actorName, "pooja");

  await call(approvals.act, HRM, { params: { id: lr.reqId }, body: { action: "approve" } });
  assert.equal(get(T.leaveRequests, (x) => x.reqId === lr.reqId).status, "APPROVED");
  assert.equal(get(T.leaveBalances, (b) => b.empId === "sanjay").used, 1);
});

test("no manager at all: refused up front, and nothing is left half-saved", async () => {
  const before = all(T.leaveRequests).length;
  assert.equal(await status(call(leave.apply, LONER, { body: { typeId: "lt", from: monday, to: monday } })), 409);
  assert.equal(all(T.leaveRequests).length, before, "no leave request was written");
  assert.equal(get(T.leaveBalances, (b) => b.empId === "loner").pending, 0, "no days are held");
});

test("escalating never skips the chain", async () => {
  const lr = await call(leave.apply, SANJAY, { body: { typeId: "lt", from: "2026-11-17", to: "2026-11-17" } });
  await call(approvals.act, POOJA, { params: { id: lr.reqId }, body: { action: "escalate" } });
  const a = get(T.approvals, (x) => x.reqId === lr.reqId);
  assert.equal(a.approver.approverId, "kavya", "the project manager escalates to HIS manager, not to HR");
  assert.equal((await call(approvals.pending, HR)).length, 0);
  assert.equal(await status(call(approvals.act, HR, { params: { id: lr.reqId }, body: { action: "approve" } })), 403);
  await call(approvals.act, KAVYA, { params: { id: lr.reqId }, body: { action: "approve" } });
  assert.equal(get(T.approvals, (x) => x.reqId === lr.reqId).currentStage, 2, "then it moves on to the HR stage");
});

test("a project manager's own leave goes to his manager", async () => {
  await put(T.leaveBalances, { empId: "pooja", typeId: "lt", name: "Casual", color: "#000", total: 10, used: 0, pending: 0 });
  const lr = await call(leave.apply, POOJA, { body: { typeId: "lt", from: "2026-11-18", to: "2026-11-18" } });
  assert.equal(get(T.approvals, (x) => x.reqId === lr.reqId).approver.approverId, "kavya");
});
