import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { getEmployee, getItem, putItem, queryBy, updateItem } from "../services/dbHelpers.js";
import { createApproval, isOpen } from "../services/approvalHelpers.js";
import { fail, makeId, need, weekdays } from "../services/helpers.js";

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

export const overview = async (req, res) => {
  const [balances, requests] = await Promise.all([
    queryBy(dynamoDb, T.leaveBalances, "empId", req.user.empId),
    queryBy(dynamoDb, T.leaveRequests, "empId", req.user.empId),
  ]);
  res.json({
    data: {
      balances: balances.map((b) => ({ ...b, available: b.total - b.used - b.pending })),
      requests: requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    },
  });
};

export const apply = async (req, res) => {
  need(req.body, ["typeId", "from", "to"]);
  const { typeId, from, to, reason } = req.body;
  const { empId, orgId } = req.user;
  if (to < from) fail(400, "The end date is before the start date");
  const days = weekdays(from, to); // weekends are not counted
  if (days < 1) fail(400, "Pick at least one working day (Mon to Fri)");

  const balance = await getItem(dynamoDb, T.leaveBalances, { empId, typeId });
  if (!balance) fail(404, "Leave type not found");
  const left = balance.total - balance.used - balance.pending;
  if (days > left) fail(400, `You have ${left} days of ${balance.name} left, but asked for ${days}`);

  const reqId = makeId("lr");
  const request = {
    empId, reqId, orgId, typeId, typeName: balance.name, color: balance.color, from, to, days, reason,
    status: "PENDING", createdAt: new Date().toISOString(),
  };
  await putItem(dynamoDb, T.leaveRequests, request);
  await updateItem(dynamoDb, T.leaveBalances, { empId, typeId }, { add: { pending: days } }); // days are held until approved or rejected
  await createApproval(dynamoDb, await getEmployee(dynamoDb, orgId, empId), {
    reqId, entityType: "LEAVE", summary: `${balance.name}, ${days} day${days > 1 ? "s" : ""} (${from} to ${to})`, payload: { typeId, days, from, to, reason },
  });
  res.status(201).json({ data: request });
};

// The requester withdraws a request that is still open
export const cancel = async (req, res) => {
  const approval = await getItem(dynamoDb, T.approvals, { reqId: req.params.id });
  if (!approval || approval.requesterId !== req.user.empId) fail(404, "Request not found");
  if (!isOpen(approval.status)) fail(409, `This request is already ${approval.status.toLowerCase()}`);

  await updateItem(dynamoDb, T.approvals, { reqId: approval.reqId }, {
    set: { status: "CANCELLED", orgStatus: `${approval.orgId}#CANCELLED`, completedAt: new Date().toISOString() },
    remove: ["approverKey"], // leaves the approver's inbox
  });
  await updateItem(dynamoDb, T.leaveRequests, { empId: req.user.empId, reqId: approval.reqId }, { set: { status: "CANCELLED" } });
  await updateItem(dynamoDb, T.leaveBalances, { empId: req.user.empId, typeId: approval.payload.typeId }, { add: { pending: -approval.payload.days } });
  res.json({ data: { reqId: approval.reqId, status: "CANCELLED" } });
};
