---
type: regex
target: last_message
match: not_contains
flags: m
pattern: "(^[ \\t]*(\\d+[.)]|[-*])[ \\t]+.*\\?[*_`)\"']*[ \\t]*$[\\s\\S]*){2}"
---
Approximates isQuestionsInChat rule 2: fewer than two list lines ending in a question mark.
