---
allowed-tools: Agent, Read, Edit, Write, Bash(git:*), WebSearch, Ref MCP, RepoPrompt MCP
argument-hint: [task-number]
description: Execute task using the Explore→Plan→Code→Commit workflow
---

# Task #$ARGUMENTS - Four-Phase Execution Protocol

You will work on **Task #$ARGUMENTS** following the proven Explore→Plan→Code→Commit workflow. Each phase is critical and must be completed sequentially.

## 📚 PHASE 1: EXPLORE (No coding yet!)

**DO NOT WRITE ANY CODE IN THIS PHASE.**

### Primary exploration:
1. Read @.kiro/specs/spec-name/tasks.md and locate Task #$ARGUMENTS - understand every requirement. There will be different specs, so technically, every spec created will have a different folder. 
2. Read ALL files in @.kiro/docs/ folder to understand:
   - What has been accomplished so far
   - Reference materials and specifications
   - Dependencies and constraints
   - Similar completed tasks

### Deep investigation with sub-agents:
**Use sub-agents liberally in this phase** to preserve context. Spawn sub-agents to:
- Investigate technical unknowns mentioned in the task
- Research best practices for any libraries/APIs involved
- Analyze similar code patterns in the codebase
- Verify assumptions about existing functionality
- Check for potential edge cases or conflicts

### Codebase reconnaissance:
- Search for related files that might be affected
- Understand the current implementation if modifying existing features
- Identify test files that need updating
- Note any configuration or documentation that needs changes

**Output of Phase 1**: Mental model of the problem space and all relevant context loaded.

## 🎯 PHASE 2: PLAN (Think deeply!)

**Think harder** about the approach before proceeding. Consider:

### Strategic planning:
1. What are ALL the components that need to be created/modified?
2. What's the optimal order of implementation?
3. What could go wrong? What are the non-obvious dependencies?
4. Are there multiple valid approaches? What are the trade-offs?

### Document the plan:
Create or update @docs/task-$ARGUMENTS-plan.md with:
- **Objective**: Clear statement of what Task #$ARGUMENTS accomplishes
- **Approach**: Step-by-step implementation strategy
- **Components**: List of files to create/modify
- **Testing Strategy**: How we'll verify correctness
- **Rollback Plan**: How to undo if something goes wrong
- **Success Criteria**: Measurable definition of "done"

### Decomposition for sub-agents:
Identify which parts can be parallelized:
- Independent module creation
- Test writing for different components
- Documentation updates
- Research tasks that don't block implementation

**CHECKPOINT**: Show me the plan. If it looks good, we'll proceed. If not, we can refine it here before any code is written.

## 💻 PHASE 3: CODE (Implement with verification)

**Think carefully** and only execute the specific task I have given you with the most concise and elegant solution that changes as little code as possible.

### Implementation approach:
1. Start with the most critical/risky component first
2. **Use sub-agents** for parallel work:
   - One sub-agent writes tests while another implements
   - Separate sub-agents for different module implementations
   - Dedicated sub-agent for documentation updates

### Incremental verification:
After each component:
- Run relevant tests
- Verify the solution's reasonableness
- Check for unintended side effects
- Update @docs/task-$ARGUMENTS-progress.md with what's complete

### Quality checks:
- Code follows patterns seen in Phase 1 exploration
- All edge cases from the plan are handled
- Tests pass and coverage is adequate
- No regression in existing functionality

## ✅ PHASE 4: COMMIT (Finalize and document)

### Pre-commit checklist:
1. All tests passing
2. Code follows project style (check CLAUDE.md guidelines)
3. Documentation updated where needed
4. Task marked as complete in @tasks.md

### Git operations:
# Create meaningful commit message based on the changes
git add -A
git commit -m "feat: Complete Task #$ARGUMENTS - [brief description]

- [List key changes]
- [Note any important decisions]

Closes: Task #$ARGUMENTS"


# Create PR (if applicable):
bash# Create pull request with comprehensive description
gh pr create --title "Task #$ARGUMENTS: [Title]" --body "
## Overview
[Summary from the plan]

## Changes
[Detailed list of modifications]

## Testing
[How it was tested]

## Documentation
Updated in @docs/task-$ARGUMENTS-plan.md
"
Final documentation:
Update:
- Mark .kiro/specs/jtbd-assistant-platform/tasks.md $ARGUMENTS as done as soon as everything is approved 
- @.kiro/docs/completed/$ARGUMENTS.md → Mark as COMPLETED with date
README.md if there are user-facing changes
- Update .kiro/docs/reference files if needed. For example, if the task is to create a new endpoint, check if it needs to be added to the API reference, and do not create a new file

