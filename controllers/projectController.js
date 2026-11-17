import { DeleteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { audit, getEmployee, getItem, getOrg, getTeamTree, listEmployees, notify, putItem, putNew, queryBy, updateItem } from "../services/dbHelpers.js";
import { fail, HR_ROLES, makeId, need, nowParts, pick } from "../services/helpers.js";

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE"];
const PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETED"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- who may do what ----------
// MANAGER owns a project (managerId), PROJECT_MANAGER runs it (pmId). HR sees every project and may create / reassign.
const isManagerOf = (user, project) => user.role === "MANAGER" && project.managerId === user.empId;
const isPmOf = (user, project) => user.role === "PROJECT_MANAGER" && project.pmId === user.empId;
const isHR = (user) => HR_ROLES.includes(user.role) || user.role === "AUDITOR";
const canManage = (user, project) => isManagerOf(user, project) || ["HR_ADMIN", "SUPER_ADMIN"].includes(user.role);

const loadProject = async (user, projectId) => {
  const project = await getItem(dynamoDb, T.projects, { orgId: user.orgId, projectId });
  if (!project) fail(404, "Project not found");
  return project;
};
const loadMembers = (projectId) => queryBy(dynamoDb, T.projectMembers, "projectId", projectId);
const loadTasks = (projectId) => queryBy(dynamoDb, T.tasks, "projectId", projectId);

const counts = (tasks, today) => ({
  total: tasks.length,
  todo: tasks.filter((t) => t.status === "TODO").length,
  inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
  done: tasks.filter((t) => t.status === "DONE").length,
  overdue: tasks.filter((t) => t.status !== "DONE" && t.dueDate < today).length,
});

// A project may only have a project manager from the organization, and (for a manager) from his own team
const checkPm = async (user, pmId, project) => {
  const pm = await getEmployee(dynamoDb, user.orgId, pmId);
  if (pm.role !== "PROJECT_MANAGER" || pm.status !== "ACTIVE") fail(422, "Choose an active project manager");
  if (user.role === "MANAGER" && !(await getTeamTree(dynamoDb, user)).some((e) => e.empId === pmId)) fail(403, "That project manager does not report to you");
  if (project && pm.empId === project.managerId) fail(422, "The manager cannot also be the project manager");
  return pm;
};

// ---------- projects ----------
// Managers see their own projects, project managers the ones they run, HR everything, others the projects they work on
export const list = async (req, res) => {
  const { user } = req;
  const org = await getOrg(dynamoDb, user.orgId);
  const { date: today } = nowParts(org.timezone);
  let projects = await queryBy(dynamoDb, T.projects, "orgId", user.orgId);
  if (user.role === "MANAGER") projects = projects.filter((p) => p.managerId === user.empId);
  else if (user.role === "PROJECT_MANAGER") projects = projects.filter((p) => p.pmId === user.empId);
  else if (!isHR(user)) {
    const mine = new Set((await queryBy(dynamoDb, T.projectMembers, "empId", user.empId, { index: "ByEmployee" })).map((m) => m.projectId));
    projects = projects.filter((p) => mine.has(p.projectId));
  }
  const people = Object.fromEntries((await listEmployees(dynamoDb, user.orgId)).map((e) => [e.empId, e.name]));
  const data = await Promise.all(projects.map(async (p) => ({
    ...p, managerName: people[p.managerId], pmName: people[p.pmId], taskCounts: counts(await loadTasks(p.projectId), today),
  })));
  res.json({ data: data.sort((a, b) => a.name.localeCompare(b.name)) });
};

export const getOne = async (req, res) => {
  const { user } = req;
  const project = await loadProject(user, req.params.projectId);
  const members = await loadMembers(project.projectId);
  const isMember = members.some((m) => m.empId === user.empId);
  if (!(isManagerOf(user, project) || isPmOf(user, project) || isHR(user) || isMember)) fail(403, "You do not have access to this");

  const org = await getOrg(dynamoDb, user.orgId);
  const { date: today } = nowParts(org.timezone);
  const people = Object.fromEntries((await listEmployees(dynamoDb, user.orgId)).map((e) => [e.empId, e]));
  const allTasks = await loadTasks(project.projectId);
  // a plain member only sees his own tasks; the manager, the project manager and HR see all
  const seeAll = isManagerOf(user, project) || isPmOf(user, project) || isHR(user);
  const tasks = (seeAll ? allTasks : allTasks.filter((t) => t.assigneeId === user.empId))
    .map((t) => ({ ...t, assigneeName: people[t.assigneeId]?.name, overdue: t.status !== "DONE" && t.dueDate < today }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  res.json({
    data: {
      ...project, managerName: people[project.managerId]?.name, pmName: people[project.pmId]?.name,
      canManage: canManage(user, project), canAssignTasks: isManagerOf(user, project) || isPmOf(user, project),
      taskCounts: counts(allTasks, today),
      members: members.map((m) => ({ empId: m.empId, name: people[m.empId]?.name, designation: people[m.empId]?.designation })),
      tasks,
    },
  });
};

// A manager creates a project he owns. HR creates one for a manager (body.managerId).
export const create = async (req, res) => {
  const { user } = req;
  need(req.body, ["name"]);
  const { startDate, endDate } = req.body;
  if ((startDate && !DATE.test(startDate)) || (endDate && !DATE.test(endDate))) fail(422, "Dates must look like 2026-11-30");
  if (startDate && endDate && endDate < startDate) fail(422, "The end date is before the start date");

  let managerId = user.empId;
  if (user.role !== "MANAGER") {
    need(req.body, ["managerId"]);
    const owner = await getEmployee(dynamoDb, user.orgId, req.body.managerId);
    if (owner.role !== "MANAGER") fail(422, "managerId must be a Manager");
    managerId = owner.empId;
  }
  const project = { orgId: user.orgId, projectId: makeId("prj"), name: req.body.name.trim(), status: "ACTIVE", managerId, startDate, endDate, createdAt: new Date().toISOString() };
  if (req.body.pmId) project.pmId = (await checkPm({ ...user, role: "MANAGER", empId: managerId }, req.body.pmId, project)).empId;
  await putNew(dynamoDb, T.projects, project, "orgId", "A project with this id already exists");
  if (project.pmId) await notify(dynamoDb, project.pmId, `You are the project manager of ${project.name}`, "Add your team and assign tasks.", `/projects/${project.projectId}`);
  await audit(dynamoDb, user, "PROJECT_CREATED", "PROJECT", project.projectId);
  res.status(201).json({ data: project });
};

export const update = async (req, res) => {
  const project = await loadProject(req.user, req.params.projectId);
  if (!canManage(req.user, project)) fail(403, "Only the project's manager or HR can change it");
  const fields = pick(req.body, ["name", "status", "startDate", "endDate"]);
  if (fields.status && !PROJECT_STATUSES.includes(fields.status)) fail(422, `status must be one of ${PROJECT_STATUSES.join(", ")}`);
  for (const d of [fields.startDate, fields.endDate]) if (d && !DATE.test(d)) fail(422, "Dates must look like 2026-11-30");
  const updated = await updateItem(dynamoDb, T.projects, { orgId: project.orgId, projectId: project.projectId }, { set: fields });
  await audit(dynamoDb, req.user, "PROJECT_UPDATED", "PROJECT", project.projectId);
  res.json({ data: updated });
};

// Gives the project to a project manager. The members stay, and now work under the new project manager.
export const setPm = async (req, res) => {
  need(req.body, ["pmId"]);
  const project = await loadProject(req.user, req.params.projectId);
  if (!canManage(req.user, project)) fail(403, "Only the project's manager or HR can change it");
  const pm = await checkPm(req.user.role === "MANAGER" ? req.user : { ...req.user, role: "HR_ADMIN" }, req.body.pmId, project);
  const updated = await updateItem(dynamoDb, T.projects, { orgId: project.orgId, projectId: project.projectId }, { set: { pmId: pm.empId } });
  await Promise.all((await loadMembers(project.projectId)).map((m) => updateItem(dynamoDb, T.projectMembers, { projectId: m.projectId, empId: m.empId }, { set: { pmId: pm.empId } })));
  await notify(dynamoDb, pm.empId, `You are the project manager of ${project.name}`, "Add your team and assign tasks.", `/projects/${project.projectId}`);
  await audit(dynamoDb, req.user, "PROJECT_PM_SET", "PROJECT", project.projectId);
  res.json({ data: updated });
};

// ---------- members: which employee works on this project, under which project manager ----------
export const addMember = async (req, res) => {
  need(req.body, ["empId"]);
  const project = await loadProject(req.user, req.params.projectId);
  if (!canManage(req.user, project)) fail(403, "Only the project's manager or HR can change the team");
  if (!project.pmId) fail(409, "Choose the project manager first, then add the team");

  const emp = await getEmployee(dynamoDb, req.user.orgId, req.body.empId);
  if (emp.status !== "ACTIVE") fail(422, "That person is not active");
  if (["MANAGER", "PROJECT_MANAGER"].includes(emp.role)) fail(422, "Only employees are added as members");
  if (req.user.role === "MANAGER" && !(await getTeamTree(dynamoDb, req.user)).some((e) => e.empId === emp.empId)) fail(403, "That person is not in your team");

  await putItem(dynamoDb, T.projectMembers, { projectId: project.projectId, empId: emp.empId, pmId: project.pmId, orgId: project.orgId, addedAt: new Date().toISOString() });
  await notify(dynamoDb, emp.empId, `You were added to ${project.name}`, "Your project manager will assign you tasks.", "/projects");
  await audit(dynamoDb, req.user, "PROJECT_MEMBER_ADDED", "PROJECT", project.projectId);
  res.status(201).json({ data: { empId: emp.empId, name: emp.name } });
};

export const removeMember = async (req, res) => {
  const project = await loadProject(req.user, req.params.projectId);
  if (!canManage(req.user, project)) fail(403, "Only the project's manager or HR can change the team");
  const open = (await queryBy(dynamoDb, T.tasks, "assigneeId", req.params.empId, { index: "ByAssignee" })).filter((t) => t.projectId === project.projectId && t.status !== "DONE");
  if (open.length) fail(409, `${open.length} open task(s) are still assigned to this person. Finish or edit them first.`);
  await dynamoDb.send(new DeleteCommand({ TableName: T.projectMembers, Key: { projectId: project.projectId, empId: req.params.empId } }));
  await audit(dynamoDb, req.user, "PROJECT_MEMBER_REMOVED", "PROJECT", project.projectId);
  res.json({ data: { removed: true } });
};

// ---------- tasks ----------
// A manager gives a task to the project's project manager. A project manager gives tasks to the project's members.
export const addTask = async (req, res) => {
  need(req.body, ["title", "assigneeId", "dueDate"]);
  const { user } = req;
  const project = await loadProject(user, req.params.projectId);
  if (!DATE.test(req.body.dueDate)) fail(422, "dueDate must look like 2026-11-30");
  if (req.body.title.trim().length < 3 || req.body.title.length > 120) fail(422, "The title needs 3 to 120 characters");

  if (isManagerOf(user, project)) {
    if (req.body.assigneeId !== project.pmId) fail(422, "A manager assigns tasks to the project's project manager");
  } else if (isPmOf(user, project)) {
    const member = await getItem(dynamoDb, T.projectMembers, { projectId: project.projectId, empId: req.body.assigneeId });
    if (!member) fail(422, "Tasks go to people who are members of this project");
  } else fail(403, "Only the project's manager or project manager can assign tasks");

  const task = {
    projectId: project.projectId, taskId: makeId("tk"), orgId: user.orgId, title: req.body.title.trim(), description: req.body.description || "",
    assigneeId: req.body.assigneeId, assignedBy: user.empId, dueDate: req.body.dueDate, status: "TODO", createdAt: new Date().toISOString(),
  };
  await putItem(dynamoDb, T.tasks, task);
  await notify(dynamoDb, task.assigneeId, `New task: ${task.title}`, `${project.name}, due ${task.dueDate}`, "/");
  await audit(dynamoDb, user, "TASK_ASSIGNED", "TASK", task.taskId);
  res.status(201).json({ data: task });
};

const loadEditableTask = async (user, projectId, taskId) => {
  const project = await loadProject(user, projectId);
  const task = await getItem(dynamoDb, T.tasks, { projectId, taskId });
  if (!task) fail(404, "Task not found");
  if (!(task.assignedBy === user.empId || isManagerOf(user, project) || isPmOf(user, project))) fail(403, "You cannot change this task");
  return task;
};

export const editTask = async (req, res) => {
  const task = await loadEditableTask(req.user, req.params.projectId, req.params.taskId);
  const fields = pick(req.body, ["title", "description", "dueDate"]);
  if (fields.dueDate && !DATE.test(fields.dueDate)) fail(422, "dueDate must look like 2026-11-30");
  if (fields.title !== undefined && fields.title.trim().length < 3) fail(422, "The title needs at least 3 characters");
  res.json({ data: await updateItem(dynamoDb, T.tasks, { projectId: task.projectId, taskId: task.taskId }, { set: fields }) });
};

export const deleteTask = async (req, res) => {
  const task = await loadEditableTask(req.user, req.params.projectId, req.params.taskId);
  await dynamoDb.send(new DeleteCommand({ TableName: T.tasks, Key: { projectId: task.projectId, taskId: task.taskId } }));
  await audit(dynamoDb, req.user, "TASK_DELETED", "TASK", task.taskId);
  res.json({ data: { deleted: true } });
};

// My tasks for the Today page: everything due today or earlier that is not finished, plus what I finished today.
export const myTasks = async (req, res) => {
  const org = await getOrg(dynamoDb, req.user.orgId);
  const { date } = nowParts(org.timezone);
  const due = await queryBy(dynamoDb, T.tasks, "assigneeId", req.user.empId, { index: "ByAssignee", skName: "dueDate", from: "0000-01-01", to: date });
  const tasks = due.filter((t) => t.status !== "DONE" || t.completedAt?.slice(0, 10) === date || t.dueDate === date);

  const names = {};
  for (const projectId of new Set(tasks.map((t) => t.projectId))) {
    names[projectId] = (await getItem(dynamoDb, T.projects, { orgId: req.user.orgId, projectId }))?.name;
  }
  const rank = { IN_PROGRESS: 0, TODO: 1, DONE: 2 };
  const data = tasks.map((t) => ({ ...t, projectName: names[t.projectId], overdue: t.dueDate < date && t.status !== "DONE" }))
    .sort((a, b) => rank[a.status] - rank[b.status] || a.dueDate.localeCompare(b.dueDate));
  res.json({ data });
};

// Only the person the task is assigned to changes its status. The person who assigned it is told when it is done.
export const setTaskStatus = async (req, res) => {
  need(req.body, ["status"]);
  if (!TASK_STATUSES.includes(req.body.status)) fail(422, `status must be one of ${TASK_STATUSES.join(", ")}`);
  const { projectId, taskId } = req.params;
  const task = await getItem(dynamoDb, T.tasks, { projectId, taskId });
  if (!task || task.orgId !== req.user.orgId) fail(404, "Task not found");
  if (task.assigneeId !== req.user.empId) fail(403, "Only the person this task is assigned to can change it");

  const done = req.body.status === "DONE";
  const updated = await updateItem(dynamoDb, T.tasks, { projectId, taskId }, {
    set: { status: req.body.status, ...(done && { completedAt: new Date().toISOString() }) },
    ...(!done && { remove: ["completedAt"] }),
  });
  if (done && task.status !== "DONE") await notify(dynamoDb, task.assignedBy, `${req.user.name} finished a task`, task.title, "/");
  res.json({ data: updated });
};
