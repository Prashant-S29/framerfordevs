// Preserves the v3 closed-object contract: a `closedObject` schema and everything inside it reject unknown keys, while lenient parents still strip them.

import { Effect, Exit, Option, Result, Schema, SchemaAST, SchemaIssue } from "effect";

/** Annotation that marks an object schema, and its descendants, as closed to unknown keys. */
export const closedObject = { closedObject: true } as const;

const closedCache = new WeakMap<SchemaAST.AST, boolean>();
const lenientDecoders = new WeakMap<SchemaAST.AST, (input: unknown) => boolean>();

function checksAreClosed(checks: SchemaAST.Checks | undefined): boolean {
  if (checks === undefined) return false;
  return checks.some(
    (check) =>
      check.annotations?.["closedObject"] === true ||
      (check._tag === "FilterGroup" && checksAreClosed(check.checks)),
  );
}

function isClosedNode(ast: SchemaAST.AST): boolean {
  return ast.annotations?.["closedObject"] === true || checksAreClosed(ast.checks);
}

function children(ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> {
  const out: Array<SchemaAST.AST> = [];
  switch (ast._tag) {
    case "Declaration":
      out.push(...ast.typeParameters);
      break;
    case "Objects":
      for (const property of ast.propertySignatures) out.push(property.type);
      for (const index of ast.indexSignatures) out.push(index.parameter, index.type);
      break;
    case "Arrays":
      out.push(...ast.elements, ...ast.rest);
      break;
    case "Union":
      out.push(...ast.types);
      break;
    case "Suspend":
      out.push(ast.thunk());
      break;
    default:
      break;
  }
  for (const link of ast.encoding ?? []) out.push(link.to);
  return out;
}

/** Returns true when any node reachable from the AST carries the closed-object marker. */
export function isClosedAst(root: SchemaAST.AST): boolean {
  const cached = closedCache.get(root);
  if (cached !== undefined) return cached;
  const visited = new Set<SchemaAST.AST>();
  const stack: Array<SchemaAST.AST> = [root];
  let closed = false;
  while (stack.length > 0) {
    const ast = stack.pop();
    if (ast === undefined || visited.has(ast)) continue;
    visited.add(ast);
    if (isClosedNode(ast)) {
      closed = true;
      break;
    }
    stack.push(...children(ast));
  }
  closedCache.set(root, closed);
  return closed;
}

function accepts(ast: SchemaAST.AST, input: unknown): boolean {
  let decoder = lenientDecoders.get(ast);
  if (decoder === undefined) {
    const decode = Schema.decodeUnknownExit(Schema.make<Schema.Codec<unknown, unknown>>(ast));
    decoder = (value) => Exit.isSuccess(decode(value));
    lenientDecoders.set(ast, decoder);
  }
  return decoder(input);
}

function isPlainRecord(input: unknown): input is Readonly<Record<PropertyKey, unknown>> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function encodedSide(ast: SchemaAST.AST): SchemaAST.AST | undefined {
  const links = ast.encoding;
  return links === undefined ? undefined : links[links.length - 1]?.to;
}

function indexMatches(index: SchemaAST.IndexSignature, key: PropertyKey): boolean {
  const parameter = index.parameter;
  if (typeof key !== "string") return parameter._tag === "Symbol";
  if (parameter._tag === "String" && parameter.checks === undefined) return true;
  return accepts(parameter, key);
}

/** Finds the first unknown key inside a closed subtree of the encoded input, mirroring v4 strict issues. */
function excess(
  ast: SchemaAST.AST,
  input: unknown,
  closed: boolean,
): SchemaIssue.Issue | undefined {
  const strict = closed || isClosedNode(ast);
  const from = encodedSide(ast);
  if (from !== undefined) return excess(from, input, strict);
  switch (ast._tag) {
    case "Suspend":
      return excess(ast.thunk(), input, strict);
    case "Objects": {
      if (!isPlainRecord(input)) return undefined;
      const names = new Set<PropertyKey>(ast.propertySignatures.map((property) => property.name));
      const issues: Array<SchemaIssue.Issue> = [];
      for (const key of Reflect.ownKeys(input)) {
        if (!Object.prototype.propertyIsEnumerable.call(input, key) || names.has(key)) continue;
        const value = input[key];
        const index = ast.indexSignatures.find((candidate) => indexMatches(candidate, key));
        if (index !== undefined) {
          const nested = excess(index.type, value, strict);
          if (nested !== undefined) return new SchemaIssue.Pointer([key], nested);
          continue;
        }
        if (strict) {
          issues.push(new SchemaIssue.Pointer([key], new SchemaIssue.UnexpectedKey(ast, value)));
        }
      }
      const [first, ...rest] = issues;
      if (first !== undefined) return new SchemaIssue.Composite(ast, [first, ...rest], input);
      for (const property of ast.propertySignatures) {
        if (!Object.hasOwn(input, property.name)) continue;
        const nested = excess(property.type, input[property.name], strict);
        if (nested !== undefined) return new SchemaIssue.Pointer([property.name], nested);
      }
      return undefined;
    }
    case "Arrays": {
      if (!Array.isArray(input)) return undefined;
      for (let index = 0; index < input.length; index++) {
        const element = ast.elements[index] ?? ast.rest[0];
        if (element === undefined) continue;
        const nested = excess(element, input[index], strict);
        if (nested !== undefined) return new SchemaIssue.Pointer([index], nested);
      }
      return undefined;
    }
    case "Union": {
      let firstIssue: SchemaIssue.Issue | undefined;
      for (const member of ast.types) {
        if (!accepts(member, input)) continue;
        if (!strict && !isClosedAst(member)) return undefined;
        const nested = excess(member, input, strict);
        if (nested === undefined) return undefined;
        firstIssue ??= nested;
      }
      return firstIssue;
    }
    case "Declaration": {
      for (const parameter of ast.typeParameters) {
        const nested = excess(parameter, input, strict);
        if (nested !== undefined) return nested;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/** Returns the unknown-key issue for a closed subtree, or undefined when the input is acceptable. */
export function closedObjectIssue(
  schema: { readonly ast: SchemaAST.AST },
  input: unknown,
): SchemaIssue.Issue | undefined {
  if (!isClosedAst(schema.ast)) return undefined;
  return excess(schema.ast, input, false);
}

export const decodeUnknownSync: typeof Schema.decodeUnknownSync = (schema, options) => {
  const decode = Schema.decodeUnknownSync(schema, options);
  return (input, callOptions) => {
    const issue = closedObjectIssue(schema, input);
    if (issue !== undefined) throw new Schema.SchemaError(issue);
    return decode(input, callOptions);
  };
};
export const decodeSync: typeof Schema.decodeSync = (schema, options) => {
  const decode = Schema.decodeSync(schema, options);
  return (input, callOptions) => {
    const issue = closedObjectIssue(schema, input);
    if (issue !== undefined) throw new Schema.SchemaError(issue);
    return decode(input, callOptions);
  };
};
export const decodeUnknownEffect: typeof Schema.decodeUnknownEffect = (schema, options) => {
  const decode = Schema.decodeUnknownEffect(schema, options);
  return (input, callOptions) =>
    Effect.suspend(() => {
      const issue = closedObjectIssue(schema, input);
      return issue === undefined
        ? decode(input, callOptions)
        : Effect.fail(new Schema.SchemaError(issue));
    });
};
export const decodeEffect: typeof Schema.decodeEffect = (schema, options) => {
  const decode = Schema.decodeEffect(schema, options);
  return (input, callOptions) =>
    Effect.suspend(() => {
      const issue = closedObjectIssue(schema, input);
      return issue === undefined
        ? decode(input, callOptions)
        : Effect.fail(new Schema.SchemaError(issue));
    });
};
export const decodeUnknownResult: typeof Schema.decodeUnknownResult = (schema, options) => {
  const decode = Schema.decodeUnknownResult(schema, options);
  return (input, callOptions) => {
    const issue = closedObjectIssue(schema, input);
    return issue === undefined
      ? decode(input, callOptions)
      : Result.fail(new Schema.SchemaError(issue));
  };
};
export const decodeResult: typeof Schema.decodeResult = (schema, options) => {
  const decode = Schema.decodeResult(schema, options);
  return (input, callOptions) => {
    const issue = closedObjectIssue(schema, input);
    return issue === undefined
      ? decode(input, callOptions)
      : Result.fail(new Schema.SchemaError(issue));
  };
};
export const decodeUnknownOption: typeof Schema.decodeUnknownOption = (schema, options) => {
  const decode = Schema.decodeUnknownOption(schema, options);
  return (input, callOptions) =>
    closedObjectIssue(schema, input) === undefined ? decode(input, callOptions) : Option.none();
};
export const decodeUnknownExit: typeof Schema.decodeUnknownExit = (schema, options) => {
  const decode = Schema.decodeUnknownExit(schema, options);
  return (input, callOptions) => {
    const issue = closedObjectIssue(schema, input);
    return issue === undefined
      ? decode(input, callOptions)
      : Exit.fail(new Schema.SchemaError(issue));
  };
};
// Encoders read typed values that the application built, so closed-object checks stay on the decode side.
export const encodeSync = Schema.encodeSync;
export const encodeUnknownSync = Schema.encodeUnknownSync;
export const encodeEffect = Schema.encodeEffect;
export const encodeUnknownEffect = Schema.encodeUnknownEffect;
export const toStandardSchemaV1: typeof Schema.toStandardSchemaV1 = (schema, options) => {
  const standard = Schema.toStandardSchemaV1(schema, options);
  const adapter = standard["~standard"];
  const format = SchemaIssue.makeFormatterStandardSchemaV1(options);
  return Object.defineProperty(standard, "~standard", {
    value: {
      ...adapter,
      validate: (value: unknown) => {
        const issue = closedObjectIssue(schema, value);
        return issue === undefined ? adapter.validate(value) : format(issue);
      },
    },
    enumerable: true,
    configurable: true,
  });
};
