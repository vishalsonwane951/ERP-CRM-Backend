import "dotenv/config";
import { CreateTableCommand, UpdateTimeToLiveCommand, waitUntilTableExists } from "@aws-sdk/client-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { TABLES } from "../config/tables.js";

configureDynamoDB();
const client = getDynamoDBClient();

const keySchema = (pk, sk) => [{ AttributeName: pk, KeyType: "HASH" }, ...(sk ? [{ AttributeName: sk, KeyType: "RANGE" }] : [])];

// Switches on the expiry attribute. Safe to repeat: "already enabled" is fine.
async function enableTtl(t) {
  await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName: t.name });
  try {
    await client.send(new UpdateTimeToLiveCommand({ TableName: t.name, TimeToLiveSpecification: { Enabled: true, AttributeName: t.ttl } }));
    console.log(`ttl on   ${t.name}.${t.ttl}`);
  } catch (e) {
    if (e.name !== "ValidationException") throw e;
  }
}

// Creates every table in config/tables.js with its indexes. Tables that already exist are skipped.
for (const t of TABLES) {
  const attributes = new Set([t.pk, t.sk, ...t.indexes.flatMap((i) => [i.pk, i.sk])].filter(Boolean));
  try {
    await client.send(new CreateTableCommand({
      TableName: t.name,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [...attributes].map((name) => ({ AttributeName: name, AttributeType: "S" })),
      KeySchema: keySchema(t.pk, t.sk),
      ...(t.indexes.length && {
        GlobalSecondaryIndexes: t.indexes.map((i) => ({ IndexName: i.name, KeySchema: keySchema(i.pk, i.sk), Projection: { ProjectionType: "ALL" } })),
      }),
    }));
    console.log(`created  ${t.name}`);
  } catch (e) {
    if (e.name === "ResourceInUseException") console.log(`exists   ${t.name}`);
    else throw e;
  }
  if (t.ttl) await enableTtl(t); // expiring items (onboarding links)
}
console.log("Done. New tables take a few seconds to become active.");
