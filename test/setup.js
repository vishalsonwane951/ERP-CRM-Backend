// Shared by the tests: fake environment, an in-memory database, and a way to call controllers directly.
process.env.JWT_ACCESS_SECRET ??= "test";
process.env.AWS_REGION ??= "ap-south-1";
process.env.AWS_ACCESS_KEY_ID ??= "x";
process.env.AWS_SECRET_ACCESS_KEY ??= "x";
process.env.S3_BUCKET ??= "test-bucket";
process.env.FIELD_ENCRYPTION_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
process.env.MAIL_TRANSPORT = "log";
process.env.MAIL_FROM = "HR <hr@test.local>";

import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { createFakeDb } from "./fakeDynamo.js";

export const db = createFakeDb();
DynamoDBDocumentClient.from = () => db; // every controller now talks to the fake database
S3Client.prototype.send = async () => ({ ContentLength: 1000, ContentType: "application/pdf" }); // and a fake S3

const { T } = await import("../config/tables.js");
export { T };

export const put = (table, item) => db.send({ constructor: { name: "PutCommand" }, input: { TableName: table, Item: item } });
export const all = (table) => [...(db.data[table]?.values() ?? [])];
export const get = (table, pred) => all(table).find(pred);

/** call(controller.fn, user, { params, body, query }) -> the `data` it answered, or throws { status, message } like the API would */
export const call = async (fn, user, { params = {}, body = {}, query = {} } = {}) => {
  let out;
  const res = { status() { return this; }, json(v) { out = v; return this; } };
  await fn({ user, params, body, query }, res);
  return out?.data;
};
export const status = async (promise) => { try { await promise; return 200; } catch (e) { return e.status || 500; } };
