import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { canViewEmployee, getEmployee, getOrg, getTeamTree, queryBy } from "../services/dbHelpers.js";
import { fail, monthEnd, nowParts } from "../services/helpers.js";

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

const taskCounts = (tasks, today) => ({
  open: tasks.filter((t) => t.status !== "DONE").length,
  inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
  done: tasks.filter((t) => t.status === "DONE").length,
  overdue: tasks.filter((t) => t.status !== "DONE" && t.dueDate < today).length,
});

// Everyone below `rootId` in the tree (every level), found through managerId
const below = (rootId, byManager) => {
  const out = [];
  for (const e of byManager[rootId] || []) out.push(e, ...below(e.empId, byManager));
  return out;
};

/**
 * The manager's dashboard. A MANAGER gets one group per project manager (that person's whole team); people who report
 * to him directly form one more group. A PROJECT_MANAGER gets one group: his own team.
 * Who is included comes from getTeamTree (the token), never from anything the client sends.
 */
export const overview = async (req, res) => {
  const { user } = req;
  const org = await getOrg(dynamoDb, user.orgId);
  const { date } = nowParts(org.timezone);

  const tree = await getTeamTree(dynamoDb, user);
  const byManager = {};
  for (const e of tree) (byManager[e.managerId] ||= []).push(e);
  const active = (list) => list.filter((e) => e.status === "ACTIVE");

  // [{ lead, people }]
  let groups;
  if (user.role === "PROJECT_MANAGER") {
    groups = [{ lead: { empId: user.empId, name: user.name }, people: active(tree) }];
  } else {
    const pms = (byManager[user.empId] || []).filter((e) => e.role === "PROJECT_MANAGER" && e.status === "ACTIVE");
    groups = pms.map((pm) => ({ lead: pm, people: active(below(pm.empId, byManager)) }));
    const direct = active(byManager[user.empId] || []).filter((e) => e.role !== "PROJECT_MANAGER");
    if (direct.length) groups.push({ lead: null, people: direct });
  }

  // today's attendance for the whole company day in one query, approved leave and tasks per person
  const atWork = Object.fromEntries((await queryBy(dynamoDb, T.attendance, "orgDate", `${user.orgId}#${date}`, { index: "ByOrgDate" })).map((r) => [r.empId, r]));
  const everyone = groups.flatMap((g) => g.people);
  const extra = Object.fromEntries(await Promise.all(everyone.map(async (e) => {
    const [leaves, tasks] = await Promise.all([
      queryBy(dynamoDb, T.leaveRequests, "empId", e.empId),
      queryBy(dynamoDb, T.tasks, "assigneeId", e.empId, { index: "ByAssignee" }),
    ]);
    return [e.empId, { onLeave: leaves.some((l) => l.status === "APPROVED" && l.from <= date && l.to >= date), tasks }];
  })));

  const dataGroups = groups.map(({ lead, people }) => {
    const members = people.map((e) => {
      const rec = atWork[e.empId];
      const today = rec ? rec.status : extra[e.empId].onLeave ? "ON_LEAVE" : "NOT_IN"; // PRESENT | LATE | HALF_DAY | ON_LEAVE | NOT_IN
      return { empId: e.empId, name: e.name, designation: e.designation, role: e.role, today, checkInAt: rec?.checkInAt, tasks: taskCounts(extra[e.empId].tasks, date) };
    });
    const n = (s) => members.filter((m) => m.today === s).length;
    const allTasks = people.flatMap((e) => extra[e.empId].tasks);
    return {
      lead: lead && { empId: lead.empId, name: lead.name, designation: lead.designation }, size: members.length,
      attendance: { present: n("PRESENT"), late: n("LATE"), halfDay: n("HALF_DAY"), onLeave: n("ON_LEAVE"), notIn: n("NOT_IN") },
      tasks: { ...taskCounts(allTasks, date), total: allTasks.length }, members: members.sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
  res.json({ data: { date, groups: dataGroups } });
};

/** Drill into one person: this month's attendance, all leave requests, all tasks. Same access rule as the People page. */
export const employee = async (req, res) => {
  const emp = await getEmployee(dynamoDb, req.user.orgId, req.params.id);
  if (!(await canViewEmployee(dynamoDb, req.user, emp))) fail(403, "You do not have access to this");
  const org = await getOrg(dynamoDb, req.user.orgId);
  const { date } = nowParts(org.timezone);
  const month = req.query.month || date.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) fail(422, "month must look like 2026-11");

  const [records, leaves, tasks] = await Promise.all([
    queryBy(dynamoDb, T.attendance, "empId", emp.empId, { skName: "date", from: `${month}-01`, to: monthEnd(month) }),
    queryBy(dynamoDb, T.leaveRequests, "empId", emp.empId),
    queryBy(dynamoDb, T.tasks, "assigneeId", emp.empId, { index: "ByAssignee" }),
  ]);
  const count = (s) => records.filter((r) => r.status === s).length;
  res.json({
    data: {
      employee: { empId: emp.empId, name: emp.name, designation: emp.designation, role: emp.role },
      month, attendance: { records, summary: { present: count("PRESENT"), late: count("LATE"), halfDay: count("HALF_DAY") } },
      leaves: leaves.sort((a, b) => b.from.localeCompare(a.from)).slice(0, 20),
      tasks: tasks.map((t) => ({ ...t, overdue: t.status !== "DONE" && t.dueDate < date })).sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    },
  });
};
