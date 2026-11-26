# Debt Snowball Calculator — Money Mind Audit

Audience: US-first (worldwide sell; not UK).

This is a single-page static web app in plain HTML, CSS and JS, with no build step and no frameworks. Open `index.html` in a browser, or serve this folder. Nothing is deployed.

## Files

- `index.html`: the page, including SEO, Open Graph and Twitter tags.
- `styles.css`: the Money Mind Audit look from the starter site (money-mind-audit-starter.netlify.app). It uses charcoal `#1C1C1C`, paper `#F5F1E8`, stamp red `#B91C1C` and a gold underline `#C49A1A`, in Anton, Inter and IBM Plex Mono.
- `app.js`: the snowball math, live results, localStorage and the add/remove debt rows. It also works as a Node module for tests.
- `fonts/`: bundled OFL fonts, the same files the starter site uses. No Google Fonts call.
- `mark.png`, `favicon.png`: the brand stamp, resized from the starter site's `mark.png`.
- `og.png`: the 1200×630 social card, rendered from `qa/og.html`.
- `qa/test.js`: math tests. Run `node qa/test.js`.
- `qa/shots.py`: renders `qa/desktop.png`, `qa/mobile.png` and `og.png` through a local server, and smoke-tests adding a row, reloading and resetting. Run `python3 qa/shots.py`.
- `POSTS.md`: draft X, Facebook Page and group copy.

## Before going live

1. Replace every `{{URL}}` in `index.html` with the live address. That covers canonical, og:url, og:image and twitter:image. The social card needs an absolute URL, for example `https://example.vercel.app/og.png`.
2. The CTA already points to `https://payhip.com/b/Vf9jC`. On 26 Nov 2026 that page showed "Money Mind Audit Workbook", $27.00.

Do not publish or deploy until Scott says go.

## What it does

**Inputs**
- Any number of debts, each with a name, balance, minimum per month and APR. Three example rows are prefilled and editable.
- An extra monthly payment, which defaults to $100.
- Inputs are saved in this browser's localStorage under `mma-debt-snowball-v1`. "Reset to examples" restores the defaults.
- Nothing is sent anywhere. There are no network calls, no email capture and no analytics.

**Outputs**
- The debt-free month and year, the total months, the total interest and the all-in monthly payment.
- A comparison with paying only the minimums: interest saved and months saved. If minimums alone never clear a debt within 50 years, it says so.
- The payoff order, with each debt's payoff as Month N plus the calendar month. Month 1 is next month.
- A CSS bar timeline.
- Warnings when a minimum doesn't cover the monthly interest, or when a minimum is blank.

## Math

All math is done in whole cents. Each month:

1. **Interest first.** Each open balance increases by `round(balance × APR / 100 / 12)`.
2. **Fixed budget.** The budget is the sum of every starting minimum plus the extra. Each open debt is paid its minimum, or less if less clears it.
3. **Snowball.** Whatever is left goes to the open debt with the smallest starting balance. Ties keep the order entered. If that clears the debt, the remainder spills into the next one in the same month. That's how final partial payments and rollovers work. A paid-off debt's minimum stays in the budget, so it rolls forward.
4. **Payoff month.** A debt's payoff month is the month its balance reaches $0.

**Minimums only:** each debt pays its own minimum, with no extra and no rollover.

Both simulations stop at 600 months.

**Not modeled:** daily interest accrual, fees, promotional-rate expiry and rate changes. The page says so.

## QA (26 Nov 2026)

- `node qa/test.js` passes 7 of 7. The tests are hand-checked cases, a closed-form amortization check, and an independent re-implementation run on the example rows.
- `python3 qa/shots.py` shows no console errors and no horizontal overflow at 1366 px or 390 px. Adding a row persists across a reload, and reset restores the 3 rows and $100.
