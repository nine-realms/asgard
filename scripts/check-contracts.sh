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
AGENTS_DIR="$REPO_ROOT/com.github.copilot/agents"
AGENT="$AGENTS_DIR/odin.agent.md"
SURTR="$AGENTS_DIR/surtr.agent.md"
VIDAR="$AGENTS_DIR/vidar.agent.md"

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

# ── 1c. Vidar lean-reviewer contract ───────────────────────────────────
# Vidar is the autonomous worker variant: Frigg (plan) + Mimir (code) only.
# It must define the two review check names it uses, and must NOT carry the
# full panel (Tyr / Heimdall / Thor / Loki) or the user-approval override.
echo "▸ Vidar lean-reviewer contract"

for vname in review-frigg review-mimir; do
  if ! grep -q "$vname" "$VIDAR" 2>/dev/null; then
    fail "$vname missing from vidar.agent.md"
  else
    pass "$vname present in vidar"
  fi
done

for absent in review-tyr review-heimdall review-thor review-loki review-frigg-approved; do
  if grep -q "$absent" "$VIDAR" 2>/dev/null; then
    fail "$absent should NOT appear in vidar.agent.md (lean autonomous worker)"
  else
    pass "$absent correctly absent from vidar"
  fi
done

# Vidar never prompts a user — there must be no ask_user call in the spec.
if grep -q "ask_user" "$VIDAR" 2>/dev/null; then
  fail "ask_user found in vidar.agent.md — Vidar must be fully autonomous"
else
  pass "vidar.agent.md has no ask_user calls"
fi

# ── 2. Skill file existence ─────────────────────────────────────────────
# Skills referenced in any agent file (Odin, Surtr, Vidar) must have SKILL.md files.
echo "▸ Skill file existence"

# Dynamically extract skill names from skill("...") invocations in all agent files.
SKILL_NAMES=$(grep -Eo 'skill\("([^"]+)"\)' "$AGENT" "$SURTR" "$VIDAR" | sed 's/.*skill("//;s/")//' | sort -u || true)

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

MIMIR="$AGENTS_DIR/mimir.agent.md"

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

# ── 4b. Plugin version ↔ marketplace catalog ────────────────────────────
# The marketplace entry's plugin version must match plugin.json, or /plugin
# update notifications silently stop working for marketplace installs.
echo "▸ Plugin version ↔ marketplace"

MARKETPLACE="$REPO_ROOT/.github/plugin/marketplace.json"
MP_VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$MARKETPLACE','utf8')).plugins[0].version)" 2>/dev/null || true)
if [ -z "$MP_VERSION" ]; then
  fail "Could not parse plugins[0].version from .github/plugin/marketplace.json"
elif [ "$MP_VERSION" = "$PLUGIN_VERSION" ]; then
  pass "marketplace plugins[0].version matches plugin.json ($PLUGIN_VERSION)"
else
  fail "marketplace.json plugins[0].version ($MP_VERSION) != plugin.json ($PLUGIN_VERSION)"
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
