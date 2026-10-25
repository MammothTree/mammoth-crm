/* Mammoth CRM — Training lessons. Each lesson is a narrated walkthrough of the real screens (steps), practice tasks, and a quiz.
   Step: { route, before(), el (CSS selector to highlight; missing or hidden → the card shows in the middle), title, say }. */
(function () {
  'use strict';
  const MT = window.MT;
  const est = (mode) => () => { MT.views.estimator.mode = mode; };
  const oh = (mode) => () => { MT.views.overhead.mode = mode; };
  const card = (id) => () => { MT.views.integrations.open = id; };

  MT.trainingLevels = [
    { id: 'basics', name: 'Start here' },
    { id: 'daily', name: 'Everyday work' },
    { id: 'money', name: 'Money' },
    { id: 'more', name: 'More tools' },
    { id: 'owner', name: 'Owner tools' },
  ];

  MT.trainingLessons = [
    {
      id: 'start', level: 'basics', mins: 4, title: 'Getting around',
      summary: 'What the CRM is for, how the menu is organized, the quick buttons, and how your phone and computer stay in sync.',
      steps: [
        { title: 'Welcome to the Mammoth CRM', say: 'This is where we run the business. Every client, lead, estimate, job, invoice, and payment lives here. The lessons follow a job from start to finish: someone calls, we estimate, they approve, we do the work, we invoice, and we get paid.' },
        { route: 'dashboard', el: '.side .nav', title: 'The menu', say: 'The menu has three groups. Business is the everyday work: leads, clients, estimates, invoices, photos, and the calendar. Tools are for pricing, bookkeeping, and marketing. Account is setup. On a phone, tap the three lines in the top left corner to open the menu.' },
        { el: '#q-customer', title: 'Quick buttons', say: 'These buttons are on every screen. Add client, New lead, and New estimate. When the phone rings, you can capture the lead from wherever you are.' },
        { route: 'dashboard', el: '.kpis', title: 'The Sales hub', say: 'The Sales hub is the first screen. It shows money collected, what customers still owe, open estimates, and how many estimates we win. We\'ll come back to it in the Money lessons.' },
        { route: 'integrations', before: card('github'), el: '[data-card="github"]', title: 'Same data on every device', say: 'Each phone and computer connects once to our private GitHub backup with an access key. After that, anything you add shows up on the other devices within about a minute. If this says Not set up on this device, ask for the key and paste it here.' },
        { route: 'app', el: '#ap-install', title: 'Put it on your phone', say: 'The Phone app tab shows how to install the CRM on your home screen, so it opens like a normal app. That\'s it for getting around. Next up: clients.' },
      ],
      practice: ['Install the CRM on your phone (Phone app tab).', 'Check that Integrations → GitHub backup & sync says Connected on your phone.', 'Find the Add client, New lead, and New estimate buttons on two different screens.'],
      quiz: [
        { q: 'A customer calls while you\'re on the Calendar. What\'s the fastest way to save them as a lead?', a: ['Go to Settings', 'Use the New lead button at the top', 'Write it down and add it later'], c: 1, why: 'The quick buttons are on every screen.' },
        { q: 'You add a client on the computer. When does it show on the phone?', a: ['Within about a minute, when both devices are connected to GitHub sync', 'Only after importing a backup file', 'It never does'], c: 0, why: 'Connected devices sync on their own every minute and whenever the app opens.' },
      ],
    },
    {
      id: 'clients', level: 'basics', mins: 4, title: 'Clients',
      summary: 'Adding clients, finding them fast, importing a list, and what\'s on a client\'s card.',
      steps: [
        { route: 'customers', el: '#cu-new', title: 'Add a client', say: 'Select Add client and fill in the name, phone, email, and address. The address matters: it\'s used for the route planner and printed on estimates. Also pick how they found us, the lead source.' },
        { el: '#cu-q', title: 'Find anyone fast', say: 'Search by name, phone, email, or street. You can also filter residential or commercial and sort by who\'s worth the most.' },
        { el: '#cu-import', title: 'Import a list', say: 'Import clients pastes in a list from Google Sheets, or a CSV or Excel file, including a Square export. Columns are matched for you, and clients we already have are skipped.' },
        { el: '#view .table-wrap, #view .list', title: 'The client card', say: 'Select any client to open their card: every lead, estimate, invoice, payment, and note in one place, plus how much they\'ve spent with us. Add a note after every call so anyone can pick up where you left off.' },
        { title: 'Why the lead source matters', say: 'Lead source tells us which marketing brings in jobs: Google, referrals, the truck sign, partners. Always fill it in. It decides where we spend money next year.' },
      ],
      practice: ['Add yourself as a test client with a full address and a lead source.', 'Open your client card and add a note.', 'Search for your test client by phone number.'],
      quiz: [
        { q: 'Why fill in the lead source on every client?', a: ['It\'s required to print estimates', 'It shows which marketing brings in jobs', 'It sets the price'], c: 1, why: 'Lead source drives where we spend marketing money.' },
        { q: 'Where do you see everything about one customer?', a: ['Their client card', 'Bookkeeping', 'Templates'], c: 0, why: 'The client card shows leads, estimates, invoices, payments, and notes.' },
      ],
    },
    {
      id: 'leads', level: 'basics', mins: 5, title: 'The leads board',
      summary: 'Every call becomes a lead. The board shows where each job stands, from first call to won or lost.',
      steps: [
        { route: 'pipeline', el: '#pl-new', title: 'Every call becomes a lead', say: 'Select New lead for every call, text, or form. Give it a short job title like Remove dead oak by the driveway, pick or add the client, guess the value, and set the source.' },
        { el: '.board', title: 'The board', say: 'Each column is a stage: New Lead, Site Visit, Estimate Sent, Negotiating, then Won or Lost. Drag a card to the next column as things happen. When you send an estimate or a customer approves online, the card moves by itself.' },
        { el: '.col-head', title: 'Totals per column', say: 'The top of each column shows how many jobs are in it and what they\'re worth, so we always know what\'s coming.' },
        { el: '.board', title: 'Open a deal', say: 'Select a card to open the deal. That\'s where you set the job date and start time, pick the crew, record payments, attach the signed contract, and create the estimate or invoice.' },
        { title: 'Lost jobs', say: 'When a job is lost, move it to Lost and write the reason, like price, timing, or went with someone else. Over time those reasons show us what to fix.' },
      ],
      practice: ['Create a test lead for your test client.', 'Drag it to Site Visit, then open it and set a job date.', 'Find where to attach a file in the deal window.'],
      quiz: [
        { q: 'You email an estimate from the CRM. What happens to the lead card?', a: ['Nothing; you must move it', 'It moves to Estimate Sent automatically', 'It\'s deleted'], c: 1, why: 'Sending an estimate moves the card for you.' },
        { q: 'Where do you record that a customer paid a deposit by check?', a: ['In the deal window under Payments', 'In Templates', 'In Settings'], c: 0, why: 'Every payment lives on the job (the deal).' },
      ],
    },
    {
      id: 'estimates', level: 'daily', mins: 7, title: 'Building an estimate',
      summary: 'Price book items, cranes and subs, crew hours, the time & materials switch, deposits, and reading the margin.',
      steps: [
        { route: 'estimator', before: est('build'), el: '[data-k=customerId]', title: 'Pick the client', say: 'Start with the client. If they\'re new, select New right next to it. The job address fills in from the client.' },
        { el: '[data-k=title]', title: 'Job title', say: 'Write a clear job title the customer will understand, like Remove two maples and grind stumps. It goes on the estimate and the invoice.' },
        { el: '#est-pb', title: 'Add work from the price book', say: 'Add each piece of work from the price book: removals by size, pruning, stump grinding, and so on. Prices are already set. You can change the quantity or price on any line.' },
        { el: '#est-addon', title: 'Cranes, subs, and rentals', say: 'Crane time, climbing subs, lift rentals, and permits are add-ons. They carry what they cost us, so the profit number stays honest.' },
        { el: '[data-k=crewHours]', title: 'Crew hours', say: 'Enter how many hours the crew will be on site. On normal flat-priced jobs, the hours do not add to the price. They only work out what the job costs us.' },
        { el: '[data-k=billTM]', title: 'Leave this box off', say: 'This box bills crew time by the hour. Leave it off for normal jobs. Only turn it on for hourly work like storm cleanup. Never use price book items and hourly billing together, or the customer pays twice.' },
        { el: '[data-k=deposit]', title: 'Deposit', say: 'Set the deposit to book the job, as a percent or a dollar amount. The estimate shows the deposit and the balance due when the work is done.' },
        { el: '#est-summary', title: 'Check the margin', say: 'The box on the right shows the total, and below it, numbers the customer never sees: our cost, our profit, and the margin. Green is healthy, yellow is thin, red means we\'re losing money. If it\'s red, raise the price or check the hours.' },
      ],
      practice: ['Build a test estimate for your test client with two price book items.', 'Change crew hours from 4 to 8 and watch the margin change.', 'Set a 25% deposit and find it in the summary.'],
      quiz: [
        { q: 'A normal removal from the price book. Should "Bill crew time" be on?', a: ['Yes, always', 'No, leave it off; the hours only calculate our cost', 'Only on Fridays'], c: 1, why: 'Price book plus hourly billing charges the customer twice.' },
        { q: 'The margin box is red. What does that mean?', a: ['The estimate was sent', 'We\'d lose money or barely break even at this price', 'The customer approved'], c: 1, why: 'Red means the price doesn\'t cover the job\'s cost.' },
        { q: 'Where do crane and sub costs go?', a: ['Add-ons (crane, sub, or rental)', 'The notes', 'Nowhere'], c: 0, why: 'Add-ons carry their cost so the profit is right.' },
      ],
    },
    {
      id: 'send', level: 'daily', mins: 6, title: 'Sending estimates & getting approval',
      summary: 'Preview, email, or text an estimate, then watch for opens, change requests, and online approval.',
      steps: [
        { route: 'estimator', before: est('build'), el: '[data-act=preview]', title: 'Preview & send', say: 'When the estimate is ready, select Preview and send. You see exactly what the customer will see, the same as the PDF.' },
        { title: 'Send by email', say: 'Send by email goes out from our Google account with the PDF attached and a button that says View and approve estimate. When it\'s sent, the CRM shows Emailed to, with the address and the time.' },
        { title: 'Send by text', say: 'Send by text opens your messages app with a short note and the link. Tap send there, then tell the CRM it went out.' },
        { title: 'The customer\'s page', say: 'The link opens the customer\'s own page. They can approve by typing their name, ask for changes, like please also quote the second stump, and pay the deposit online.' },
        { el: '#est-summary', title: 'Watch for activity', say: 'On the estimate you\'ll see when they opened it and how many times. If they ask for changes, their note shows here. Update the estimate and send it again: the same link shows the new version. When they approve, the estimate is accepted and the job moves to Won by itself.' },
        { route: 'estimator', before: est('list'), el: '#el-q', title: 'Saved estimates', say: 'Saved estimates lists everything with flags like Opened, Changes requested, and Approved online. Check it every morning and follow up on anything opened but not approved.' },
      ],
      practice: ['Preview your test estimate.', 'Send it to your own email and open the link on your phone.', 'On that page, ask for a change, then watch it show up on the estimate within a couple of minutes.'],
      quiz: [
        { q: 'A customer asks for changes online. What do you do?', a: ['Make a brand-new estimate', 'Update the estimate and send it again (same link)', 'Nothing'], c: 1, why: 'Resending updates the same customer page.' },
        { q: 'How do you know they actually looked at it?', a: ['The estimate shows Opened, with the time', 'You can\'t know', 'Call Google'], c: 0, why: 'Opens are tracked on the customer\'s page.' },
      ],
    },
    {
      id: 'deposits', level: 'money', mins: 5, title: 'Deposits & payments',
      summary: 'Requesting the deposit, online payments through Square, and recording checks and cash.',
      steps: [
        { route: 'estimator', before: est('build'), el: '#est-summary', title: 'Request the deposit', say: 'On a sent estimate with a deposit, select Request the deposit. It writes the message for you with a Square pay link for the exact amount. Text it, email it, or copy it.' },
        { title: 'Paid online is automatic', say: 'When the customer pays the Square link, the CRM records the payment on the job within a couple of minutes, marks the estimate accepted, and moves the job to Won. You\'ll see a message pop up.' },
        { route: 'pipeline', el: '.board', title: 'Checks, cash, and Zelle', say: 'For other payments, open the deal and record it under Payments: amount, date, and method. If it was the deposit, use Deposit received. That turns off the Square link so nobody pays twice.' },
        { route: 'integrations', before: card('square'), el: '[data-card="square"]', title: 'Card reader payments', say: 'Payments taken in person on the Square reader come in with Bring in other Square payments. Match each one to its job. Nothing is counted twice.' },
      ],
      practice: ['Find the Payments section in a deal window.', 'Find the Deposit received button on a sent estimate with a deposit.'],
      quiz: [
        { q: 'A customer pays the deposit with a check. What do you do?', a: ['Record it under Payments (or Deposit received) on the job', 'Nothing; Square handles it', 'Email the bank'], c: 0, why: 'Only online Square payments record themselves.' },
        { q: 'Why use Deposit received instead of just adding a payment?', a: ['It looks nicer', 'It also turns off the Square link so they can\'t pay twice', 'There\'s no difference'], c: 1, why: 'The open link is cancelled.' },
      ],
    },
    {
      id: 'schedule', level: 'daily', mins: 5, title: 'Calendar & crew',
      summary: 'Scheduling jobs and estimate visits, rescheduling, crew filters, and sending a crew member their day.',
      steps: [
        { route: 'calendar', el: '#cal-add', title: 'Add to the calendar', say: 'Add a job, an estimate visit, or anything else. Won jobs with a job date show up here on their own.' },
        { el: '.cal-grid', title: 'Drag to reschedule', say: 'Rain day? Drag the job to a new day. The job date updates everywhere.' },
        { el: '#cal-crew', title: 'Filter by crew', say: 'Show one crew member\'s schedule at a time, so you can see who\'s free.' },
        { route: 'settings', el: '#crew-add', title: 'Crew & roles', say: 'The crew list lives in Settings: names, roles, wages, and calendar colors. Wages are used to work out labor cost.' },
        { route: 'app', el: '#ap-make', title: 'Send someone their day', say: 'Send a crew member their day creates a link with just their jobs, addresses, and notes. They don\'t need the key, and they can\'t see money or other clients.' },
      ],
      practice: ['Add a test estimate visit for tomorrow.', 'Drag it to the next day.', 'Make a day link for a crew member (you don\'t have to send it).'],
      quiz: [
        { q: 'It rains. How do you move tomorrow\'s job?', a: ['Delete it and make a new one', 'Drag it to the new day on the Calendar', 'Call GitHub'], c: 1, why: 'Dragging updates the job date everywhere.' },
        { q: 'A new crew member needs their schedule but shouldn\'t see prices. What do you send?', a: ['The GitHub key', 'A "send a crew member their day" link', 'A screenshot of Bookkeeping'], c: 1, why: 'Day links show only their jobs.' },
      ],
    },
    {
      id: 'jobcam', level: 'daily', mins: 4, title: 'Job photos & files',
      summary: 'Before, during, and after photos for every job, plus contracts and permits on the deal.',
      steps: [
        { route: 'jobcam', el: '#jc-new', title: 'A folder for every job', say: 'Make a photo folder for each job and link it to the client. On the phone, take photos right from here.' },
        { title: 'Before, during, after', say: 'Tag photos as before, during, or after. Before photos protect us if there\'s ever a damage question. After photos are great for reviews and the website.' },
        { title: 'Backed up automatically', say: 'When the device is connected, photos and videos back up to our private GitHub, so they\'re safe even if a phone is lost, and the other devices can see them.' },
        { route: 'pipeline', el: '.board', title: 'Contracts and permits', say: 'Signed contracts, permits, and other paperwork go in the deal window under Files and contract. PDFs, Word files, and photos all work.' },
      ],
      practice: ['Make a test photo folder and add one photo.', 'Tag it Before.', 'Attach any PDF to your test deal under Files & contract.'],
      quiz: [
        { q: 'Why take before photos?', a: ['They protect us if there\'s a damage question', 'They\'re required by Square', 'No reason'], c: 0, why: 'Before photos are our proof of the site\'s condition.' },
        { q: 'Where does a signed contract go?', a: ['Files & contract in the deal window', 'In a text message', 'Templates'], c: 0, why: 'Files are saved with the job and backed up.' },
      ],
    },
    {
      id: 'time', level: 'daily', mins: 4, title: 'Time tracking',
      summary: 'Clocking the crew in and out, adding hours, and why real hours matter.',
      steps: [
        { route: 'time', el: '#tt-crew', title: 'Clock in a crew', say: 'At the start of the day, clock in the whole crew on a job with one button.' },
        { el: '[data-clock]', title: 'One person at a time', say: 'Or clock people in and out one at a time. Breaks can be entered when clocking out.' },
        { el: '#tt-add', title: 'Forgot to clock in?', say: 'Add hours by hand. Hours texted from crew phones can be imported here too.' },
        { title: 'Why it matters', say: 'Real hours feed Job cost, so we can see which jobs made money and price the next one better.' },
      ],
      practice: ['Clock yourself in on a test job, then clock out.', 'Find where to add hours by hand.'],
      quiz: [
        { q: 'Why track real hours?', a: ['So Job cost shows which jobs made money', 'Google needs it', 'To print invoices'], c: 0, why: 'Actual hours vs. estimated hours shows true profit.' },
      ],
    },
    {
      id: 'invoices', level: 'money', mins: 6, title: 'Invoicing & getting paid',
      summary: 'Turning finished jobs into invoices, sending them, Square pay links, reminders, and marking paid.',
      steps: [
        { route: 'invoices', el: '.kpis', title: 'The money owed', say: 'The top shows what\'s outstanding, what\'s overdue, what came in the last 30 days, and finished jobs that still need an invoice.' },
        { el: '#inv-new', title: 'New invoice', say: 'Create the invoice from a won job. The lines come from the estimate, and any deposit already paid is subtracted, so the invoice shows only the balance.' },
        { title: 'Preview & send', say: 'Inside the invoice, Preview and send works just like estimates. The customer gets a View and pay button that opens their page with a Pay online link.' },
        { title: 'Square pay link and reminders', say: 'Create Square pay link makes a link for the exact balance. When it\'s paid, the invoice is marked paid by itself. For late invoices, Copy payment reminder writes a friendly reminder that includes the link.' },
        { title: 'Paid by check?', say: 'Record the payment in the invoice: amount, date, and method, or Paid in full. A paid invoice prints with a Paid stamp.' },
      ],
      practice: ['Open Invoices and find "Ready to invoice".', 'Open any invoice and find Preview & send, Record payment, and Copy payment reminder.'],
      quiz: [
        { q: 'The customer paid a $500 deposit on a $1,500 job. What does the invoice show as due?', a: ['$1,500', '$1,000', '$500'], c: 1, why: 'Deposits are subtracted automatically.' },
        { q: 'An invoice is two weeks late. What\'s the quick fix?', a: ['Copy payment reminder and send it', 'Delete the invoice', 'Wait'], c: 0, why: 'The reminder includes the balance and the pay link.' },
      ],
    },
    {
      id: 'profit', level: 'money', mins: 4, title: 'Job cost & profit',
      summary: 'Estimated vs. actual cost, jobs that ran over, and job expenses.',
      steps: [
        { route: 'jobcost', el: '.kpis', title: 'Did we make money?', say: 'Job cost compares what we estimated with what the job really cost: tracked crew time, a share of overhead, and job expenses like dump fees.' },
        { title: 'Over budget flags', say: 'Jobs that ran over are flagged. Look for patterns, like a type of job that always takes longer, and adjust the price book.' },
        { title: 'Add job expenses', say: 'Open a job here to add expenses such as extra dump loads or a rental, so the profit is real.' },
      ],
      practice: ['Open Job cost and find a job that ran over budget (sample data has some).'],
      quiz: [
        { q: 'A type of job keeps running over budget. What should change?', a: ['Its price in the price book (or the hours we estimate)', 'The company name', 'Nothing'], c: 0, why: 'Use what really happened to price the next one.' },
      ],
    },
    {
      id: 'hub', level: 'money', mins: 4, title: 'Sales hub & goal',
      summary: 'Reading the numbers for any time period and tracking the yearly sales goal.',
      steps: [
        { route: 'dashboard', before: () => { MT.views.dashboard.mode = 'overview'; }, el: '.timebar-presets', title: 'Pick the time period', say: 'Choose this month, last month, the quarter, year to date, or custom dates. Every number on the page follows.' },
        { el: '.kpis', title: 'The key numbers', say: 'Revenue paid, money still owed, open estimates, and close rate, each compared with the period before.' },
        { el: '#dash-rings', title: 'The sales goal', say: 'The rings show how close we are to this year\'s goal. The Sales goal tab sets the yearly goal and seasonal monthly targets.' },
      ],
      practice: ['Switch the Sales hub to Last month, then Year to date.', 'Find our close rate.'],
      quiz: [
        { q: 'What does close rate mean?', a: ['Estimates won ÷ estimates decided (won + lost)', 'How fast we close the gate', 'Hours per job'], c: 0, why: 'It\'s the share of decided estimates we win.' },
      ],
    },
    {
      id: 'routes', level: 'more', mins: 3, title: 'Route planner',
      summary: 'Planning the day\'s stops in the best order and opening the route in Google Maps.',
      steps: [
        { route: 'routes', el: '#rt-date', title: 'Pick the day', say: 'Choose the day and the crew member. Their jobs and visits show as numbered stops.' },
        { el: '#rt-map', title: 'The map', say: 'The route follows real roads, with miles, drive time, and fuel cost. It also suggests nearby jobs you could add to the day.' },
        { el: '#rt-gmaps', title: 'Open in Google Maps', say: 'Open the route in Google Maps for turn-by-turn directions on the phone.' },
      ],
      practice: ['Open the Route planner for a day with jobs and open it in Google Maps.'],
      quiz: [{ q: 'Where do you get turn-by-turn directions?', a: ['Open in Google Maps from the Route planner', 'Bookkeeping', 'Templates'], c: 0, why: 'The planner hands the route to Google Maps.' }],
    },
    {
      id: 'partners', level: 'more', mins: 4, title: 'Partner finder',
      summary: 'Finding top landscapers, builders, and others nearby and running a contractor-rate campaign.',
      steps: [
        { route: 'partners', el: '#pf-find', title: 'Find the top 25', say: 'Pick a category, like landscapers or fence companies, and find the top 25 near us, ranked by rating and number of reviews.' },
        { title: 'Build the campaign', say: 'Add the ones you want to the campaign, then call, text, or email each one with our contractor-rate offer. Track who\'s been contacted, who\'s interested, and follow-up dates.' },
        { title: 'New partners', say: 'When a business becomes a partner, add them as a commercial client so we can send estimates and invoices.' },
      ],
      practice: ['Open Partner finder and look at the Campaign and Offer tabs.'],
      quiz: [{ q: 'A landscaper agrees to send us work. What do you do in the CRM?', a: ['Mark them Partner and add them as a commercial client', 'Delete them', 'Nothing'], c: 0, why: 'Then they can get estimates and invoices.' }],
    },
    {
      id: 'templates', level: 'more', mins: 3, title: 'Message templates',
      summary: 'Ready-made emails and texts that fill in the client\'s name, job, and amounts.',
      steps: [
        { route: 'templates', el: '#tp-new', title: 'Templates', say: 'Templates are ready-made emails, texts, and contract wording: follow-ups, thank-yous, review requests, and more.' },
        { el: '#tp-cust', title: 'Fill in a client', say: 'Pick a client and the message fills in their name, job, amounts, and dates automatically.' },
        { el: '#tp-copy', title: 'Send it', say: 'Copy it, or open it straight in email or text. Send the review request after every happy job. Google reviews bring in new customers.' },
      ],
      practice: ['Open the "Thank you & review request" template, pick your test client, and preview it.'],
      quiz: [{ q: 'When should you send the review request?', a: ['After every happy, finished job', 'Before the estimate', 'Never'], c: 0, why: 'Reviews bring in new customers.' }],
    },
    {
      id: 'pricing', level: 'owner', mins: 6, title: 'Overhead & pricing',
      summary: 'Where our hourly rate comes from, the price book, and the Price a job calculator.',
      steps: [
        { route: 'overhead', before: oh('rates'), el: '#oh-rate', title: 'Our rate', say: 'Our break-even rate comes from monthly overhead plus crew wages, divided by billable hours. The recommended rate adds our profit target. Keep the overhead numbers real, or every price is off.' },
        { route: 'overhead', before: oh('pricebook'), el: '#pb-add', title: 'The price book', say: 'The price book holds our standard prices. Update it when costs change or when Job cost shows a job type keeps running over.' },
        { route: 'overhead', before: oh('job'), el: '#pj-hours', title: 'Price a job', say: 'Price a job is for hourly work: hours, equipment, and add-ons give a recommended price, then you turn it into an estimate. Don\'t add price book items to that estimate.' },
      ],
      practice: ['Look at the break-even and recommended rate.', 'Find one price book item and check its price.'],
      quiz: [{ q: 'The overhead numbers are made up. What\'s the problem?', a: ['None', 'Every recommended price and margin will be wrong', 'Estimates won\'t print'], c: 1, why: 'Rates are calculated from overhead.' }],
    },
    {
      id: 'books', level: 'owner', mins: 4, title: 'Bookkeeping',
      summary: 'Importing bank files, categories, and reports for the accountant.',
      steps: [
        { route: 'books', title: 'Bookkeeping has its own PIN', say: 'Bookkeeping is locked with its own PIN, so it stays private even on a shared device.' },
        { title: 'Import bank files', say: 'Download a CSV, QFX, or OFX file from the bank or card website and import it. Transactions are sorted into categories automatically, duplicates are skipped, and your corrections are remembered.' },
        { title: 'Reports', say: 'Pick any period and download a profit and loss, as a PDF or spreadsheet, plus all transactions for the accountant.' },
      ],
      practice: ['Ask for the Bookkeeping PIN, then find the import button and the profit & loss download.'],
      quiz: [{ q: 'Where do bank transactions come from?', a: ['Files downloaded from the bank and imported', 'They appear by magic', 'Square only'], c: 0, why: 'Bank files are imported; duplicates are skipped.' }],
    },
    {
      id: 'safety', level: 'owner', mins: 3, title: 'Backups & safety',
      summary: 'PIN lock, backups, and undo.',
      steps: [
        { route: 'settings', el: '#pin-set', title: 'PIN lock', say: 'Turn on a PIN so the CRM locks itself after a few minutes of no use. Good for phones.' },
        { el: '#dt-export', title: 'Backups', say: 'GitHub keeps every version of our data. You can also download a backup file anytime.' },
        { title: 'Undo', say: 'Big actions like removing sample data or restoring a backup save a restore point first. Settings shows an Undo button to put everything back. That\'s the whole tour. Practice a few real jobs, and come back to any lesson anytime.' },
      ],
      practice: ['Turn on a PIN on your phone.', 'Download a backup file once and see where it saves.'],
      quiz: [{ q: 'You accidentally removed something big. Where do you look first?', a: ['Settings → Undo', 'Delete the app', 'Google'], c: 0, why: 'Risky actions save a restore point first.' }],
    },
  ];
})();
