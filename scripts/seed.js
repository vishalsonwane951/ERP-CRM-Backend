import "dotenv/config";
import bcrypt from "bcryptjs";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { putItem } from "../services/dbHelpers.js";
import { createApproval } from "../services/approvalHelpers.js";
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
];
await putItem(dynamoDb, T.organizations, {
  orgId: ORG, name: "Kestrel Logistics", timezone: "Asia/Kolkata", shiftName: "General", shiftStart: "09:30", shiftEnd: "18:30",
  graceMinutes: 10, halfDayAfterMinutes: 120, leaveTypes,
  departments: [{ deptId: "dept_eng", name: "Engineering" }, { deptId: "dept_people", name: "People" }, { deptId: "dept_fin", name: "Finance" }, { deptId: "dept_ops", name: "Operations" }],
});

// [id, name, role, department, title, manager, basic salary]
const people = [
  ["arjun", "Arjun Rao", "SUPER_ADMIN", "dept_ops", "Chief Operating Officer", null, 180000],
  ["meera", "Meera Iyer", "HR_ADMIN", "dept_people", "Head of People", "arjun", 95000],
  ["rohan", "Rohan Shah", "FINANCE", "dept_fin", "Finance Controller", "arjun", 90000],
  ["nisha", "Nisha Kapoor", "AUDITOR", "dept_fin", "Internal Auditor", "arjun", 70000],
  ["kavya", "Kavya Nair", "MANAGER", "dept_eng", "Engineering Manager", "arjun", 120000],
  ["sanjay", "Sanjay Patil", "EMPLOYEE", "dept_eng", "Senior Engineer", "kavya", 80000],
  ["ananya", "Ananya Deshmukh", "EMPLOYEE", "dept_eng", "Product Designer", "kavya", 72000],
  ["vikram", "Vikram Joshi", "EMPLOYEE", "dept_eng", "Software Engineer", "kavya", 60000],
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

// one pending leave request (Sanjay -> Kavya -> HR) and two assets
let from = addDays(today, 3);
while ([0, 6].includes(new Date(`${from}T00:00:00Z`).getUTCDay())) from = addDays(from, 1);
const to = addDays(from, 1);
await putItem(dynamoDb, T.leaveRequests, { empId: "emp_sanjay", reqId: "lr_seed01", orgId: ORG, typeId: "lt_casual", typeName: "Casual leave", color: "#0B6E75", from, to, days: 2, reason: "Family function", status: "PENDING", createdAt: new Date().toISOString() });
await putItem(dynamoDb, T.leaveBalances, { empId: "emp_sanjay", typeId: "lt_casual", name: "Casual leave", color: "#0B6E75", total: 12, used: 0, pending: 2 });
await createApproval(dynamoDb, emps.sanjay, { reqId: "lr_seed01", entityType: "LEAVE", summary: `Casual leave, 2 days (${from} to ${to})`, payload: { typeId: "lt_casual", days: 2, from, to, reason: "Family function" } });

await putItem(dynamoDb, T.assets, { orgId: ORG, assetId: "as_laptop1", tag: "KL-LT-0142", name: "MacBook Pro 14", category: "Laptop", status: "AVAILABLE", value: 189900, history: [] });
await putItem(dynamoDb, T.assets, { orgId: ORG, assetId: "as_monitor1", tag: "KL-MN-0031", name: "Dell 27 inch Monitor", category: "Monitor", status: "AVAILABLE", value: 52000, history: [] });

console.log(`Seeded ${people.length} people. Password for everyone: ${PASSWORD}`);
console.log(people.map(([id, , role]) => `  ${id}@kestrel.test  ${role}`).join("\n"));
