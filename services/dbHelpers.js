import {
  GetCommand,
  PutCommand,
  QueryCommand,
<<<<<<< HEAD
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { T } from "../config/tables.js";
import { clean, fail, makeId, HR_ROLES } from "./helpers.js";
=======
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { T } from "../config/tables.js";
import { clean, fail, makeId, FEATURES, featureFlags, HR_ROLES, TEAM_LEAD_ROLES } from "./helpers.js";
>>>>>>> master

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
<<<<<<< HEAD
        ConditionExpression: `attribute_not_exists(${keyName})`,
=======
        // aliased with #k because many names are DynamoDB reserved words (token, status, name, date, ...)
        ConditionExpression: "attribute_not_exists(#k)",
        ExpressionAttributeNames: { "#k": keyName },
>>>>>>> master
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
<<<<<<< HEAD
=======
/** Every item of a small table (platform screens only: organizations, plans, employee counts). `fields` = attributes to return. */
export const scanAll = async (db, table, fields) => {
  const names = fields && Object.fromEntries(fields.map((f, i) => [`#f${i}`, f]));
  const items = [];
  let lastKey;
  do {
    const result = await db.send(
      new ScanCommand({
        TableName: table,
        ExclusiveStartKey: lastKey,
        ...(fields && { ProjectionExpression: Object.keys(names).join(", "), ExpressionAttributeNames: names }),
      }),
    );
    items.push(...(result.Items ?? []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
};

>>>>>>> master
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
<<<<<<< HEAD
    departments: [],
    leaveTypes: [],
    ...org,
=======
    maxBreaksPerDay: 0, // 0 = breaks are off until HR sets a number
    breakAllowedAfterMinutes: null, // null = a break is allowed any time after check-in
    cycleStartDay: 1, // 1 = calendar month, 26 = pay cycle runs 26th to 25th
    holidays: [], // [{ date: "2026-10-02", name: "Gandhi Jayanti" }]
    departments: [],
    leaveTypes: [],
    ...org,
    // an organization saved before plans existed has every feature on
    features: { ...featureFlags(FEATURES), ...org.features },
>>>>>>> master
  };
};

export const getEmployee = async (db, orgId, empId) => {
  const emp = await getItem(db, T.employees, { orgId, empId });
  if (!emp) fail(404, "Employee not found");
  return emp;
};

export const listEmployees = (db, orgId) =>
  queryBy(db, T.employees, "orgId", orgId);

<<<<<<< HEAD
/** Who the caller may list: a manager sees their direct reports, HR/finance/auditor see everyone */
export const listVisibleEmployees = (db, user) => {
  if (user.role === "MANAGER")
    return queryBy(db, T.employees, "managerId", user.empId, {
      index: "ByManager",
    });
=======
/**
 * Everyone below this person in the reporting line, at every level (uses managerId + the ByManager index).
 * A MANAGER gets his project managers and their members, a PROJECT_MANAGER gets his members.
 * The person himself is not included. Another manager's people are never reached.
 */
export const getTeamTree = async (db, user) => {
  const people = [];
  const seen = new Set([user.empId]); // stops a loop if two people ever point at each other
  let level = [user.empId];
  while (level.length) {
    const lists = await Promise.all(level.map((id) => queryBy(db, T.employees, "managerId", id, { index: "ByManager" })));
    level = [];
    for (const e of lists.flat()) {
      if (e.orgId !== user.orgId || seen.has(e.empId)) continue;
      seen.add(e.empId);
      people.push(e);
      level.push(e.empId);
    }
  }
  return people;
};

/** Own record; HR, finance and auditors see everyone; a manager / project manager sees his team tree */
export const canViewEmployee = async (db, user, emp) => {
  if (emp.empId === user.empId || [...HR_ROLES, "FINANCE", "AUDITOR"].includes(user.role)) return true;
  if (!TEAM_LEAD_ROLES.includes(user.role)) return false;
  return (await getTeamTree(db, user)).some((e) => e.empId === emp.empId);
};

/** Who the caller may list: managers see their team tree, HR/finance/auditor see everyone */
export const listVisibleEmployees = (db, user) => {
  if (TEAM_LEAD_ROLES.includes(user.role)) return getTeamTree(db, user);
>>>>>>> master
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
<<<<<<< HEAD
};
=======
};
>>>>>>> master
