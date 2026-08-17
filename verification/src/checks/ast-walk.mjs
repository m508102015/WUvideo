const functionTypes = new Set([
  'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
  'TSDeclareFunction', 'TSFunctionType', 'ObjectMethod', 'ClassMethod',
]);
const branchTypes = new Set([
  'IfStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement',
  'WhileStatement', 'DoWhileStatement', 'CatchClause', 'ConditionalExpression',
]);
const nestTypes = new Set([...branchTypes, 'SwitchStatement', 'TryStatement']);

export function children(node) {
  const output = [];
  for (const [key, value] of Object.entries(node || {})) {
    if (key === 'parent' || key === 'tokens' || key === 'comments') continue;
    if (Array.isArray(value)) output.push(...value.filter((item) => item?.type));
    else if (value?.type) output.push(value);
  }
  return output;
}

function displayName(node, parent) {
  if (node.id?.name) return node.id.name;
  if (parent?.id?.name) return parent.id.name;
  if (parent?.key?.name) return parent.key.name;
  return '<anonymous>';
}

function functionMetric(node, parent) {
  let complexity = 1;
  let maxNesting = 0;
  const visit = (current, depth) => {
    if (current !== node && functionTypes.has(current.type)) return;
    if (branchTypes.has(current.type)) complexity += 1;
    if (current.type === 'LogicalExpression' && ['&&', '||', '??'].includes(current.operator)) complexity += 1;
    if (current.type === 'SwitchCase' && current.test) complexity += 1;
    const nextDepth = nestTypes.has(current.type) ? depth + 1 : depth;
    maxNesting = Math.max(maxNesting, nextDepth);
    for (const child of children(current)) visit(child, nextDepth);
  };
  visit(node, 0);
  return {
    name: displayName(node, parent),
    line: node.loc?.start.line || 0,
    lines: (node.loc?.end.line || 0) - (node.loc?.start.line || 0) + 1,
    params: node.params?.length || 0,
    complexity,
    maxNesting,
  };
}

export function collectFunctions(ast) {
  const output = [];
  const visit = (node, parent) => {
    if (functionTypes.has(node.type)) output.push(functionMetric(node, parent));
    for (const child of children(node)) visit(child, node);
  };
  visit(ast, null);
  return output;
}
