import test from "node:test";
import assert from "node:assert/strict";
import { T, all, call, get, put, status } from "./setup.js";

const ob = await import("../controllers/onboardingController.js");
const { sentLog } = await import("../services/mailer.js");
const HR = { empId: "hr", orgId: "o", role: "HR_ADMIN", name: "Hema" };
await put(T.organizations, { orgId: "o", name: "Test Co", timezone: "Asia/Kolkata", leaveTypes: [{ typeId: "lt", name: "Casual", annualDays: 10, color: "#000" }] });

test("invite -> candidate fills the form and uploads -> HR converts to an employee", async () => {
  const inv = await call(ob.createInvite, HR, { body: { name: "Nina Rao", email: "Nina@Test.local", role: "EMPLOYEE" } });
  assert.equal(inv.emailSent, true);
  assert.equal(sentLog.at(-1).to, "nina@test.local");
  assert.match(inv.link, /\/onboard\/.{40,}/, "a long random token in the link");
  const token = inv.token;
  assert.equal(await status(call(ob.createInvite, HR, { body: { name: "Dup", email: "nina@test.local" } })), 200, "a second invite is fine until she is an employee");

  const show = await call(ob.publicShow, null, { params: { token } });
  assert.equal(show.name, "Nina Rao");
  assert.equal(await status(call(ob.publicShow, null, { params: { token: "nope" } })), 404);

  // upload rules
  const up = (body) => call(ob.publicUploadUrl, null, { params: { token }, body });
  assert.equal(await status(up({ category: "payslips", filename: "a.pdf", contentType: "application/pdf" })), 422, "a candidate cannot file payslips");
  assert.equal(await status(up({ category: "identity", filename: "a.exe", contentType: "application/x-msdownload" })), 422);
  const slot = await up({ category: "identity", filename: "id card.pdf", contentType: "application/pdf" });
  assert.ok(slot.uploadUrl.startsWith("https://"));
  assert.equal(await status(call(ob.publicConfirm, null, { params: { token }, body: { documentId: slot.documentId, category: "identity", filename: "x.pdf", key: "someone/elses/file" } })), 400, "a made-up key is refused");
  await call(ob.publicConfirm, null, { params: { token }, body: { documentId: slot.documentId, category: "identity", filename: "id card.pdf", key: slot.key } });

  // submit
  const form = { phone: "999", address: "Pune", bankAccount: "1234567890", bankIfsc: "HDFC0001", nationalId: "ABCDE1234F" };
  assert.equal(await status(call(ob.publicSubmit, null, { params: { token }, body: { phone: "1" } })), 422, "required fields");
  await call(ob.publicSubmit, null, { params: { token }, body: form });
  assert.equal(await status(call(ob.publicSubmit, null, { params: { token }, body: form })), 409, "the form cannot be sent twice");
  assert.equal(await status(up({ category: "bank", filename: "b.pdf", contentType: "application/pdf" })), 409, "no uploads after submitting");
  assert.ok(!JSON.stringify(get(T.onboardingInvites, (i) => i.token === token).submission).includes("1234567890"), "the bank number is stored encrypted");

  // HR reviews and converts
  const review = await call(ob.getInvite, HR, { params: { token } });
  assert.equal(review.submission.bankAccount, "1234567890");
  const body = { joinDate: "2026-12-01", salary: { basic: 40000, hra: 16000, allowances: 4000 }, designation: "Analyst", deptId: "d1" };
  const done = await call(ob.convert, HR, { params: { token }, body });
  assert.equal(done.employee.email, "nina@test.local");
  const emp = get(T.employees, (e) => e.email === "nina@test.local");
  assert.equal(emp.phone, "999");
  assert.ok(emp.bankAccountEnc, "bank details carried over, encrypted");
  assert.ok(get(T.documents, (d) => d.empId === emp.empId && d.category === "identity"), "her upload is on her employee card");
  assert.ok(get(T.leaveBalances, (b) => b.empId === emp.empId), "leave balances were created like for any new hire");
  assert.equal(await status(call(ob.convert, HR, { params: { token }, body })), 409, "no second employee from the same invite");
  assert.equal(get(T.onboardingInvites, (i) => i.token === token).status, "CONVERTED");
});

test("an expired link stops working, and another company's HR cannot open an invite", async () => {
  await put(T.onboardingInvites, { token: "old", orgId: "o", name: "Old", email: "o@t", status: "SENT", documents: [], expiresAt: 1 });
  assert.equal(await status(call(ob.publicShow, null, { params: { token: "old" } })), 410);
  assert.equal(await status(call(ob.publicSubmit, null, { params: { token: "old" }, body: { phone: "1", address: "a", bankAccount: "1", bankIfsc: "1", nationalId: "1" } })), 410);
  assert.equal(await status(call(ob.getInvite, { ...HR, orgId: "other" }, { params: { token: "old" } })), 404);
});
