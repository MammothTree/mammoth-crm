# Mammoth CRM

Clients, estimates, invoices, jobs, crew time, routes, and bookkeeping for Mammoth Tree Service.
Plain HTML, CSS, and JavaScript. There is nothing to install or build.

**Open it:** https://mammothtree.github.io/mammoth-crm/

## Live on GitHub

- **App:** https://mammothtree.github.io/mammoth-crm/ (repository `MammothTree/mammoth-crm`, published with GitHub Pages). It holds only the app code, never client data.
- **Data:** the private repository `MammothTree/mammoth-crm-data` holds your CRM data (`data/crm-data.json`) and job cam photos and videos (`media/`).

### Connect a device (once per phone or computer)

1. Open the app address above. On phones, install it (iPhone: Safari → Share → Add to Home Screen; Android: Chrome → Install app).
2. Go to **Integrations → GitHub backup & sync** and select **Create an access key on GitHub**. Choose *Only select repositories* → `mammoth-crm-data`, set **Contents** to *Read and write*, and generate it.
3. Paste the key and select **Connect this device**. One key can be used on every device.

After that, each device gets the latest data when it opens, sends changes a few seconds after saving, and backs up new photos and videos automatically (up to 50 MB each). If two devices change data while offline, the app asks which copy to keep instead of overwriting. Anyone with the key can see all data, including bookkeeping, so for crew members who shouldn't, use **Phone app → Send a crew member their day**.

GitHub asks to keep a repository under about 5 GB. Integrations shows how much you're using.

### Updating the app

Edit the files, then in **GitHub Desktop** commit and select **Push origin**. GitHub Pages republishes in about a minute, and installed phones pick up the update the next time they open the app.

## What's inside

### Business

| Tab | What it does |
|---|---|
| **Sales hub** | A time bar (this month, last month, quarter, year to date, last 12 months, last year, or custom dates) controls the KPIs: revenue paid, outstanding, estimates, and close rate, each compared with the previous period. It also shows profit on jobs won, the sales goal growth rings, upcoming jobs, follow-ups, and recent activity. **Sales goal** sets your annual goal with seasonal monthly targets. |
| **Leads** | Drag-and-drop deal board: New Lead → Site Visit → Estimate Sent → Negotiating → Won / Lost. The deal window holds crew, start time, job length, payments, job cost, and the invoice. |
| **Clients** | Client list with lifetime value. **Import clients** brings in a list pasted from Google Sheets, or a CSV or Excel file. Columns are matched automatically and existing clients are skipped or have missing details filled in. Each client card shows deals, estimates, invoices, notes, and activity. |
| **Estimates** | Price book items, add-ons (cranes, subs, rentals), crew hours, equipment, and site difficulty. Shows your real cost and margin, and prints with your logo. |
| **Invoices** | Turn finished jobs into invoices, record partial or full payments, print with a "Paid" stamp, copy a payment reminder, or void an invoice. |
| **Job cam** | Photo and video folders per job, with status and before, during, or after labels. Backed up to GitHub when a device is connected. |
| **Job cost** | Estimated cost compared with actual cost (tracked crew time + an overhead share + job expenses). Flags jobs that ran over budget. |
| **Time tracking** | Clock in and out (one person or a whole crew), weekly timesheet, labor cost, overtime, and importing hours texted from crew phones. |
| **Calendar** | Month and week views of jobs, estimate visits, and events. Drag to reschedule, filter by crew. |
| **Route planner** | A street map with numbered, labeled stops and the route along real roads. It shows nearby jobs you could add, the best order for each person's day, miles, drive time, fuel cost, and savings, and opens the route in Google Maps. |

### Tools

| Tab | What it does |
|---|---|
| **Bookkeeping** | Its own PIN. Import bank and card files (CSV, QFX, or OFX). Transactions are sorted into categories automatically, duplicates are skipped, and your own rules are learned as you go. View any week, month, quarter, year, or custom range, then download a profit & loss (PDF or spreadsheet) and all transactions for your accountant. |
| **Overhead & pricing** | Overhead, a rate card (per crew-hour, person-hour, half day, full day, week), rate history, the **Price a job** calculator, your add-ons list, and your price book. |
| **Templates** | Emails, texts, and contract terms with merge fields such as `{{customer.firstName}}`, `{{invoice.balance}}`, and `{{company.reviewLink}}`. |

### Account

| Tab | What it does |
|---|---|
| **Branding** | Business profile, logo, colors (presets, custom, or pulled from your logo), heading style, and yard address. |
| **Integrations** | GitHub backup & sync, a website request form (free Google Sheets connector), Square CSV import, Google reviews (with your API key), and Yelp tracking. |
| **Phone app** | The web address with a QR code, install steps, crew view, sending a crew member their day, and importing their hours. |
| **Settings** | Defaults, crew and roles, PIN lock, backups, and clearing the demo data. |

## First steps for real use

1. **Settings → Clear demo data.** Settings, branding, price book, overhead, templates, and goal are kept.
2. **Settings → Crew & roles:** add your crew and wages.
3. **Branding:** add your logo, colors, and yard address.
4. **Integrations:** connect GitHub on each device, and set up the website form.

## Data and privacy

- Each device keeps a copy of the data in its browser. GitHub sync keeps the copies the same.
- Keys and tokens (GitHub, Google) stay in the browser where they're entered. They're never in backups or synced files.
- The app PIN and the bookkeeping PIN are privacy screens. They don't encrypt data.
- **Settings → Download backup** saves everything except photos to a file. Photos are backed up to GitHub instead.

## How the numbers work

- **Break-even rate per crew-hour** = (monthly overhead + monthly crew labor) ÷ billable crew-hours per month. **Recommended rate** = break-even ÷ (1 − target profit %), rounded up to $5.
- **Estimate job cost** = crew hours × break-even rate + equipment operating cost + disposal + add-on costs.
- **Revenue paid** = payments recorded, on their payment date. **Outstanding** = unpaid balance on jobs won in the period.
- **Close rate** = deals won ÷ (won + lost) in the period.
- **Profit** = job value − job cost. Job cost comes from the estimate, from your entry, or from tracked time.
- **Tracked job cost** = hours × wage × (1 + labor burden) + crew-hours × overhead per crew-hour + job expenses + estimated equipment cost.
- **Route distances** come from OpenStreetMap road data when online, otherwise straight-line × 1.25. Fuel = miles ÷ MPG × price.
- **Bookkeeping** is cash basis. Owner draws and transfers are kept out of profit.

## Files

```
index.html             App shell
css/styles.css         All styling (light/dark, print)
js/util.js             Helpers, modals, toasts
js/store.js            Data, calculations, GitHub sync
js/seed.js             Demo data
js/charts.js           Charts and growth rings
js/media.js            Job cam storage and GitHub photo backup
js/print.js            Printable estimates and invoices
js/brand.js            Branding
js/lock.js             PIN lock
js/crewlink.js         Crew day links and texted hours
js/views/*.js          One file per tab
js/app.js              Navigation and startup
manifest.webmanifest, sw.js, icons/   Installable phone app and offline support
```
