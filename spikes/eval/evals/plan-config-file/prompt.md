---
name: plan-config-file
runs: 1
model: sonnet
max_turns: 10
timeout_seconds: 300
plugins: ["../../../instructions"]
allowed_tools: [Read, Glob, Grep]
---
plan adding a config file to this project
