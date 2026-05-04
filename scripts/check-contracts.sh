#!/usr/bin/env bash
# check-contracts.sh — validates cross-file contracts in the asgard repo.
# Run via: make check
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0

pass() { printf "  ✅ %s\n" "$1"; }
fail() { printf "  ❌ %s\n" "$1"; ERRORS=$((ERRORS + 1)); }

# ── 1. Check-name contract ──────────────────────────────────────────────
# Names defined in the skill must match gate queries in odin.agent.md.
echo "▸ Check-name contract (skill ↔ agent gates)"

SKILL="$REPO_ROOT/skills/odin-review-prompts/SKILL.md"
AGENT="$REPO_ROOT/agents/odin.agent.md"
SURTR="$REPO_ROOT/agents/surtr.agent.md"

for name in review-tyr review-mimir review-heimdall review-thor review-loki; do
  if ! grep -q "$name" "$SKILL" 2>/dev/null; then
    fail "$name missing from skill file"
  elif ! grep -q "$name" "$AGENT" 2>/dev/null; then
    fail "$name missing from odin.agent.md gate queries"
  elif ! grep -q "$name" "$SURTR" 2>/dev/null; then
    fail "$name missing from surtr.agent.md gate queries"
  else
    pass "$name present in skill, odin, and surtr"
  fi
done

# ── 1b. Frigg timeout/approved contract ────────────────────────────────
# Both agent files must define the new review-frigg-approved and review-frigg-timeout check names
# in their gate/ledger SQL so the Frigg approval split is consistent.
echo "▸ Frigg timeout contract (agent gates)"

for frigg_name in review-frigg-approved review-frigg-timeout; do
  if ! grep -q "$frigg_name" "$AGENT" 2>/dev/null; then
    fail "$frigg_name missing from odin.agent.md"
  elif ! grep -q "$frigg_name" "$SURTR" 2>/dev/null; then
    fail "$frigg_name missing from surtr.agent.md"
  else
    pass "$frigg_name present in odin and surtr"
  fi
done

# Gate registry in both agents must use the IN() form that covers review-frigg-approved.
if ! grep -q "IN ('review-frigg','review-frigg-approved')" "$AGENT" 2>/dev/null; then
  fail "Odin Gate Registry 3a missing IN ('review-frigg','review-frigg-approved') gate"
else
  pass "Odin Gate Registry 3a uses correct IN() gate for Frigg approval"
fi

if ! grep -q "IN ('review-frigg','review-frigg-approved')" "$SURTR" 2>/dev/null; then
  fail "Surtr Gate Registry 3a missing IN ('review-frigg','review-frigg-approved') gate"
else
  pass "Surtr Gate Registry 3a uses correct IN() gate for Frigg approval"
fi

# ── 2. Skill file existence ─────────────────────────────────────────────
# Skills referenced in odin.agent.md must have SKILL.md files.
echo "▸ Skill file existence"

# Dynamically extract skill names from skill("...") invocations in both agent files.
SKILL_NAMES=$(grep -Eo 'skill\("([^"]+)"\)' "$AGENT" "$SURTR" | sed 's/.*skill("//;s/")//' | sort -u || true)

if [ -z "$SKILL_NAMES" ]; then
  fail "No skill(\"...\") invocations found in agent file"
else
  while IFS= read -r skill; do
    if [ -s "$REPO_ROOT/skills/$skill/SKILL.md" ]; then
      pass "skills/$skill/SKILL.md exists"
    else
      fail "skills/$skill/SKILL.md missing or empty"
    fi
  done <<< "$SKILL_NAMES"
fi

# ── 3. Panel mode contract ──────────────────────────────────────────────
# review_context=panel must appear in both the skill and mimir.agent.md.
echo "▸ Panel mode contract (skill ↔ mimir)"

MIMIR="$REPO_ROOT/agents/mimir.agent.md"

if grep -q "review_context=panel" "$SKILL" 2>/dev/null; then
  pass "review_context=panel in skill"
else
  fail "review_context=panel missing from skill"
fi

if grep -q "review_context=panel" "$MIMIR" 2>/dev/null; then
  pass "review_context=panel in mimir.agent.md"
else
  fail "review_context=panel missing from mimir.agent.md"
fi

# ── 4. Plugin version ↔ CHANGELOG ───────────────────────────────────────
# The version in plugin.json must appear somewhere in CHANGELOG.md.
echo "▸ Plugin version ↔ CHANGELOG"

PLUGIN_VERSION=$(grep -o '"version": *"[^"]*"' "$REPO_ROOT/plugin.json" | grep -o '[0-9][0-9.]*' || true)
if [ -z "$PLUGIN_VERSION" ]; then
  fail "Could not parse version from plugin.json"
elif grep -q "$PLUGIN_VERSION" "$REPO_ROOT/CHANGELOG.md" 2>/dev/null; then
  pass "v$PLUGIN_VERSION found in CHANGELOG.md"
else
  fail "v$PLUGIN_VERSION not found in CHANGELOG.md"
fi

# ── 5. No duplicate models within H/T/L rows ────────────────────────────
# Each row of the Heimdall/Thor/Loki table must have 3 distinct models.
echo "▸ H/T/L model uniqueness per row"

# Extract table rows (lines starting with |, excluding header/separator)
TABLE_ROWS=$(sed -n '/^|.*Heimdall.*Thor.*Loki/,/^$/p' "$SKILL" \
  | grep '^|' | grep -v 'Odin' | grep -v '^\s*|--' || true)

if [ -z "$TABLE_ROWS" ]; then
  fail "Could not find H/T/L model selection table in skill"
else
  ROW_NUM=0
  while IFS= read -r row; do
    ROW_NUM=$((ROW_NUM + 1))
    # Extract only H/T/L columns (2, 3, 4 — pipe-delimited fields 3, 4, 5)
    heimdall=$(echo "$row" | awk -F'|' '{gsub(/[ `]/, "", $3); print $3}')
    thor=$(echo "$row"     | awk -F'|' '{gsub(/[ `]/, "", $4); print $4}')
    loki=$(echo "$row"     | awk -F'|' '{gsub(/[ `]/, "", $5); print $5}')
    unique_count=$(printf "%s\n%s\n%s\n" "$heimdall" "$thor" "$loki" | sort -u | wc -l | tr -d ' ')
    if [ "$unique_count" -eq 3 ]; then
      pass "Row $ROW_NUM: all H/T/L models unique"
    else
      fail "Row $ROW_NUM: duplicate model in H/T/L ($heimdall, $thor, $loki)"
    fi
  done <<< "$TABLE_ROWS"
fi

# ── Summary ──────────────────────────────────────────────────────────────
echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo "All contract checks passed ✅"
  exit 0
else
  echo "$ERRORS contract check(s) failed ❌"
  exit 1
fi
