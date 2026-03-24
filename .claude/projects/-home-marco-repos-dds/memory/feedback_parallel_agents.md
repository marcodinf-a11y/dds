---
name: User prefers parallel agent execution with worktrees
description: How the user likes to work with Claude Code agents for task implementation and review
type: feedback
---

The user prefers dispatching multiple agents in parallel using `isolation: "worktree"` for both implementation and review tasks. Typical pattern:

1. Analyze task dependencies and file scope overlaps
2. Group tasks with no file overlaps into parallel batches
3. Launch all agents in one message with `run_in_background: true`
4. Merge branches sequentially after all complete, verify with `npx tsc --noEmit && npx vitest run`
5. Clean up worktrees and branches after merge

**Why:** The user ran 28 implementation tasks, 28 review tasks, and multiple fix iterations this way. It's fast and the user is comfortable with the workflow.

**How to apply:** Always check file scope overlaps before parallelizing. Tasks sharing files must run sequentially. After merging worktree branches, always verify build + tests. Clean up worktrees and branches promptly.

**Gotcha:** Worktree branches created from main sometimes show "Already up to date" when merging — this means the branch wasn't actually ahead of main. Verify files exist after merge. This happened with batch 2 and 3 implementations and required re-merging from the correct branch names.
