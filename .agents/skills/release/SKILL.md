---
name: release
description: Cut a Will Be Done release end to end. Bumps the desktop version with `pnpm run release:desktop`, waits for the Release workflow, writes the GitHub release notes from the commits since the last release, publishes the draft, and updates the landing site (release page and download links). Use for /release, optionally with a version such as `/release 0.16.0`.
disable-model-invocation: true
---

# Release

Invoking this skill is the explicit request AGENTS.md requires before running
`release:desktop`. It does not authorize `deploy:*` or `fly` commands.

Two steps cannot be undone and need the user's yes first: pushing the tag (step 2) and
publishing the release (step 5). Everything else, proceed without asking.

## 1. Preflight and version

```sh
git fetch origin --tags
git switch main && git pull --ff-only
git status --porcelain          # must be empty
PREV=$(git tag --list 'v*' --sort=-v:refname | head -1)
git log --oneline "$PREV"..HEAD --no-merges
gh run list --branch main --workflow ci.yaml --limit 1   # last CI on main should be green
```

`scripts/release` pushes the current branch, so it must run on an up-to-date `main`. If
there are no commits since `$PREV`, stop.

If the user gave a version, use it. Otherwise propose one: bump minor when the range
adds user-visible features or changes the sync protocol, patch when it only fixes bugs.
Show the proposal with a two-line reason and wait for confirmation.

## 2. Bump and tag

```sh
printf '%s\n' "$VERSION" | pnpm run release:desktop
```

The script prompts for the version on stdin, commits `chore: release v$VERSION`, tags it,
and pushes both.

## 3. Wait for the Release workflow, write notes meanwhile

Find the run with `gh run list --workflow release.yaml --branch "v$VERSION" --limit 1`
and start `gh run watch <id> --exit-status` as a background command. It takes 10–25
minutes. Do not poll with sleep loops.

While it runs, draft the notes (step 4). If the run fails, show the failing job's log
(`gh run view <id> --log-failed`) and stop. Do not delete or move the tag without the
user's say-so.

## 4. Draft the release notes

Collect what changed between `$PREV` and the new tag:

```sh
git log "$PREV".."v$VERSION" --no-merges --format='%h %s'
git log "$PREV".."v$VERSION" --merges --format='%s' | grep -o '#[0-9]*'   # merged PRs
gh pr view <n> --json title,body,files
```

Read the PR bodies, and the diffs where a title is vague, until you know what a user
will notice. Drop refactors, tests, CI, dependency bumps, and internal tooling unless a
user can see the effect.

Match the house style of the previous releases (`gh release view "$PREV"`;
`apps/landing/src/content/releases/v0.15.0.md` is a good model):

- Title: `v$VERSION - <headline>`, the headline naming the two or three biggest changes.
- An opening sentence that says what the release lets the user do.
- `## What's new` with a `###` section per major feature (where to find it, how to use
  it, keyboard shortcuts, limits), then `### Smaller improvements` as bullets.
- `## Fixes`: what the user saw before, stated as what now works.
- `## Upgrade notes`: sync protocol changes (open tabs show **Update required** until
  reloaded), data migrations, new or changed self-hosting env vars, and always the
  `ghcr.io/will-be-done/will-be-done:$VERSION` (or `latest`) pull line.
- End with `**Full Changelog**: https://github.com/will-be-done/will-be-done/compare/$PREV...v$VERSION`.

Write in the product's voice: concrete UI names in bold, no implementation details, no
PR numbers, no contributor names. Link docs with absolute
`https://will-be-done.app/docs/...` URLs. Omit an empty section.

Save the notes to the scratchpad and show the user the title and full text.

## 5. Edit and publish the draft

After the workflow succeeds, `publish-desktop` has created a draft release with generated
notes and the desktop builds.

```sh
gh release view "v$VERSION" --json isDraft,assets --jq '.isDraft, [.assets[].name]'
gh release edit "v$VERSION" --title "v$VERSION - <headline>" --notes-file <notes.md>
```

The assets must include the `.dmg`, `-setup.exe`, `.AppImage`, `.deb`, `.rpm`,
`.flatpak`, and `.snap` (see `apps/landing/src/lib/downloads.ts`); otherwise the
download sync fails. Report anything missing before publishing.

Once the user approves the notes, publish:

```sh
gh release edit "v$VERSION" --draft=false --latest
```

## 6. Landing site

Publishing starts two workflows:

- `sync-downloads.yaml` points `apps/landing/src/data/desktop-downloads.json` at the new
  release, commits it to `main`, and deploys the landing site. Wait for it (`gh run
  watch`, in the background), then `git pull` and check the file's `tag` is
  `v$VERSION`. If it failed, read the log; a missing asset is the usual cause.
- `sync-release-pages.yaml` pushes a generated page to `release-pages/pending` and opens
  or updates a PR. Its frontmatter is mechanical, so write the page yourself instead and
  close that PR afterwards with a comment pointing to yours.

Write the release page on a new branch from the updated `main`:

```sh
git switch -c "landing/release-v$VERSION"
pnpm -C apps/landing sync:releases --tag "v$VERSION"   # writes the .md, downloads images
```

Then polish `apps/landing/src/content/releases/v$VERSION.md`:

- `headline`: the release title's headline.
- `summary`: the opening sentence, under about 160 characters. It is the meta
  description.
- `highlights`: four to six short phrases, one per notable change.
- In the body, change `https://will-be-done.app/docs/` links to relative `/docs/`.

When the release adds a headline feature, also update the marketing copy: the
`everythingElse` list and the matching feature section in both
`apps/landing/src/pages/index.astro` and `apps/landing/src/pages/features.astro` (keep
the two in sync), and the screenshot carousel captions in `index.astro` if a caption no
longer holds. Skip this for a fix-only release. If a feature changed how a user does
something and `apps/landing/src/content/docs/docs` was not updated in its PR, tell the
user rather than writing new docs here.

Verify and ship:

```sh
pnpm prettier --write "apps/landing/src/content/releases/**/*.md"
pnpm -C apps/landing build
```

Commit (`docs(landing): add v$VERSION release page`), push, and open a PR to `main`.
Merging it deploys the landing site.

## Report

Finish with: the release URL, the landing PR URL, the `desktop-downloads.json` state,
the closed bot PR, and anything skipped or still pending.
