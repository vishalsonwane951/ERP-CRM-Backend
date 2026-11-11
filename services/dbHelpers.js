import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { T } from "../config/tables.js";
import { clean, fail, makeId, HR_ROLES } from "./helpers.js";

export const getItem = async (db, table, key) =>
  (await db.send(new GetCommand({ TableName: table, Key: key }))).Item;

export const putItem = (db, table, item) =>
  db.send(new PutCommand({ TableName: table, Item: clean(item) }));

/** Insert only if this key is new; otherwise respond 409. `keyName` is the table's partition key attribute. */
export const putNew = async (db, table, item, keyName, conflictMessage) => {
  try {
    await db.send(
      new PutCommand({
        TableName: table,
        Item: clean(item),
        ConditionExpression: `attribute_not_exists(${keyName})`,
      }),
    );
  } catch (e) {
    if (e.name === "ConditionalCheckFailedException")
      fail(409, conflictMessage);
    throw e;
  }
};

/**
 * All items with partition key `pkName = pkValue`.
 * options: index (index name), skName + begins | from/to (sort key filter), desc (newest first), limit (first N only)
 */

// Build the "sort key" part of the query (optional)
function buildSortKeyCondition(options) {
  const { skName, begins, from, to } = options;

  if (begins !== undefined) {
    return {
      expression: " AND begins_with(#sk, :begins)",
      names: { "#sk": skName },
      values: { ":begins": begins },
    };
  }

  if (from !== undefined) {
    return {
      expression: " AND #sk BETWEEN :from AND :to",
      names: { "#sk": skName },
      values: { ":from": from, ":to": to },
    };
  }

  // No sort key filter
  return { expression: "", names: {}, values: {} };
}

export const queryBy = async (db, table, pkName, pkValue, options = {}) => {
  const sortKey = buildSortKeyCondition(options);

  // Query settings that stay the same for every page
  const baseParams = {
    TableName: table,
    IndexName: options.index,
    KeyConditionExpression: "#pk = :pk" + sortKey.expression,
    ExpressionAttributeNames: { "#pk": pkName, ...sortKey.names },
    ExpressionAttributeValues: { ":pk": pkValue, ...sortKey.values },
    ScanIndexForward: !options.desc, // desc = newest first
    Limit: options.limit,
  };

  // A limit means "just the first page"
  if (options.limit) {
    const result = await db.send(new QueryCommand(baseParams));
    return result.Items ?? [];
  }

  // No limit: keep fetching pages until there are no more
  const items = [];
  let lastKey;

  do {
    const result = await db.send(
      new QueryCommand({ ...baseParams, ExclusiveStartKey: lastKey }),
    );
    items.push(...(result.Items ?? []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
};
/**
 * Update an item. Pass { set, add, remove, condition }.
 * Returns the updated item, or null when the `condition` was not met.
 * condition = { expr, names, values } using #c_ and :c_ placeholders.
 */
export const updateItem = async (
  db,
  table,
  key,
  { set = {}, add = {}, remove = [], condition } = {},
) => {
  const names = {};
  const values = {};
  const parts = { SET: [], ADD: [], REMOVE: [] };
  let n = 0;
  for (const [k, v] of Object.entries(clean(set))) {
    names[`#s${n}`] = k;
    values[`:s${n}`] = v;
    parts.SET.push(`#s${n} = :s${n}`);
    n++;
  }
  for (const [k, v] of Object.entries(add)) {
    names[`#s${n}`] = k;
    values[`:s${n}`] = v;
    parts.ADD.push(`#s${n} :s${n}`);
    n++;
  }
  for (const k of remove) {
    names[`#s${n}`] = k;
    parts.REMOVE.push(`#s${n}`);
    n++;
  }
  const expression = Object.entries(parts)
    .filter(([, v]) => v.length)
    .map(([k, v]) => `${k} ${v.join(", ")}`)
    .join(" ");
  Object.assign(names, condition?.names);
  Object.assign(values, condition?.values);
  try {
    const r = await db.send(
      new UpdateCommand({
        TableName: table,
        Key: key,
        UpdateExpression: expression,
        ExpressionAttributeNames: names,
        ...(Object.keys(values).length && {
          ExpressionAttributeValues: values,
        }),
        ConditionExpression: condition?.expr,
        ReturnValues: "ALL_NEW",
      }),
    );
    return r.Attributes;
  } catch (e) {
    if (e.name === "ConditionalCheckFailedException") return null;
    throw e;
  }
};

// ---------- common lookups ----------
export const getOrg = async (db, orgId) => {
  const org = await getItem(db, T.organizations, { orgId });
  if (!org) fail(404, "Organization not found");
  return {
    timezone: "Asia/Kolkata",
    shiftName: "General",
    shiftStart: "09:30",
    shiftEnd: "18:30",
    graceMinutes: 10,
    halfDayAfterMinutes: 120,
    departments: [],
    leaveTypes: [],
    ...org,
  };
};

export const getEmployee = async (db, orgId, empId) => {
  const emp = await getItem(db, T.employees, { orgId, empId });
  if (!emp) fail(404, "Employee not found");
  return emp;
};

export const listEmployees = (db, orgId) =>
  queryBy(db, T.employees, "orgId", orgId);

/** Who the caller may list: a manager sees their direct reports, HR/finance/auditor see everyone */
export const listVisibleEmployees = (db, user) => {
  if (user.role === "MANAGER")
    return queryBy(db, T.employees, "managerId", user.empId, {
      index: "ByManager",
    });
  if ([...HR_ROLES, "FINANCE", "AUDITOR"].includes(user.role))
    return listEmployees(db, user.orgId);
  return fail(403, "Only managers and HR can list people");
};

// ---------- notifications & audit trail ----------
export const notify = (db, empId, title, body, link) => {
  if (!empId) return null;
  const createdAt = new Date().toISOString();
  return putItem(db, T.notifications, {
    empId,
    notificationId: `${createdAt}#${makeId("n")}`,
    title,
    body,
    link,
    read: false,
    createdAt,
  });
};

export const audit = (db, user, action, entityType, entityId) => {
  const at = new Date().toISOString();
  return putItem(db, T.auditLogs, {
    orgId: user.orgId,
    auditId: `${at}#${makeId("a")}`,
    at,
    actorId: user.empId,
    actorName: user.name,
    actorRole: user.role,
    action,
    entityType,
    entityId,
  });
};
