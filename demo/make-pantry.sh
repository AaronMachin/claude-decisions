#!/bin/sh
# Makes the made-up "Pantry" recipe app as a new git project for recording the README's GIFs.
#
#   demo/make-pantry.sh [--seed] [folder]
#
# With no folder it makes one with mktemp -d. A given folder must be empty or not exist yet,
# and must not be inside this repository. --seed also fills the project's decisions store
# (needs Node, for npx). The last line printed is the project's folder.
set -e

repo=$(cd "$(dirname "$0")/.." && pwd -P)
seed=no
folder=

for arg in "$@"; do
  case "$arg" in
    --seed) seed=yes ;;
    -*) echo "Unknown option: $arg. Usage: demo/make-pantry.sh [--seed] [folder]" >&2; exit 1 ;;
    *) folder=$arg ;;
  esac
done

if [ "$seed" = yes ] && ! command -v npx >/dev/null 2>&1; then
  echo "--seed needs Node (npx) on PATH." >&2
  exit 1
fi

if [ -z "$folder" ]; then
  folder=$(mktemp -d)
else
  parent=$(cd "$(dirname "$folder")" 2>/dev/null && pwd -P) || {
    echo "The folder above $folder doesn't exist." >&2
    exit 1
  }
  folder="$parent/$(basename "$folder")"
  case "$folder/" in
    "$repo"/*)
      echo "$folder is inside the claude-decisions repository. Give a folder outside it." >&2
      exit 1
      ;;
  esac
  mkdir -p "$folder"
  if [ -n "$(ls -A "$folder")" ]; then
    echo "$folder is not empty. Give an empty or new folder." >&2
    exit 1
  fi
fi
folder=$(cd "$folder" && pwd -P)

cd "$folder"
sh "$repo/evals/pantry-setup.sh"
rm -f last-commit.diff

if [ "$seed" = yes ]; then
  npx -y tsx "$repo/demo/seed.ts"
fi

echo "$folder"
