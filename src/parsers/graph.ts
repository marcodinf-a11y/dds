export function detectCycle(adjacencyList: Map<string, string[]>): string[] | null {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  for (const node of adjacencyList.keys()) {
    if (!visited.has(node)) {
      const cycle = dfs(node, adjacencyList, visited, inStack, path);
      if (cycle) return cycle;
    }
  }

  return null;
}

function dfs(
  node: string,
  adjacencyList: Map<string, string[]>,
  visited: Set<string>,
  inStack: Set<string>,
  path: string[]
): string[] | null {
  visited.add(node);
  inStack.add(node);
  path.push(node);

  const neighbors = adjacencyList.get(node) ?? [];
  for (const neighbor of neighbors) {
    if (!visited.has(neighbor)) {
      const cycle = dfs(neighbor, adjacencyList, visited, inStack, path);
      if (cycle) return cycle;
    } else if (inStack.has(neighbor)) {
      const cycleStart = path.indexOf(neighbor);
      return path.slice(cycleStart).concat(neighbor);
    }
  }

  path.pop();
  inStack.delete(node);
  return null;
}
