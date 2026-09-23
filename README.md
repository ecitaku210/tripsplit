# TripSplit

A Splitwise-style expense splitter for group trips. It installs on any phone
from a browser, syncs live between everyone's phones, keeps working with no
signal, and needs no account or sign-up.

---

## What it does

- Log an expense in about five seconds: amount, what for, who paid, who shares it
- Split **equally**, by **exact amounts**, by **shares** (a couple counts as 2), or by **percentage**
- See at a glance who is up and who is down
- **Settle up**: nets everyone off into the fewest payments instead of everyone paying everyone
- **Live sync** — an expense added on one phone appears on everyone else's in about a second
- Works offline, and catches up automatically when signal returns
- Invite people by sharing a file or a code — over WhatsApp, AirDrop, email, anything

---

## How the phones stay in step

Trips sync live through **Google Firebase (Firestore)**. Add an expense and
everyone else on the trip sees it within about a second, with no button to
press.

With no signal the app keeps working normally. Changes are saved on the phone,
the trip screen says **Offline · saved on this phone**, and everything goes up
by itself when signal returns. A failed upload, sign-in or listener retries on
its own (every 2 s, backing off to every 30 s), so one bar of signal or a
captive hotel Wi-Fi recovers without anyone reopening the app. The app only
syncs while it is open: phones do not let a web app run in the background.

Two things follow from that, and your group should know them:

- **Expenses are stored on Google's servers**, not only on your phones.
  Anyone holding a trip's share code can read and edit that trip.
- **Sync depends on Firebase staying available.** If it ever went away, the
  app would still work fully offline, and manual sharing still works. The
  pre-Firebase version is kept on the [`offline-only`](../../tree/offline-only)
  branch.

The first time you open a trip someone shared with you, the app asks **which
person on the trip is you**. Answer it: until you do, the app cannot know whose
balance to show you, and "Who paid?" has nothing sensible to pre-fill.

---

## How the sync actually works

The interesting part of this app is not the expense form, it is the merge.
Firebase is only the postman; the merge is the brain.

Every record — expense, person, repayment — carries four fields:

| Field | Purpose |
| --- | --- |
| `id` | A UUID minted on the phone that created it. Two phones can never mint the same one. |
| `updatedAt` | When it was last edited. |
| `updatedBy` | Which phone edited it. Used **only** to break `updatedAt` ties. |
| `deletedAt` | A *tombstone*. Deleted records are marked, never removed. |

Merging two ledgers is then a set union, taking the newer version of anything
that appears in both. This structure is a **CRDT** (Conflict-free Replicated
Data Type) — specifically an **LWW-Element-Set** — and it has three properties
that the test suite verifies against randomly generated, deliberately divergent
ledgers:

- **Commutative** — `merge(A, B) == merge(B, A)`. Order of imports does not matter.
- **Associative** — `merge(merge(A, B), C) == merge(A, merge(B, C))`. Grouping does not matter.
- **Idempotent** — `merge(A, A) == A`. Importing the same file ten times changes nothing.

Those three together mean everyone can send everyone their file, in any order,
as often as they like, and every phone converges on the same answer. That is
what makes "just send it in the group chat" a safe protocol instead of a mess.

### Why Firebase needs so little code

Because merging is commutative, associative and idempotent, the server never
has to resolve a conflict. Each trip is **one Firestore document** holding the
compressed ledger, which the server stores without understanding. A phone that
changes something reads the document, merges, and writes it back inside a
transaction — correct even when several phones do it at the same instant.

The one thing that needs care is not writing when nothing changed: a write
fires every listener, including the writer's own, and a phone that re-wrote on
every snapshot would loop forever at a cost per write. `src/sync/protocol.ts`
decides every write by comparing full content, and holds no Firebase code, so
all of it is tested without a network.

It compares what the server would **end up holding**, not what the phone
holds. Other phones read every copy through the import validator, which drops
records it rejects. A phone holding such a record — an expense saved with a
cleared date, before the editor required one — could otherwise never match the
server and would write the same copy forever, using up the group's daily
quota. The trip screen flags such an expense so a person can fix it.

A server copy written by a **newer** app version is never overwritten by an
older one: the trip says **Update needed** instead.

**Why tombstones?** If deleting an expense actually removed the record, then
merging with a friend whose copy still had it would silently bring it back.
A tombstone is a record that says "this is gone, as of this moment", so the
deletion wins over any older version of the row.

### What the merge cannot fix

If you and your friend each separately type in the same ₹2,000 dinner, those
are two different records with two different ids. No algorithm can know they
are the same meal — they are indistinguishable from two genuinely identical
bills. The app flags them (same date, same amount, same payer, entered on
different phones) and leaves the decision to you. It never deletes anything on
its own.

---

## Why money is stored as integers

Every amount is held as a whole number of **minor units** — paise, cents, fils.
`₹12.35` is stored as `1235`.

Floating point cannot represent `0.1` exactly, so `0.1 + 0.2 !== 0.3` in every
mainstream language, JavaScript included. On a personal budget that is a
rounding curiosity. On a shared ledger it is an argument about who owes an
extra paisa. Integers make the arithmetic exact.

The same care applies to splitting. `₹100` three ways is not `₹33.33` each —
that loses a paisa. The app uses the **largest remainder method**: everyone
gets their floored share, then the leftover units go one at a time to whoever
was rounded down hardest, with ties broken on member id so **every phone
computes byte-identical shares**. The result always sums to exactly the amount
of the expense. That invariant is asserted over thousands of random cases.

Formatting is done by hand, never with the device locale, so a ledger reads
the same on every phone in the group. Rupee amounts use **Indian grouping**
(`₹1,50,000`, not `₹150,000`); every other currency groups in thousands.

---

## Settling up

Turning balances into payments uses a greedy largest-debtor-to-largest-creditor
pass. With six people, paying each other back pairwise is 15 transfers; netting
first brings that down to at most 5.

Honest caveat: this is not guaranteed to be the theoretical *minimum* number of
transfers — that problem is NP-hard. Greedy is optimal unless some subgroup
happens to net exactly to zero, and is never worse than `n-1`.

---

## Getting it onto everyone's phone

**Service workers require HTTPS**, so the app must be served over TLS for the
install to work. `localhost` is exempt, which is why local development works.

1. Push to `main`. The included GitHub Actions workflow builds and publishes to
   GitHub Pages.
2. In the repository, go to **Settings → Pages** and set **Source** to
   **GitHub Actions**.
3. Share the resulting `https://<user>.github.io/<repo>/` link with the group.
4. Each person opens it and taps:
   - **iPhone (Safari):** Share → *Add to Home Screen*
   - **Android (Chrome):** menu → *Install app* / *Add to Home screen*

It then launches full-screen with its own icon, with no browser chrome, and
opens instantly with no signal.

Any static host works equally well — Netlify, Vercel, Cloudflare Pages. Build
with `BASE_PATH=/` when serving from a domain root.

---

## Firebase and the security rules

The Firebase config in `src/sync/config.ts` is **public by design** — it ships
inside the JavaScript bundle and anyone can read it. It identifies the
project; it grants nothing. What protects the data is `firestore.rules`, which:

- requires a signed-in (anonymous) phone for every read and write
- allows reading a trip only by its id, and refuses listing, so trip ids
  cannot be discovered
- accepts only a well-formed document: the ledger, a server-stamped time, and
  the writer's own id — no extra fields, no forged timestamps, capped in size
- refuses deletes entirely, so no client can wipe a trip for the group

**The rules must be published in the Firebase console** (Firestore → Rules →
paste the file → Publish). CI tests the copy in this repository; it cannot see
what is live, so after changing the file, publish it again.

The built `index.html` also carries a **Content Security Policy**: scripts run
only from the app's own bundle, and the page may talk only to Firestore and
Firebase Auth. Should a dependency ever be compromised or an injection slip
through, the browser refuses to run or send anything else. The policy lives in
`vite.config.ts`; a new network call has to be added there first or it fails
in production.

Deleting anything (an expense, a repayment, a person, a trip) shows an
**Undo** for a few seconds instead of asking "are you sure?". A delete is a
tombstone, so undo is just a newer version of the record with the tombstone
cleared, and it wins the merge on every phone.

## Running it locally

Needs **Node 22.12 or newer** (Vitest 5 sets that floor; it is enforced by
`engines` in `package.json`). The emulator tests also need **Java 11+**.

```bash
npm install
npm run dev            # dev server, talking to the real Firebase project
npm test               # domain and sync-protocol tests, no network needed
npm run test:emulator  # security rules + two-phone sync against Google's emulator
npm run build          # production build into dist/
npm run preview        # serve the built app
npm run icons          # regenerate the PWA icons
```

To try it on your actual phone, run `npm run dev -- --host` and open the LAN
address it prints. Note that the service worker will not register over plain
http, so the app will run but will not be installable — deploy it for that.

---

## Where things live

```
src/
  domain/          no React, no browser APIs — pure, and fully tested
    types.ts       the data model and the replication contract
    money.ts       parsing and formatting of minor units
    split.ts       dividing an expense (largest remainder)
    balance.ts     who has paid what, who owes what
    settle.ts      balances -> a short list of payments
    merge.ts       the CRDT: merging two phones' ledgers
    ledger.ts      import/export, and validation of untrusted files
  storage/
    db.ts          localStorage persistence, quota handling
    store.tsx      React state; every mutation stamps the LWW fields
  sync/            live sync over Firestore
    protocol.ts    every sync decision, pure and tested without a network
    engine.ts      the Firestore adapter: moves bytes, decides nothing
    SyncProvider.tsx  loads the engine lazily and connects it to the store
    config.ts      the public Firebase config
firestore.rules    the only barrier protecting the database — tested in CI
test/emulator/     rules and two-phone tests against the Firestore emulator
  ui/              screens and components
```

The `domain/` folder deliberately has no dependency on React or the DOM. That
is what lets the arithmetic and the merge be tested exhaustively, and it is
where a future server-backed version would plug in unchanged.

---

## Known limits

These are deliberate, not oversights:

- **One currency per trip.** Convert before entering. Multi-currency needs
  per-expense FX rates and a rate source, which is a real feature, not a flag.
- **One payer per expense.** If two people split a bill at the till, log two
  expenses. Keeping this single-valued keeps the balance maths honest.
- **Your copy lives in this browser's storage**, and the trip also lives in
  Firebase. Clearing site data removes this phone's copy; it comes back from
  Firebase once you re-import the trip.
- **Anyone with a trip's share code can read and edit it.** That is the
  membership model: there are no accounts to revoke.
- **One trip must fit in one Firestore document** (about 700 KB compressed —
  thousands of expenses). A larger trip stops syncing live and says so;
  manual sharing still works.
- **Removing someone does not rewrite history.** Their past shares stay on the
  books, because recalculating them would change what everyone else owes.
- **No photos or trip journal.** Text only, which keeps a whole trip under a
  few hundred KB and comfortably inside the storage budget.
