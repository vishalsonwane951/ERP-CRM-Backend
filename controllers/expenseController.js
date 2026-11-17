import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { getEmployee, getItem, putItem, queryBy } from "../services/dbHelpers.js";
import { assertCanRoute, createApproval } from "../services/approvalHelpers.js";
import { fail, makeId, need } from "../services/helpers.js";

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

const CATEGORIES = ["Travel", "Meals", "Equipment", "Software", "Other"];

export const list = async (req, res) => {
  const items = await queryBy(dynamoDb, T.expenses, "empId", req.user.empId);
  res.json({ data: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
};

// The bill is uploaded first (documents/upload-url -> S3 -> documents/confirm, category "expense-bills"),
// then its documentId is sent here. We look the document up, so a made-up id or somebody else's file is refused.
const findBill = async (user, billDocumentId) => {
  const doc = await getItem(dynamoDb, T.documents, { empId: user.empId, documentId: billDocumentId });
  if (!doc || doc.orgId !== user.orgId || doc.category !== "expense-bills") fail(422, "Upload the bill first, then submit the claim");
  const earlier = (await queryBy(dynamoDb, T.expenses, "empId", user.empId)).find((x) => x.billDocumentId === billDocumentId);
  if (earlier) fail(409, "This bill is already attached to another claim");
  return doc;
};

export const submit = async (req, res) => {
  need(req.body, ["category", "amount", "date", "description"]);
  if (!req.body.billDocumentId) fail(422, "A bill is required. Upload it and send its billDocumentId");
  const { category, amount, date, description } = req.body;
  if (!CATEGORIES.includes(category)) fail(422, `category must be one of ${CATEGORIES.join(", ")}`);
  if (!(Number(amount) > 0)) fail(422, "amount must be more than 0");

  const requester = await getEmployee(dynamoDb, req.user.orgId, req.user.empId);
  await assertCanRoute(dynamoDb, requester); // refuse before saving anything when nobody can approve it
  const bill = await findBill(req.user, req.body.billDocumentId);
  const reqId = makeId("ex");
  const claim = {
    empId: req.user.empId, reqId, orgId: req.user.orgId, category, amount: Number(amount), date, description, status: "PENDING", createdAt: new Date().toISOString(),
    billDocumentId: bill.documentId, billKey: bill.key, billFilename: bill.filename,
  };
  await putItem(dynamoDb, T.expenses, claim);
  await createApproval(dynamoDb, requester, {
    reqId, entityType: "EXPENSE", summary: `Expense: ${category}, ${Number(amount).toLocaleString("en-IN")}`, payload: { amount: Number(amount), category, billDocumentId: bill.documentId, billFilename: bill.filename }, // the approver opens the bill from here
  });
  res.status(201).json({ data: claim });
};
