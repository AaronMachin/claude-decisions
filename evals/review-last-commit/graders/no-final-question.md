---
type: regex
target: last_message
match: not_contains
pattern: "\\?[*_`)\"'\\s]*$"
---
Approximates isQuestionsInChat rule 1: the final text does not end in a question mark. The real function is unit tested; the eval has no custom-code graders.
