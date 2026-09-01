/**
 * Named-combination registry for kinded grammars (#38).
 *
 * Each legacy `type` value (in relationships, actions, assertions) is a named
 * combination of attributes in the expanded kinded form. The validator
 * resolves a legacy name to its expansion and reports the expanded attributes
 * so authors see the underlying grammar even when they wrote the short name.
 *
 * Adding a new kind is purely additive: extend the schema's enum for `kind`
 * (if appropriate), and — if the new kind has a stable short name — register
 * it here. Authors can also use the expanded form directly without a short
 * name; the validator accepts that and skips the expansion step.
 */

const RELATIONSHIP_COMBINATIONS = {
  'belongs-to': {
    kind: 'association',
    cardinality: 'many-to-one',
    ownership: 'not-owned',
  },
  'has-one': {
    kind: 'composition',
    cardinality: 'one-to-one',
    ownership: 'owned',
  },
  'has-many': {
    kind: 'composition',
    cardinality: 'one-to-many',
    ownership: 'owned',
  },
  'many-to-many': {
    kind: 'association',
    cardinality: 'many-to-many',
    ownership: 'not-owned',
  },
};

const ACTION_COMBINATIONS = {
  navigate: { kind: 'navigation', verb: 'navigate' },
  click: { kind: 'ui-interaction', verb: 'click' },
  fill: { kind: 'ui-interaction', verb: 'fill' },
  select: { kind: 'ui-interaction', verb: 'select' },
  check: { kind: 'ui-interaction', verb: 'check' },
  uncheck: { kind: 'ui-interaction', verb: 'uncheck' },
  wait: { kind: 'wait', verb: 'wait' },
  hover: { kind: 'ui-interaction', verb: 'hover' },
  scroll: { kind: 'ui-interaction', verb: 'scroll' },
  press: { kind: 'ui-interaction', verb: 'press' },
  type: { kind: 'ui-interaction', verb: 'type' },
  upload: { kind: 'ui-interaction', verb: 'upload' },
  // Protocol / CLI vocabulary (v1.12) — promoted after contact with a kernel
  // consumer whose journeys install and drive executables, not browsers.
  'npm-global-install': { kind: 'install', verb: 'install', via: 'npm-global' },
  'npm-global-uninstall': { kind: 'install', verb: 'uninstall', via: 'npm-global' },
  'installed-executable': { kind: 'install', verb: 'verify-executable' },
  'installed-cli': { kind: 'cli', verb: 'run' },
  'installed-mcp': { kind: 'mcp', verb: 'call' },
  'harness-integration': { kind: 'harness', verb: 'integrate' },
};

const ASSERTION_COMBINATIONS = {
  // Playwright-vocabulary (v1.2 originals)
  visible: { kind: 'dom', property: 'visibility', expected: 'visible' },
  hidden: { kind: 'dom', property: 'visibility', expected: 'hidden' },
  text: { kind: 'dom', property: 'text' },
  url: { kind: 'url', property: 'matches' },
  api: { kind: 'api' },
  count: { kind: 'dom', property: 'count' },
  polling: { kind: 'api', property: 'polling' },
  attribute: { kind: 'dom', property: 'attribute' },
  value: { kind: 'dom', property: 'value' },
  enabled: { kind: 'dom', property: 'enabled', expected: true },
  disabled: { kind: 'dom', property: 'enabled', expected: false },
  // Domain-assertion shorthands (v1.6) — promoted to named combinations after
  // contact with downstream specs. The author can still write the expanded form.
  'cookie-set': { kind: 'cookie', property: 'set' },
  'cookie-present': { kind: 'cookie', property: 'present' },
  'cookie-max-age': { kind: 'cookie', property: 'max-age' },
  'principal-classification': { kind: 'classification', target: 'principal' },
  'lead-tag-present': { kind: 'tag', property: 'present', target: 'lead' },
  'intake-prefill-available': { kind: 'context', property: 'available', target: 'intake-prefill' },
  // Protocol / CLI vocabulary (v1.12)
  'principal-continuity': { kind: 'authority', property: 'continuity', target: 'principal' },
  'required-content': { kind: 'content', property: 'required' },
  'forbidden-content': { kind: 'content', property: 'forbidden' },
  'package-removal': { kind: 'package', property: 'removed' },
  'package-installed': { kind: 'package', property: 'installed' },
};

const RELATIONSHIP_KINDS = new Set(['composition', 'association', 'aggregation', 'pointer']);
const ACTION_KINDS = new Set(['ui-interaction', 'navigation', 'wait', 'network', 'cli', 'install', 'mcp', 'harness']);
const ASSERTION_KINDS = new Set(['dom', 'url', 'api', 'cookie', 'classification', 'tag', 'context', 'lifecycle', 'authority', 'content', 'package']);

function describeCombination(combination) {
  return Object.entries(combination)
    .map(([k, v]) => `${k}:${v}`)
    .join(', ');
}

/**
 * Resolve a slot (relationship / action / assertion) into a categorization.
 *
 * Inputs:
 *   - slot: 'relationship' | 'action' | 'assertion'
 *   - value: the user's object, e.g. { type: 'belongs-to', entity: 'X' }
 *
 * Returns:
 *   {
 *     status: 'expanded' | 'kinded' | 'unknown' | 'mixed',
 *     legacyType?: string,
 *     kind?: string,
 *     expansion?: object,            // present when status === 'expanded' or 'mixed'
 *     description?: string,          // human-readable expansion summary
 *     conflicts?: string[],          // present when status === 'mixed' and the
 *                                    //   author-provided fields conflict with the
 *                                    //   named-combination values
 *   }
 */
function categorize(slot, value) {
  if (!value || typeof value !== 'object') {
    return { status: 'unknown' };
  }

  const table =
    slot === 'relationship' ? RELATIONSHIP_COMBINATIONS :
    slot === 'action' ? ACTION_COMBINATIONS :
    slot === 'assertion' ? ASSERTION_COMBINATIONS :
    null;

  const validKinds =
    slot === 'relationship' ? RELATIONSHIP_KINDS :
    slot === 'action' ? ACTION_KINDS :
    slot === 'assertion' ? ASSERTION_KINDS :
    null;

  if (!table) return { status: 'unknown' };

  const legacyType = typeof value.type === 'string' ? value.type : null;
  const declaredKind = typeof value.kind === 'string' ? value.kind : null;

  if (legacyType && table[legacyType]) {
    const expansion = table[legacyType];
    if (declaredKind) {
      const conflicts = [];
      for (const [k, v] of Object.entries(expansion)) {
        if (value[k] !== undefined && value[k] !== v) {
          conflicts.push(`${k}: declared=${value[k]}, named-combination=${v}`);
        }
      }
      return {
        status: 'mixed',
        legacyType,
        kind: declaredKind,
        expansion,
        description: describeCombination(expansion),
        conflicts,
      };
    }
    return {
      status: 'expanded',
      legacyType,
      expansion,
      description: describeCombination(expansion),
    };
  }

  if (declaredKind) {
    if (!validKinds.has(declaredKind)) {
      return { status: 'unknown', kind: declaredKind };
    }
    return { status: 'kinded', kind: declaredKind };
  }

  if (legacyType) {
    return { status: 'unknown', legacyType };
  }

  return { status: 'unknown' };
}

module.exports = {
  RELATIONSHIP_COMBINATIONS,
  ACTION_COMBINATIONS,
  ASSERTION_COMBINATIONS,
  RELATIONSHIP_KINDS,
  ACTION_KINDS,
  ASSERTION_KINDS,
  categorize,
  describeCombination,
};
