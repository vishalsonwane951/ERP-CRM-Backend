import { S3Client } from "@aws-sdk/client-s3";
import "dotenv/config";
let s3Client;

const configureS3 = () => {
  if (!s3Client) {
    try {
      // Configure the S3 client only once
      s3Client = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
      console.log(`S3 configured for region: ${process.env.AWS_REGION}`);
    } catch (error) {
      console.error("Error configuring S3:", error);
      process.exit(1);
    }
  }
};

const getS3Client = () => {
  if (!s3Client) {
    configureS3();
  }
  return s3Client;
};

export { configureS3, getS3Client };
