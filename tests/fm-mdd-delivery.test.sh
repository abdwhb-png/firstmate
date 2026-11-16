#!/usr/bin/env bash
# Exercise MDD delivery and real Git stacks with only the forge boundary simulated.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BUNDLE=${FM_TEST_MDD_DELIVERY_BUNDLE:-${FM_TEST_MDD_BUNDLE:-}}
[ -n "$BUNDLE" ] || { echo 'skip: external MDD qualification bundle not supplied'; exit 0; }
node "$ROOT/tests/mdd-delivery.mjs" "$BUNDLE"

if [ -n "${FM_TEST_MDD_PORTABLE_BUNDLE:-}" ]; then
  for scenario in draft portable portable-valid portable-workflow; do
    node "$ROOT/tests/mdd-delivery.mjs" "$FM_TEST_MDD_PORTABLE_BUNDLE" "$scenario"
  done
else
  echo 'skip: v0.6 portable qualification bundle not supplied'
fi
