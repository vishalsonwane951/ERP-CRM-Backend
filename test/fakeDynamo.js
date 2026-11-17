import { TABLES } from "../config/tables.js";

// A small in-memory stand-in for DynamoDB, so the business rules can be tested without AWS.
// It understands the commands and condition expressions this project actually uses. Not a general DynamoDB.
const byName = Object.fromEntries(TABLES.map((t) => [t.name, t]));

export const createFakeDb = () => {
  const data = {};
  const rows = (name) => (data[name] ??= new Map());
  const keyOf = (t, item) => (t.sk ? `${item[t.pk]}\u0000${item[t.sk]}` : `${item[t.pk]}`);
  const copy = (x) => (x === undefined ? x : structuredClone(x));

  // "#c_s IN (:a, :b) AND attribute_not_exists(#x)"  ->  JavaScript, evaluated against the item
  const test = (expr, names = {}, values = {}, item = {}) => {
    const A = (n) => item[names[n] ?? n];
    const V = (v) => values[v];
    const js = expr
      .replace(/attribute_not_exists\(([#\w]+)\)/g, (_, n) => `(A("${n}")===undefined)`)
      .replace(/attribute_exists\(([#\w]+)\)/g, (_, n) => `(A("${n}")!==undefined)`)
      .replace(/(#\w+)\s+IN\s+\(([^)]*)\)/g, (_, n, list) => `([${list.split(",").map((v) => `V("${v.trim()}")`).join(",")}].includes(A("${n}")))`)
      .replace(/<>/g, "!==").replace(/(?<![<>!=])=(?!=)/g, "===").replace(/\bAND\b/g, "&&").replace(/\bOR\b/g, "||")
      .replace(/(#\w+)(?![\w"])/g, (_, n) => `A("${n}")`).replace(/(:\w+)(?![\w"])/g, (_, v) => `V("${v}")`);
    return new Function("A", "V", `return (${js});`)(A, V);
  };
  const failCondition = () => Object.assign(new Error("The conditional request failed"), { name: "ConditionalCheckFailedException" });

  const applyUpdate = (item, expr, names, values) => {
    const out = copy(item);
    for (const part of expr.matchAll(/(SET|ADD|REMOVE)\s+(.*?)(?=\s(?:SET|ADD|REMOVE)\s|$)/g)) {
      for (const piece of part[2].split(/,\s*/)) {
        if (part[1] === "SET") { const [n, v] = piece.split(/\s*=\s*/); out[names[n.trim()]] = copy(values[v.trim()]); }
        if (part[1] === "ADD") { const [n, v] = piece.trim().split(/\s+/); out[names[n]] = (out[names[n]] || 0) + values[v]; }
        if (part[1] === "REMOVE") delete out[names[piece.trim()]];
      }
    }
    return out;
  };

  return {
    data,
    send: async (cmd) => {
      const i = cmd.input;
      const kind = cmd.constructor.name;
      const t = byName[i.TableName];
      if (kind === "GetCommand") return { Item: copy(rows(i.TableName).get(keyOf(t, i.Key))) };
      if (kind === "PutCommand") {
        const old = rows(i.TableName).get(keyOf(t, i.Item));
        if (i.ConditionExpression && !test(i.ConditionExpression, i.ExpressionAttributeNames, i.ExpressionAttributeValues, old || {})) throw failCondition();
        rows(i.TableName).set(keyOf(t, i.Item), copy(i.Item));
        return {};
      }
      if (kind === "DeleteCommand") { rows(i.TableName).delete(keyOf(t, i.Key)); return {}; }
      if (kind === "UpdateCommand") {
        const old = rows(i.TableName).get(keyOf(t, i.Key));
        if (i.ConditionExpression && !test(i.ConditionExpression, i.ExpressionAttributeNames, i.ExpressionAttributeValues, old || {})) throw failCondition();
        const next = applyUpdate(old || { ...i.Key }, i.UpdateExpression, i.ExpressionAttributeNames || {}, i.ExpressionAttributeValues || {});
        rows(i.TableName).set(keyOf(t, i.Key), next);
        return { Attributes: copy(next) };
      }
      if (kind === "ScanCommand") return { Items: [...rows(i.TableName).values()].map(copy) };
      if (kind === "QueryCommand") {
        const n = i.ExpressionAttributeNames; const v = i.ExpressionAttributeValues;
        const index = t.indexes.find((x) => x.name === i.IndexName);
        const skField = n["#sk"] || (index ? index.sk : t.sk);
        let items = [...rows(i.TableName).values()].filter((x) => x[n["#pk"]] === v[":pk"]);
        if (i.KeyConditionExpression.includes("begins_with")) items = items.filter((x) => String(x[skField]).startsWith(v[":begins"]));
        if (i.KeyConditionExpression.includes("BETWEEN")) items = items.filter((x) => x[skField] >= v[":from"] && x[skField] <= v[":to"]);
        items.sort((a, b) => String(a[skField]).localeCompare(String(b[skField])));
        if (i.ScanIndexForward === false) items.reverse();
        return { Items: items.slice(0, i.Limit || items.length).map(copy) };
      }
      throw new Error(`fake db: ${kind} is not supported`);
    },
  };
};
