#!/usr/bin/env python3
"""Compare three benchmark result markdown files (baseline, terse control, candidate)."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


def strip_md(text: str) -> str:
    return re.sub(r"[*`_]", "", text).strip()


def parse_number(cell: str) -> float | None:
    matches = re.findall(r"-?\d+(?:\.\d+)?", cell)
    if not matches:
        return None
    return float(matches[-1])


def parse_scores(path: Path) -> tuple[dict[str, float], float | None]:
    rows: dict[str, float] = {}
    average: float | None = None

    lines = path.read_text().splitlines()
    table_start = None
    for idx, raw_line in enumerate(lines):
        if re.match(r"^\|\s*Model\s*\|", strip_md(raw_line), flags=re.IGNORECASE):
            table_start = idx + 1
            break

    if table_start is None:
        raise ValueError(f"Could not find a score table with a 'Model' header in {path}")

    for raw_line in lines[table_start:]:
        line = raw_line.strip()
        if not line.startswith("|"):
            # Stop at first non-table line after entering the score table
            if rows or average is not None:
                break
            continue

        cells = [strip_md(c) for c in line.strip("|").split("|")]
        if len(cells) < 2:
            continue

        name = cells[0]
        lowered = name.lower()

        if not name or lowered in {"model", "version"}:
            continue
        if all(ch in "-:" for ch in lowered):
            continue

        total = parse_number(cells[-1])
        if total is None:
            continue

        if lowered in {"average", "avg"}:
            average = total
            continue

        rows[name] = total

    if average is None and rows:
        average = round(sum(rows.values()) / len(rows), 2)

    return rows, average


def model_order_key(model: str) -> tuple[int, int | str]:
    canonical = model.lower()
    order = [
        "claude-opus-4.6",
        "claude-sonnet-4.6",
        "gpt-5.4",
        "gpt-5.3-codex",
    ]
    if canonical in order:
        return (0, order.index(canonical))
    return (1, canonical)


def fmt(value: float | None) -> str:
    if value is None:
        return "—"
    if float(value).is_integer():
        return str(int(value))
    return f"{value:.2f}"


def fmt_delta(value: float | None) -> str:
    if value is None:
        return "—"
    if abs(value) < 0.005:
        value = 0.0
    return f"{value:+.2f}"


def compare(
    baseline: tuple[dict[str, float], float | None],
    terse: tuple[dict[str, float], float | None],
    candidate: tuple[dict[str, float], float | None],
) -> str:
    base_rows, base_avg = baseline
    terse_rows, terse_avg = terse
    cand_rows, cand_avg = candidate

    models = sorted(
        set(base_rows) | set(terse_rows) | set(cand_rows),
        key=model_order_key,
    )

    lines = [
        "## Three-Arm Benchmark Comparison",
        "",
        "| Model | Baseline | Terse control | Candidate | Δ(C-B) | Δ(C-T) |",
        "|------|:--------:|:-------------:|:---------:|:------:|:------:|",
    ]

    for model in models:
        b = base_rows.get(model)
        t = terse_rows.get(model)
        c = cand_rows.get(model)
        delta_cb = None if c is None or b is None else c - b
        delta_ct = None if c is None or t is None else c - t
        lines.append(
            f"| {model} | {fmt(b)} | {fmt(t)} | {fmt(c)} | {fmt_delta(delta_cb)} | {fmt_delta(delta_ct)} |"
        )

    avg_delta_cb = None if cand_avg is None or base_avg is None else cand_avg - base_avg
    avg_delta_ct = None if cand_avg is None or terse_avg is None else cand_avg - terse_avg
    lines.extend(
        [
            f"| **Average** | **{fmt(base_avg)}** | **{fmt(terse_avg)}** | **{fmt(cand_avg)}** | **{fmt_delta(avg_delta_cb)}** | **{fmt_delta(avg_delta_ct)}** |",
            "",
            "- **Δ(C-B)**: candidate vs baseline",
            "- **Δ(C-T)**: candidate vs terse control",
        ]
    )

    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compare baseline/terse/candidate benchmark markdown files."
    )
    parser.add_argument("--baseline", type=Path, required=True, help="Baseline result markdown path")
    parser.add_argument(
        "--terse-control", type=Path, required=True, help="Terse-control result markdown path"
    )
    parser.add_argument("--candidate", type=Path, required=True, help="Candidate result markdown path")
    parser.add_argument("--out", type=Path, help="Optional output markdown path")
    args = parser.parse_args()

    for path in (args.baseline, args.terse_control, args.candidate):
        if not path.exists():
            raise FileNotFoundError(f"Missing file: {path}")

    output = compare(
        parse_scores(args.baseline),
        parse_scores(args.terse_control),
        parse_scores(args.candidate),
    )

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(output)
    print(output, end="")


if __name__ == "__main__":
    main()
