#!/usr/bin/env bash
# .gitignore must ignore config/ as a directory, not by exact filename.
#
# A name-by-name list silently stops ignoring any new or home-local file under
# config/ (fm-gitignore-config-name-by-name): an unrecognized file there makes
# the working tree read as dirty, which then blocks guarded sync paths that
# refuse to touch a dirty home.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=tests/fixtures.sh
. "$ROOT/tests/fixtures.sh"

fail() {
  printf 'not ok - %s\n' "$1" >&2
  exit 1
}

pass() {
  printf 'ok - %s\n' "$1"
}

random_leaf() {
  printf '%s-%s' "$1" "$$-$RANDOM-$RANDOM"
}

test_config_dir_ignored_as_category() {
  local direct nested sample
  direct="$(random_leaf config/unlisted-key)"
  nested="config/$(random_leaf nested-dir)/$(random_leaf deep-file)"
  for sample in "$direct" "$nested" config/some-new-key.admin; do
    git -C "$ROOT" check-ignore -q "$sample" \
      || fail "git does not ignore $sample (config/ must be ignored as a directory)"
  done
  pass "config/ is ignored as a directory, covering unlisted and nested paths"
}

test_unrelated_path_stays_visible() {
  # Control: a path outside config/ must remain visible to Git, so the
  # coverage above is proven by contrast rather than an always-ignoring rule.
  local sibling
  sibling="$(random_leaf not-config)"
  git -C "$ROOT" check-ignore -q "$sibling" \
    && fail "git unexpectedly ignores $sibling (outside config/)"
  pass "an unrelated path outside config/ remains visible to git"
}

test_scratchpad_prefix_is_ignored() {
  local sample
  for sample in scratchpad scratchpad2/file scratchpad-foo scratchpad/tmp; do
    git -C "$ROOT" check-ignore -q "$sample" \
      || fail "git does not ignore $sample (names starting with scratchpad must be ignored)"
  done
  git -C "$ROOT" check-ignore -q not-scratchpad \
    && fail "git unexpectedly ignores not-scratchpad (must not match the scratchpad* prefix)"
  pass "names starting with scratchpad are gitignored"
}

test_scratchpad_prefix_ignores_no_tracked_path() {
  local tracked
  tracked=$(git -C "$ROOT" ls-files | grep -E '(^|/)scratchpad' || true)
  [ -z "$tracked" ] \
    || fail "a currently tracked path would be newly ignored by scratchpad*: $tracked"
  pass "no currently tracked path starts with scratchpad"
}

test_scratchpad2_does_not_dirty_porcelain() {
  # Remote sync uses git status --porcelain. A scratchpad2/ directory must not
  # make a home look dirty once scratchpad* is gitignored.
  local repo status
  repo=$(mktemp -d "${TMPDIR:-/tmp}/fm-scratchpad-ignore.XXXXXX")
  git init -q "$repo"
  cp "$ROOT/.gitignore" "$repo/.gitignore"
  git -C "$repo" add .gitignore
  git -C "$repo" -c user.name='Firstmate Tests' -c user.email='tests@example.invalid' \
    commit -qm 'seed gitignore'
  mkdir -p "$repo/scratchpad2"
  printf 'notes\n' > "$repo/scratchpad2/notes.txt"
  printf 'loose\n' > "$repo/scratchpad"
  printf 'named\n' > "$repo/scratchpad-foo"
  status=$(git -C "$repo" status --porcelain)
  rm -rf "$repo"
  [ -z "$status" ] || fail "scratchpad* paths still dirty porcelain: $status"
  pass "scratchpad2/ does not make git status --porcelain dirty"
}

test_config_dir_ignored_as_category
test_unrelated_path_stays_visible
test_scratchpad_prefix_is_ignored
test_scratchpad_prefix_ignores_no_tracked_path
test_scratchpad2_does_not_dirty_porcelain

test_spawn_applies_configured_git_excludes() {
  local tmp home project wt fakebin id out exclude next
  tmp=$(fm_test_tmproot fm-git-excludes)
  home="$tmp/home"; project="$tmp/project"; wt="$tmp/worktree"
  id="git-excludes-$$"
  fm_test_spawn_home "$home" codex
  fm_test_spawn_brief "$home" "$id"
  fm_git_worktree "$project" "$wt" test-excludes
  exclude=$(git -C "$wt" rev-parse --git-path info/exclude)
  printf '\n# Existing project-local rule\n/manual.tmp\n' >> "$exclude"
  fakebin=$(fm_test_make_spawn_fakebin "$tmp/tools")
  printf '# Personal paths\n/private-notes/\n/local file.txt\n/scratch/*\n!/scratch/keep.md\n' > "$home/config/git-excludes"
  out=$(fm_test_run_spawn "$home" "$wt" "$fakebin" "$id" "$project" --mode local-only --yolo off) \
    || fail "configured launch failed: $out"
  git -C "$wt" check-ignore -q private-notes/note.md \
    || fail 'launch did not apply config/git-excludes to its worktree'
  git -C "$wt" check-ignore -q 'local file.txt' \
    || fail 'launch did not preserve spaces in Git patterns'
  mkdir -p "$wt/scratch"
  touch "$wt/scratch/discard.md" "$wt/scratch/keep.md" "$wt/source.mjs"
  git -C "$wt" ls-files --others --exclude-standard > "$tmp/visible"
  grep -qxF 'scratch/keep.md' "$tmp/visible" || fail 'Git negation stopped working'
  grep -qxF 'source.mjs' "$tmp/visible" || fail 'unrelated code was hidden'
  if grep -q '^scratch/discard.md$' "$tmp/visible"; then fail 'configured glob was not applied'; fi
  git -C "$wt" add -f scratch/discard.md
  git -C "$wt" ls-files --cached --others --exclude-standard > "$tmp/visible"
  grep -qxF 'scratch/discard.md' "$tmp/visible" || fail 'tracked files must remain in the reviewed content'
  [ ! -e "$wt/.gitignore" ] || fail 'launch wrote a project .gitignore'
  pass 'launch applies private Git exclusions without changing project files'

  printf '/new-notes/\n' > "$home/config/git-excludes"
  for next in changed empty absent; do
    case "$next" in
      empty) : > "$home/config/git-excludes" ;;
      absent) rm "$home/config/git-excludes" ;;
    esac
    wt="$tmp/$next-worktree"
    id="git-excludes-$next-$$"
    git -C "$project" worktree add -q -b "$next" "$wt"
    fm_test_spawn_brief "$home" "$id"
    out=$(fm_test_run_spawn "$home" "$wt" "$fakebin" "$id" "$project" --mode local-only --yolo off) \
      || fail "$next exclusion launch failed: $out"
    if git -C "$wt" check-ignore -q private-notes/note.md; then
      fail 'removing a configured rule left its old exclusion in the repository'
    fi
    git -C "$wt" check-ignore -q manual.tmp || fail 'synchronization removed a user-owned exclusion'
    if [ "$next" = changed ]; then
      git -C "$wt" check-ignore -q new-notes/note.md || fail 'updated exclusions were not installed'
    else
      if git -C "$wt" check-ignore -q new-notes/note.md; then fail 'clearing configuration retained an old rule'; fi
    fi
    if [ "$next" = absent ]; then
      git -C "$wt" check-ignore -q .pi-lens-probe-home/extension.log || fail 'absent configuration did not use portable defaults'
      git -C "$wt" check-ignore -q .pi/artifacts/session-cron.lock || fail 'default cron lock exclusion missing'
    elif git -C "$wt" check-ignore -q .pi-lens-probe-home/extension.log; then
      fail 'explicit configuration did not replace the defaults'
    fi
  done
  pass 'changed, empty and absent configuration converge while preserving manual exclusions'
}

test_git_excludes_inherit_to_secondmate() {
  local tmp source dest
  tmp=$(fm_test_tmproot fm-git-excludes-inherit)
  source="$tmp/primary/config"; dest="$tmp/secondmate/config"
  mkdir -p "$source" "$dest"
  printf '/private-notes/\n' > "$source/git-excludes"
  (
    # shellcheck source=bin/fm-config-inherit-lib.sh
    . "$ROOT/bin/fm-config-inherit-lib.sh"
    propagate_inheritable_config "$source" "$dest" || exit 1
    cmp -s "$source/git-excludes" "$dest/git-excludes" || exit 1
    : > "$source/git-excludes"
    propagate_inheritable_config "$source" "$dest" || exit 1
    [ -f "$dest/git-excludes" ] && [ ! -s "$dest/git-excludes" ] || exit 1
    rm "$source/git-excludes"
    propagate_inheritable_config "$source" "$dest" || exit 1
    [ ! -e "$dest/git-excludes" ] || exit 1
  ) || fail 'secondmate did not inherit configured, empty and absent Git exclusions'
  pass 'secondmate inherits the primary Git exclusion setting through existing propagation'
}

test_git_excludes_defaults_and_failures() {
  local tmp home project wt fakebin id out exclude bad before
  tmp=$(fm_test_tmproot fm-git-excludes-defaults)
  home="$tmp/home"; project="$tmp/project"; wt="$tmp/worktree"
  id="git-excludes-defaults-$$"
  fm_test_spawn_home "$home" pi
  fm_test_spawn_brief "$home" "$id"
  fm_git_worktree "$project" "$wt" defaults
  fakebin=$(fm_test_make_spawn_fakebin "$tmp/tools" pi)
  exclude=$(git -C "$wt" rev-parse --git-path info/exclude)
  cp "$exclude" "$tmp/original-exclude"
  for bad in directory dangling marker nul; do
    case "$bad" in
      directory) mkdir "$home/config/git-excludes" ;;
      dangling) ln -s "$tmp/missing" "$home/config/git-excludes" ;;
      marker) printf '# BEGIN Firstmate config/git-excludes\n' > "$home/config/git-excludes" ;;
      nul) printf 'unsafe\0pattern\n' > "$home/config/git-excludes" ;;
    esac
    if out=$(fm_test_run_spawn "$home" "$wt" "$fakebin" "$id" "$project" --mode local-only --yolo off); then
      fail "$bad configuration was silently accepted"
    fi
    assert_contains "$out" 'git-excludes' 'refusal did not identify its configuration'
    assert_absent "$home/state/$id.meta" 'invalid configuration published a task'
    cmp -s "$exclude" "$tmp/original-exclude" || fail 'invalid configuration changed Git exclusions'
    if [ "$bad" = directory ]; then rmdir "$home/config/git-excludes"; else rm "$home/config/git-excludes"; fi
  done
  out=$(fm_test_run_spawn "$home" "$wt" "$fakebin" "$id" "$project" --mode local-only --yolo off) \
    || fail "Pi default launch failed: $out"
  git -C "$wt" check-ignore -q .pi-lens-probe-home/extension.log || fail 'fresh project requires a user Git configuration'
  git -C "$wt" check-ignore -q subdir/.pi/artifacts/session-cron.lock || fail 'nested runtime path was not ignored'
  if git -C "$wt" check-ignore -q .pi/artifacts/session-cron.json; then fail 'default excluded functional cron configuration'; fi
  if git -C "$wt" check-ignore -q diagnostic.log; then fail 'default excluded unrelated logs'; fi
  before=$(cat "$exclude")
  id="git-excludes-repeat-$$"
  fm_test_spawn_brief "$home" "$id"
  out=$(fm_test_run_spawn "$home" "$wt" "$fakebin" "$id" "$project" --mode local-only --yolo off) \
    || fail "repeated launch failed: $out"
  [ "$(cat "$exclude")" = "$before" ] || fail 'same setting changed the exclusions on repeated launch'
  printf '# BEGIN Firstmate config/git-excludes\n' >> "$exclude"
  cp "$exclude" "$tmp/broken-exclude"
  id="git-excludes-corrupt-$$"
  fm_test_spawn_brief "$home" "$id"
  if out=$(fm_test_run_spawn "$home" "$wt" "$fakebin" "$id" "$project" --mode local-only --yolo off); then
    fail 'malformed managed block was silently repaired'
  fi
  assert_contains "$out" 'Firstmate exclude block' 'corrupt block error lacked context'
  cmp -s "$exclude" "$tmp/broken-exclude" || fail 'failed synchronization discarded exclusion evidence'
  pass 'portable defaults, repeat launches and invalid configuration preserve Git and task boundaries'
}

test_git_excludes_inherit_to_secondmate
test_spawn_applies_configured_git_excludes
test_git_excludes_defaults_and_failures
