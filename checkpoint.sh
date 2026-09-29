#!/usr/bin/env bash
# Checkpoint every worktree's live state (tracked edits AND new untracked files, .gitignore respected) to a
# backup/<branch> ref on origin, and the lead's scratchpad notes to backup/lead-notes — without touching any
# worktree's index, HEAD or files, so agents working in them are never disturbed. Safe to run at any time.
# Usage: checkpoint.sh            (once)        checkpoint.sh --loop N   (every N minutes, forever)
REPO=/home/user/A-game-of-thrones-local-game
SCRATCH=/tmp/claude-0/-home-user-A-game-of-thrones-local-game/1a59ec30-8b4e-5558-8c33-823b20aa5156/scratchpad
LOG="$SCRATCH/checkpoint.log"

snap() { # snap <worktree> <ref-name> <message>
  local wt="$1" ref="$2" msg="$3" idx; idx=$(mktemp -u)
  local head; head=$(git -C "$wt" rev-parse -q --verify HEAD 2>/dev/null)
  [ -n "$head" ] && GIT_INDEX_FILE="$idx" git -C "$wt" read-tree "$head"
  # add everything the worktree holds except ignored files and the node_modules symlink
  GIT_INDEX_FILE="$idx" git -C "$wt" add -A 2>>"$LOG" || { rm -f "$idx"; return 1; }
  local tree; tree=$(GIT_INDEX_FILE="$idx" git -C "$wt" write-tree) || { rm -f "$idx"; return 1; }
  rm -f "$idx"
  local parent=(); [ -n "$head" ] && parent=(-p "$head")
  # skip when nothing changed since the last backup of this ref
  local last; last=$(git -C "$REPO" rev-parse -q --verify "refs/backup-last/$ref^{tree}" 2>/dev/null)
  [ "$last" = "$tree" ] && return 0
  local c; c=$(git -C "$wt" commit-tree "$tree" "${parent[@]}" -m "$msg") || return 1
  git -C "$REPO" update-ref "refs/backup-last/$ref" "$c"
  git -C "$REPO" push -q -f origin "$c:refs/heads/backup/$ref" >>"$LOG" 2>&1 && echo "$(date -u +%FT%TZ) $ref $c" >>"$LOG"
}

once() {
  local when; when=$(date -u +%FT%TZ)
  git -C "$REPO" worktree list --porcelain | awk '/^worktree /{w=$2} /^branch /{sub("refs/heads/","",$2); print w" "$2}' |
  while read -r wt br; do
    [ "$wt" = "$REPO" ] && continue
    snap "$wt" "$br" "checkpoint $when: live state of $br (WIP, not for merging)"
  done
  # the lead's notes: plan, prompts, reports, scripts (small top-level files only; not the repo copies agents left)
  local notes; notes=$(mktemp -d)
  find "$SCRATCH" -maxdepth 1 -type f \( -name '*.md' -o -name '*.sh' -o -name '*.py' -o -name '*.mjs' -o -name '*.json' -o -name '*.log' \) -size -2M -exec cp {} "$notes"/ \;
  local idx; idx=$(mktemp -u)
  GIT_INDEX_FILE="$idx" git -C "$REPO" --work-tree="$notes" add -A . 2>>"$LOG" && {
    local tree c; tree=$(GIT_INDEX_FILE="$idx" git -C "$REPO" write-tree)
    local last; last=$(git -C "$REPO" rev-parse -q --verify "refs/backup-last/lead-notes^{tree}" 2>/dev/null)
    if [ "$last" != "$tree" ]; then
      c=$(git -C "$REPO" commit-tree "$tree" -m "lead notes $when (plan, prompts, reports)")
      git -C "$REPO" update-ref refs/backup-last/lead-notes "$c"
      git -C "$REPO" push -q -f origin "$c:refs/heads/backup/lead-notes" >>"$LOG" 2>&1 && echo "$when lead-notes $c" >>"$LOG"
    fi
  }
  rm -rf "$notes" "$idx"
}

if [ "$1" = "--loop" ]; then
  while true; do once; sleep $(( ${2:-10} * 60 )); done
else
  once
fi
