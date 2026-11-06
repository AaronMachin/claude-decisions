---
name: review-last-commit
runs: 1
model: sonnet
max_turns: 10
timeout_seconds: 300
plugins: ["../../../instructions"]
allowed_tools: [Read, Glob, Grep]
---
review the last commit
