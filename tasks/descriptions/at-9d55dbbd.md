# at-9d55dbbd: Impl Schema: Graph Utilities

## Objective

After this task, the project has a standalone directed-graph utility module at `src/parsers/graph.ts` that can build adjacency lists and detect cycles using DFS. This module is shared infrastructure used by the impl-doc Ring 0 validator (R0-I47 dependency acyclicity) and later by the atomic-task Ring 0 validator (R0-T08 task dependency acyclicity).

## Context

The impl-doc dependency graph is formed by the `dependencies` field on each `ImplDefinition`. R0-I47 requires that this graph is acyclic -- no implementation document may directly or transitively depend on itself.

The graph utilities must be generic (not coupled to `ImplDefinition` or any specific domain type) so that impl-9f4b1c7d (Atomic Task Schema and Validation) can reuse them for R0-T08 task dependency checking.

**Location:** `src/parsers/graph.ts`, alongside the existing `src/parsers/markdown.ts` (shared Markdown heading extractor from impl-7e2a9f1b).

**Pattern:** Pure functions, no I/O, explicit return types, generic string-keyed data structures.

**DFS cycle detection algorithm:** Standard iterative or recursive DFS with three-color marking (white/gray/black). A back edge (encountering a gray node) indicates a cycle. The function should return the list of cycles found (each cycle as an array of node IDs) or an empty array if acyclic.

## Approach

1. Create `src/parsers/graph.ts`.

2. Implement and export `buildAdjacencyList(edges: Array<{ from: string; to: string }>): Map<string, string[]>`. This takes a flat list of directed edges and returns an adjacency list as a Map. Ensure all nodes appear as keys even if they have no outgoing edges (needed for complete DFS traversal).

3. Implement and export `detectCycles(adjacencyList: Map<string, string[]>): string[][]`. This performs DFS cycle detection on the adjacency list and returns an array of cycles. Each cycle is represented as an ordered array of node IDs forming the cycle path. Return an empty array if the graph is acyclic.
   - Use three-color marking: WHITE (unvisited), GRAY (in current DFS path), BLACK (fully processed).
   - When a GRAY node is encountered, extract the cycle from the recursion stack.
   - Iterate over all nodes to handle disconnected components.

4. Add explicit TypeScript return types and JSDoc comments for both functions.

5. Verify with `npx tsc --noEmit`.

## Constraints

- Do not import or reference `ImplDefinition`, `AtomicTaskDefinition`, or any domain-specific types. The module must be fully generic.
- Do not perform any file I/O or use Node.js fs APIs.
- Do not add external dependencies. Use only built-in JavaScript/TypeScript constructs.
- Do not modify `src/parsers/markdown.ts`.
- Keep the module to a single file (`src/parsers/graph.ts`).

## References

- spec-fa3a90b8#implementation-documents -- R0-I47 requires dependency graph acyclicity
- at-3a0e5e9c -- Provides ImplDefinition which contains the dependencies field (type awareness, not import)
- at-e1c51f43 -- Ring 0 validator imports buildAdjacencyList and detectCycles for R0-I47
- at-3a7815aa -- Unit tests will cover graph utility functions
