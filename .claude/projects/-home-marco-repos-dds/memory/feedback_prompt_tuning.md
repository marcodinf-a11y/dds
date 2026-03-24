---
name: LLM validation prompt tuning lessons
description: Patterns learned from tuning Ring 1 and Ring 2 validation prompts to reduce false positives
type: feedback
---

When Ring 1/Ring 2 LLM validation prompts produce persistent false positives, the fix belongs in the prompt, not in the spec or impl doc.

**Why:** The first R1-S02 (atomicity) prompt flagged 17 requirements as non-atomic. After reviewing each one with the user, only 1 was genuinely non-atomic. The prompt was too aggressive about flagging enumeration patterns.

**How to apply:**
- Add explicit "do NOT flag" examples to prompts, covering the exact patterns that caused false positives
- Raise the confidence bar: "if unsure, it's probably fine"
- Require the LLM to name the two independent behaviors when flagging — this forces precision
- Test prompt changes by running `npx tsx src/cli/validate-spec.ts spec-fa3a90b8` (Ring 0 only) or the full pipeline
- R2-I13 (design decision completeness) in `src/validators/impl/ring2.ts` still needs the same treatment — it's too strict about task-level implementation details

Prompt files:
- Spec Ring 1: `src/validators/spec/ring1.ts`
- Spec Ring 2: `src/validators/spec/ring2.ts`
- Impl Ring 1: `src/validators/impl/ring1.ts`
- Impl Ring 2: `src/validators/impl/ring2.ts`
- Task Ring 1: `src/validators/task/ring1.ts`
- Task Ring 2: `src/validators/task/ring2.ts`
