import jwt from "jsonwebtoken";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { getOrg } from "../services/dbHelpers.js";
import { fail, HttpError, PLATFORM_ORG } from "../services/helpers.js";

configureDynamoDB();
const dynamoDb = DynamoDBDocumentClient.from(getDynamoDBClient());

/** Reads the Bearer token and puts { empId, orgId, role, name } on req.user */
export const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const p = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = { empId: p.sub, orgId: p.orgId, role: p.role, name: p.name };
    next();
  } catch {
    next(new HttpError(401, "Sign in to continue"));
  }
};

/** allow("HR_ADMIN", "FINANCE") lets those roles through. SUPER_ADMIN is always allowed. */
export const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) || req.user.role === "SUPER_ADMIN" ? next() : next(new HttpError(403, "You do not have access to this"));

/** Platform staff only: the person must belong to the "platform" organization AND have one of these roles. */
export const allowPlatform = (...roles) => (req, res, next) =>
  req.user.orgId === PLATFORM_ORG && (roles.includes(req.user.role) || req.user.role === "SUPER_ADMIN")
    ? next()
    : next(new HttpError(403, "You do not have access to this"));

/** requireFeature("payroll") answers 403 when the organization's plan / switches have that feature off (or the org is suspended). */
export const requireFeature = (feature) => async (req, res, next) => {
  if (req.user.orgId === PLATFORM_ORG) return next();
  const org = await getOrg(dynamoDb, req.user.orgId); // read every time, so a platform change applies at once
  if (org.status === "SUSPENDED") fail(403, "This organization is suspended. Contact support.");
  if (!org.features[feature]) fail(403, `${feature} is not included in your organization's plan`);
  return next();
};
