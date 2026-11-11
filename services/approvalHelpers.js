import { T } from "../config/tables.js";
import { getItem, notify, putItem, queryBy } from "./dbHelpers.js";

// Used by leave + expense (to start a request), approvals (to move it along) and reports (pending count).
// Stages: first the employee's manager, then a role.
export const STAGES = {
  LEAVE: [{ approverType: "REPORTING_MANAGER" }, { approverType: "ROLE", role: "HR_ADMIN" }],
  EXPENSE: [{ approverType: "REPORTING_MANAGER" }, { approverType: "ROLE", role: "FINANCE" }],
};
const ROLE_LABEL = { HR_ADMIN: "HR", FINANCE: "Finance", SUPER_ADMIN: "Admin" };

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
  const keys = [user.empId, `${user.orgId}#${user.role}`];
  if (user.role === "SUPER_ADMIN") ["HR_ADMIN", "HR_MANAGER", "FINANCE"].forEach((r) => keys.push(`${user.orgId}#${r}`));
  const lists = await Promise.all(keys.map((k) => queryBy(db, T.approvals, "approverKey", k, { index: "ByApprover" })));
  return lists.flat().filter((a) => isOpen(a.status) && a.requesterId !== user.empId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};
