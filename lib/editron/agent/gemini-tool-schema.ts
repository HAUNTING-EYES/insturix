import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { SchemaType, type FunctionDeclaration, type FunctionDeclarationSchema, type Schema } from '@google/generative-ai';

type JsonSchemaNode = Record<string, unknown>;

export interface GeminiToolSchemaSource {
  name: string;
  description?: string;
  schema: Parameters<typeof toJsonSchema>[0];
}

const TOOL_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

function isRecord(value: unknown): value is JsonSchemaNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, path: string): JsonSchemaNode {
  if (!isRecord(value)) {
    throw new Error(`[GeminiToolSchema] ${path} must be a JSON Schema object.`);
  }
  return value;
}

function combineDescriptions(...values: Array<string | undefined>): string | undefined {
  const unique = [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
  return unique.length > 0 ? unique.join(' ') : undefined;
}

function describeSchema(node: JsonSchemaNode, extra?: string): string | undefined {
  const constraints: string[] = [];
  const push = (label: string, key: string) => {
    const value = node[key];
    if (typeof value === 'number' || typeof value === 'string') {
      constraints.push(`${label} ${value}.`);
    }
  };

  push('Minimum:', 'minimum');
  push('Exclusive minimum:', 'exclusiveMinimum');
  push('Maximum:', 'maximum');
  push('Exclusive maximum:', 'exclusiveMaximum');
  push('Minimum length:', 'minLength');
  push('Maximum length:', 'maxLength');
  push('Pattern:', 'pattern');

  if (Object.prototype.hasOwnProperty.call(node, 'default')) {
    const serialized = JSON.stringify(node.default);
    if (serialized && serialized.length <= 120) constraints.push(`Default: ${serialized}.`);
  }

  return combineDescriptions(
    typeof node.description === 'string' ? node.description : undefined,
    constraints.length > 0 ? constraints.join(' ') : undefined,
    extra,
  );
}

function withDescription(schema: Schema, description?: string): Schema {
  const merged = combineDescriptions(schema.description, description);
  return merged ? { ...schema, description: merged } : schema;
}

function schemaType(node: JsonSchemaNode): string | undefined {
  return typeof node.type === 'string' ? node.type : undefined;
}

function isNullSchema(node: JsonSchemaNode): boolean {
  return schemaType(node) === 'null' || node.const === null;
}

function mergeObjectAlternatives(schemas: Schema[], path: string): Schema {
  const objects = schemas.map((schema) => {
    if (schema.type !== SchemaType.OBJECT) {
      throw new Error(`[GeminiToolSchema] ${path} contains a non-object alternative.`);
    }
    return schema;
  });
  const properties: Record<string, Schema> = {};
  for (const object of objects) {
    for (const [key, value] of Object.entries(object.properties)) {
      properties[key] = properties[key]
        ? mergeAlternativeSchemas([properties[key], value], `${path}.${key}`)
        : value;
    }
  }
  const requiredSets = objects.map((object) => new Set(object.required ?? []));
  const required = [...(objects[0]?.required ?? [])].filter((key) =>
    requiredSets.every((set) => set.has(key)),
  );
  return {
    type: SchemaType.OBJECT,
    properties,
    required: required.length > 0 ? required : undefined,
    description: combineDescriptions(...objects.map((object) => object.description)),
  };
}

function mergeAlternativeSchemas(schemas: Schema[], path: string): Schema {
  if (schemas.length === 0) {
    throw new Error(`[GeminiToolSchema] ${path} has no representable alternatives.`);
  }
  if (schemas.length === 1) return schemas[0];
  const types = new Set(schemas.map((schema) => schema.type));
  const description = combineDescriptions(...schemas.map((schema) => schema.description));

  if (types.size === 1) {
    const type = schemas[0].type;
    if (type === SchemaType.OBJECT) {
      return withDescription(mergeObjectAlternatives(schemas, path), description);
    }
    if (type === SchemaType.STRING) {
      const strings = schemas.filter((schema) => schema.type === SchemaType.STRING);
      if (strings.every((schema) => 'enum' in schema)) {
        return {
          type: SchemaType.STRING,
          format: 'enum',
          enum: [...new Set(strings.flatMap((schema) => schema.enum ?? []))],
          description,
        };
      }
      return { type: SchemaType.STRING, description };
    }
    if (type === SchemaType.ARRAY) {
      const arrays = schemas.filter((schema) => schema.type === SchemaType.ARRAY);
      return {
        type: SchemaType.ARRAY,
        items: mergeAlternativeSchemas(arrays.map((schema) => schema.items), `${path}[]`),
        description,
      };
    }
    return { ...schemas[0], description };
  }

  const numericTypes = new Set([SchemaType.INTEGER, SchemaType.NUMBER]);
  if ([...types].every((type) => numericTypes.has(type))) {
    return { type: SchemaType.NUMBER, description };
  }
  if ([...types].every((type) =>
    type === SchemaType.STRING || type === SchemaType.NUMBER || type === SchemaType.INTEGER,
  )) {
    return {
      type: SchemaType.STRING,
      description: combineDescriptions(description, 'Accepts text or a number encoded as decimal text.'),
    };
  }
  throw new Error(
    `[GeminiToolSchema] ${path} uses an unsupported mixed union: ${[...types].join(', ')}.`,
  );
}

function convertUnion(node: JsonSchemaNode, branches: unknown[], path: string): Schema {
  const records = branches.map((branch, index) => readRecord(branch, `${path}[${index}]`));
  const nullable = records.some(isNullSchema);
  const converted = records
    .filter((branch) => !isNullSchema(branch))
    .map((branch, index) => convertJsonSchema(branch, `${path}[${index}]`));
  const merged = mergeAlternativeSchemas(converted, path);
  return withDescription(nullable ? { ...merged, nullable: true } : merged, describeSchema(node));
}

function convertObject(node: JsonSchemaNode, path: string): Schema {
  const rawProperties = readRecord(node.properties ?? {}, `${path}.properties`);
  const properties: Record<string, Schema> = {};
  for (const [key, rawProperty] of Object.entries(rawProperties)) {
    properties[key] = convertJsonSchema(readRecord(rawProperty, `${path}.${key}`), `${path}.${key}`);
  }
  if (Object.keys(properties).length === 0) {
    throw new Error(`[GeminiToolSchema] ${path} is an empty object schema.`);
  }
  const required = Array.isArray(node.required)
    ? node.required.filter(
        (key): key is string =>
          typeof key === 'string' &&
          key in properties &&
          !Object.prototype.hasOwnProperty.call(rawProperties[key], 'default'),
      )
    : [];
  return {
    type: SchemaType.OBJECT,
    properties,
    required: required.length > 0 ? required : undefined,
    description: describeSchema(
      node,
      node.additionalProperties === false ? 'Only the listed fields are accepted.' : undefined,
    ),
  };
}

function convertJsonSchema(node: JsonSchemaNode, path: string): Schema {
  if ('$ref' in node) throw new Error(`[GeminiToolSchema] ${path} contains an unresolved $ref.`);
  const alternatives = Array.isArray(node.anyOf)
    ? node.anyOf
    : Array.isArray(node.oneOf) ? node.oneOf : undefined;
  if (alternatives) return convertUnion(node, alternatives, path);

  if (Array.isArray(node.allOf)) {
    const schemas = node.allOf.map((branch, index) =>
      convertJsonSchema(readRecord(branch, `${path}.allOf[${index}]`), `${path}.allOf[${index}]`),
    );
    if (schemas.every((schema) => schema.type === SchemaType.OBJECT)) {
      const merged = mergeObjectAlternatives(schemas, `${path}.allOf`);
      if (merged.type !== SchemaType.OBJECT) {
        throw new Error(`[GeminiToolSchema] ${path}.allOf did not resolve to an object.`);
      }
      const required = [...new Set(schemas.flatMap((schema) =>
        schema.type === SchemaType.OBJECT ? schema.required ?? [] : [],
      ))];
      return withDescription(
        { ...merged, required: required.length > 0 ? required : undefined },
        describeSchema(node),
      );
    }
    return withDescription(mergeAlternativeSchemas(schemas, `${path}.allOf`), describeSchema(node));
  }

  const type = schemaType(node);
  const base: Schema = (() : Schema => {
    switch (type) {
      case 'string': {
        const values = Array.isArray(node.enum)
          ? node.enum
          : Object.prototype.hasOwnProperty.call(node, 'const') ? [node.const] : undefined;
        if (values && values.every((value) => typeof value === 'string')) {
          return {
            type: SchemaType.STRING,
            format: 'enum' as const,
            enum: values as string[],
            description: describeSchema(node),
          };
        }
        return {
          type: SchemaType.STRING,
          format: node.format === 'date-time' ? ('date-time' as const) : undefined,
          description: describeSchema(node),
        };
      }
      case 'number': return { type: SchemaType.NUMBER, description: describeSchema(node) };
      case 'integer': return { type: SchemaType.INTEGER, description: describeSchema(node) };
      case 'boolean': return { type: SchemaType.BOOLEAN, description: describeSchema(node) };
      case 'array': {
        if (!node.items) throw new Error(`[GeminiToolSchema] ${path} is an array without an item schema.`);
        return {
          type: SchemaType.ARRAY,
          items: convertJsonSchema(readRecord(node.items, `${path}[]`), `${path}[]`),
          minItems: typeof node.minItems === 'number' ? node.minItems : undefined,
          maxItems: typeof node.maxItems === 'number' ? node.maxItems : undefined,
          description: describeSchema(node),
        };
      }
      case 'object': return convertObject(node, path);
      default:
        throw new Error(`[GeminiToolSchema] ${path} has unsupported or missing type '${String(type)}'.`);
    }
  })();
  return node.nullable === true ? { ...base, nullable: true } : base;
}

export function buildGeminiFunctionDeclarations(
  tools: readonly GeminiToolSchemaSource[],
): FunctionDeclaration[] {
  if (tools.length > 64) {
    throw new Error(`[GeminiToolSchema] Gemini accepts at most 64 tools; received ${tools.length}.`);
  }
  const names = new Set<string>();
  return tools.map((tool) => {
    if (!TOOL_NAME_PATTERN.test(tool.name)) {
      throw new Error(`[GeminiToolSchema] Invalid tool name '${tool.name}'.`);
    }
    if (names.has(tool.name)) throw new Error(`[GeminiToolSchema] Duplicate tool name '${tool.name}'.`);
    names.add(tool.name);

    let jsonSchema: JsonSchemaNode;
    try {
      jsonSchema = readRecord(toJsonSchema(tool.schema, {
        target: 'draft-7',
        reused: 'inline',
        io: 'input',
        unrepresentable: 'any',
      }), tool.name);
    } catch (error) {
      throw new Error(
        `[GeminiToolSchema] Failed to convert '${tool.name}': ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    if (schemaType(jsonSchema) !== 'object') {
      throw new Error(`[GeminiToolSchema] Tool '${tool.name}' must use an object parameter schema.`);
    }
    const rawProperties = readRecord(jsonSchema.properties ?? {}, `${tool.name}.properties`);
    const declaration: FunctionDeclaration = { name: tool.name, description: tool.description };
    if (Object.keys(rawProperties).length > 0) {
      declaration.parameters = convertObject(jsonSchema, tool.name) as FunctionDeclarationSchema;
    }
    return declaration;
  });
}
