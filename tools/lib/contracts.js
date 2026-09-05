const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { findFiles } = require('./parse-front-matter');

const OPENAPI_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const CONTRACT_PROTOCOLS = {
  openapi: {
    directory: 'openapi',
    displayName: 'OpenAPI',
  },
  asyncapi: {
    directory: 'asyncapi',
    displayName: 'AsyncAPI',
  },
  'json-rpc': {
    directory: 'json-rpc',
    displayName: 'JSON-RPC',
  },
};

function toPosix(value) {
  return String(value || '').replace(/\\/g, '/');
}

function normalizeRef(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? toPosix(trimmed.replace(/^\.\//, '')) : null;
}

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function normalizeProtocol(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'openapi') return 'openapi';
  if (normalized === 'asyncapi') return 'asyncapi';
  if (normalized === 'json-rpc' || normalized === 'jsonrpc') return 'json-rpc';
  return null;
}

function protocolDisplayName(protocol) {
  const normalized = normalizeProtocol(protocol);
  return normalized ? CONTRACT_PROTOCOLS[normalized].displayName : String(protocol || 'Contract');
}

function parseContractDocument(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.json') {
    return JSON.parse(content);
  }
  return yaml.load(content);
}

function discoverContractFiles(specsDir) {
  const contractsDir = path.join(specsDir, 'contracts');
  const entries = [];

  for (const [protocol, config] of Object.entries(CONTRACT_PROTOCOLS)) {
    const dir = path.join(contractsDir, config.directory);
    for (const filePath of findFiles(dir, /\.(json|ya?ml)$/i)) {
      entries.push({
        protocol,
        filePath,
        relativePath: toPosix(path.relative(process.cwd(), filePath)),
      });
    }
  }

  return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function loadContractDocuments(specsDir, results) {
  const documents = [];

  for (const entry of discoverContractFiles(specsDir)) {
    try {
      documents.push({
        ...entry,
        document: parseContractDocument(entry.filePath),
      });
    } catch (error) {
      if (results) {
        results.errors.push(`${entry.relativePath}: Failed to parse ${protocolDisplayName(entry.protocol)} contract: ${error.message}`);
      }
    }
  }

  return documents;
}

function resolvePointer(document, ref) {
  if (!ref || typeof ref !== 'string' || !ref.startsWith('#/')) {
    return null;
  }

  const parts = ref
    .slice(2)
    .split('/')
    .map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));

  let current = document;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return null;
    }
    current = current[part];
  }

  return current;
}

function dereference(value, document) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !value.$ref) {
    return value;
  }

  return resolvePointer(document, value.$ref) || value;
}

function resolveLocalRefs(value, document, seenRefs = new Set()) {
  if (Array.isArray(value)) {
    return value.map(item => resolveLocalRefs(item, document, seenRefs));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (value.$ref && typeof value.$ref === 'string' && value.$ref.startsWith('#/')) {
    if (seenRefs.has(value.$ref)) {
      return value;
    }

    const resolved = resolvePointer(document, value.$ref);
    if (!resolved) {
      return value;
    }

    const nextSeenRefs = new Set(seenRefs);
    nextSeenRefs.add(value.$ref);

    const resolvedValue = resolveLocalRefs(resolved, document, nextSeenRefs);
    const siblingEntries = Object.entries(value).filter(([key]) => key !== '$ref');
    if (siblingEntries.length === 0) {
      return resolvedValue;
    }

    return {
      ...(resolvedValue && typeof resolvedValue === 'object' && !Array.isArray(resolvedValue) ? resolvedValue : {}),
      ...Object.fromEntries(
        siblingEntries.map(([key, child]) => [key, resolveLocalRefs(child, document, nextSeenRefs)])
      ),
    };
  }

  const clone = {};
  for (const [key, child] of Object.entries(value)) {
    clone[key] = resolveLocalRefs(child, document, seenRefs);
  }
  return clone;
}

function schemaFromOpenApiContent(content, document) {
  if (!content || typeof content !== 'object') return null;

  if (content['application/json'] && content['application/json'].schema) {
    return resolveLocalRefs(content['application/json'].schema, document);
  }

  for (const mediaType of Object.values(content)) {
    if (mediaType && typeof mediaType === 'object' && mediaType.schema) {
      return resolveLocalRefs(mediaType.schema, document);
    }
  }

  return null;
}

function responseForStatus(responses, status) {
  if (!responses || typeof responses !== 'object') return null;
  if (status && responses[status]) return dereference(responses[status], responses);
  if (status && status.length === 3 && responses[`${status[0]}XX`]) return dereference(responses[`${status[0]}XX`], responses);
  if (responses.default) return dereference(responses.default, responses);
  return null;
}

function extractRefs(source) {
  return {
    storyRefs: toArray(source && source['x-story']).map(normalizeRef).filter(Boolean),
    featureRefs: toArray(source && source['x-feature']).map(normalizeRef).filter(Boolean),
    journeyRefs: toArray(source && source['x-journey']).map(normalizeRef).filter(Boolean),
  };
}

function asyncApiMetadata(operation, messages) {
  const sources = [
    { location: 'operation', source: operation },
    ...messages.map(({ name, source }) => ({ location: `message ${name}`, source })),
  ];
  const refs = sources.map(({ source }) => extractRefs(source));
  return {
    ...Object.fromEntries(['storyRefs', 'featureRefs', 'journeyRefs'].map(key => [key, [...new Set(refs.flatMap(ref => ref[key]))]])),
    ruleBindings: sources.filter(({ source }) => source?.['x-rules'] !== undefined)
      .map(({ location, source }) => ({ location, rules: source['x-rules'] })),
  };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function localAsyncApiObject(value, document, errors, label) {
  const seen = new Set();
  while (isObject(value) && value.$ref !== undefined) {
    const ref = value.$ref;
    if (typeof ref !== 'string' || !ref.startsWith('#/')) {
      errors.push(`${label}: unsupported reference ${String(ref)}; expected a local JSON pointer`);
      return null;
    }
    if (seen.has(ref)) {
      errors.push(`${label}: cyclic reference ${ref}`);
      return null;
    }
    seen.add(ref);
    value = resolvePointer(document, ref);
    if (value === null || value === undefined) {
      errors.push(`${label}: unresolved reference ${ref}`);
      return null;
    }
  }
  if (!isObject(value)) {
    errors.push(`${label}: expected an object`);
    return null;
  }
  return value;
}

function pointerParts(ref) {
  return typeof ref === 'string' && ref.startsWith('#/')
    ? ref.slice(2).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    : [];
}

function asyncApi3Operations(contract) {
  const document = contract.document;
  if (!isObject(document.operations)) return [];
  return Object.entries(document.operations).filter(([id]) => !id.startsWith('x-')).map(([id, rawOperation]) => {
    const errors = [];
    const operation = localAsyncApiObject(rawOperation, document, errors, id) || {};
    if (!['send', 'receive'].includes(operation.action)) errors.push(`${id}: action must be send or receive`);
    const channelParts = pointerParts(operation.channel?.$ref);
    const channelName = channelParts.length === 2 && channelParts[0] === 'channels' ? channelParts[1] : null;
    if (!channelName) errors.push(`${id}: channel must reference a local #/channels/<key>`);
    const channel = channelName
      ? localAsyncApiObject(document.channels?.[channelName], document, errors, `${id} channel ${channelName}`)
      : null;
    if (channel?.messages !== undefined && !isObject(channel.messages)) errors.push(`${id}: channel messages must be an object`);
    const available = isObject(channel?.messages) ? channel.messages : {};
    let selected = Object.keys(available);
    if (operation.messages !== undefined) {
      selected = [];
      if (!Array.isArray(operation.messages)) errors.push(`${id}: messages must be an array of channel message references`);
      else for (const reference of operation.messages) {
        const parts = pointerParts(reference?.$ref);
        if (parts.length !== 4 || parts[0] !== 'channels' || parts[1] !== channelName || parts[2] !== 'messages' || !Object.hasOwn(available, parts[3])) {
          errors.push(`${id}: message reference ${String(reference?.$ref)} must name a message in the selected channel`);
        } else selected.push(parts[3]);
      }
    }
    const messages = [...new Set(selected)].map(name => ({
      name, source: localAsyncApiObject(available[name], document, errors, `${id} message ${name}`),
    })).filter(message => message.source);
    const schemas = messages.map(({ name, source }) => {
      if (source.payload === undefined) return null;
      const schema = resolveLocalRefs(source.payload, document);
      if (isObject(schema) && schema.schemaFormat !== undefined) {
        errors.push(`${id} message ${name}: multi-format payload schemas are not supported; expected JSON Schema`);
        return null;
      }
      return schema;
    });
    const complete = schemas.length > 0 && schemas.every(schema => schema !== null && schema !== undefined);
    return {
      protocol: 'asyncapi', filePath: contract.filePath, relativePath: contract.relativePath,
      source: operation, signature: `asyncapi ${id}`, aliases: channelName ? [`${operation.action} ${channelName}`, `asyncapi ${operation.action} ${channelName}`] : [],
      label: id, operationId: id, action: operation.action, channelName,
      channelAddress: channel?.address ?? null,
      payloadSchema: complete ? (schemas.length === 1 ? schemas[0] : { oneOf: schemas }) : null,
      errors,
      ...asyncApiMetadata(operation, messages),
    };
  });
}

function openApiOperations(contract) {
  const operations = [];
  const document = contract.document;
  const paths = document && document.paths;

  if (!paths || typeof paths !== 'object') {
    return operations;
  }

  for (const [routePath, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object' || pathItem.$ref) continue;

    for (const method of OPENAPI_METHODS) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== 'object') continue;

      operations.push({
        protocol: 'openapi',
        filePath: contract.filePath,
        relativePath: contract.relativePath,
        source: operation,
        signature: `openapi ${method.toUpperCase()} ${routePath}`,
        aliases: [`${method.toUpperCase()} ${routePath}`],
        label: operation.operationId || `${method.toUpperCase()} ${routePath}`,
        routePath,
        method,
        operationId: operation.operationId || null,
        requestSchema: schemaFromOpenApiContent(operation.requestBody && dereference(operation.requestBody, document).content, document),
        responseSchemaForStatus(status) {
          const response = responseForStatus(operation.responses, status);
          return response ? schemaFromOpenApiContent(response.content, document) : null;
        },
        ...extractRefs(operation),
      });
    }
  }

  return operations;
}

function asyncApiOperations(contract) {
  const operations = [];
  const document = contract.document;
  if (String(document?.asyncapi).startsWith('3.')) return asyncApi3Operations(contract);
  const channels = document && document.channels;

  if (!channels || typeof channels !== 'object') {
    return operations;
  }

  for (const [channelName, channelItem] of Object.entries(channels)) {
    if (!channelItem || typeof channelItem !== 'object') continue;

    for (const action of ['publish', 'subscribe']) {
      const operation = channelItem[action];
      if (!operation || typeof operation !== 'object') continue;

      const resolvedOperation = dereference(operation, document);
      const resolvedMessage = dereference(resolvedOperation.message, document);
      const payloadSchema = resolvedMessage
        ? dereference(resolvedMessage.payload, document)
        : null;

      operations.push({
        protocol: 'asyncapi',
        filePath: contract.filePath,
        relativePath: contract.relativePath,
        source: resolvedOperation,
        signature: `asyncapi ${action} ${channelName}`,
        aliases: [`${action} ${channelName}`],
        label: resolvedOperation.operationId || `${action} ${channelName}`,
        channelName,
        action,
        operationId: resolvedOperation.operationId || null,
        payloadSchema,
        ...asyncApiMetadata(resolvedOperation, resolvedMessage ? [{ name: resolvedMessage.name || 'message', source: resolvedMessage }] : []),
      });
    }
  }

  return operations;
}

function jsonRpcOperations(contract) {
  const operations = [];
  const document = contract.document;
  const methods = document && document.methods;

  if (!methods || (typeof methods !== 'object' && !Array.isArray(methods))) {
    return operations;
  }

  const methodEntries = Array.isArray(methods)
    ? methods.map((value) => [value && value.name, value])
    : Object.entries(methods).map(([name, value]) => [name, value]);

  for (const [rawName, rawMethod] of methodEntries) {
    const methodDef = dereference(rawMethod, document);
    if (!methodDef || typeof methodDef !== 'object') continue;

    const methodName = String(methodDef.name || rawName || '').trim();
    if (!methodName) continue;

    const paramsSchema = dereference(methodDef.paramsSchema || methodDef.params, document);
    const resultSchema = dereference(methodDef.resultSchema || methodDef.result, document);
    const errorSchema = dereference(methodDef.errorSchema || methodDef.error, document);

    operations.push({
      protocol: 'json-rpc',
      filePath: contract.filePath,
      relativePath: contract.relativePath,
      source: methodDef,
      signature: `json-rpc ${methodName}`,
      aliases: [`jsonrpc ${methodName}`],
      label: methodDef.summary || methodName,
      methodName,
      paramsSchema,
      resultSchema,
      errorSchema,
      ...extractRefs(methodDef),
    });
  }

  return operations;
}

function extractContractOperations(contract) {
  if (contract.protocol === 'openapi') return openApiOperations(contract);
  if (contract.protocol === 'asyncapi') return asyncApiOperations(contract);
  if (contract.protocol === 'json-rpc') return jsonRpcOperations(contract);
  return [];
}

module.exports = {
  CONTRACT_PROTOCOLS,
  OPENAPI_METHODS,
  discoverContractFiles,
  extractContractOperations,
  loadContractDocuments,
  normalizeProtocol,
  normalizeRef,
  parseContractDocument,
  protocolDisplayName,
  responseForStatus,
  resolveLocalRefs,
  schemaFromOpenApiContent,
  toArray,
  toPosix,
};
