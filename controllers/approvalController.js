import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { audit, getEmployee, getItem, notify, queryBy, updateItem } from "../services/dbHelpers.js";
import { canAct, findApprover, getPendingFor, isOpen } from "../services/approvalHelpers.js";
import { fail, HR_ROLES } from "../services/helpers.js";

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

// The request, with its history (the `actions` list), as the screen needs it
const loadDetail = async (user, reqId) => {
  const request = await getItem(dynamoDb, T.approvals, { reqId });
  if (!request || request.orgId !== user.orgId) fail(404, "Request not found");

  const allowed = request.requesterId === user.empId || request.requesterManagerId === user.empId || canAct(user, request.approver) ||
    request.actions.some((a) => a.actorId === user.empId) || [...HR_ROLES, "AUDITOR"].includes(user.role);
  if (!allowed) fail(403, "You do not have access to this");
  return { ...request, canAct: isOpen(request.status) && request.requesterId !== user.empId && canAct(user, request.approver) };
};

// What a final decision does to the original record (leave balance, expense status)
const applyOutcome = async (request, status) => {
  if (request.entityType === "LEAVE") {
    const { typeId, days } = request.payload;
    await updateItem(dynamoDb, T.leaveRequests, { empId: request.requesterId, reqId: request.reqId }, { set: { status } });
    const add = status === "APPROVED" ? { used: days, pending: -days } : { pending: -days };
    await updateItem(dynamoDb, T.leaveBalances, { empId: request.requesterId, typeId }, { add });
  }
  if (request.entityType === "EXPENSE") await updateItem(dynamoDb, T.expenses, { empId: request.requesterId, reqId: request.reqId }, { set: { status } });
};

export const pending = async (req, res) => {
  res.json({ data: await getPendingFor(dynamoDb, req.user) });
};

// History for HR and auditors: ?status=APPROVED | REJECTED | CANCELLED | PENDING
export const byStatus = async (req, res) => {
  if (![...HR_ROLES, "AUDITOR"].includes(req.user.role)) fail(403, "You do not have access to this");
  const { status } = req.query;
  if (!["APPROVED", "REJECTED", "CANCELLED", "PENDING"].includes(status)) fail(422, "status must be APPROVED, REJECTED, CANCELLED or PENDING");
  const items = await queryBy(dynamoDb, T.approvals, "orgStatus", `${req.user.orgId}#${status}`, { index: "ByOrgStatus", desc: true });
  res.json({ data: items });
};

export const detail = async (req, res) => {
  res.json({ data: await loadDetail(req.user, req.params.id) });
};

export const act = async (req, res) => {
  const { action, comment } = req.body;
  if (!["approve", "reject", "escalate"].includes(action)) fail(422, "action must be approve, reject or escalate");
  if (action === "reject" && !comment?.trim()) fail(422, "Add a reason when rejecting");

  const request = await getItem(dynamoDb, T.approvals, { reqId: req.params.id });
  if (!request || request.orgId !== req.user.orgId) fail(404, "Request not found");
  if (!isOpen(request.status)) fail(409, `This request is already ${request.status.toLowerCase()}`);
  if (request.requesterId === req.user.empId) fail(403, "You cannot act on your own request");
  if (!canAct(req.user, request.approver)) fail(403, "This request is not waiting on you");

  let changes; let finalStatus = null;
  if (action === "approve" && request.currentStage < request.totalStages) { // move to the next stage
    const requester = await getEmployee(dynamoDb, request.orgId, request.requesterId);
    const { approverKey, ...next } = await findApprover(dynamoDb, request.stages[request.currentStage], requester);
    changes = { set: { status: "PENDING", currentStage: request.currentStage + 1, approver: next, approverKey } };
  } else if (action === "escalate") { // hand over to the next role up
    const role = request.approver.role === "HR_ADMIN" ? "SUPER_ADMIN" : "HR_ADMIN";
    changes = { set: { status: "ESCALATED", approver: { kind: "ROLE", role, label: role === "HR_ADMIN" ? "HR" : "Admin" }, approverKey: `${request.orgId}#${role}`, escalatedFrom: request.approver.label } };
  } else { // final decision
    finalStatus = action === "approve" ? "APPROVED" : "REJECTED";
    changes = { set: { status: finalStatus, orgStatus: `${request.orgId}#${finalStatus}`, completedAt: new Date().toISOString() }, remove: ["approverKey"] };
  }

  // the decision is added to the history in the same update. The condition stops two people deciding at once.
  const at = new Date().toISOString();
  const entry = { action, comment, stage: request.currentStage, actorId: req.user.empId, actorName: req.user.name, actorRole: req.user.role, at };
  changes.set.actions = [...request.actions, entry];
  const updated = await updateItem(dynamoDb, T.approvals, { reqId: request.reqId }, {
    ...changes, condition: { expr: "#c_s = :c_p OR #c_s = :c_e", names: { "#c_s": "status" }, values: { ":c_p": "PENDING", ":c_e": "ESCALATED" } },
  });
  if (!updated) fail(409, "Someone just acted on this request. Reload to see the latest.");
  if (finalStatus) await applyOutcome(request, finalStatus);

  const verb = finalStatus ? finalStatus.toLowerCase() : { approve: "approved", escalate: "escalated" }[action];
  await notify(dynamoDb, request.requesterId, `${request.summary}: ${verb}`, comment || `By ${req.user.name}.`, "/leave");
  if (!finalStatus && updated.approver.kind === "USER") await notify(dynamoDb, updated.approver.approverId, `${request.requesterName}: ${request.summary}`, "Waiting for your decision.", `/approvals?open=${request.reqId}`);
  await audit(dynamoDb, req.user, `APPROVAL_${action.toUpperCase()}`, request.entityType, request.reqId);
  res.json({ data: await loadDetail(req.user, request.reqId) });
};
