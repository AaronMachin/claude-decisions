#!/usr/bin/env bash
# Drives a real Claude Code with this mod in tmux and checks what is on the screen: the things the
# test kit can't show, because it doesn't behave like Claude Code in those places (focus, keys,
# typing). Each size gets a fresh scratch repository seeded with the testers' session, so nothing
# real is touched, and no prompt is ever sent to Claude, so a run costs no model usage.
#
#   tests/real/run.sh                 # 150x40 (the pane docked beside the chat) and 100x30 (above the prompt)
#   tests/real/run.sh 120x35          # one size
#   KEEP=1 tests/real/run.sh 150x40   # leave the tmux session and scratch folder for a look afterwards
#
# Needs tmux, node (for npx tsx) and a signed-in claude on PATH. Exits 1 if any check fails.
set -u

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SIZES=("$@")
[ ${#SIZES[@]} -eq 0 ] && SIZES=(150x40 100x30)
FAILED=0
S=""
COMPACT=0

screen() { tmux capture-pane -p -t "$S"; }

# What is typed in Claude's own prompt: the last line starting with ❯, cut at the pane's border.
prompt_text() { screen | grep '^❯' | tail -1 | sed 's/^❯ *//; s/│.*$//; s/[[:space:]]*$//'; }

# The screen with every space and box-drawing character taken out, so text wrapped across lines
# (or cut and drawn whole above a field) can be searched for as one string.
flat() { screen | tr -d ' \n│╭╮╰╯─▌›' ; }

keys() { tmux send-keys -t "$S" "$@"; sleep 0.4; }
type_text() { tmux send-keys -t "$S" -l "$1"; sleep 0.6; }

# Waits up to $2 seconds (default 10) for a line matching the extended regex $1.
wait_for() {
  local tries=$(( ${2:-10} * 4 ))
  for _ in $(seq "$tries"); do
    screen | grep -Eq -- "$1" && return 0
    sleep 0.25
  done
  return 1
}

pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAILED=1; }
check() { if "${@:2}"; then pass "$1"; else fail "$1"; fi; }

on_screen() { wait_for "$1" "${2:-5}"; }
not_on_screen() { ! screen | grep -Eq -- "$1"; }
# An empty prompt shows a dim suggestion (`Try "..."`), which counts as empty.
prompt_empty() { local text; text="$(prompt_text)"; [ -z "$text" ] || [[ "$text" == 'Try "'* ]]; }
prompt_lacks() { ! prompt_text | grep -Fq -- "$1"; }
flat_has() { flat | grep -Fq -- "$(printf '%s' "$1" | tr -d ' ')"; }

run_size() {
  local columns="${1%x*}" rows="${1#*x}"
  local root scratch id store
  root="$(mktemp -d)"
  scratch="$root/pantry"
  mkdir -p "$scratch" && git -C "$scratch" init -q
  id="$(node -e 'console.log(crypto.randomUUID())')"
  (cd "$scratch" && DECISIONS_SESSION="$id" npx -y tsx "$REPO/tests/replay/seed-ux.ts" >/dev/null) || { fail "seeding the scratch repository"; return; }
  store="$(cd "$scratch" && npx -y tsx "$REPO/tests/real/store-dir.ts")"
  S="decisions-real-$$-$columns-$rows"

  echo "$columns x $rows"
  tmux new-session -d -s "$S" -x "$columns" -y "$rows" -c "$scratch" "claude --plugin-dir '$REPO' --session-id $id --model sonnet"
  # A new folder asks whether to trust it; Enter alone picks "No, exit".
  if wait_for 'trust this folder|^❯' 30 && screen | grep -q 'trust this folder'; then
    sleep 1
    keys Down
    wait_for '❯ Yes, I trust' 5 && keys Enter
  fi
  wait_for '^❯' 30 || { fail "Claude Code started"; cleanup "$root" "$store"; return; }
  sleep 2

  drive
  cleanup "$root" "$store"
}

# Enter, but only while Claude's prompt is empty and no box in the pane has the keys (a box with the
# keys shows `⏎ submit`): an enter in either sends to Claude. Text that got into the prompt is
# cleared (ctrl+u), and the run for this size stops.
safe_enter() {
  if screen | grep -q '⏎ submit'; then
    fail "a box in the pane had the keys before an enter; stopped this size"
    return 1
  fi
  if prompt_empty; then
    keys Enter
    return 0
  fi
  fail "text reached Claude's prompt before an enter; cleared it and stopped this size"
  keys C-u
  return 1
}

# On a short pane (under 110 columns the pane sits above the prompt, about 9 rows) t opens the
# whole thread, where enter on "Ask a question" opens the box; on a tall one t puts the ring in the
# decision's own ask box.
open_ask_box() {
  keys t
  if wait_for '\[ Ask a question \]' 2; then
    COMPACT=1
    safe_enter || return 1
    wait_for 'enter sends' 3
  else
    COMPACT=0
  fi
}

# Out of the box without sending (enter in a box sends to Claude): up, the way the key line says, then
# tab. Only on a tall pane: on a short one the thread's box has no way out but enter or esc, so the
# run there stops after the typing checks.
leave_ask_box() {
  keys Up
  [ "${1:-}" = check ] && check "up leaves the ask box (the key line stops saying send to Claude)" not_on_screen 'enter: send to Claude'
  keys Tab
}

drive() {
  type_text '/decisions'
  keys Enter
  check "/decisions opens the pane on the seeded session" on_screen 'Pantry: sharing recipes by link|Recipe printing' 10
  check "the ring starts on the first waiting row" on_screen '› .*d79'
  safe_enter || return
  check "enter opens that decision" on_screen 'What a printed recipe|d79 ·'
  keys Down
  check "down moves the ring from the recommended option to the next" on_screen '› +3[: ]'

  open_ask_box || return
  type_text 'hello from the script'
  check "the ask box takes the typing" flat_has 'hello from the script'
  check "... and none of it reaches Claude's prompt" prompt_lacks 'hello'
  local long='and a long tail typed in one go so that every letter has to arrive 0123456789 abcdefghij'
  type_text " $long"
  sleep 1
  check "a long burst of typing keeps every letter" flat_has "hello from the script $long"
  check "... and none of it reaches Claude's prompt" prompt_lacks 'tail typed'
  prompt_empty || { keys C-u; fail "cleared text that reached Claude's prompt; stopped this size"; return; }
  if [ "$COMPACT" = 1 ]; then
    keys Escape
    check "esc gives the keys back with Claude's prompt still empty" prompt_empty
    return
  fi

  leave_ask_box check
  keys b
  check "b goes back to the list" on_screen '◆ Recipe printing'
  keys Down
  keys Down
  safe_enter || return
  check "the next decision opens" on_screen 'Whether to print in colour|d80 ·'
  open_ask_box || return
  check "its ask box starts empty, not with the last decision's draft" not_on_screen 'hello from the script'
  leave_ask_box
  keys b
  keys h
  check "h hides the pane" not_on_screen 'Recipe printing'
  check "Claude's prompt is still empty" prompt_empty
}


cleanup() {
  if [ -n "${KEEP:-}" ]; then
    echo "  kept: tmux session $S, scratch folder $1, decisions folder $2"
    return
  fi
  tmux kill-session -t "$S" 2>/dev/null
  [ -d "$1" ] && rm -rf -- "$1"
  case "$2" in
    */.claude/decisions/*) rm -rf "$2" ;;
  esac
}

command -v tmux >/dev/null || { echo "needs tmux"; exit 2; }
command -v claude >/dev/null || { echo "needs claude on PATH"; exit 2; }
for size in "${SIZES[@]}"; do
  run_size "$size"
done
[ "$FAILED" -eq 0 ] && echo "All checks passed." || echo "Some checks failed."
exit "$FAILED"
