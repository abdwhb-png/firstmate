#!/usr/bin/env bash
# tests/fm-wake-daemon-lifecycle-e2e.test.sh - the watcher + supervise-daemon
# lifecycle, end to end, over one shared state root and a shimmed tmux:
#
#   routine status -> self-handled, queued
#   terminal status written while the watcher is DOWN -> caught on restart (catch-up)
#   drain queued records -> exactly ONE captain-relevant digest is buffered
#   housekeeping catch-all scan -> NO duplicate digest
#   buffered digest flushes to the supervisor pane as exactly ONE submission
#   stale working-pane: transient (self + marker) -> persistent (escalates once,
#     clears its marker) -> resumed/busy (clears without escalating)
#
# This proves the operator-visible routing/queueing/dedupe behavior through real
# fm-watch.sh runs plus the daemon's own functions. The captain-relevant
# status-phrase matrix and the lock-primitive races stay as focused units
# (fm-daemon.test.sh, fm-watcher-lock.test.sh) - an e2e cannot deterministically
# cover a race, and the phrase list is a product contract worth a dedicated test.
set -u

# shellcheck source=tests/wake-helpers.sh
. "$(dirname "${BASH_SOURCE[0]}")/wake-helpers.sh"

WATCH="$ROOT/bin/fm-watch.sh"
DRAIN="$ROOT/bin/fm-wake-drain.sh"
DAEMON="$ROOT/bin/fm-supervise-daemon.sh"

# Source the daemon's pure functions (its main loop is guarded out under sourcing).
if [ -z "${FM_TEST_DAEMON_SOURCED:-}" ]; then
  export FM_TEST_DAEMON_SOURCED=1
  # shellcheck source=/dev/null
  . "$DAEMON"
fi

TMP_ROOT=$(fm_test_tmproot fm-wake-daemon-e2e)

# Run the daemon-managed watcher once: under the supervise-daemon (away mode) the
# watcher is one-shot - it exits with a single reason line on EVERY wake and the
# daemon does the triage. This e2e exercises exactly that path, so it runs with
# state/.afk present (which the daemon owns) to keep the watcher one-shot; the
# always-on standalone triage is covered by fm-watch-triage.test.sh. fakebin
# shadows tmux. Echoes nothing; the caller reads $out.
run_watcher_once() {
  local state=$1 fakebin=$2 out=$3
  mkdir -p "$state"
  date '+%s' > "$state/.afk"
  PATH="$fakebin:$PATH" FM_STATE_OVERRIDE="$state" FM_POLL=1 FM_SIGNAL_GRACE=1 \
    FM_CHECK_INTERVAL=999999 FM_HEARTBEAT=999999 "$WATCH" > "$out" &
  wait_for_exit "$!" 50
}

ack_handled_wakes() {  # <state> <drain-stderr>
  local state=$1 drain_err=$2 sequence generation
  sequence=$(sed -n 's/^WAKE_ACK_REQUIRED:.*--ack-through \([0-9][0-9]*\) --recovery-generation [A-Za-z0-9._-][A-Za-z0-9._-]*$/\1/p' "$drain_err")
  generation=$(sed -n 's/^WAKE_ACK_REQUIRED:.*--ack-through [0-9][0-9]* --recovery-generation \([A-Za-z0-9._-][A-Za-z0-9._-]*\)$/\1/p' "$drain_err")
  [ -n "$sequence" ] && [ -n "$generation" ] || return 1
  FM_STATE_OVERRIDE="$state" "$DRAIN" --ack-through "$sequence" \
    --recovery-generation "$generation"
}

# --- Phase 1: routine self-handled, queued; terminal caught after restart ---
test_routine_then_terminal_after_restart() {
  local dir state fakebin out drain_out drain_err status_file
  dir=$(make_supercase wd-lifecycle)
  state="$dir/state"
  fakebin="$dir/fakebin"
  out="$dir/watch.out"
  drain_out="$dir/drain.out"
  drain_err="$dir/drain.err"
  status_file="$state/task-w1.status"

  # A routine status fires a signal; the watcher queues it and exits.
  printf 'working: building\n' > "$status_file"
  run_watcher_once "$state" "$fakebin" "$out" || fail "watcher did not exit for the routine signal"
  grep -F "signal: $status_file" "$out" >/dev/null || fail "watcher did not report the routine signal"

  # Drain it and route through the daemon: a routine status self-handles.
  FM_STATE_OVERRIDE="$state" "$DRAIN" > "$drain_out" 2> "$drain_err" \
    || fail "drain after routine signal failed"
  grep "$(printf '\tsignal\t')" "$drain_out" | grep -F "$status_file" >/dev/null \
    || fail "routine signal was not queued"
  FM_STATE_OVERRIDE="$state" handle_wake "signal: $status_file" "$state"
  ack_handled_wakes "$state" "$drain_err" || fail "routine wake acknowledgement failed"
  [ ! -s "$state/.subsuper-escalations" ] || fail "routine status was escalated by the daemon"

  # The watcher is now DOWN (one-shot exit). A terminal status lands while it is
  # down; the next watcher run must catch it up (losslessness across restart).
  printf 'done: PR https://example.test/pr/900\n' >> "$status_file"
  : > "$out"
  run_watcher_once "$state" "$fakebin" "$out" || fail "restarted watcher did not exit for the terminal signal"
  grep -F "signal: $status_file" "$out" >/dev/null || fail "terminal signal written while watcher down was not caught on restart"

  # Drain and route the terminal: exactly ONE digest is buffered.
  : > "$drain_out"
  FM_STATE_OVERRIDE="$state" "$DRAIN" > "$drain_out" 2> "$drain_err" \
    || fail "drain after terminal signal failed"
  FM_STATE_OVERRIDE="$state" handle_wake "signal: $status_file" "$state"
  ack_handled_wakes "$state" "$drain_err" || fail "terminal wake acknowledgement failed"
  [ -s "$state/.subsuper-escalations" ] || fail "captain-relevant terminal status was not buffered"
  [ "$(wc -l < "$state/.subsuper-escalations" | tr -d ' ')" -eq 1 ] \
    || fail "expected exactly one buffered digest after the terminal signal"

  # The catch-all heartbeat scan must NOT re-escalate the same status (no dup).
  FM_STATE_OVERRIDE="$state" housekeeping "$state"
  [ "$(wc -l < "$state/.subsuper-escalations" | tr -d ' ')" -eq 1 ] \
    || fail "catch-all scan duplicated the already-buffered digest"

  # With afk active, the buffered digest flushes to the supervisor pane as ONE
  # submission (one typed line + one Enter), then the buffer clears.
  local sent
  sent="$dir/sent.log"; : > "$sent"
  printf '❯\n' > "$dir/pane.txt"
  afk_enter "$state"
  PATH="$fakebin:$PATH" FM_FAKE_TMUX_PANE_ALIVE=1 FM_FAKE_TMUX_SENT="$sent" \
    FM_FAKE_TMUX_CAPTURE="$dir/pane.txt" FM_ESCALATE_BATCH_SECS=0 escalate_flush "$state" \
    || fail "escalate_flush failed for the buffered digest"
  [ "$(grep -c '\[ENTER\]' "$sent")" -eq 1 ] || fail "buffered digest was not submitted exactly once"
  [ ! -s "$state/.subsuper-escalations" ] || fail "buffer not cleared after a successful flush"
  pass "lifecycle: routine self-handles, terminal survives a watcher restart, buffers once, no dup, injects once"
}

test_two_direct_returns_survive_restart_until_ack() {
  local dir state fakebin out drain_out drain_err impl_report review_report
  local impl_event review_event first_rows replayed_rows buffered epoch sequence kind key payload
  dir=$(make_supercase wd-direct-returns)
  state="$dir/state"
  fakebin="$dir/fakebin"
  out="$dir/watch.out"
  drain_out="$dir/drain.out"
  drain_err="$dir/drain.err"
  impl_report="$dir/implementation-report.md"
  review_report="$dir/review-report.md"
  first_rows="$dir/first-rows.tsv"
  replayed_rows="$dir/replayed-rows.tsv"
  buffered="$dir/buffered.txt"
  mkdir -p "$dir/impl" "$dir/review"
  fm_write_meta "$state/direct-impl.meta" "window=firstmate:fm-direct-impl" \
    "backend=tmux" "kind=ship" "harness=codex" "worktree=$dir/impl"
  fm_write_meta "$state/direct-review.meta" "window=firstmate:fm-direct-review" \
    "backend=tmux" "kind=ship" "harness=codex" "worktree=$dir/review"
  printf 'Implementation complete.\n' > "$impl_report"
  printf 'Review found a regression.\n' > "$review_report"
  impl_event="direct-impl.status: done: report $impl_report"
  review_event="direct-review.status: failed: report $review_report"

  printf 'done: report %s\n' "$impl_report" > "$state/direct-impl.status"
  run_watcher_once "$state" "$fakebin" "$out" || fail "watcher missed the implementation return"
  assert_contains "$(cat "$out")" "signal: $state/direct-impl.status" "wrong implementation wake"
  printf 'failed: report %s\n' "$review_report" > "$state/direct-review.status"
  # Keep collecting as a handling successor while the first wake awaits its drain.
  FM_WATCH_HANDLING_SUCCESSOR=1 run_watcher_once "$state" "$fakebin" "$out" \
    || fail "restarted watcher missed the review return"
  assert_contains "$(cat "$out")" "signal: $state/direct-review.status" "wrong review wake"

  FM_STATE_OVERRIDE="$state" "$DRAIN" > "$drain_out" 2> "$drain_err" \
    || fail "first direct-return drain failed"
  assert_contains "$(cat "$drain_out")" "$impl_event" "wrong implementation attribution"
  assert_contains "$(cat "$drain_out")" "$review_event" "wrong review attribution"
  awk -F '\t' 'NF == 5 && $2 ~ /^[0-9]+$/ && $3 == "signal"' "$drain_out" > "$first_rows"
  [ "$(wc -l < "$first_rows" | tr -d ' ')" -eq 2 ] || fail "expected two durable signal rows"
  assert_contains "$(cat "$first_rows")" "$(printf '\tsignal\tdirect-impl.status\tsignal: %s' "$state/direct-impl.status")" "wrong implementation queue identity"
  assert_contains "$(cat "$first_rows")" "$(printf '\tsignal\tdirect-review.status\tsignal: %s' "$state/direct-review.status")" "wrong review queue identity"

  FM_STATE_OVERRIDE="$state" FM_ESCALATE_BATCH_SECS=3600 \
    handle_wake "signal: $state/direct-impl.status" "$state" || fail "implementation handling failed"
  grep -Fx -- "$impl_event" "$state/.subsuper-escalations" >/dev/null || fail "implementation was not buffered"
  if grep -Fx -- "$review_event" "$state/.subsuper-escalations" >/dev/null; then
    fail "review was handled before the interruption"
  fi

  # Restart presentation without acknowledging the partially handled batch.
  FM_STATE_OVERRIDE="$state" "$DRAIN" > "$drain_out" 2> "$drain_err" \
    || fail "replayed direct-return drain failed"
  awk -F '\t' 'NF == 5 && $2 ~ /^[0-9]+$/ && $3 == "signal"' "$drain_out" > "$replayed_rows"
  cmp -s "$first_rows" "$replayed_rows" || fail "unacknowledged queue identities or payloads changed"
  [ "$(cat "$impl_report")" = 'Implementation complete.' ] || fail "implementation report lost on replay"
  [ "$(cat "$review_report")" = 'Review found a regression.' ] || fail "review report lost on replay"

  while IFS=$'\t' read -r epoch sequence kind key payload; do
    FM_STATE_OVERRIDE="$state" FM_ESCALATE_BATCH_SECS=3600 \
      handle_wake "$payload" "$state" || fail "replayed handling failed for $key"
  done < "$replayed_rows"
  [ "$(grep -Fxc -- "$impl_event" "$state/.subsuper-escalations")" -eq 1 ] || fail "implementation duplicated or lost"
  [ "$(grep -Fxc -- "$review_event" "$state/.subsuper-escalations")" -eq 1 ] || fail "review duplicated or lost"
  [ "$(wc -l < "$state/.subsuper-escalations" | tr -d ' ')" -eq 2 ] || fail "unexpected result digest"
  cp "$state/.subsuper-escalations" "$buffered"
  FM_STATE_OVERRIDE="$state" FM_ESCALATE_BATCH_SECS=3600 \
    housekeeping "$state" || fail "housekeeping after replay failed"
  cmp -s "$buffered" "$state/.subsuper-escalations" || fail "housekeeping changed the handled result digest"

  ack_handled_wakes "$state" "$drain_err" || fail "direct-return acknowledgement failed"
  [ "$(awk -F '\t' '$3 == "signal" && ($4 == "direct-impl.status" || $4 == "direct-review.status") { n++ } END { print n+0 }' "$state/.wake-queue")" -eq 0 ] \
    || fail "acknowledged direct-return rows remained queued or could not be read"
  FM_STATE_OVERRIDE="$state" "$DRAIN" > "$drain_out" 2> "$drain_err" \
    || fail "post-acknowledgement drain failed"
  [ "$(awk -F '\t' '$3 == "signal" && ($4 == "direct-impl.status" || $4 == "direct-review.status") { n++ } END { print n+0 }' "$drain_out")" -eq 0 ] \
    || fail "acknowledged direct returns were presented again or drain output could not be read"
  pass "lifecycle: two direct returns retain attribution, replay until ack, and handle exactly once across restart"
}

# --- Phase 2: stale working-pane transient -> persistent -> resumed ----------
test_stale_pane_transient_persistent_resume() {
  local dir state fakebin win key resumed_gen
  dir=$(make_supercase wd-stale)
  state="$dir/state"
  fakebin="$dir/fakebin"
  win="sess:fm-stale-w2"
  key=$(printf '%s' "stale-w2" | tr ':/.' '___')
  printf 'working: compiling\n' > "$state/stale-w2.status"

  # Transient: first stale observation self-handles and records a marker.
  stale_marker_record "$win" "$state"
  case "$(FM_STATE_OVERRIDE="$state" classify_stale "$win" "$state")" in
    self\|*) : ;;
    *) fail "transient stale did not self-handle" ;;
  esac
  [ -e "$state/.subsuper-stale-$key" ] || fail "transient stale did not record a persistence marker"

  # Persistent: the marker ages past the threshold and the pane is still idle, so
  # housekeeping escalates exactly once and clears the marker.
  printf 'idle prompt $\n' > "$dir/pane.txt"
  echo $(( $(date +%s) - 500 )) > "$state/.subsuper-stale-$key"
  : > "$state/.subsuper-escalations" 2>/dev/null || true
  PATH="$fakebin:$PATH" FM_FAKE_TMUX_WINDOW="$win" FM_FAKE_TMUX_CAPTURE="$dir/pane.txt" \
    FM_STATE_OVERRIDE="$state" FM_STALE_ESCALATE_SECS=240 housekeeping "$state" \
    2>"$dir/housekeeping.err"
  [ ! -s "$dir/housekeeping.err" ] \
    || fail "missing task metadata leaked a raw read error: $(cat "$dir/housekeeping.err")"
  [ -s "$state/.subsuper-escalations" ] || fail "persistent stale did not escalate"
  [ ! -e "$state/.subsuper-stale-$key" ] || fail "stale marker not cleared after escalation"

  # Resumed: a fresh transient marker but the crew is provably working again ->
  # housekeeping clears the marker without escalating. The proof is the crew's
  # own semantic busy-state record (bin/fm-busy-lib.sh), not rendered pane text.
  stale_marker_record "$win" "$state"
  echo $(( $(date +%s) - 500 )) > "$state/.subsuper-stale-$key"
  printf 'Working...\n' > "$dir/pane.txt"
  fm_write_meta "$state/stale-w2.meta" "window=$win" "worktree=$dir/wt" "kind=ship" "harness=pi"
  resumed_gen=$("$ROOT/bin/fm-busy-event.sh" arm "$state" stale-w2)
  "$ROOT/bin/fm-busy-event.sh" apply "$state" stale-w2 busy --gen "$resumed_gen" \
    --source pi-ext --event agent-start
  : > "$state/.subsuper-escalations"
  PATH="$fakebin:$PATH" FM_FAKE_TMUX_WINDOW="$win" FM_FAKE_TMUX_CAPTURE="$dir/pane.txt" \
    FM_STATE_OVERRIDE="$state" FM_STALE_ESCALATE_SECS=240 housekeeping "$state"
  [ ! -e "$state/.subsuper-stale-$key" ] || fail "resumed stale marker was not cleared"
  [ ! -s "$state/.subsuper-escalations" ] || fail "resumed (busy) stale was escalated"
  pass "lifecycle: stale pane transient self-handles, persistent escalates once and clears, resumed clears quietly"
}

if [ -n "${FM_TEST_ONLY:-}" ]; then
  "$FM_TEST_ONLY"
  exit
fi

test_routine_then_terminal_after_restart
test_two_direct_returns_survive_restart_until_ack
test_stale_pane_transient_persistent_resume
