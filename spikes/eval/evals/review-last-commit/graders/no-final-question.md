---
type: regex
target: last_message
match: not_contains
pattern: "\\?[*_`)\"'\\s]*$"
---
Approximates isQuestionsInChat rule 1: the final text does not end in a question mark. (No custom-code graders exist, so the function itself cannot run.)
