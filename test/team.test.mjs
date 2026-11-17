import test from "node:test";
import assert from "node:assert/strict";
import { T, all, call, get, put, status } from "./setup.js";

const team = await import("../controllers/teamController.js");
const projects = await import("../controllers/projectController.js");
const { nowParts } = await import("../services/helpers.js");

const today = nowParts("Asia/Kolkata").date;
await put(T.organizations, { orgId: "o", name: "Test Co", timezone: "Asia/Kolkata", leaveTypes: [] });
const emp = (id, role, managerId) => put(T.employees, { orgId: "o", empId: id, name: id, role, managerId, status: "ACTIVE", designation: "x", email: `${id}@t` });
// Kavya -> Pooja -> Sanjay, Ananya      Dev -> Imran -> Vikram
await emp("kavya", "MANAGER"); await emp("dev", "MANAGER");
await emp("pooja", "PROJECT_MANAGER", "kavya"); await emp("imran", "PROJECT_MANAGER", "dev");
await emp("sanjay", "EMPLOYEE", "pooja"); await emp("ananya", "EMPLOYEE", "pooja"); await emp("vikram", "EMPLOYEE", "imran");
await emp("direct", "EMPLOYEE", "kavya");
const U = (empId, role) => ({ empId, orgId: "o", role, name: empId });
const [KAVYA, DEV, POOJA, SANJAY, HR] = [U("kavya", "MANAGER"), U("dev", "MANAGER"), U("pooja", "PROJECT_MANAGER"), U("sanjay", "EMPLOYEE"), U("hr", "HR_ADMIN")];

await put(T.attendance, { empId: "sanjay", date: today, orgDate: `o#${today}`, status: "PRESENT" });
await put(T.attendance, { empId: "ananya", date: today, orgDate: `o#${today}`, status: "LATE" });
await put(T.leaveRequests, { empId: "direct", reqId: "l1", status: "APPROVED", from: today, to: today });
await put(T.tasks, { projectId: "p0", taskId: "t0", assigneeId: "sanjay", dueDate: "2000-01-01", status: "TODO" });

test("a manager's dashboard groups his project managers' teams, and never shows another manager's people", async () => {
  const { groups } = await call(team.overview, KAVYA);
  assert.deepEqual(groups.map((g) => g.lead?.name ?? "direct"), ["pooja", "direct"]);
  const pooja = groups[0];
  assert.equal(pooja.size, 2);
  assert.deepEqual(pooja.members.map((m) => m.name), ["ananya", "sanjay"]);
  assert.deepEqual(pooja.attendance, { present: 1, late: 1, halfDay: 0, onLeave: 0, notIn: 0 });
  assert.equal(pooja.tasks.overdue, 1);
  assert.equal(groups[1].attendance.onLeave, 1, "approved leave today is on leave, not absent");
  assert.ok(!JSON.stringify(groups).includes("vikram"), "Dev's team is not visible to Kavya");

  const devGroups = (await call(team.overview, DEV)).groups;
  assert.deepEqual(devGroups.map((g) => g.lead.name), ["imran"]);
  assert.equal(devGroups[0].attendance.notIn, 1);
});

test("a project manager sees one group: his own team", async () => {
  const { groups } = await call(team.overview, POOJA);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].members.map((m) => m.name), ["ananya", "sanjay"]);
});

test("drilling into a person follows the same access rule as the People page", async () => {
  assert.equal((await call(team.employee, KAVYA, { params: { id: "sanjay" } })).employee.name, "sanjay");
  assert.equal(await status(call(team.employee, KAVYA, { params: { id: "vikram" } })), 403, "another manager's employee");
  assert.equal(await status(call(team.employee, POOJA, { params: { id: "direct" } })), 403);
  assert.equal((await call(team.employee, HR, { params: { id: "vikram" } })).employee.name, "vikram", "HR sees everyone");
});

test("projects: who can assign what to whom", async () => {
  const p = await call(projects.create, KAVYA, { body: { name: "Portal", pmId: "pooja" } });
  assert.equal(p.managerId, "kavya");
  assert.equal(await status(call(projects.create, KAVYA, { body: { name: "X", pmId: "imran" } })), 403, "a PM from another manager's team");
  assert.equal(await status(call(projects.create, POOJA, { body: { name: "X" } })), 422, "only a manager (or HR for a manager) creates projects");

  const id = p.projectId;
  await call(projects.addMember, KAVYA, { params: { projectId: id }, body: { empId: "sanjay" } });
  assert.equal(await status(call(projects.addMember, KAVYA, { params: { projectId: id }, body: { empId: "vikram" } })), 403, "not in Kavya's team");
  assert.equal(await status(call(projects.addMember, DEV, { params: { projectId: id }, body: { empId: "ananya" } })), 403, "Dev does not own it");
  assert.equal(await status(call(projects.addMember, POOJA, { params: { projectId: id }, body: { empId: "ananya" } })), 403, "a PM cannot staff the project");

  const task = (user, assigneeId) => call(projects.addTask, user, { params: { projectId: id }, body: { title: "Do it", assigneeId, dueDate: today } });
  assert.equal((await task(KAVYA, "pooja")).assignedBy, "kavya", "manager -> PM");
  assert.equal(await status(task(KAVYA, "sanjay")), 422, "a manager assigns to the PM, not to members");
  assert.equal((await task(POOJA, "sanjay")).assigneeId, "sanjay", "PM -> member");
  assert.equal(await status(task(POOJA, "ananya")), 422, "ananya is not a member of this project");
  assert.equal(await status(task(DEV, "pooja")), 403, "another manager");
  assert.equal(await status(task(SANJAY, "sanjay")), 403, "an employee assigns nothing");

  // the member sees only his own tasks; the status of a task is changed only by its assignee
  const mine = (await call(projects.getOne, SANJAY, { params: { projectId: id } })).tasks;
  assert.deepEqual(mine.map((t) => t.assigneeId), ["sanjay"]);
  const t = get(T.tasks, (x) => x.assigneeId === "sanjay" && x.projectId === id);
  assert.equal(await status(call(projects.setTaskStatus, POOJA, { params: { projectId: id, taskId: t.taskId }, body: { status: "DONE" } })), 403);
  await call(projects.setTaskStatus, SANJAY, { params: { projectId: id, taskId: t.taskId }, body: { status: "DONE" } });
  assert.ok(all(T.notifications).some((n) => n.empId === "pooja" && n.title.includes("finished")), "the assigner is told");
  assert.equal(await status(call(projects.removeMember, KAVYA, { params: { projectId: id, empId: "sanjay" } })), 200, "done tasks do not block removal");

  assert.equal((await call(projects.list, DEV)).length, 0, "Dev sees none of Kavya's projects");
  assert.equal((await call(projects.list, POOJA)).length, 1);
});
