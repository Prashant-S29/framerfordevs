// Emits JSON Schema with the exact v3 `JSONSchema.make` semantics from an Effect v4 AST, so released contract artifacts stay byte-stable.

import { Schema, SchemaAST } from "effect";

export type JsonSchemaObject = { [key: string]: unknown };

export interface JsonSchemaRoot extends JsonSchemaObject {
  readonly $schema: string;
  readonly $defs?: Record<string, JsonSchemaObject>;
}

type IdentifierMode = "handle-identifier" | "ignore-identifier";

/** A v4 node viewed as the v3 refinement chain made of its first `depth` checks. */
interface Node {
  readonly ast: SchemaAST.AST;
  readonly depth: number;
}

interface CheckView {
  readonly annotations: Readonly<Record<string, unknown>>;
}

const constNever = { $id: "/schemas/never", not: {} };
const constAny = { $id: "/schemas/any" };
const constUnknown = { $id: "/schemas/unknown" };
const constVoid = { $id: "/schemas/void" };
const constObject = { $id: "/schemas/object", anyOf: [{ type: "object" }, { type: "array" }] };
/** v3 built-in keyword annotations that JSON Schema output keeps. */
const keywordAnnotations: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  Never: { title: "never" },
  Void: { title: "void" },
  Unknown: { title: "unknown" },
  Any: { title: "any" },
  ObjectKeyword: {
    title: "object",
    description: "an object in the TypeScript meaning, i.e. the `object` type",
  },
};

const constEmptyStruct = {
  $id: "/schemas/%7B%7D",
  anyOf: [{ type: "object" }, { type: "array" }],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): boolean {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isRecord(value)) {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) return false;
    return Object.values(value).every(isJsonValue);
  }
  return false;
}

function checksOf(ast: SchemaAST.AST): ReadonlyArray<CheckView> {
  const out: Array<CheckView> = [];
  for (const check of ast.checks ?? []) out.push({ annotations: check.annotations ?? {} });
  return out;
}

function annotationsOf(node: Node): Readonly<Record<string, unknown>> {
  if (node.depth > 0) return checksOf(node.ast)[node.depth - 1]?.annotations ?? {};
  return node.ast.annotations ?? {};
}

function full(ast: SchemaAST.AST): Node {
  return { ast, depth: checksOf(ast).length };
}

function stringAnnotation(
  annotations: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = annotations[key];
  return typeof value === "string" ? value : undefined;
}

function identifierOf(node: Node): string | undefined {
  const id = stringAnnotation(annotationsOf(node), "identifier");
  if (id !== undefined) return id;
  if (node.ast._tag === "Suspend" && node.depth === 0) return identifierOf(full(node.ast.thunk()));
  return undefined;
}

/** v3 title/description/default/examples for a node. */
function jsonAnnotations(
  annotations: Readonly<Record<string, unknown>>,
): JsonSchemaObject | undefined {
  const out: JsonSchemaObject = {};
  const description = stringAnnotation(annotations, "description");
  const title = stringAnnotation(annotations, "title");
  if (description !== undefined) out["description"] = description;
  if (title !== undefined) out["title"] = title;
  if ("default" in annotations && isJsonValue(annotations["default"])) {
    out["default"] = annotations["default"];
  }
  const examples = annotations["examples"];
  if (Array.isArray(examples)) {
    const encoded = examples.filter(isJsonValue);
    if (encoded.length > 0) out["examples"] = encoded;
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

function addAnnotations(
  schema: JsonSchemaObject,
  annotations: JsonSchemaObject | undefined,
): JsonSchemaObject {
  if (annotations === undefined) return schema;
  if ("$ref" in schema) return { allOf: [schema], ...annotations };
  return { ...schema, ...annotations };
}

/** Rebuilds the v3 refinement hook and default annotations for a v4 check. */
function refinementOf(
  node: Node,
  isArray: boolean,
): { readonly hook: JsonSchemaObject; readonly annotations: JsonSchemaObject } | undefined {
  const annotations = annotationsOf(node);
  const custom = annotations["jsonSchema"];
  const representation = annotations["representation"];
  const own = jsonAnnotations(annotations) ?? {};
  if (isRecord(custom)) return { hook: custom, annotations: own };
  if (!isRecord(representation)) return undefined;
  const id = representation["id"];
  const payload = isRecord(representation["payload"]) ? representation["payload"] : {};
  const number = (key: string): number => {
    const value = payload[key];
    return typeof value === "number" ? value : Number(value);
  };
  const defaults = (title: string | undefined, description: string): JsonSchemaObject =>
    title === undefined ? { description } : { title, description };
  let hook: JsonSchemaObject;
  let base: JsonSchemaObject;
  switch (id) {
    case "effect/schema/isMinLength": {
      const n = number("minLength");
      hook = isArray ? { minItems: n } : { minLength: n };
      base = isArray
        ? defaults(`minItems(${n})`, `an array of at least ${n} item(s)`)
        : defaults(`minLength(${n})`, `a string at least ${n} character(s) long`);
      break;
    }
    case "effect/schema/isMaxLength": {
      const n = number("maxLength");
      hook = isArray ? { maxItems: n } : { maxLength: n };
      base = isArray
        ? defaults(`maxItems(${n})`, `an array of at most ${n} item(s)`)
        : defaults(`maxLength(${n})`, `a string at most ${n} character(s) long`);
      break;
    }
    case "effect/schema/isBetweenLength": {
      const min = number("minimum");
      const max = number("maximum");
      if (isArray) {
        hook = { minItems: min, maxItems: max };
        base =
          min === max
            ? defaults(`itemsCount(${min})`, `an array of exactly ${min} item(s)`)
            : defaults(undefined, `an array of at least ${min} and at most ${max} item(s)`);
      } else if (min === max) {
        hook = { minLength: min, maxLength: min };
        base = defaults(
          `length(${min})`,
          min === 1 ? "a single character" : `a string ${min} character(s) long`,
        );
      } else {
        hook = { minLength: min, maxLength: max };
        base = defaults(
          `length({ min: ${min}, max: ${max})`,
          `a string at least ${min} character(s) and at most ${max} character(s) long`,
        );
      }
      break;
    }
    case "effect/schema/isPattern": {
      const source = String(payload["source"]);
      hook = { pattern: source };
      base = defaults(undefined, `a string matching the pattern ${source}`);
      break;
    }
    case "effect/schema/isInt":
      hook = { type: "integer" };
      base = defaults("int", "an integer");
      break;
    case "effect/schema/isFinite":
      hook = {};
      base = defaults("finite", "a finite number");
      break;
    case "effect/schema/isBetween": {
      const min = number("minimum");
      const max = number("maximum");
      hook = { minimum: min, maximum: max };
      base = defaults(`between(${min}, ${max})`, `a number between ${min} and ${max}`);
      break;
    }
    case "effect/schema/isGreaterThanOrEqualTo": {
      const n = number("minimum");
      hook = { minimum: n };
      base = defaults(
        `greaterThanOrEqualTo(${n})`,
        n === 0 ? "a non-negative number" : `a number greater than or equal to ${n}`,
      );
      break;
    }
    case "effect/schema/isGreaterThan": {
      const n = number("exclusiveMinimum");
      hook = { exclusiveMinimum: n };
      base = defaults(
        `greaterThan(${n})`,
        n === 0 ? "a positive number" : `a number greater than ${n}`,
      );
      break;
    }
    case "effect/schema/isLessThanOrEqualTo": {
      const n = number("maximum");
      hook = { maximum: n };
      base = defaults(
        `lessThanOrEqualTo(${n})`,
        n === 0 ? "a non-positive number" : `a number less than or equal to ${n}`,
      );
      break;
    }
    case "effect/schema/isLessThan": {
      const n = number("exclusiveMaximum");
      hook = { exclusiveMaximum: n };
      base = defaults(`lessThan(${n})`, n === 0 ? "a negative number" : `a number less than ${n}`);
      break;
    }
    case "effect/schema/isMultipleOf": {
      const n = number("divisor");
      hook = { multipleOf: n };
      base = defaults(`multipleOf(${n})`, `a number divisible by ${n}`);
      break;
    }
    default:
      return undefined;
  }
  return { hook, annotations: jsonAnnotations({ ...base, ...annotations }) ?? {} };
}

function isOverride(node: Node, hook: JsonSchemaObject): boolean {
  if (node.depth > 0) {
    const representation = annotationsOf(node)["representation"];
    if (isRecord(representation) && representation["id"] === "effect/schema/isInt") {
      return "type" in hook && hook["type"] !== "integer";
    }
  }
  return "type" in hook || "oneOf" in hook || "anyOf" in hook || "$ref" in hook;
}

function mergeRefinements(
  from: JsonSchemaObject,
  hook: JsonSchemaObject,
  annotations: JsonSchemaObject,
): JsonSchemaObject {
  const out: JsonSchemaObject = { ...from, ...annotations, ...hook };
  let allOf: Array<JsonSchemaObject> = Array.isArray(out["allOf"]) ? [...out["allOf"]] : [];
  const handle = (name: string, keep: (item: JsonSchemaObject) => boolean) => {
    if (name in hook && name in from) {
      allOf.unshift({ [name]: from[name] });
      allOf = allOf.filter(keep);
    }
  };
  const num = (value: unknown) => (typeof value === "number" ? value : Number.NaN);
  handle("minLength", (i) => num(i["minLength"]) > num(hook["minLength"]));
  handle("maxLength", (i) => num(i["maxLength"]) < num(hook["maxLength"]));
  handle("pattern", (i) => i["pattern"] !== hook["pattern"]);
  handle("minItems", (i) => num(i["minItems"]) > num(hook["minItems"]));
  handle("maxItems", (i) => num(i["maxItems"]) < num(hook["maxItems"]));
  handle("minimum", (i) => num(i["minimum"]) > num(hook["minimum"]));
  handle("maximum", (i) => num(i["maximum"]) < num(hook["maximum"]));
  handle("exclusiveMinimum", (i) => num(i["exclusiveMinimum"]) > num(hook["exclusiveMinimum"]));
  handle("exclusiveMaximum", (i) => num(i["exclusiveMaximum"]) < num(hook["exclusiveMaximum"]));
  handle("multipleOf", (i) => i["multipleOf"] !== hook["multipleOf"]);
  if (allOf.length === 0) delete out["allOf"];
  else out["allOf"] = allOf;
  return out;
}

function encodedFrom(ast: SchemaAST.AST): SchemaAST.AST | undefined {
  const links = ast.encoding;
  if (links === undefined) return undefined;
  return links[links.length - 1]?.to;
}

/** v3 `getTransformationFrom`: the encoded side under a refinement chain. */
function transformationFrom(ast: SchemaAST.AST): SchemaAST.AST | undefined {
  const from = encodedFrom(ast);
  if (from !== undefined) return from;
  if (ast._tag === "Suspend") return transformationFrom(ast.thunk());
  return undefined;
}

function isUndefinedAst(ast: SchemaAST.AST): boolean {
  return ast._tag === "Undefined" && checksOf(ast).length === 0;
}

/** v3 `pruneUndefined`: the members left after removing `undefined`, or undefined when nothing was pruned. */
function pruneUndefined(ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> | undefined {
  if (annotationsOf(full(ast))["jsonSchema"] !== undefined) return undefined;
  if (isUndefinedAst(ast)) return [];
  if (ast._tag === "Union" && checksOf(ast).length === 0 && ast.encoding === undefined) {
    const kept: Array<SchemaAST.AST> = [];
    let pruned = false;
    for (const member of ast.types) {
      const result = pruneUndefined(member);
      if (result === undefined) kept.push(member);
      else {
        pruned = true;
        kept.push(...result);
      }
    }
    return pruned ? kept : undefined;
  }
  const from = encodedFrom(ast);
  if (from !== undefined) return pruneUndefined(from);
  return undefined;
}

/** Emits v3 `Union.make(members)`: no annotations, a single member collapses to itself. */
function goMembers(
  members: ReadonlyArray<SchemaAST.AST>,
  defs: Record<string, JsonSchemaObject>,
  path: ReadonlyArray<PropertyKey>,
): JsonSchemaObject {
  const [only] = members;
  if (members.length === 0) return constNever;
  if (members.length === 1 && only !== undefined)
    return go(full(only), defs, "handle-identifier", path);
  const anyOf = compactUnion(
    members.map((member) => go(full(member), defs, "handle-identifier", path)),
  );
  const [single] = anyOf;
  if (anyOf.length === 0) return constNever;
  if (anyOf.length === 1 && single !== undefined) return single;
  return { anyOf };
}

function isCompactableLiteral(schema: JsonSchemaObject | undefined): schema is JsonSchemaObject {
  return (
    schema !== undefined && "enum" in schema && "type" in schema && Object.keys(schema).length === 2
  );
}

function isNeverWithoutCustomAnnotations(schema: JsonSchemaObject): boolean {
  return (
    schema === constNever || (schema["$id"] === constNever.$id && Object.keys(schema).length === 2)
  );
}

function compactUnion(members: ReadonlyArray<JsonSchemaObject>): Array<JsonSchemaObject> {
  const out: Array<JsonSchemaObject> = [];
  for (const member of members) {
    if (isNeverWithoutCustomAnnotations(member)) continue;
    const id = member["$id"];
    if (id === constAny.$id || id === constUnknown.$id || id === constVoid.$id) return [member];
    const last = out[out.length - 1];
    if (
      isCompactableLiteral(member) &&
      isCompactableLiteral(last) &&
      last["type"] === member["type"]
    ) {
      const lastEnum = Array.isArray(last["enum"]) ? last["enum"] : [];
      const memberEnum = Array.isArray(member["enum"]) ? member["enum"] : [];
      out[out.length - 1] = { type: last["type"], enum: [...lastEnum, ...memberEnum] };
      continue;
    }
    out.push(member);
  }
  return out;
}

function pathText(path: ReadonlyArray<PropertyKey>): string {
  return path.length === 0 ? "root" : path.map((key) => String(key)).join(".");
}

function baseAst(node: Node): SchemaAST.AST {
  return node.ast;
}

function go(
  node: Node,
  defs: Record<string, JsonSchemaObject>,
  identifier: IdentifierMode,
  path: ReadonlyArray<PropertyKey>,
  annotation: "handle-annotation" | "ignore-annotation" = "handle-annotation",
): JsonSchemaObject {
  if (identifier === "handle-identifier") {
    const id = identifierOf(node);
    if (id !== undefined) {
      const escaped = id.replace(/~/gu, "~0").replace(/\//gu, "~1");
      const ref = { $ref: `#/$defs/${escaped}` };
      if (!Object.hasOwn(defs, id)) {
        defs[id] = ref;
        defs[id] = go(node, defs, "ignore-identifier", path);
      }
      return ref;
    }
  }

  const ast = baseAst(node);
  if (node.depth > 0) {
    const refinement = refinementOf(node, ast._tag === "Arrays");
    const previous: Node = { ast, depth: node.depth - 1 };
    if (refinement === undefined) return go(previous, defs, identifier, path);
    if (isOverride(node, refinement.hook)) return refinement.hook;
    const from = transformationFrom(ast);
    if (from !== undefined) return go(full(from), defs, identifier, path);
    return mergeRefinements(
      go(previous, defs, identifier, path),
      refinement.hook,
      refinement.annotations,
    );
  }

  const own = annotationsOf(node);
  const custom = own["jsonSchema"];
  if (annotation === "handle-annotation" && isRecord(custom)) {
    if (isOverride(node, custom)) {
      return ast._tag === "Declaration" ? addAnnotations(custom, jsonAnnotations(own)) : custom;
    }
    return { ...go(node, defs, identifier, path, "ignore-annotation"), ...custom };
  }

  const from = encodedFrom(ast);
  if (from !== undefined) {
    return addAnnotations(go(full(from), defs, identifier, path), jsonAnnotations(own));
  }

  const keyword = keywordAnnotations[ast._tag];
  const annotate = (schema: JsonSchemaObject) =>
    addAnnotations(schema, jsonAnnotations(keyword === undefined ? own : { ...keyword, ...own }));
  switch (ast._tag) {
    case "Declaration":
    case "Undefined":
    case "BigInt":
    case "UniqueSymbol":
    case "Symbol":
      throw new Error(`Missing JSON Schema annotation for ${ast._tag} at ${pathText(path)}.`);
    case "Suspend":
      if (identifier === "handle-identifier") {
        throw new Error(`Missing identifier annotation for Suspend at ${pathText(path)}.`);
      }
      return go(full(ast.thunk()), defs, "ignore-identifier", path);
    case "Never":
      return annotate(constNever);
    case "Void":
      return annotate(constVoid);
    case "Unknown":
      return annotate(constUnknown);
    case "Any":
      return annotate(constAny);
    case "ObjectKeyword":
      return annotate(constObject);
    case "Null":
      return annotate({ type: "null" });
    case "String":
      return annotate({ type: "string" });
    case "Number":
      return annotate({ type: "number" });
    case "Boolean":
      return annotate({ type: "boolean" });
    case "Literal": {
      const literal = ast.literal;
      if (typeof literal === "string") return annotate({ type: "string", enum: [literal] });
      if (typeof literal === "number") return annotate({ type: "number", enum: [literal] });
      if (typeof literal === "boolean") return annotate({ type: "boolean", enum: [literal] });
      throw new Error(`Unsupported literal at ${pathText(path)}.`);
    }
    case "Enum": {
      const anyOf = ast.enums.map(([title, value]) => ({
        type: typeof value === "number" ? "number" : "string",
        title,
        enum: [value],
      }));
      return anyOf.length >= 1
        ? annotate({ $comment: "/schemas/enums", anyOf })
        : annotate(constNever);
    }
    case "TemplateLiteral":
      throw new Error(`Unsupported template literal at ${pathText(path)}.`);
    case "Arrays": {
      const elements = ast.elements.map((element, index) =>
        go(full(element), defs, "handle-identifier", [...path, index]),
      );
      const rest = ast.rest.map((type) => go(full(type), defs, "handle-identifier", path));
      const output: JsonSchemaObject = { type: "array" };
      const length = ast.elements.length;
      if (length > 0) {
        output["minItems"] =
          length - ast.elements.filter((element) => element.context?.isOptional === true).length;
        output["items"] = elements;
      }
      const [head] = rest;
      if (head !== undefined) {
        const restAst = ast.rest[0];
        const homogeneous =
          rest.length === 1 && ast.elements.every((element) => element === restAst);
        if (homogeneous) output["items"] = head;
        else output["additionalItems"] = head;
        if (rest.length > 1) {
          throw new Error(`Unsupported post-rest elements at ${pathText(path)}.`);
        }
      } else if (length > 0) {
        output["additionalItems"] = false;
      } else {
        output["maxItems"] = 0;
      }
      return annotate(output);
    }
    case "Objects": {
      if (ast.propertySignatures.length === 0 && ast.indexSignatures.length === 0) {
        return annotate(constEmptyStruct);
      }
      const required: Array<string> = [];
      const properties: Record<string, JsonSchemaObject> = {};
      const output: JsonSchemaObject = {
        type: "object",
        required,
        properties,
        additionalProperties: false,
      };
      let patternProperties: JsonSchemaObject | undefined;
      let propertyNames: JsonSchemaObject | undefined;
      for (const index of ast.indexSignatures) {
        const pruned = pruneUndefined(index.type);
        const emitType = (mode: IdentifierMode) =>
          pruned === undefined
            ? go(full(index.type), defs, mode, path)
            : goMembers(pruned, defs, path);
        const parameter = index.parameter;
        if (parameter._tag === "String" && checksOf(parameter).length === 0) {
          const value = emitType("handle-identifier");
          output["additionalProperties"] = isNeverWithoutCustomAnnotations(value) ? false : value;
        } else if (parameter._tag === "String") {
          patternProperties = emitType("handle-identifier");
          propertyNames = go(full(parameter), defs, "handle-identifier", path);
        } else {
          throw new Error(`Unsupported index signature at ${pathText(path)}.`);
        }
      }
      for (const property of ast.propertySignatures) {
        const name = property.name;
        if (typeof name !== "string") {
          throw new Error(`Unsupported property key at ${pathText(path)}.`);
        }
        const encoded = encodedTypeOf(property.type);
        const pruned = pruneUndefined(property.type);
        properties[name] =
          pruned === undefined
            ? go(full(property.type), defs, "handle-identifier", [...path, name])
            : goMembers(pruned, defs, [...path, name]);
        if (encoded.context?.isOptional !== true && pruned === undefined) required.push(name);
      }
      if (patternProperties !== undefined) {
        delete output["additionalProperties"];
        output["patternProperties"] = { "": patternProperties };
      }
      if (propertyNames !== undefined) output["propertyNames"] = propertyNames;
      return annotate(output);
    }
    case "Union": {
      const members = ast.types.map((type) => go(full(type), defs, "handle-identifier", path));
      const anyOf = compactUnion(members);
      const [single] = anyOf;
      if (anyOf.length === 0) return constNever;
      if (anyOf.length === 1 && single !== undefined) return annotate(single);
      return annotate({ anyOf });
    }
  }
}

/** The most-encoded side of a property type, which carries the v3 key optionality. */
function encodedTypeOf(ast: SchemaAST.AST): SchemaAST.AST {
  let current = ast;
  for (let from = encodedFrom(current); from !== undefined; from = encodedFrom(current)) {
    current = from;
  }
  return current;
}

/** Builds a draft-07 JSON Schema document with the v3 `JSONSchema.make` output shape. */
export function make(schema: Schema.Top): JsonSchemaRoot {
  const defs: Record<string, JsonSchemaObject> = {};
  const body = go(full(schema.ast), defs, "handle-identifier", []);
  const root: JsonSchemaRoot = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $defs: defs,
    ...body,
  };
  if (Object.keys(defs).length === 0) {
    const { $defs: _empty, ...withoutDefs } = root;
    return withoutDefs;
  }
  return root;
}
