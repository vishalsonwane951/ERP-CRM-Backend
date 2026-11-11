# Muster ERP: Backend

Node.js + Express (ESM) on one DynamoDB table, with documents in S3. MVC without a model folder.

```
index.js                  app entry: middleware, routes, error handling
config/
  db.js                   DynamoDB client (configureDynamoDB / getDynamoDBClient)
  s3.js                   S3 client (configureS3 / getS3Client)
  tables.js               every table: name, PK, SK, indexes
routes/                   one small file per module: URL -> controller function
controllers/              ALL the logic for each module lives here
middleware/auth.js        authenticate (JWT) + allow(...roles)
services/                 shared helpers only (used by more than one controller)
  helpers.js              errors, validation, ids, dates, role checks
  dbHelpers.js            getItem, putItem, queryAll, updateItem, lookups, notify, audit
  approvalHelpers.js      starting / finding approvers for leave + expense requests
scripts/createTable.js    creates the table and its two indexes
scripts/seed.js           demo company, people, attendance, a pending leave request
docs/API.md               every endpoint, who can call it, payloads, responses
docs/Muster-ERP.postman_collection.json
```

Rule of thumb: a function used by one controller stays inside that controller (for example the
encryption in `employeeController`, the pay calculation in `payrollController`). It moves to
`services/` only when a second controller needs it.

Each controller starts the same way:

```js
configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);
```

## Run it

```bash
cp .env.example .env      # add your AWS keys, table prefix, bucket, secrets
npm install
npm run db:create         # once. Creates the 13 tables. Wait a few seconds for them to become active
npm run db:seed           # demo data (password for everyone: Passw0rd!)
npm run dev               # http://localhost:4000
```

Then import `docs/Muster-ERP.postman_collection.json` into Postman and read `docs/API.md`.

## Data layout: 13 tables

Plain table and attribute names, no generic key columns. Full list with keys and indexes:
`docs/Muster-ERP-DynamoDB-Tables.pdf`. The definitions live in `config/tables.js`, which
`npm run db:create` reads to create the tables.

| Table | PK | SK | Indexes (PK / SK) |
|---|---|---|---|
| erp_organizations | orgId | none | none |
| erp_employees | orgId | empId | ByManager (managerId / empId), ByEmail (email / none) |
| erp_attendance | empId | date | ByOrgDate (orgDate / empId) |
| erp_leave_balances | empId | typeId | none |
| erp_leave_requests | empId | reqId | none |
| erp_expenses | empId | reqId | none |
| erp_approvals | reqId | none | ByApprover (approverKey / createdAt), ByOrgStatus (orgStatus / createdAt) |
| erp_assets | orgId | assetId | none |
| erp_payroll_runs | orgId | period | none |
| erp_payroll_lines | runId | empId | ByEmployee (empId / period) |
| erp_documents | empId | documentId | none |
| erp_notifications | empId | notificationId | none |
| erp_audit_logs | orgId | auditId | none |

Who can see what is decided by the signed-in user's token, never by a value the client sends:
managers query their own team through `ByManager`; employees only ever read their own partition.
Set `TABLE_PREFIX` in `.env` to change the `erp_` prefix.

## Simplified compared with the v3 reference

Kept simple on purpose. Add back when you need them:

- **No MFA.** The reference requires it for HR admin, finance and super admin. Add a TOTP step to `authController.login`.
- **No SQS / EventBridge / Streams.** Notifications are written straight to the table. Dashboard and trend numbers are computed live from the attendance index (fine for a small company; use pre-aggregated counts when you grow).
- **Separate tables instead of one single table.** The v3 reference uses one table with generic keys. This version follows your brief (real index names, a clear list of tables) so each table has natural key names.
- **No multi-item transactions.** Steps run one after another. Double-decisions and double-locks are still blocked with conditions (`attribute_not_exists`, status checks). A failure between two steps can leave a leave balance out of step; add `TransactWriteItems` if that matters.
- **No retry key on check-in.** One record per person per day means a retry gets a clear 409 instead of a duplicate.
- **No shift assignment endpoints.** One company-wide shift in the organization settings.
- Pay rules (PF, professional tax, tax) in `payrollController` are examples. Payslips are shown in the browser (print to PDF).
- Document metadata is saved by `POST /documents/confirm` after the upload.
- Bucket policy, KMS encryption and IAM roles are infrastructure to set up in AWS.

## Verification

Run against an in-memory stand-in for DynamoDB that enforces each table's real keys and indexes (77 checks over every module: login, role access, check-in rules, the two-stage approval chain, escalate, cancel, payroll lock, assets, reports) and the Postman collection through Newman (53 of 59 passed; the rest need real S3 or the right login order, see docs). It has **not** been run against real AWS from here, so run `db:create`, `db:seed` and the Postman flow on your side first, especially the S3 upload steps.
