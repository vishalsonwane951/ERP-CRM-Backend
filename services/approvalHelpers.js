import { T } from "../config/tables.js";
import { getItem, notify, putItem, queryBy } from "./dbHelpers.js";
<<<<<<< HEAD
=======
import { fail } from "./helpers.js";
>>>>>>> master

// Used by leave + expense (to start a request), approvals (to move it along) and reports (pending count).
// Stages: first the employee's manager, then a role.
export const STAGES = {
  LEAVE: [{ approverType: "REPORTING_MANAGER" }, { approverType: "ROLE", role: "HR_ADMIN" }],
  EXPENSE: [{ approverType: "REPORTING_MANAGER" }, { approverType: "ROLE", role: "FINANCE" }],
};
const ROLE_LABEL = { HR_ADMIN: "HR", FINANCE: "Finance", SUPER_ADMIN: "Admin" };

<<<<<<< HEAD
export const isOpen = (status) => status === "PENDING" || status === "ESCALATED";
export const canAct = (user, approver) =>
  approver.kind === "USER" ? approver.approverId === user.empId : user.role === approver.role || user.role === "SUPER_ADMIN";

/** Who must decide this stage: the requester's manager, or everyone with a role (falls back to HR) */
export const findApprover = async (db, stage, requester) => {
  if (stage.approverType === "REPORTING_MANAGER" && requester.managerId) {
    const manager = await getItem(db, T.employees, { orgId: requester.orgId, empId: requester.managerId });
    if (manager?.status === "ACTIVE") return { kind: "USER", approverId: manager.empId, label: manager.name, approverKey: manager.empId };
  }
  const role = stage.role || "HR_ADMIN";
  return { kind: "ROLE", role, label: ROLE_LABEL[role] || role, approverKey: `${requester.orgId}#${role}` };
};

=======
// Roles that may also decide for another role's stage. HR managers help HR admins with the HR stage.
const ACTS_AS = { HR_MANAGER: ["HR_ADMIN"] };

export const isOpen = (status) => status === "PENDING" || status === "ESCALATED";
export const canAct = (user, approver) =>
  approver.kind === "USER"
    ? approver.approverId === user.empId
    : user.role === approver.role || ACTS_AS[user.role]?.includes(approver.role) || user.role === "SUPER_ADMIN";

const userApprover = (m) => ({ kind: "USER", approverId: m.empId, label: m.name, approverKey: m.empId });

/**
 * Stage 1: the first ACTIVE manager above the requester. That is the PROJECT_MANAGER (an employee's managerId points to him),
 * or the Manager when the person has no project manager. It never falls back to HR: HR only gets a request after this stage approved.
 * If somebody has left, the chain goes one level up. With nobody left, the request is refused with a clear message.
 */
export const findReportingManager = async (db, requester) => {
  const seen = new Set();
  for (let id = requester.managerId; id && !seen.has(id); ) {
    seen.add(id);
    const manager = await getItem(db, T.employees, { orgId: requester.orgId, empId: id });
    if (manager?.status === "ACTIVE") return userApprover(manager);
    id = manager?.managerId;
  }
  return fail(409, "You have no active reporting manager, so this cannot be sent for approval. Ask HR to set who you report to.");
};

/** Who must decide this stage: the reporting manager (stage 1), or everyone with a role (later stages) */
export const findApprover = async (db, stage, requester) => {
  if (stage.approverType === "REPORTING_MANAGER") return findReportingManager(db, requester);
  const role = stage.role;
  return { kind: "ROLE", role, label: ROLE_LABEL[role] || role, approverKey: `${requester.orgId}#${role}` };
};

/** Call BEFORE saving a leave or expense, so a request that cannot be routed leaves nothing half-saved behind */
export const assertCanRoute = (db, requester) => findReportingManager(db, requester);

>>>>>>> master
export const createApproval = async (db, requester, { reqId, entityType, summary, payload }) => {
  const stages = STAGES[entityType];
  const approver = await findApprover(db, stages[0], requester);
  const { approverKey, ...approverInfo } = approver;
  await putItem(db, T.approvals, {
    reqId, orgId: requester.orgId, entityType, requesterId: requester.empId, requesterName: requester.name,
    requesterManagerId: requester.managerId, summary, payload, stages, totalStages: stages.length, currentStage: 1,
    approver: approverInfo, approverKey, status: "PENDING", orgStatus: `${requester.orgId}#PENDING`, actions: [],
    createdAt: new Date().toISOString(),
  });
  if (approver.kind === "USER") await notify(db, approver.approverId, `${requester.name}: ${summary}`, "Waiting for your decision.", `/approvals?open=${reqId}`);
};

/** Open requests currently waiting on this user (directly, or through their role) */
export const getPendingFor = async (db, user) => {
<<<<<<< HEAD
  const keys = [user.empId, `${user.orgId}#${user.role}`];
=======
  const keys = [user.empId, `${user.orgId}#${user.role}`, ...(ACTS_AS[user.role] || []).map((r) => `${user.orgId}#${r}`)];
>>>>>>> master
  if (user.role === "SUPER_ADMIN") ["HR_ADMIN", "HR_MANAGER", "FINANCE"].forEach((r) => keys.push(`${user.orgId}#${r}`));
  const lists = await Promise.all(keys.map((k) => queryBy(db, T.approvals, "approverKey", k, { index: "ByApprover" })));
  return lists.flat().filter((a) => isOpen(a.status) && a.requesterId !== user.empId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};
