---
name: what-next
runs: 1
model: sonnet
max_turns: 10
timeout_seconds: 300
plugins: ["../../../instructions"]
allowed_tools: [Read, Glob, Grep]
---
what should we do next?
