import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { queryBy } from "../services/dbHelpers.js";

configureDynamoDB();
const dynamoDb = DynamoDBDocumentClient.from(getDynamoDBClient());

async function main() {
  const email = process.env.SUPERADMIN_EMAIL?.toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD;
  const name = process.env.SUPERADMIN_NAME || "Super Admin";

if (!email || !password) {
    throw new Error("Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD in .env");
  }

  // Stop if this email already exists
  const [existing] = await queryBy(dynamoDb, T.employees, "email", email, {
    index: "ByEmail",
  });
  if (existing) {
    console.log("A user with this email already exists. Nothing changed.");
    return;
  }

  // Create the super admin directly in the employees table
  await dynamoDb.send(
    new PutCommand({
      TableName: T.employees,
      Item: {
        orgId: "platform", // required: it is the partition key of employees
        empId: randomUUID(), // required: it is the sort key of employees
        name,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        designation: "Super Admin",
        deptId: null,
        empCode: null,
        managerId: null,
      },
    }),
  );

  console.log(`Super admin created: ${email}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});