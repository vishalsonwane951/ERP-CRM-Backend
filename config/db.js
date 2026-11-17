import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import "dotenv/config";
let dynamoDBClient;

const configureDynamoDB = () => {
  if (!dynamoDBClient) {
    try {
      // Configure the DynamoDB client only once
      dynamoDBClient = new DynamoDBClient({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
      console.log(`DynamoDB configured for region: ${process.env.AWS_REGION}`);
    } catch (error) {
      console.error("Error configuring DynamoDB:", error);
      process.exit(1); // Exit the process if configuration fails
    }
  }
};

const getDynamoDBClient = () => {
  if (!dynamoDBClient) {
    // Ensure DynamoDB is configured if it hasn't been done yet
    configureDynamoDB();
  }
  return dynamoDBClient;
};

export { configureDynamoDB, getDynamoDBClient };
