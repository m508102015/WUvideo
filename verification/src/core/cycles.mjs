function children(graph, node) {
  return graph instanceof Map ? graph.get(node) || [] : graph[node] || [];
}

export function findCycles(graph) {
  const cycles = new Set();
  const active = [];
  const done = new Set();
  const visit = (node) => {
    const index = active.indexOf(node);
    if (index >= 0) { cycles.add([...active.slice(index), node].join(' -> ')); return; }
    if (done.has(node)) return;
    active.push(node);
    for (const child of children(graph, node)) visit(child);
    active.pop();
    done.add(node);
  };
  const nodes = graph instanceof Map ? graph.keys() : Object.keys(graph);
  for (const node of nodes) visit(node);
  return [...cycles].sort();
}
