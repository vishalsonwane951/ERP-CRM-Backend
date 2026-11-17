import crypto from "crypto";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { configureS3, getS3Client } from "../config/s3.js";
import { T } from "../config/tables.js";
import {
  audit,
  getItem,
  getOrg,
  putItem,
  putNew,
  queryBy,
  updateItem,
} from "../services/dbHelpers.js";
import { decrypt, encrypt } from "../services/crypto.js";
import { fail, makeId, need, pick, TENANT_ROLES } from "../services/helpers.js";
import { mailErrorText, sendMail } from "../services/mailer.js";
import { createEmployee } from "./employeeController.js";

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);
configureS3();
const s3 = getS3Client();
const BUCKET = process.env.S3_BUCKET;

const INVITE_DAYS = 7;
const CANDIDATE_DOCS = ["identity", "bank", "certificates"]; // what a candidate may upload
const TYPES = ["application/pdf", "image/png", "image/jpeg"];
const MAX_BYTES = 10 * 1048576;
const MAX_DOCS = 15;

const linkFor = (token) =>
  `${process.env.APP_URL || "http://localhost:5173"}/onboard/${token}`;
const loadInvite = async (token) => {
  const invite = await getItem(dynamoDb, T.onboardingInvites, { token });
  if (!invite) fail(404, "This link is not valid");
  return invite;
};

// ---------- HR side (signed in) ----------
const emailInvite = async (invite, orgName) => {
  try {
    await sendMail({
      to: invite.email,
      subject: `Welcome to ${orgName}: complete your joining details`,
      text: `Hello ${invite.name},\n\nPlease fill in your joining details and upload your documents here:\n${linkFor(invite.token)}\n\nThe link works for ${INVITE_DAYS} days.\n\n${orgName}`,
    });
    return { emailSent: true };
  } catch (e) {
    return { emailSent: false, emailError: mailErrorText(e) }; // the invite exists; HR can copy the link
  }
};

export const createInvite = async (req, res) => {
  need(req.body, ["name", "email"]);
  const { orgId } = req.user;
  const role = req.body.role || "EMPLOYEE";
  if (!TENANT_ROLES.includes(role))
    fail(422, `role must be one of ${TENANT_ROLES.join(", ")}`);
  const email = req.body.email.trim().toLowerCase();
  if (
    (await queryBy(dynamoDb, T.employees, "email", email, { index: "ByEmail" }))
      .length
  )
    fail(409, "An employee with this email already exists");

  const invite = {
    token: crypto.randomBytes(32).toString("base64url"),
    orgId,
    name: req.body.name.trim(),
    email,
    role,
    ...pick(req.body, ["deptId", "designation"]),
    status: "SENT",
    documents: [],
    createdBy: req.user.name,
    createdAt: new Date().toISOString(),
    expiresAt: Math.floor(Date.now() / 1000) + INVITE_DAYS * 86400,
  };
  await putNew(dynamoDb, T.onboardingInvites, invite, "token", "Try again");
  const org = await getOrg(dynamoDb, orgId);
  const mail = await emailInvite(invite, org.name);
  await audit(
    dynamoDb,
    req.user,
    "ONBOARDING_INVITED",
    "ONBOARDING",
    invite.email,
  );
  res
    .status(201)
    .json({
      data: { ...publicView(invite), link: linkFor(invite.token), ...mail },
    });
};

// What HR's list shows. Never the submitted bank or ID numbers.
const publicView = ({
  token,
  name,
  email,
  role,
  deptId,
  designation,
  status,
  createdBy,
  createdAt,
  expiresAt,
  empId,
}) => ({
  token,
  name,
  email,
  role,
  deptId,
  designation,
  status,
  createdBy,
  createdAt,
  expiresAt,
  empId,
  expired: expiresAt * 1000 < Date.now(),
});

export const listInvites = async (req, res) => {
  const items = await queryBy(
    dynamoDb,
    T.onboardingInvites,
    "orgId",
    req.user.orgId,
    { index: "ByOrg", desc: true },
  );
  res.json({
    data: items.map((i) => ({ ...publicView(i), link: linkFor(i.token) })),
  });
};

const loadOwnInvite = async (user, token) => {
  const invite = await loadInvite(token);
  if (invite.orgId !== user.orgId) fail(404, "Invite not found");
  return invite;
};

// HR reviews the submission. Bank and ID numbers are shown here (HR can already see them on the employee card).
export const getInvite = async (req, res) => {
  const invite = await loadOwnInvite(req.user, req.params.token);
  const { bankAccountEnc, nationalIdEnc, ...rest } = invite.submission || {};
  res.json({
    data: {
      ...publicView(invite),
      link: linkFor(invite.token),
      submission: invite.submission && {
        ...rest,
        bankAccount: decrypt(bankAccountEnc),
        nationalId: decrypt(nationalIdEnc),
      },
      documents: invite.documents,
    },
  });
};

// A short-lived link to a file the candidate uploaded (HR only, own organization only)
export const documentUrl = async (req, res) => {
  const invite = await loadOwnInvite(req.user, req.params.token);
  const doc = invite.documents.find(
    (d) => d.documentId === req.params.documentId,
  );
  if (!doc) fail(404, "Document not found");
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: doc.key }),
    { expiresIn: 120 },
  );
  res.json({ data: { url, expiresIn: 120 } });
};

export const resend = async (req, res) => {
  const invite = await loadOwnInvite(req.user, req.params.token);
  if (invite.status !== "SENT") fail(409, "This invite was already completed");
  if (invite.expiresAt * 1000 < Date.now())
    fail(410, "This invite has expired. Create a new one.");
  res.json({
    data: await emailInvite(
      invite,
      (await getOrg(dynamoDb, req.user.orgId)).name,
    ),
  });
};

// Turns a submitted invite into an employee (same code as "Add person"), and files the uploaded documents on his card.
export const convert = async (req, res) => {
  const invite = await loadOwnInvite(req.user, req.params.token);
  if (invite.status !== "SUBMITTED")
    fail(409, "Only a submitted form can be converted");
  need(req.body, ["joinDate", "salary", "designation", "deptId"]);

  // claim it first: two HR people pressing the button cannot create two employees
  const claimed = await updateItem(
    dynamoDb,
    T.onboardingInvites,
    { token: invite.token },
    {
      set: { status: "CONVERTED", convertedAt: new Date().toISOString() },
      condition: {
        expr: "#c_s = :c_s",
        names: { "#c_s": "status" },
        values: { ":c_s": "SUBMITTED" },
      },
    },
  );
  if (!claimed) fail(409, "Someone already converted this invite");

  const s = invite.submission;
  let created;
  try {
    created = await createEmployee(req.user, {
      name: invite.name,
      email: invite.email,
      role: req.body.role || invite.role,
      managerId: req.body.managerId,
      ...pick(req.body, ["joinDate", "salary", "designation", "deptId"]),
      phone: s.phone,
      dob: s.dob,
      address: s.address,
      emergencyName: s.emergencyName,
      emergencyPhone: s.emergencyPhone,
      bankName: s.bankName,
      bankIfsc: s.bankIfsc,
      bankAccount: decrypt(s.bankAccountEnc),
      nationalId: decrypt(s.nationalIdEnc),
    });
  } catch (e) {
    await updateItem(
      dynamoDb,
      T.onboardingInvites,
      { token: invite.token },
      { set: { status: "SUBMITTED" }, remove: ["convertedAt"] },
    ); // let HR fix the problem and retry
    throw e;
  }
  const empId = created.employee.empId;
  await Promise.all(
    invite.documents.map((d) =>
      putItem(dynamoDb, T.documents, {
        ...d,
        empId,
        orgId: req.user.orgId,
        uploadedBy: invite.name,
      }),
    ),
  );
  await updateItem(
    dynamoDb,
    T.onboardingInvites,
    { token: invite.token },
    { set: { empId } },
  );
  await audit(dynamoDb, req.user, "ONBOARDING_CONVERTED", "EMPLOYEE", empId);
  res.status(201).json({ data: created });
};

// ---------- the candidate (public: no sign-in, the token is the key) ----------
// An invite the candidate can still work on: it exists, has not expired, and has not been submitted
const openInvite = async (token) => {
  const invite = await loadInvite(token);
  if (invite.expiresAt * 1000 < Date.now())
    fail(410, "This link has expired. Ask HR for a new one.");
  if (invite.status !== "SENT")
    fail(409, "This form was already submitted. HR will be in touch.");
  return invite;
};

export const publicShow = async (req, res) => {
  const invite = await loadInvite(req.params.token);
  const org = await getOrg(dynamoDb, invite.orgId);
  if (invite.expiresAt * 1000 < Date.now())
    fail(410, "This link has expired. Ask HR for a new one.");
  res.json({
    data: {
      orgName: org.name,
      name: invite.name,
      email: invite.email,
      status: invite.status,
      categories: CANDIDATE_DOCS,
      documents: invite.documents.map(({ documentId, category, filename }) => ({
        documentId,
        category,
        filename,
      })),
    },
  });
};

export const publicUploadUrl = async (req, res) => {
  need(req.body, ["category", "filename", "contentType"]);
  const invite = await openInvite(req.params.token);
  const { category, filename, contentType } = req.body;
  if (!CANDIDATE_DOCS.includes(category))
    fail(422, `category must be one of ${CANDIDATE_DOCS.join(", ")}`);
  if (!TYPES.includes(contentType)) fail(422, "Upload a PDF, PNG or JPG");
  if (invite.documents.length >= MAX_DOCS)
    fail(422, `You can upload up to ${MAX_DOCS} files`);
  const documentId = makeId("doc");
  const key = `${invite.orgId}/onboarding/${invite.token.slice(0, 12)}/${category}/${documentId}-${String(filename).replace(/[^\w.\-]+/g, "_")}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 300 },
  );
  res
    .status(201)
    .json({
      data: {
        documentId,
        key,
        uploadUrl,
        headers: { "Content-Type": contentType },
        expiresIn: 300,
      },
    });
};

export const publicConfirm = async (req, res) => {
  need(req.body, ["documentId", "category", "filename", "key"]);
  const invite = await openInvite(req.params.token);
  const { documentId, category, filename, key } = req.body;
  if (!CANDIDATE_DOCS.includes(category)) fail(422, "Unknown document type");
  if (
    !key.startsWith(
      `${invite.orgId}/onboarding/${invite.token.slice(0, 12)}/${category}/${documentId}-`,
    )
  )
    fail(400, "Document key does not match");

  let head;
  try {
    head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch {
    fail(404, "The file never finished uploading");
  }
  if (head.ContentLength > MAX_BYTES || !TYPES.includes(head.ContentType)) {
    // the link cannot limit size, so check after the fact and remove it
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    fail(422, "Files can be PDF, PNG or JPG, up to 10 MB");
  }
  const doc = {
    documentId,
    category,
    filename,
    key,
    size: head.ContentLength,
    contentType: head.ContentType,
    uploadedAt: new Date().toISOString(),
  };
  await updateItem(
    dynamoDb,
    T.onboardingInvites,
    { token: invite.token },
    { set: { documents: [...invite.documents, doc] } },
  );
  res.status(201).json({ data: { documentId, category, filename } });
};

const submitFields = [
  "phone",
  "dob",
  "address",
  "emergencyName",
  "emergencyPhone",
  "bankName",
  "bankIfsc",
];
export const publicSubmit = async (req, res) => {
  need(req.body, ["phone", "address", "bankAccount", "bankIfsc", "nationalId"]);
  const invite = await openInvite(req.params.token);
  if (!invite.documents.some((d) => d.category === "identity"))
    fail(422, "Upload at least one identity document");
  const submission = {
    ...pick(req.body, submitFields),
    bankAccountEnc: encrypt(req.body.bankAccount),
    nationalIdEnc: encrypt(req.body.nationalId),
    submittedAt: new Date().toISOString(),
  };
  const done = await updateItem(
    dynamoDb,
    T.onboardingInvites,
    { token: invite.token },
    {
      set: { status: "SUBMITTED", submission },
      condition: {
        expr: "#c_s = :c_s",
        names: { "#c_s": "status" },
        values: { ":c_s": "SENT" },
      },
    },
  );
  if (!done) fail(409, "This form was already submitted");
  res.status(201).json({ data: { submitted: true } });
};
