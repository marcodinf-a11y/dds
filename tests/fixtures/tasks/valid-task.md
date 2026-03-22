# at-a1b2c3d4: Valid Test Task

## Objective

Create a valid test task for unit testing the Ring 0 validator.

## Context

This fixture is used by the task-validator.test.ts test suite to verify that the validator correctly passes valid task definitions and descriptions.

## Approach

1. Create a valid task definition JSON file at `tests/fixtures/tasks/valid-task.json`.
2. Create this matching markdown description file.
3. Use both fixtures in unit tests for `validateTaskRing0`.

## Constraints

- Do not modify any source files.
- This fixture must remain valid across all R0-T rules.

## References

- spec-fa3a90b8#atomic-tasks -- Defines the task schema and validation rules
- at-11111111 -- Dependency task (simulated)
