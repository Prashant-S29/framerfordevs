import { sql, type SQL } from "@framerfordevs/db/query";
import { assert } from "vitest";

export interface SqlExecutor {
  execute(query: SQL): PromiseLike<{ readonly rows: ReadonlyArray<unknown> }>;
}

export interface PlanNode {
  readonly nodeType: string;
  readonly relationName: string | undefined;
  readonly indexName: string | undefined;
  readonly indexCondition: boolean;
  readonly children: ReadonlyArray<PlanNode>;
}

export interface QueryPlan {
  readonly root: PlanNode;
  readonly text: string;
}

export interface IndexedAccessExpectation {
  readonly table: string;
  readonly allowBitmap?: boolean;
  readonly indexCondition?: boolean;
  readonly order?: "index" | "index-prefix";
}

export interface IndexDefinition {
  readonly table: string;
  readonly name: string;
  readonly keys: string;
  readonly unique?: boolean;
  readonly where?: string;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalString = (value: unknown) => (typeof value === "string" ? value : undefined);

function decodePlanNode(value: unknown): PlanNode {
  if (!isRecord(value) || typeof value["Node Type"] !== "string") {
    throw new Error(`EXPLAIN returned an invalid plan node: ${JSON.stringify(value)}`);
  }
  const children = value["Plans"];
  return {
    nodeType: value["Node Type"],
    relationName: optionalString(value["Relation Name"]),
    indexName: optionalString(value["Index Name"]),
    indexCondition: typeof value["Index Cond"] === "string",
    children: Array.isArray(children) ? children.map(decodePlanNode) : [],
  };
}

export async function explainPlan(executor: SqlExecutor, query: SQL): Promise<QueryPlan> {
  const result = await executor.execute(sql`explain (format json) ${query}`);
  const row = result.rows[0];
  const document = isRecord(row) ? row["QUERY PLAN"] : undefined;
  const parsed: unknown = typeof document === "string" ? JSON.parse(document) : document;
  const statement = Array.isArray(parsed) ? parsed[0] : undefined;
  if (!isRecord(statement)) {
    throw new Error(`EXPLAIN returned an invalid document: ${JSON.stringify(result.rows)}`);
  }
  return { root: decodePlanNode(statement["Plan"]), text: JSON.stringify(statement) };
}

export function planNodes(node: PlanNode): ReadonlyArray<PlanNode> {
  return [node, ...node.children.flatMap(planNodes)];
}

const directIndexScans = new Set(["Index Scan", "Index Only Scan"]);

function hasBoundedBitmapIndexScans(node: PlanNode) {
  const indexScans = planNodes(node).filter(
    (candidate) => candidate.nodeType === "Bitmap Index Scan",
  );
  return indexScans.length > 0 && indexScans.every((candidate) => candidate.indexCondition);
}

export function assertIndexedAccess(plan: QueryPlan, expectation: IndexedAccessExpectation) {
  const { table, allowBitmap = false, indexCondition = true, order } = expectation;
  const nodes = planNodes(plan.root);
  const reads = nodes.filter((node) => node.relationName === table);
  assert.isNotEmpty(reads, `the plan does not read ${table}: ${plan.text}`);
  for (const read of reads) {
    if (directIndexScans.has(read.nodeType)) {
      if (indexCondition) {
        assert.isTrue(read.indexCondition, `${table} index scan is unbounded: ${plan.text}`);
      }
      continue;
    }
    assert.isTrue(
      allowBitmap && read.nodeType === "Bitmap Heap Scan",
      `${table} is read by ${read.nodeType} instead of an index scan: ${plan.text}`,
    );
    assert.isTrue(
      hasBoundedBitmapIndexScans(read),
      `${table} bitmap scan is unbounded: ${plan.text}`,
    );
  }
  if (order === undefined) return;
  const sorts = nodes.filter(
    (node) =>
      node.nodeType === "Sort" || (order === "index" && node.nodeType === "Incremental Sort"),
  );
  assert.isEmpty(sorts, `${table} order is not supplied by an index: ${plan.text}`);
}

export function indexDefinitionText(definition: IndexDefinition) {
  const unique = definition.unique === true ? "UNIQUE " : "";
  const where = definition.where === undefined ? "" : ` WHERE ${definition.where}`;
  return `CREATE ${unique}INDEX ${definition.name} ON public.${definition.table} USING btree (${definition.keys})${where}`;
}

export async function assertIndexDefinitions(
  executor: SqlExecutor,
  definitions: ReadonlyArray<IndexDefinition>,
) {
  for (const definition of definitions) {
    const result = await executor.execute(
      sql`select tablename, indexdef from pg_indexes where schemaname = 'public' and indexname = ${definition.name}`,
    );
    const row = result.rows[0];
    if (!isRecord(row)) assert.fail(`index ${definition.name} does not exist`);
    assert.strictEqual(row["tablename"], definition.table, `index ${definition.name} table`);
    assert.strictEqual(row["indexdef"], indexDefinitionText(definition));
  }
}

export async function assertIndexedQuery(
  executor: SqlExecutor,
  query: SQL,
  expectation: IndexedAccessExpectation,
) {
  assertIndexedAccess(await explainPlan(executor, query), expectation);
}
