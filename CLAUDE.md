# TripSplit: notes for Claude Code sessions

TripSplit is a Splitwise-style expense splitter, built as an installable PWA. It needs no account. It covers groups, four split modes, settle up in the fewest payments, close the books (periods), and archive. Phones sync live through Firebase Firestore, with end-to-end encryption, and invites go by link or file.

- **Live app:** https://ecitaku210.github.io/tripsplit/
- **Owner:** `ecitaku210`. They test on a Motorola Edge 50 Ultra, Android 17, Chrome.
- **Pronouns:** use they/them for the owner.

## Check the live state first

Don't trust a summary of "where things are". Run these:

- `git fetch origin && git log --oneline -5 origin/main`
- The open PRs, and the newest workflow run on main.

The deploy is `.github/workflows/deploy.yml`:
- `build` and `emulator` run on every PR and every push to main.
- `deploy` runs only on a push to main. **Merging a PR to main is what deploys.**

## Rules the owner insists on

1. **Never push to `ecitaku210/ecitaku210`.** That's their GitHub profile repo, and its branch `claude/trip-expense-sharing-app-hm7yyi` must stay at `e7ce0bc`. Cloud sessions sometimes clone the profile repo and point `origin` at it, but the TripSplit code isn't there.
   - Work in a TripSplit clone, with `origin` = `https://github.com/ecitaku210/tripsplit`.
   - If a stop hook complains, fix it by repointing `origin` and fetching. Never push to the profile repo.
   - After pushing, check that `git ls-remote https://github.com/ecitaku210/ecitaku210 refs/heads/claude/trip-expense-sharing-app-hm7yyi` still shows `e7ce0bc`.
2. **Open or merge PRs only when told to**, with words like "raise pr and deploy", "merge and deploy" or "deploy". "Raise pr and don't" means open it but don't merge. Otherwise, commit and push to the branch and report.
3. **Merge only after `build` and `emulator` are green on the PR's head commit.** Pass `expectedHeadSha` so the merge can't take a commit that wasn't tested.
4. **After a merge:**
   - fast-forward the working branch to main and push it;
   - confirm the deploy run on main passed (build, emulator, deploy);
   - confirm the GitHub Pages deployment for that commit has state `success`.
   - The sandbox can't reach `github.io`, so say plainly that the live page itself wasn't checked. A PWA shows the old version until it has been closed and reopened once.
5. **Model names or IDs never go in** commits, PR titles or bodies, or code comments.
6. **Never use `--force`** on someone else's branch.

## How the owner wants answers

- **Explain why** each step is done. They're learning the concepts.
- Use headings, and **bold** the important words, so answers are easy to scan.
- Be straightforward. Don't just agree; say what is actually best.
- **Never assume; check.** Distrust your own tests, use controls, and report failures with their output. Say what wasn't verified.

The Humanizer skill (`.claude/skills/humanizer/`) strips bold and headings. Use it only on prose the owner asks to rewrite, not on answers to them.

## Stack and commands

- **Main libraries:** React 18.3 (deliberately not 19: +22 kB gzipped for nothing, as `.github/dependabot.yml` explains), TypeScript 7, Vite 8, vite-plugin-pwa 2, vitest 5, oxlint, firebase 13, and `@firebase/rules-unit-testing` 6.
- **Node:** 24.12 or newer, enforced by `engines`. Cloud containers ship Node 22, so set up Node 24 with:
  - `npm i --prefix <scratch>/node24 node@24`
  - `export PATH=<scratch>/node24/node_modules/node/bin:$PATH`
- **Java:** 11 or newer, needed for the emulator tests.

| Command | What it does |
|---|---|
| `npm run lint` | oxlint with `--deny-warnings` |
| `npm run typecheck` | `tsc -b`; writes nothing |
| `npm test` | vitest, about 311 tests |
| `npm run build` | `tsc -b`, then `vite build`, then `scripts/check-built-css.mjs` |
| `npm run test:emulator` | Firestore rules and two-phone sync, about 30 tests |
| `npm run check:phone` | after a build: all 12 screens at 390px, 320px and 125% text; flags sideways scrolling, controls under 40px, text under 12px, unnamed controls and page errors |

`check:phone` needs Playwright, which cloud containers have globally. Never run `playwright install` there.

The `overrides` in `package.json` are security fixes; keep them. `gaxios > uuid` is scoped on purpose, because a global `uuid` override broke `npm ls`.

## Code map

- **`src/domain/`:** pure, fully tested logic.
  - `money.ts` keeps amounts in integer minor units.
  - `overview.ts` works per currency and **never nets across groups**: the same name in two groups may not be the same person, and the owner rejected cross-group netting.
- **`src/storage/`:** localStorage, under the key `tripsplit.db.v1`.
- **`src/sync/`:** the sync engine, protocol and end-to-end crypto. `VITE_FIREBASE_EMULATOR_HOST=127.0.0.1` points the dev server at the emulator.
- **`src/ui/`:** screens and components.
  - `Avatar`, `AvatarPair` and `AvatarStack` need a `group` prop.
  - Routes are hash routes, like `#/trip/<id>/expense/new` (see `router.ts`).

## Lessons (don't repeat these)

1. **Write `backdrop-filter` alone, with no `-webkit-` copy.** Lightning CSS keeps only the prefixed form, and Chrome on Android loses the blur. `check-built-css.mjs` guards this. Always check the **production build**, not just the dev server.
2. **Headless Chromium draws backdrop blur wrongly.** Use GPU-emulation flags for faithful screenshots.
3. **Kill test servers by name with a bracket pattern**, for example `pkill -f "[v]ite preview --port 5199"`, as its own short command. Inside a longer command line, `pkill` matches its own shell (exit 144). Confirm the port is free with curl afterwards.
4. **Never conclude anything from truncated output.** Count over the full output.
5. **Tests need controls:** a negative control that proves the check can fail, realistic seed data, and full reloads rather than hash changes.
6. **Dependabot PRs:** test each PR's exact lockfile with `npm ci`, not by re-resolving.
   - Prefer one `npm audit fix` PR (never `--force`) over many single-package PRs: they all conflict in `package-lock.json`.
   - Don't take a fix that downgrades a major version.
7. **Tap targets are at least 40px by design.** To make something look smaller, shrink a `::before` drawing inside the 40px control. 44px (Apple) and 48dp (Android) aren't met: about 160 to 200 controls fall short, measured with `check:phone -- --targets 44` or `48`. If that's ever wanted, enlarge the invisible hit area rather than the visuals, and watch for overlap between chips 8px apart.
8. **Notifications were dropped at the owner's request.** Don't build them.

## Watch

- **A one-off failure in the "party" multi-phone sync e2e:** it once got 3 bins instead of 2. It hasn't reproduced since, including every CI run in November 2026. It's still unexplained.
- **About 21 dev-only `npm audit` warnings.** They wait for upstream fixes in firebase-tools and vite-plugin-pwa. Shipped code has 0.
