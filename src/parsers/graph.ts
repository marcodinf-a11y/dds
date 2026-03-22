/**
 * Generic directed-graph utilities for adjacency list construction
 * and cycle detection. Pure functions with no I/O or side effects.
 */

/**
 * Builds an adjacency list from a flat list of directed edges.
 *
 * All nodes referenced in any edge appear as keys in the returned Map,
 * even if they have no outgoing edges. This ensures complete DFS traversal
 * across disconnected components.
 *
 * @param edges - Array of directed edges, each with a `from` and `to` node ID.
 * @returns A Map where each key is a node ID and the value is an array of
 *          node IDs it has outgoing edges to.
 */
export function buildAdjacencyList(
  edges: Array<{ from: string; to: string }>
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();

  for (const { from, to } of edges) {
    if (!adjacency.has(from)) {
      adjacency.set(from, []);
    }
    adjacency.get(from)!.push(to);

    if (!adjacency.has(to)) {
      adjacency.set(to, []);
    }
  }

  return adjacency;
}

/** Color states for three-color DFS marking. */
const enum Color {
  WHITE = 0,
  GRAY = 1,
  BLACK = 2,
}

/**
 * Detects all cycles in a directed graph using DFS with three-color marking.
 *
 * - WHITE: unvisited node
 * - GRAY: node currently on the DFS recursion stack (in-progress)
 * - BLACK: node fully processed (all descendants visited)
 *
 * A back edge (encountering a GRAY node) indicates a cycle. Each detected
 * cycle is returned as an ordered array of node IDs forming the cycle path.
 *
 * @param adjacencyList - A Map where keys are node IDs and values are arrays
 *                        of outgoing neighbor node IDs.
 * @returns An array of cycles. Each cycle is an array of node IDs tracing the
 *          cycle path (starting and ending with the same node). Returns an
 *          empty array if the graph is acyclic.
 */
export function detectCycles(
  adjacencyList: Map<string, string[]>
): string[][] {
  const color = new Map<string, Color>();
  const cycles: string[][] = [];
  const path: string[] = [];

  for (const node of adjacencyList.keys()) {
    color.set(node, Color.WHITE);
  }

  for (const node of adjacencyList.keys()) {
    if (color.get(node) === Color.WHITE) {
      dfs(node, adjacencyList, color, path, cycles);
    }
  }

  return cycles;
}

/**
 * Recursive DFS helper for cycle detection.
 */
function dfs(
  node: string,
  adjacencyList: Map<string, string[]>,
  color: Map<string, Color>,
  path: string[],
  cycles: string[][]
): void {
  color.set(node, Color.GRAY);
  path.push(node);

  const neighbors = adjacencyList.get(node) ?? [];
  for (const neighbor of neighbors) {
    const neighborColor = color.get(neighbor) ?? Color.WHITE;
    if (neighborColor === Color.WHITE) {
      dfs(neighbor, adjacencyList, color, path, cycles);
    } else if (neighborColor === Color.GRAY) {
      const cycleStart = path.indexOf(neighbor);
      cycles.push(path.slice(cycleStart).concat(neighbor));
    }
  }

  path.pop();
  color.set(node, Color.BLACK);
}

/**
 * Detects a single cycle in a directed graph, if one exists.
 *
 * This is a convenience wrapper around {@link detectCycles} that returns the
 * first cycle found, or `null` if the graph is acyclic.
 *
 * @param adjacencyList - A Map where keys are node IDs and values are arrays
 *                        of outgoing neighbor node IDs.
 * @returns The first cycle found as an array of node IDs, or `null` if acyclic.
 */
export function detectCycle(
  adjacencyList: Map<string, string[]>
): string[] | null {
  const cycles = detectCycles(adjacencyList);
  return cycles.length > 0 ? cycles[0] : null;
}
