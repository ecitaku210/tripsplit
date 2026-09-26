import type { ReactNode } from 'react'
import { Alert, TopBar } from '../components'
import { Icon } from '../icons'
import { appUrl } from '../invite'
import { back } from '../router'

/**
 * Help that lives inside the app, at its own address (#/help), so anyone on a
 * trip can open it from the home screen or from a link in the group chat.
 *
 * Written for the person standing at a till, not for a developer: every
 * answer is a short list of taps, in the words the buttons actually use.
 */


function Q({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="howto">
      <summary>
        {q}
        <Icon name="chevron" size={18} className="chev" />
      </summary>
      <div className="body">{children}</div>
    </details>
  )
}

export function HelpScreen() {
  const url = appUrl()

  async function shareHelp() {
    const text = `TripSplit — how to install and use it: ${url}#/help`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'TripSplit help', text, url: `${url}#/help` })
        return
      }
      await navigator.clipboard.writeText(text)
      alert('Link copied. Paste it into your group chat.')
    } catch {
      // The person dismissed the share sheet, or the browser refused. Nothing to do.
    }
  }

  return (
    <>
      <TopBar title="Help & FAQ" subtitle="Everything in one place" onBack backTo="/" />
      <div className="content no-fab faq">
        <div className="section">
          <Alert tone="info">
            <strong>New to the group?</strong> Install the app (first section), then import the group
            code someone sends you. From then on everything syncs by itself.
          </Alert>
        </div>

        <div className="section">
          <h2>Getting started</h2>
          <Q q="Install on iPhone">
            <ol>
              <li>
                Open <strong>{url}</strong> in <strong>Safari</strong>. If the link opened inside
                WhatsApp, tap <strong>⋯</strong> and choose <strong>Open in Safari</strong>.
              </li>
              <li>
                Tap the <strong>Share</strong> button (the square with an arrow pointing up, at the
                bottom).
              </li>
              <li>
                Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
              </li>
            </ol>
            <p>
              It then opens like a normal app, with its own icon, and works with no signal. There
              is nothing to download from the App Store.
            </p>
          </Q>
          <Q q="Install on Android">
            <ol>
              <li>
                Open <strong>{url}</strong> in <strong>Chrome</strong>.
              </li>
              <li>
                Tap <strong>⋮</strong> (top right), then <strong>Add to Home screen</strong> or{' '}
                <strong>Install app</strong>.
              </li>
            </ol>
          </Q>
          <Q q="Join a group someone else created">
            <ol>
              <li>Ask them to open the group, tap <strong>Invite &amp; share</strong>, then{' '}
                <strong>Share this group</strong>, and pick WhatsApp (or any chat).</li>
              <li>Tap the link they send. The group appears, with everything so far. On iPhone,
                if it opened inside WhatsApp, tap <strong>⋯</strong> and <strong>Open in Safari</strong>.</li>
              <li>Open the group and pick your name under <strong>Which person is you?</strong></li>
            </ol>
            <p>
              You only do this once. After that, every expense anyone adds appears on your phone by
              itself.
            </p>
          </Q>
          <Q q="Start a new group">
            <p>
              <strong>Exactly one person</strong> creates the group and adds everyone under{' '}
              <strong>People</strong>. Then they share the code. If two people each create a group,
              you end up with two groups that never join.
            </p>
          </Q>
        </div>

        <div className="section">
          <h2>Everyday use</h2>
          <Q q="Add an expense">
            <ol>
              <li>Tap <strong>Add expense</strong> the moment you pay.</li>
              <li>Type the amount and what it was for.</li>
              <li>
                Check <strong>Who paid?</strong> is you, untick anyone who was not part of it, tap{' '}
                <strong>Save</strong>.
              </li>
            </ol>
            <p>
              If <strong>Save</strong> does not save, something is missing. The form scrolls to
              the box that needs filling and marks it in red. The commonest slip is writing what
              the expense was for in the <strong>Note</strong> box at the bottom instead of the{' '}
              <strong>What was it for?</strong> box near the top; a one-tap{' '}
              <strong>Use your note</strong> button moves the words up.
            </p>
            <p>
              <strong>The person who paid is the one who adds it.</strong> If two people both add
              the same dinner, you get two dinners.
            </p>
          </Q>
          <Q q="What do the split options mean?">
            <p>
              <strong>Equally</strong>: everyone ticked pays the same. <strong>Amounts</strong>:
              type what each person owes, for example separate meals on one bill.{' '}
              <strong>Shares</strong>: whole numbers, so a couple in one room can be 2 and everyone
              else 1. <strong>%</strong>: percentages that add up to 100.
            </p>
          </Q>
          <Q q='What do "you owe" and "you lent" mean on an expense?'>
            <p>
              What that one expense means for you. <strong>you owe ₹800</strong>: someone else paid
              and ₹800 of it was your share. <strong>you lent ₹1,600</strong>: you paid, and ₹1,600
              of it was other people&apos;s share. They all add up to the balance at the top.
            </p>
          </Q>
          <Q q="Fix or delete an expense">
            <p>
              Tap the expense to see who owes what for it, then tap <strong>Edit</strong>, change
              it, tap <strong>Save</strong>. To remove it, tap <strong>Delete expense</strong> at
              the bottom of the edit screen. Everyone gets the change by itself.
              Deleted by mistake? Tap <strong>Undo</strong> on the message at the bottom within a
              few seconds. That works for removed people and repayments too.
            </p>
          </Q>
        </div>

        <div className="section">
          <h2>Syncing</h2>
          <Q q="What does the badge at the top of a group mean?">
            <p>
              <strong>Live</strong>: in step with everyone. <strong>Saving…</strong>: sending your
              change. <strong>Offline</strong>: no signal; everything is saved on your phone and
              goes up when signal returns. <strong>Sync problem</strong>: the app keeps retrying by
              itself. <strong>Update needed</strong>: close the app fully and open it again.{' '}
              <strong>Locked</strong>: the group is encrypted and this phone lacks the key; ask
              someone in the group for the code again and import it. <strong>Daily limit</strong>:
              the free sync allowance for the day is used up; everything is saved on the phone and
              syncs again after the daily reset.
            </p>
          </Q>
          <Q q="Does it sync when the app is closed?">
            <p>
              <strong>No.</strong> Phones do not let a web app run in the background. Anything you
              add with no signal goes up the next time you open the app with signal. While it is
              open, it keeps retrying by itself on weak signal.
            </p>
          </Q>
          <Q q="My friend's expenses are not showing">
            <ol>
              <li>Ask them to open the app with signal and check it says <strong>Live</strong>.</li>
              <li>
                Still nothing? You may be in <strong>different groups</strong>. Groups created
                separately never join. Keep the one with the data: they send you its code, you{' '}
                <strong>Import</strong> it, and delete the empty one.
              </li>
            </ol>
          </Q>
        </div>

        <div className="section">
          <h2>Settling up</h2>
          <Q q="How do we settle at the end?">
            <ol>
              <li>Everyone adds anything still missing.</li>
              <li>
                <strong>Everyone opens the app with signal</strong> and waits for{' '}
                <strong>Live</strong>. One missing phone means wrong numbers.
              </li>
              <li>
                Tap <strong>Settle up</strong>. It shows the fewest payments that clear everyone.
              </li>
              <li>Pay by cash or a transfer app.</li>
              <li>
                <strong>The person who paid</strong> taps <strong>Record</strong>, once the money
                has moved. Only the two people in a payment can record or delete it. Anyone else who
                taps Record is told so, and nothing is written.
              </li>
              <li>
                Paid a part of it, or paid someone the plan did not pair you with? Tap{' '}
                <strong>Paid someone</strong> next to Add expense on the group screen (it is also at
                the bottom of Settle up) and enter who paid, who received and the amount. The plan
                shrinks by what was paid.
              </li>
            </ol>
          </Q>
          <Q q="We settled up. How do we start a fresh count without deleting the group?">
            <p>
              For a flat, a running tab, or any group that keeps going: once everyone is square,
              tap <strong>Settle up</strong> (or open <strong>Balances</strong>) and tap{' '}
              <strong>Close the books</strong>. Everything so far moves under{' '}
              <strong>Closed periods</strong> at the bottom of the group, still readable, and the
              balances start again from zero. Nothing is deleted, and it happens on every phone.
            </p>
            <p>
              Closed expenses cannot be edited. If something was missed, open the period under{' '}
              <strong>Closed periods</strong> and tap <strong>Reopen this period</strong>, fix it,
              settle, and close again. Only offered when everyone is square: a closed period is
              always a finished story.
            </p>
          </Q>
          <Q q="A group is finished. How do I put it away?">
            <p>
              Open the group, tap <strong>People</strong>, then <strong>Archive this group</strong>.
              It moves under <strong>Archived</strong> on the home screen, keeps everything, and
              stops checking for updates. This is on your phone only; nobody else is affected, and{' '}
              <strong>Bring back from Archived</strong> undoes it.
            </p>
          </Q>
          <Q q="A repayment was recorded twice, or by mistake">
            <p>
              On the group screen, under <strong>Repayments</strong>, tap the <strong>bin icon</strong>{' '}
              next to it. It is removed for everyone. The app warns you with{' '}
              <strong>Possible double repayment</strong> when two phones recorded the same one.
            </p>
          </Q>
        </div>

        <div className="section">
          <h2>When something looks wrong</h2>
          <Q q="Balances are different on two phones">
            <p>
              One phone has not received everything yet. Both open the app with signal and check{' '}
              <strong>Live</strong>. Compare the <strong>spent</strong> total at the top: when it
              matches, you hold the same data.
            </p>
          </Q>
          <Q q='An expense shows "No date" or "not reaching anyone else&apos;s phone"'>
            <p>
              It was saved without a date. Open it, pick a date, tap <strong>Save</strong>. The
              warning disappears and the expense reaches everyone.
            </p>
          </Q>
          <Q q="Someone appears twice in the group">
            <p>
              Two people added them separately. Under <strong>People</strong>, keep one and remove
              the other. Past shares of the removed one stay on the books.
            </p>
          </Q>
          <Q q="A group disappeared after reinstalling">
            <p>
              Your phone&apos;s copy was wiped, but the group is still stored online. Tap{' '}
              <strong>Import</strong> and paste its code from the group chat. Everything comes back,
              including what others added since.
            </p>
          </Q>
        </div>

        <div className="section">
          <h2>Privacy</h2>
          <Q q="Where is the data stored, and who can see it?">
            <p>
              On each phone and in Google Firebase, so phones can stay in step. Trips are{' '}
              <strong>end-to-end encrypted</strong>: Firebase holds scrambled text and the key
              lives only on the phones, inside the group&apos;s code. A group&apos;s code therefore
              works like a <strong>password</strong>: anyone who has it can see and edit that group,
              and nobody else can, Google included. Share it only with the people in the group.
              There are no accounts or logins.
            </p>
          </Q>
          <Q q='My group says "Not encrypted yet"'>
            <p>
              It was created before encryption existed. Under <strong>Invite &amp; share</strong>,
              tap <strong>Turn on encryption</strong>. Do it when everyone has opened the app that
              day, then send them the new code; their phones show <strong>Locked</strong> until they
              import it. New groups are encrypted from the start.
            </p>
          </Q>
        </div>

        <div className="section">
          <button className="btn primary block" onClick={shareHelp}>
            <Icon name="share" size={18} />
            Share this help page
          </button>
          <p className="hint">
            Shares a link to this page, which also works before they have installed the app.
          </p>
        </div>

        <button className="btn block ghost" onClick={() => back('/')}>
          Back to groups
        </button>
      </div>
    </>
  )
}
