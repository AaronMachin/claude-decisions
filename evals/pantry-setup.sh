#!/bin/sh
# Makes the small "Pantry" recipe app the evals run against: a git repository with five commits.
# Writes files and git state in the current folder only. No network, nothing outside the folder.
set -e

git init -q
git config user.name "Pantry Dev"
git config user.email "dev@pantry.test"
git checkout -q -b main 2>/dev/null || true

cat > README.md <<'EOT'
# Pantry

A tiny recipe keeper. `python3 app.py list` shows every recipe.
EOT
cat > app.py <<'EOT'
import sys

RECIPES = [
    {"name": "Pancakes", "minutes": 20, "tags": ["breakfast"]},
    {"name": "Lentil soup", "minutes": 45, "tags": ["dinner", "vegan"]},
    {"name": "Flapjacks", "minutes": 35, "tags": ["snack"]},
]


def list_recipes():
    for recipe in RECIPES:
        print(f"{recipe['name']} ({recipe['minutes']} min)")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "list":
        list_recipes()
EOT
git add -A
git commit -q -m "Add the recipe list"

cat >> app.py <<'EOT'


def search(term):
    return [r for r in RECIPES if term.lower() in r["name"].lower()]
EOT
git add -A
git commit -q -m "Add search by name"

python3 - <<'EOT'
import re
text = open("app.py").read()
text = text.replace('"tags": ["breakfast"]}', '"tags": ["breakfast"], "favourite": True}')
open("app.py", "w").write(text)
EOT
git add -A
git commit -q -m "Mark Pancakes as a favourite"

cat >> README.md <<'EOT'

## To do

- Share a recipe with someone by link
- Scale a recipe up or down
EOT
git add -A
git commit -q -m "Note what is next in the README"

python3 - <<'EOT'
text = open("app.py").read()
text = text.replace('print(f"{recipe[\'name\']} ({recipe[\'minutes\']} min)")', 'print(f"{recipe[\'name\']} ({recipe[\'minutes\'] * 60} min)")')
open("app.py", "w").write(text)
EOT
git add -A
git commit -q -m "Show times in one place"
