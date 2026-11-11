import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { configureS3, getS3Client } from "../config/s3.js";
import { getEmployee, getItem, putNew, queryBy } from "../services/dbHelpers.js";
import { fail, HR_ROLES, makeId, need } from "../services/helpers.js";

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);
configureS3();
const s3 = getS3Client();

const BUCKET = process.env.S3_BUCKET;
const CATEGORIES = ["identity", "bank", "offer-letters", "payslips", "certificates", "contracts", "assets"];
const TYPES = ["application/pdf", "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

// HR can upload anything for anyone. Employees can add their own identity papers and certificates.
const canUpload = (user, ownerId, category) =>
  HR_ROLES.includes(user.role) || (ownerId === user.empId && ["identity", "certificates"].includes(category));
// Owner and HR see everything. Finance sees payslips and bank documents.
const canView = (user, ownerId, category) =>
  HR_ROLES.includes(user.role) || ownerId === user.empId || (user.role === "FINANCE" && ["payslips", "bank"].includes(category));

export const categories = (req, res) => res.json({ data: CATEGORIES });

// Step 1: ask for a temporary upload link. The file itself goes straight from the browser to S3.
export const uploadUrl = async (req, res) => {
  need(req.body, ["category", "filename", "contentType"]);
  const { category, filename, contentType } = req.body;
  const ownerId = req.body.employeeId || req.user.empId;
  if (!CATEGORIES.includes(category)) fail(422, `category must be one of ${CATEGORIES.join(", ")}`);
  if (!TYPES.includes(contentType)) fail(422, "Upload a PDF, PNG, JPG or Word file");
  if (!canUpload(req.user, ownerId, category)) fail(403, "You cannot upload this kind of document");
  await getEmployee(dynamoDb, req.user.orgId, ownerId);

  const documentId = makeId("doc");
  const key = `${req.user.orgId}/${ownerId}/${category}/${documentId}-${filename.replace(/[^\w.\-]+/g, "_")}`;
  const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }), { expiresIn: 300 });
  res.status(201).json({ data: { documentId, key, uploadUrl: url, headers: { "Content-Type": contentType }, expiresIn: 300 } });
};

// Step 2: after the upload, record the document (only if the file really reached S3)
export const confirm = async (req, res) => {
  need(req.body, ["documentId", "category", "filename", "key"]);
  const { documentId, category, filename, key } = req.body;
  const ownerId = req.body.employeeId || req.user.empId;
  if (!canUpload(req.user, ownerId, category)) fail(403, "You cannot upload this kind of document");
  if (!key.startsWith(`${req.user.orgId}/${ownerId}/${category}/${documentId}-`)) fail(400, "Document key does not match");

  let head;
  try { head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); } catch { fail(404, "The file never finished uploading"); }
  const doc = {
    empId: ownerId, documentId, orgId: req.user.orgId, category, filename, key,
    size: head.ContentLength, contentType: head.ContentType, uploadedBy: req.user.name, uploadedAt: new Date().toISOString(),
  };
  await putNew(dynamoDb, T.documents, doc, "empId", "This document is already recorded");
  res.status(201).json({ data: doc });
};

export const list = async (req, res) => {
  const ownerId = req.query.employeeId || req.user.empId;
  const docs = await queryBy(dynamoDb, T.documents, "empId", ownerId);
  const visible = docs.filter((d) => d.orgId === req.user.orgId && canView(req.user, ownerId, d.category));
  res.json({ data: visible.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)) });
};

// A download link that stops working after 2 minutes
export const downloadUrl = async (req, res) => {
  const ownerId = req.query.employeeId || req.user.empId;
  const doc = await getItem(dynamoDb, T.documents, { empId: ownerId, documentId: req.params.id });
  if (!doc || doc.orgId !== req.user.orgId) fail(404, "Document not found");
  if (!canView(req.user, ownerId, doc.category)) fail(403, "You do not have access to this");
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: doc.key, ResponseContentDisposition: `attachment; filename="${doc.filename}"` }), { expiresIn: 120 });
  res.json({ data: { url, expiresIn: 120, filename: doc.filename } });
};
