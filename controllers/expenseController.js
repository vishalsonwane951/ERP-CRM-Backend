import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { getEmployee, putItem, queryBy } from "../services/dbHelpers.js";
import { createApproval } from "../services/approvalHelpers.js";
import { fail, makeId, need } from "../services/helpers.js";

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

const CATEGORIES = ["Travel", "Meals", "Equipment", "Software", "Other"];

export const list = async (req, res) => {
  const items = await queryBy(dynamoDb, T.expenses, "empId", req.user.empId);
  res.json({ data: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
};

export const submit = async (req, res) => {
  need(req.body, ["category", "amount", "date", "description"]);
  const { category, amount, date, description } = req.body;
  if (!CATEGORIES.includes(category)) fail(422, `category must be one of ${CATEGORIES.join(", ")}`);
  if (!(Number(amount) > 0)) fail(422, "amount must be more than 0");

  const reqId = makeId("ex");
  const claim = { empId: req.user.empId, reqId, orgId: req.user.orgId, category, amount: Number(amount), date, description, status: "PENDING", createdAt: new Date().toISOString() };
  await putItem(dynamoDb, T.expenses, claim);
  await createApproval(dynamoDb, await getEmployee(dynamoDb, req.user.orgId, req.user.empId), {
    reqId, entityType: "EXPENSE", summary: `Expense: ${category}, ${Number(amount).toLocaleString("en-IN")}`, payload: { amount: Number(amount), category },
  });
  res.status(201).json({ data: claim });
};
