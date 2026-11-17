import "dotenv/config";
import bcrypt from "bcryptjs";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { putItem } from "../services/dbHelpers.js";
import { createApproval } from "../services/approvalHelpers.js";
<<<<<<< HEAD
=======
import { encrypt } from "../services/crypto.js";
>>>>>>> master
import { addDays, nowParts } from "../services/helpers.js";

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

const ORG = "kestrel";
const PASSWORD = "Passw0rd!";

const leaveTypes = [
  { typeId: "lt_casual", name: "Casual leave", annualDays: 12, color: "#0B6E75" },
  { typeId: "lt_sick", name: "Sick leave", annualDays: 8, color: "#C8445A" },
  { typeId: "lt_earned", name: "Earned leave", annualDays: 15, color: "#E59B1F" },
<<<<<<< HEAD
];
await putItem(dynamoDb, T.organizations, {
  orgId: ORG, name: "Kestrel Logistics", timezone: "Asia/Kolkata", shiftName: "General", shiftStart: "09:30", shiftEnd: "18:30",
  graceMinutes: 10, halfDayAfterMinutes: 120, leaveTypes,
=======
  { typeId: "lt_wpl", name: "Without-pay leave", annualDays: 30, color: "#6B7280", paid: false }, // WPL: deducted from salary
];
// Platform plans. Kestrel is on Growth (everything on); Orbit is on Starter (payroll and assets off) to try feature switching.
const plans = [
  { planId: "plan_starter", name: "Starter", price: 1999, maxEmployees: 25, features: ["reports", "onboarding"], status: "ACTIVE" },
  { planId: "plan_growth", name: "Growth", price: 4999, maxEmployees: 100, features: ["payroll", "assets", "reports", "onboarding", "projects"], status: "ACTIVE" },
];
for (const plan of plans) await putItem(dynamoDb, T.plans, plan);
const growthFeatures = Object.fromEntries(["payroll", "assets", "reports", "onboarding", "projects"].map((f) => [f, true]));

await putItem(dynamoDb, T.organizations, {
  orgId: ORG, name: "Kestrel Logistics", status: "ACTIVE", planId: "plan_growth", features: growthFeatures, timezone: "Asia/Kolkata", shiftName: "General", shiftStart: "09:30", shiftEnd: "18:30",
  graceMinutes: 10, halfDayAfterMinutes: 120, leaveTypes,
  maxBreaksPerDay: 2, breakAllowedAfterMinutes: null, // two breaks, allowed any time after check-in
  cycleStartDay: 1, holidays: [{ date: "2026-10-02", name: "Gandhi Jayanti" }, { date: "2026-12-25", name: "Christmas Day" }],
>>>>>>> master
  departments: [{ deptId: "dept_eng", name: "Engineering" }, { deptId: "dept_people", name: "People" }, { deptId: "dept_fin", name: "Finance" }, { deptId: "dept_ops", name: "Operations" }],
});

// [id, name, role, department, title, manager, basic salary]
<<<<<<< HEAD
=======
// Reporting lines: Manager -> Project Manager -> Employee. Kavya and Dev are separate managers with separate teams.
>>>>>>> master
const people = [
  ["arjun", "Arjun Rao", "SUPER_ADMIN", "dept_ops", "Chief Operating Officer", null, 180000],
  ["meera", "Meera Iyer", "HR_ADMIN", "dept_people", "Head of People", "arjun", 95000],
  ["rohan", "Rohan Shah", "FINANCE", "dept_fin", "Finance Controller", "arjun", 90000],
  ["nisha", "Nisha Kapoor", "AUDITOR", "dept_fin", "Internal Auditor", "arjun", 70000],
  ["kavya", "Kavya Nair", "MANAGER", "dept_eng", "Engineering Manager", "arjun", 120000],
<<<<<<< HEAD
  ["sanjay", "Sanjay Patil", "EMPLOYEE", "dept_eng", "Senior Engineer", "kavya", 80000],
  ["ananya", "Ananya Deshmukh", "EMPLOYEE", "dept_eng", "Product Designer", "kavya", 72000],
  ["vikram", "Vikram Joshi", "EMPLOYEE", "dept_eng", "Software Engineer", "kavya", 60000],
=======
  ["dev", "Dev Malhotra", "MANAGER", "dept_ops", "Operations Manager", "arjun", 115000],
  ["pooja", "Pooja Menon", "PROJECT_MANAGER", "dept_eng", "Project Manager", "kavya", 100000],
  ["imran", "Imran Qureshi", "PROJECT_MANAGER", "dept_ops", "Project Manager", "dev", 98000],
  ["sanjay", "Sanjay Patil", "EMPLOYEE", "dept_eng", "Senior Engineer", "pooja", 80000],
  ["ananya", "Ananya Deshmukh", "EMPLOYEE", "dept_eng", "Product Designer", "pooja", 72000],
  ["vikram", "Vikram Joshi", "EMPLOYEE", "dept_ops", "Operations Executive", "imran", 60000],
  ["tara", "Tara Bose", "EMPLOYEE", "dept_ops", "Logistics Analyst", "imran", 58000],
>>>>>>> master
];
const passwordHash = await bcrypt.hash(PASSWORD, 10);
const emps = {};
for (const [i, [id, name, role, deptId, designation, manager, basic]] of people.entries()) {
  emps[id] = {
    orgId: ORG, empId: `emp_${id}`, empCode: `EMP-${String(i + 1).padStart(4, "0")}`, name, email: `${id}@kestrel.test`, role, deptId, designation,
    managerId: manager ? `emp_${manager}` : undefined, joinDate: "2023-04-10", status: "ACTIVE", passwordHash,
    salary: { basic, hra: Math.round(basic * 0.4), allowances: Math.round(basic * 0.25) },
  };
  await putItem(dynamoDb, T.employees, emps[id]);
  for (const t of leaveTypes) {
    await putItem(dynamoDb, T.leaveBalances, { empId: emps[id].empId, typeId: t.typeId, name: t.name, color: t.color, total: t.annualDays, used: 0, pending: 0 });
  }
}

// about ten weekdays of attendance so the dashboard, trend and calendar have something to show
const today = nowParts().date;
let n = 0;
for (let back = 12; back >= 1; back--) {
  const date = addDays(today, -back);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) continue;
  for (const e of Object.values(emps)) {
    n++;
    const late = n % 7 === 0;
    await putItem(dynamoDb, T.attendance, {
      empId: e.empId, date, orgId: ORG, orgDate: `${ORG}#${date}`, deptId: e.deptId, status: late ? "LATE" : "PRESENT",
      checkInAt: new Date(`${date}T${late ? "10:20" : "09:25"}:00+05:30`).toISOString(), checkOutAt: new Date(`${date}T18:40:00+05:30`).toISOString(),
      lateByMinutes: late ? 50 : 0, workedMinutes: late ? 500 : 555,
    });
  }
}

<<<<<<< HEAD
// one pending leave request (Sanjay -> Kavya -> HR) and two assets
=======
// one pending leave request (Sanjay -> Pooja, his project manager -> HR) and two assets
>>>>>>> master
let from = addDays(today, 3);
while ([0, 6].includes(new Date(`${from}T00:00:00Z`).getUTCDay())) from = addDays(from, 1);
const to = addDays(from, 1);
await putItem(dynamoDb, T.leaveRequests, { empId: "emp_sanjay", reqId: "lr_seed01", orgId: ORG, typeId: "lt_casual", typeName: "Casual leave", color: "#0B6E75", from, to, days: 2, reason: "Family function", status: "PENDING", createdAt: new Date().toISOString() });
await putItem(dynamoDb, T.leaveBalances, { empId: "emp_sanjay", typeId: "lt_casual", name: "Casual leave", color: "#0B6E75", total: 12, used: 0, pending: 2 });
await createApproval(dynamoDb, emps.sanjay, { reqId: "lr_seed01", entityType: "LEAVE", summary: `Casual leave, 2 days (${from} to ${to})`, payload: { typeId: "lt_casual", days: 2, from, to, reason: "Family function" } });

await putItem(dynamoDb, T.assets, { orgId: ORG, assetId: "as_laptop1", tag: "KL-LT-0142", name: "MacBook Pro 14", category: "Laptop", status: "AVAILABLE", value: 189900, history: [] });
await putItem(dynamoDb, T.assets, { orgId: ORG, assetId: "as_monitor1", tag: "KL-MN-0031", name: "Dell 27 inch Monitor", category: "Monitor", status: "AVAILABLE", value: 52000, history: [] });

<<<<<<< HEAD
console.log(`Seeded ${people.length} people. Password for everyone: ${PASSWORD}`);
console.log(people.map(([id, , role]) => `  ${id}@kestrel.test  ${role}`).join("\n"));
=======
// Two projects with tasks. Pooja (project manager) assigned the tasks; they show on each employee's Today page.
const yesterday = addDays(today, -1);
const projects = [
  { projectId: "prj_portal", name: "Customer Portal Revamp", managerId: "emp_kavya", pmId: "emp_pooja", members: ["sanjay", "ananya"] },
  { projectId: "prj_tracking", name: "Warehouse Tracking", managerId: "emp_dev", pmId: "emp_imran", members: ["vikram", "tara"] },
];
for (const p of projects) {
  await putItem(dynamoDb, T.projects, { orgId: ORG, projectId: p.projectId, name: p.name, status: "ACTIVE", managerId: p.managerId, pmId: p.pmId, startDate: addDays(today, -30), endDate: addDays(today, 60) });
  for (const m of p.members) await putItem(dynamoDb, T.projectMembers, { projectId: p.projectId, empId: `emp_${m}`, pmId: p.pmId, orgId: ORG });
}
const tasks = [
  ["prj_portal", "tk_01", "Fix login redirect bug", "sanjay", "pooja", today, "TODO"],
  ["prj_portal", "tk_02", "Write API tests for approvals", "sanjay", "pooja", today, "IN_PROGRESS"],
  ["prj_portal", "tk_03", "Update onboarding checklist copy", "sanjay", "pooja", addDays(today, -2), "TODO"], // overdue
  ["prj_portal", "tk_04", "Design empty states", "ananya", "pooja", today, "TODO"],
  ["prj_portal", "tk_05", "Hand off icon set to developers", "ananya", "pooja", yesterday, "DONE"],
  ["prj_tracking", "tk_06", "Map the dock scanning flow", "vikram", "imran", today, "TODO"],
  ["prj_tracking", "tk_07", "Clean up the pallet location report", "tara", "imran", today, "IN_PROGRESS"],
  // earlier work, so the performance card has something to show
  ["prj_portal", "tk_08", "Draft the release notes", "sanjay", "pooja", addDays(today, -35), "DONE"],
  ["prj_portal", "tk_09", "Migrate the old settings page", "sanjay", "pooja", addDays(today, -33), "DONE_LATE"],
  ["prj_portal", "tk_10", "Audit colour contrast", "ananya", "pooja", addDays(today, -34), "DONE"],
];
for (const [projectId, taskId, title, who, by, dueDate, status] of tasks) {
  const finished = status === "DONE" ? (dueDate < today ? dueDate : today) : status === "DONE_LATE" ? addDays(dueDate, 3) : null;
  await putItem(dynamoDb, T.tasks, {
    projectId, taskId, orgId: ORG, title, description: "", assigneeId: `emp_${who}`, assignedBy: `emp_${by}`, dueDate, status: status === "DONE_LATE" ? "DONE" : status,
    createdAt: new Date().toISOString(), ...(finished && { completedAt: `${finished}T10:00:00.000Z` }),
  });
}

// Two onboarding links to try: one still waiting for the candidate, one already submitted and ready for HR to convert.
const inSevenDays = Math.floor(Date.now() / 1000) + 7 * 86400;
await putItem(dynamoDb, T.onboardingInvites, {
  token: "demo-waiting-token-000000000000000000000000", orgId: ORG, name: "Rhea Kapoor", email: "rhea@candidate.test", role: "EMPLOYEE", deptId: "dept_eng", designation: "QA Engineer",
  status: "SENT", documents: [], createdBy: "Meera Iyer", createdAt: new Date().toISOString(), expiresAt: inSevenDays,
});
await putItem(dynamoDb, T.onboardingInvites, {
  token: "demo-submitted-token-0000000000000000000000", orgId: ORG, name: "Omar Sheikh", email: "omar@candidate.test", role: "EMPLOYEE", deptId: "dept_ops", designation: "Dispatch Coordinator",
  status: "SUBMITTED", documents: [], createdBy: "Meera Iyer", createdAt: new Date().toISOString(), expiresAt: inSevenDays,
  submission: { phone: "+91 98200 11122", address: "12 Lake Road, Pune", emergencyName: "Sana Sheikh", emergencyPhone: "+91 98200 33344", bankName: "HDFC Bank", bankIfsc: "HDFC0001234", bankAccountEnc: encrypt("501002003004"), nationalIdEnc: encrypt("ABCDE1234F"), submittedAt: new Date().toISOString() },
});

// Platform side (orgId "platform"): the product owner's own staff. They manage organizations, plans and money, not HR.
const platformStaff = [
  ["platform_admin", "Platform Admin", "SUPER_ADMIN", "admin@muster.test"],
  ["platform_sales", "Sia Sales", "SALES", "sales@muster.test"],
  ["platform_finance", "Pran Accounts", "FINANCE", "accounts@muster.test"],
];
for (const [id, name, role, email] of platformStaff) {
  await putItem(dynamoDb, T.employees, { orgId: "platform", empId: `emp_${id}`, name, email, role, designation: "Platform staff", status: "ACTIVE", passwordHash });
}

// A second company on the Starter plan (payroll and assets switched off), with one HR admin
await putItem(dynamoDb, T.organizations, {
  orgId: "orbit", name: "Orbit Foods", status: "ACTIVE", planId: "plan_starter", features: { payroll: false, assets: false, reports: true, onboarding: true, projects: false },
  timezone: "Asia/Kolkata", shiftName: "General", shiftStart: "09:30", shiftEnd: "18:30", graceMinutes: 10, halfDayAfterMinutes: 120,
  maxBreaksPerDay: 1, breakAllowedAfterMinutes: 60, cycleStartDay: 26, holidays: [], // one break, only 60 minutes after check-in; pay cycle 26th to 25th
  leaveTypes: [], departments: [{ deptId: "dept_ops", name: "Operations" }],
});
await putItem(dynamoDb, T.employees, {
  orgId: "orbit", empId: "emp_orbit_hr", empCode: "EMP-0001", name: "Leela Rao", email: "hr@orbit.test", role: "HR_ADMIN", deptId: "dept_ops",
  designation: "HR Admin", joinDate: "2024-01-08", status: "ACTIVE", passwordHash, salary: { basic: 60000, hra: 24000, allowances: 15000 },
});

console.log(`Seeded ${people.length} people. Password for everyone: ${PASSWORD}`);
console.log(people.map(([id, , role]) => `  ${id}@kestrel.test  ${role}`).join("\n"));
console.log(platformStaff.map(([, , role, email]) => `  ${email}  ${role} (platform)`).join("\n"));
console.log("  hr@orbit.test  HR_ADMIN (Orbit Foods, Starter plan)");
console.log("Onboarding links to try (after signing in nothing is needed): /onboard/demo-waiting-token-000000000000000000000000 (candidate fills the form), and HR > Onboarding shows a submitted one (Omar Sheikh) ready to convert.");
>>>>>>> master
