import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { configureDynamoDB, getDynamoDBClient } from "../config/db.js";
import { T } from "../config/tables.js";
import { audit, getEmployee, getItem, putItem, queryBy, updateItem } from "../services/dbHelpers.js";
import { fail, HR_ROLES, makeId, need } from "../services/helpers.js";

configureDynamoDB();
const dynamoDbClient = getDynamoDBClient();
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

const CATEGORIES = ["Laptop", "Phone", "Monitor", "Accessory", "Furniture", "Other"];
const withoutHistory = ({ history, ...asset }) => asset;
const allAssets = (orgId) => queryBy(dynamoDb, T.assets, "orgId", orgId);
const loadAsset = async (orgId, assetId) => {
  const asset = await getItem(dynamoDb, T.assets, { orgId, assetId });
  if (!asset) fail(404, "Asset not found");
  return asset;
};
// every assign / return is added to the asset's own history list
const entry = (action, emp, by, note) => ({ action, empId: emp.empId, empName: emp.name, by, note, at: new Date().toISOString() });

// HR, finance and auditors see the whole inventory; everyone else sees only what is assigned to them
export const list = async (req, res) => {
  const all = (await allAssets(req.user.orgId)).map(withoutHistory);
  const wide = [...HR_ROLES, "AUDITOR", "FINANCE"].includes(req.user.role);
  res.json({ data: wide ? all : all.filter((a) => a.assignedTo === req.user.empId) });
};

export const mine = async (req, res) => {
  res.json({ data: (await allAssets(req.user.orgId)).filter((a) => a.assignedTo === req.user.empId).map(withoutHistory) });
};

export const create = async (req, res) => {
  need(req.body, ["tag", "name", "category"]);
  if (!CATEGORIES.includes(req.body.category)) fail(422, `category must be one of ${CATEGORIES.join(", ")}`);
  const asset = {
    orgId: req.user.orgId, assetId: makeId("as"), status: "AVAILABLE", history: [], createdAt: new Date().toISOString(),
    tag: req.body.tag, name: req.body.name, category: req.body.category, serial: req.body.serial, purchaseDate: req.body.purchaseDate, value: req.body.value,
  };
  await putItem(dynamoDb, T.assets, asset);
  res.status(201).json({ data: withoutHistory(asset) });
};

export const assign = async (req, res) => {
  need(req.body, ["empId"]);
  const asset = await loadAsset(req.user.orgId, req.params.id);
  const emp = await getEmployee(dynamoDb, req.user.orgId, req.body.empId);
  const updated = await updateItem(dynamoDb, T.assets, { orgId: asset.orgId, assetId: asset.assetId }, {
    set: { status: "ASSIGNED", assignedTo: emp.empId, assignedToName: emp.name, assignedAt: new Date().toISOString(), history: [...(asset.history || []), entry("ASSIGNED", emp, req.user.name, req.body.note)] },
    condition: { expr: "#c_s = :c_s", names: { "#c_s": "status" }, values: { ":c_s": "AVAILABLE" } }, // cannot be given to two people
  });
  if (!updated) fail(409, "This asset is not available");
  await audit(dynamoDb, req.user, "ASSET_ASSIGNED", "ASSET", asset.assetId);
  res.json({ data: withoutHistory(updated) });
};

export const giveBack = async (req, res) => {
  const asset = await loadAsset(req.user.orgId, req.params.id);
  if (asset.status !== "ASSIGNED") fail(409, "This asset is not assigned to anyone");
  const emp = await getEmployee(dynamoDb, req.user.orgId, asset.assignedTo);
  const updated = await updateItem(dynamoDb, T.assets, { orgId: asset.orgId, assetId: asset.assetId }, {
    set: { status: "AVAILABLE", history: [...(asset.history || []), entry("RETURNED", emp, req.user.name, req.body.note)] },
    remove: ["assignedTo", "assignedToName", "assignedAt"],
  });
  await audit(dynamoDb, req.user, "ASSET_RETURNED", "ASSET", asset.assetId);
  res.json({ data: withoutHistory(updated) });
};

export const history = async (req, res) => {
  const asset = await loadAsset(req.user.orgId, req.params.id);
  res.json({ data: [...(asset.history || [])].reverse() }); // newest first
};
