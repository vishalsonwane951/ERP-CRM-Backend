import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { queryBy, updateItem } from "../services/dbHelpers.js";

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

const latest = (empId) => queryBy(dynamoDb, T.notifications, "empId", empId, { desc: true, limit: 30 });

export const list = async (req, res) => {
  const items = await latest(req.user.empId);
  res.json({ data: items.map((n) => ({ ...n, id: n.notificationId })) });
};

export const readAll = async (req, res) => {
  const items = await latest(req.user.empId);
  await Promise.all(items.filter((n) => !n.read).map((n) => updateItem(dynamoDb, T.notifications, { empId: n.empId, notificationId: n.notificationId }, { set: { read: true } })));
  res.json({ data: { done: true } });
};
