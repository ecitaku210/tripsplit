import type { ReactNode } from 'react'
import { Alert, TopBar } from '../components'
import { Icon } from '../icons'
import { navigate } from '../router'

/**
 * Help that lives inside the app, at its own address (#/help), so anyone on a
 * trip can open it from the home screen or from a link in the group chat.
 *
 * Written for the person standing at a till, not for a developer: every
 * answer is a short list of taps, in the words the buttons actually use.
 */

/** The installable address of this very deployment, wherever it is hosted. */
function appUrl(): string {
  return `${window.location.origin}${window.location.pathname}`
}

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
      <TopBar title="Help & FAQ" subtitle="Everything in one place" onBack />
      <div className="content no-fab faq">
        <div className="section">
          <Alert tone="info">
            <strong>New to the group?</strong> Install the app (first section), then import the trip
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
          <Q q="Join a trip someone else created">
            <ol>
              <li>Ask them to open the trip, tap <strong>Invite &amp; share</strong>, then{' '}
                <strong>Copy code</strong>, and send you the code.</li>
              <li>In TripSplit, tap <strong>Import</strong>, paste the code, tap <strong>Import</strong>.</li>
              <li>Open the trip and pick your name under <strong>Which person is you?</strong></li>
            </ol>
            <p>
              You only do this once. After that, every expense anyone adds appears on your phone by
              itself.
            </p>
          </Q>
          <Q q="Start a new trip">
            <p>
              <strong>Exactly one person</strong> creates the trip and adds everyone under{' '}
              <strong>People</strong>. Then they share the code. If two people each create a trip,
              you end up with two trips that never join.
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
              Tap the expense, change it, tap <strong>Save</strong>. To remove it, tap{' '}
              <strong>Delete expense</strong> at the bottom. Everyone gets the change by itself.
            </p>
          </Q>
        </div>

        <div className="section">
          <h2>Syncing</h2>
          <Q q="What does the badge at the top of a trip mean?">
            <p>
              <strong>Live</strong>: in step with everyone. <strong>Saving…</strong>: sending your
              change. <strong>Offline</strong>: no signal; everything is saved on your phone and
              goes up when signal returns. <strong>Sync problem</strong>: the app keeps retrying by
              itself. <strong>Update needed</strong>: close the app fully and open it again.
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
                Still nothing? You may be in <strong>different trips</strong>. Trips created
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
                <strong>Only the person who paid</strong> taps <strong>Record</strong>, once the
                money has moved.
              </li>
            </ol>
          </Q>
          <Q q="A repayment was recorded twice, or by mistake">
            <p>
              On the trip screen, under <strong>Repayments</strong>, tap the <strong>bin icon</strong>{' '}
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
          <Q q="Someone appears twice in the trip">
            <p>
              Two people added them separately. Under <strong>People</strong>, keep one and remove
              the other. Past shares of the removed one stay on the books.
            </p>
          </Q>
          <Q q="A trip disappeared after reinstalling">
            <p>
              Your phone&apos;s copy was wiped, but the trip is still stored online. Tap{' '}
              <strong>Import</strong> and paste its code from the group chat. Everything comes back,
              including what others added since.
            </p>
          </Q>
        </div>

        <div className="section">
          <h2>Privacy</h2>
          <Q q="Where is the data stored, and who can see it?">
            <p>
              On each phone and in Google Firebase, so phones can stay in step. A trip&apos;s code
              works like a <strong>password</strong>: anyone who has it can see and edit that trip,
              and nobody else can find it. Share it only with the people on the trip. There are no
              accounts or logins.
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

        <button className="btn block ghost" onClick={() => navigate('/')}>
          Back to trips
        </button>
      </div>
    </>
  )
}
