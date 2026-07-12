// Mock data for the Thematics prototype.
// Themes → Findings (articles) → inline viz, sources, tickers, conversation starters.
// Tickers carry sparkline data so inline mentions can hover to a mini preview.

const THEMES = [
  { id: 'ai-infra',   name: 'AI infrastructure',     hue: 'ocean',
    blurb: 'Compute, memory, networking, and the cycle financing it.' },
  { id: 'fed',        name: 'Federal balance sheet', hue: 'amber',
    blurb: 'Rate path, Treasury issuance, and what comes after QT.' },
  { id: 'energy',     name: 'Energy transition',     hue: 'emerald',
    blurb: 'Generation, the grid, and the manufacturing margins inside it.' },
  { id: 'crypto',     name: 'Crypto market structure', hue: 'violet',
    blurb: 'ETF flows, custody, and the mechanics behind the headline price.' },
  { id: 'consumer',   name: 'Consumer signal',       hue: 'crimson',
    blurb: 'Credit, savings, real wages, and what the cards are telling us.' },
];

// Tickers — symbol → { name, price, change %, sparkline (15 points), exchange }.
// Sparklines are normalised 0–100 just for the preview viz.
const TICKERS = {
  NVDA: { name: 'NVIDIA',              price: 1124.18, deltaPct:  +1.42, spark: [62,64,68,72,70,74,78,84,88,86,90,93,91,95,98], ex:'NASDAQ',
    sector: 'Semiconductors', mcap: '$2.76T', pe: '52', range52: '418.05 – 1190.20',
    note: 'Designs the GPUs that have anchored the AI infrastructure cycle. Data-center revenue now over 80% of the mix; the cycle\u2019s shape, not the absolute level, is the live question on the desk.' },
  AMD:  { name: 'AMD',                 price:  168.42, deltaPct:  -0.78, spark: [72,74,76,70,68,66,70,72,68,66,64,66,68,66,64], ex:'NASDAQ',
    sector: 'Semiconductors', mcap: '$272B', pe: '37', range52: '124.10 – 211.38',
    note: 'A real but second-order beneficiary of the AI capex cycle, with MI300X-class accelerators taking measured share. Desk consensus has them under-earning consensus EPS into the second half.' },
  AVGO: { name: 'Broadcom',            price: 1620.50, deltaPct:  +2.04, spark: [44,46,50,54,58,60,64,68,72,76,80,84,86,90,94], ex:'NASDAQ',
    sector: 'Semiconductors', mcap: '$762B', pe: '34', range52: '910.42 – 1648.10',
    note: 'The structural ASIC story. Every hyperscaler with the engineering depth to design their own silicon is doing so; Broadcom is the design partner.' },
  TSM:  { name: 'TSMC',                price:  178.90, deltaPct:  +0.92, spark: [60,62,65,68,70,73,75,78,80,82,84,85,87,89,92], ex:'NYSE',
    sector: 'Foundries', mcap: '$930B', pe: '28', range52: '120.16 – 192.30',
    note: 'Sold-out on N3, ramping N2. Monthly revenue is the cleanest leading indicator for the broader AI compute cycle.' },
  MU:   { name: 'Micron',              price:   98.34, deltaPct:  -1.10, spark: [78,76,74,72,68,66,64,62,60,58,56,54,52,50,48], ex:'NASDAQ',
    sector: 'Memory', mcap: '$110B', pe: '14', range52: '85.20 – 157.54',
    note: 'HBM is the bull case; the bear case is that contract pricing inverts in Q1 as new capacity comes online.' },
  MSFT: { name: 'Microsoft',           price:  468.20, deltaPct:  +0.62, spark: [70,72,74,73,75,76,78,80,82,84,86,87,88,90,92], ex:'NASDAQ',
    sector: 'Hyperscaler', mcap: '$3.48T', pe: '36', range52: '380.40 – 489.20',
    note: 'Anchored by Azure and the OpenAI deployment. Capex commentary is the line that moves the print most.' },
  META: { name: 'Meta',                price:  612.40, deltaPct:  +1.18, spark: [54,58,60,62,66,70,72,74,78,82,85,86,88,90,92], ex:'NASDAQ',
    sector: 'Internet', mcap: '$1.56T', pe: '28', range52: '410.10 – 638.40',
    note: 'Highest single-name exposure to a hyperscaler capex pause. The advertising lift from AI inference has to show by mid-2026 or the call gets revisited.' },
  GOOG: { name: 'Alphabet',            price:  198.42, deltaPct:  +0.38, spark: [62,64,66,68,68,70,72,72,74,76,76,78,78,80,82], ex:'NASDAQ',
    sector: 'Internet', mcap: '$2.42T', pe: '24', range52: '155.30 – 207.05',
    note: 'TPUs are the quiet upside; Search is the obvious risk if zero-click summaries take a share of intent.' },
  AMZN: { name: 'Amazon',              price:  234.60, deltaPct:  +0.92, spark: [56,58,60,60,62,64,66,68,70,72,74,76,78,80,82], ex:'NASDAQ',
    sector: 'Hyperscaler', mcap: '$2.45T', pe: '38', range52: '170.42 – 244.20',
    note: 'AWS margins are the line item that drives the print; retail is now a flat-utility.' },
  TLT:  { name: '20+ Year Treasury',   price:   92.10, deltaPct:  -0.42, spark: [88,86,84,82,80,78,76,76,74,74,72,72,70,70,68], ex:'NASDAQ',
    sector: 'Treasury ETF', mcap: '$56B AUM', pe: '—', range52: '85.50 – 102.42',
    note: 'The cleanest expression of long-duration. Outperforms if the Fed buys belly on the way out of QT.' },
  XLE:  { name: 'Energy Select Sector',price:   98.40, deltaPct:  -1.28, spark: [82,80,78,76,74,76,78,80,78,76,74,72,72,74,76], ex:'NYSE',
    sector: 'Energy ETF', mcap: '$36B AUM', pe: '11', range52: '78.40 – 104.62',
    note: 'Tracks the integrated majors. The contrarian read is that supply discipline will hold even if global demand softens.' },
  FSLR: { name: 'First Solar',         price:  214.80, deltaPct:  -2.18, spark: [88,84,82,78,74,72,70,68,66,64,62,60,58,56,54], ex:'NASDAQ',
    sector: 'Solar', mcap: '$22B', pe: '15', range52: '178.50 – 311.45',
    note: 'Thin-film manufacturer protected by the U.S. tariff carve-out. The protection structure is two regulatory votes from sunset.' },
  NEE:  { name: 'NextEra Energy',      price:   78.40, deltaPct:  +0.42, spark: [60,62,62,64,66,66,68,70,72,72,74,76,76,78,80], ex:'NYSE',
    sector: 'Utility', mcap: '$162B', pe: '22', range52: '62.10 – 86.10',
    note: 'Owns both transmission and generation. The unappreciated grid-bottleneck winner.' },
  IBIT: { name: 'iShares Bitcoin ETF', price:   62.18, deltaPct:  +2.64, spark: [50,54,58,62,66,70,72,74,76,80,82,84,86,90,92], ex:'NASDAQ',
    sector: 'Crypto ETF', mcap: '$48B AUM', pe: '—', range52: '34.20 – 64.40',
    note: 'The largest spot Bitcoin vehicle. Daily flows are the cleanest read on marginal demand.' },
  XRT:  { name: 'SPDR S&P Retail',     price:   78.40, deltaPct:  -0.62, spark: [72,70,72,72,70,68,66,64,66,68,66,64,62,60,58], ex:'NYSE',
    sector: 'Retail ETF', mcap: '$420M AUM', pe: '16', range52: '70.20 – 88.40',
    note: 'Equal-weight; the basket has heavy bottom-decile exposure that the headline reads understate.' },
};

const FINDINGS = [
  {
    id: 'nvda-decel',
    themeId: 'ai-infra',
    cover: { kind: 'sparkline', hue: 'ocean', label: 'NVDA · 5Y revenue' },
    title: 'Nvidia data-center growth is decelerating faster than the buy-side expects',
    lede: 'Year-on-year growth has bent twice in two quarters. The street is still modelling a third re-acceleration into FY27. The shape of the curve disagrees.',
    publishedAt: 'Two hours ago',
    contributor: 'A. Reyes, with model & desk notes',
    mentions: ['NVDA', 'AMD', 'AVGO', 'TSM'],
    confidence: 'high',
    relatedSignals: [
      { id:'rs1', label: 'Hyperscaler capex still climbing', confidence: 'high'   },
      { id:'rs2', label: 'Memory pricing topping',           confidence: 'medium' },
      { id:'rs3', label: 'Sovereign AI demand de-rating',    confidence: 'low'    },
    ],
    starters: [
      'Why is the buy-side still modelling re-acceleration?',
      'What does the comparable 2018 GPU cycle look like at this point?',
      'Which suppliers de-rate first if NVDA misses?',
    ],
    sources: [
      { id:'s1', publisher: 'Nvidia',   publisherMark:'N', title: 'Q3 FY26 earnings release', quote: 'Data Center revenue of $30.8B grew 17% sequentially and 94% year-over-year.' },
      { id:'s2', publisher: 'TSMC',     publisherMark:'T', title: 'Monthly revenue, November',  quote: 'Net revenue for November 2025 was approximately NT$276.06 billion.' },
      { id:'s3', publisher: 'IDC',      publisherMark:'I', title: 'Worldwide AI server tracker', quote: 'AI server shipment growth is forecast to slow to 24% in 2026 from 71% in 2025.' },
    ],
    body: [
      { kind: 'p', text: "Two quarters ago, data-center revenue at #NVDA was growing 134% year-on-year. Last quarter it printed 94%. The street's consensus model still has it returning to 110%+ by the second half of FY27. That re-acceleration is the load-bearing assumption inside almost every long thesis on the name — and it does not survive contact with the data the company itself published last week." },
      { kind: 'viz', viz: { type: 'sparkline-band', title: 'Nvidia data-center revenue, year-on-year growth', series: [134, 154, 162, 141, 122, 109, 94], labels: ['Q1','Q2','Q3','Q4','Q1','Q2','Q3'], unit:'%', source:'Nvidia quarterly filings' } },
      { kind: 'p', text: "What is plausible is that growth lands around 60% next quarter and decelerates from there — still a remarkable business, but not the curve baked into a $3T market cap. The question isn't whether AI infrastructure is real (it is). It's whether one company can keep capturing this share of the spend. Margins inside the supply chain say no." },
      { kind: 'p', text: "Two adjacent reads worth tracking. First, #TSM monthly revenue is decoupling from the headline AI server cycle — the foundry is now sold-out on N3 capacity, but the marginal customer (sovereign clouds, enterprise) is paying lower take-rates. Second, #AVGO continues to take ASIC share for every hyperscaler that has the engineering depth to build their own. The numbers are small today; the curve is wrong direction for Nvidia ASPs. The cleanest second read is from @alphaprime, whose model annotations on the published prints catch the second derivative the consensus model still smooths over." },
      { kind: 'metric', viz: { type: 'metric-row', items: [
        { label: 'Last DC growth (yoy)',  value: '94%',  caption: 'Q3 FY26' },
        { label: 'Consensus FY27 H2',     value: '112%', caption: 'street median' },
        { label: 'Our base case',         value: '58%',  caption: 'mid-FY27' },
      ]}},
      { kind: 'p', text: "The trade isn't a fade of Nvidia at this level — too crowded, too dependent on quarter timing. The trade is a relative-value short of NVDA against a long basket of ASIC and memory winners that benefit from a flatter, longer-duration capex cycle. Compositional risk; modest sizing." },
    ],
  },

  {
    id: 'hyperscaler-capex',
    themeId: 'ai-infra',
    cover: { kind: 'bars', hue: 'ocean', label: 'Hyperscaler capex' },
    title: "Why the hyperscaler capex cycle hasn't peaked",
    lede: "The five largest cloud spenders just guided $312B in 2026 capex — 38% above 2025 levels. The market has decided this is the peak. It is almost certainly not.",
    publishedAt: 'Yesterday',
    contributor: 'L. Park',
    mentions: ['MSFT', 'META', 'GOOG', 'AMZN'],
    confidence: 'medium',
    relatedSignals: [
      { id:'rs1', label: 'Enterprise AI deployments lagging', confidence: 'medium' },
      { id:'rs2', label: 'Power constraint becomes binding 2027', confidence: 'high' },
    ],
    starters: [
      'Which hyperscaler is most exposed to a capex pause?',
      'What\u2019s the cleanest way to short the deceleration if it does come?',
    ],
    sources: [
      { id:'s1', publisher:'Microsoft', publisherMark:'M', title:'Q2 FY26 prepared remarks', quote: 'We expect FY26 capital expenditures to be approximately $80 billion, weighted to AI infrastructure.' },
      { id:'s2', publisher:'Meta',      publisherMark:'M', title:'Q4 2025 earnings call',     quote: 'We anticipate full-year 2026 capital expenditures will be in the range of $94B to $99B.' },
    ],
    body: [
      { kind: 'p', text: 'The argument that the cycle has peaked rests on a single observation: 2026 capex growth is the largest absolute step in the history of the industry. The argument fails because absolute spend is not what compounds — utilisation does. The five largest spenders ran their existing infrastructure at 71% average GPU utilisation in 2025. They have signed contracts that take that to 88% by Q2 2026. The next leg is generation, not allocation.' },
      { kind: 'viz', viz: { type: 'bars-row', title: 'Top-five hyperscaler capex, $B', series: [102, 154, 226, 312], labels:['2023','2024','2025','2026E'], hue:'ocean', source:'Company filings; FactSet consensus' } },
      { kind: 'p', text: "We are short power. The grid bottleneck is real, and you can see it most cleanly in #NEE's 2027 PPA pipeline." },
    ],
  },

  {
    id: 'memory-pricing',
    themeId: 'ai-infra',
    cover: { kind: 'distribution', hue: 'crimson', label: 'HBM contract pricing' },
    title: 'Memory pricing is the contrarian short for 2026',
    lede: 'High-bandwidth memory contracts re-price annually in Q1. The pricing power that built #MU\u2019s entire 2025 narrative is about to invert.',
    publishedAt: 'Three days ago',
    contributor: 'D. Singh',
    mentions: ['MU'],
    confidence: 'medium',
    relatedSignals: [
      { id:'rs1', label: 'HBM capacity online 2026', confidence:'high'   },
      { id:'rs2', label: 'GDDR overhang lingering',  confidence:'medium' },
    ],
    starters: [
      'How does the 2024–25 HBM tightness compare to past memory cycles?',
      'What\u2019s the right pair trade — long compute, short memory?',
    ],
    sources: [
      { id:'s1', publisher:'Micron',      publisherMark:'M', title:'Q1 FY26 release', quote: 'HBM3E is now sold out for calendar 2026 with most 2027 supply already committed.' },
      { id:'s2', publisher:'TrendForce',  publisherMark:'T', title:'DRAM contract tracker', quote: 'Average HBM contract prices are expected to decline ~12% in 1Q26 as new capacity comes online.' },
    ],
    body: [
      { kind: 'p', text: 'The market reads "sold out" as bullish. It is not — it is a backward-looking statement.' },
    ],
  },

  {
    id: 'fed-qt-end',
    themeId: 'fed',
    cover: { kind: 'gauge', hue: 'amber', label: 'Fed balance sheet' },
    title: 'Balance-sheet runoff is ending. What replaces it matters more than the rate path.',
    lede: 'QT effectively ends in Q2 2026. The composition of what the Fed buys to maintain reserves is the trade — not the date.',
    publishedAt: 'Two days ago',
    contributor: 'E. Mendes',
    mentions: ['TLT'],
    confidence: 'high',
    relatedSignals: [
      { id:'rs1', label: 'Reserves at lower bound', confidence:'high'   },
      { id:'rs2', label: 'Bills vs coupons mix',    confidence:'medium' },
    ],
    starters: [
      'How does the bills-vs-coupons mix change positioning?',
      'What does the curve do if the Fed buys belly?',
    ],
    sources: [
      { id:'s1', publisher:'Federal Reserve', publisherMark:'F', title:'November FOMC minutes', quote: 'Participants generally agreed that it would be appropriate to slow the pace of decline in the Fed\u2019s securities holdings and to end balance-sheet runoff in the months ahead.' },
    ],
    body: [
      { kind: 'p', text: 'The rate path debate is settled — the Fed is on hold through the first half. The interesting question is the second-order one: with reserves now within $200B of the bottom of the working range, the Committee will need to start buying again to maintain operating conditions. @themacrodesk has been on this for weeks, and the read holds up.' },
    ],
  },

  {
    id: 'solar-margins',
    themeId: 'energy',
    cover: { kind: 'sparkline', hue: 'emerald', label: 'Module ASPs' },
    title: 'Solar manufacturing margins are about to compress',
    lede: 'Chinese over-capacity has been the meme for two years. The U.S. carve-out that protected #FSLR margins ends in Q3 2026.',
    publishedAt: 'Last week',
    contributor: 'N. Okoye',
    mentions: ['FSLR'],
    confidence: 'medium',
    relatedSignals: [
      { id:'rs1', label: 'ITC capacity utilisation', confidence:'medium' },
    ],
    starters: [ 'Which manufacturer survives a 30% ASP cut?' ],
    sources: [ { id:'s1', publisher:'EIA', publisherMark:'E', title:'Module price tracker, November', quote: 'Average U.S. utility-scale module ASP fell 8.4% quarter-on-quarter to $0.27 per watt.' } ],
    body: [ { kind:'p', text: 'A short note: the protective tariff structure that has kept First Solar\u2019s ASPs decoupled from the global market is two regulatory votes from sunset.' } ],
  },

  {
    id: 'grid-bottleneck',
    themeId: 'energy',
    cover: { kind: 'bars', hue: 'emerald', label: 'Interconnection queue' },
    title: 'The grid is the bottleneck, not generation',
    lede: 'There is 2,600 GW in U.S. interconnection queues. Generation isn\u2019t the constraint — the interconnect is.',
    publishedAt: 'Last week',
    contributor: 'N. Okoye',
    mentions: ['NEE'],
    confidence: 'high',
    relatedSignals: [
      { id:'rs1', label: 'FERC Order 2023 implementation', confidence:'high' },
    ],
    starters: [ 'Who owns the right-of-way?' ],
    sources: [],
    body: [ { kind:'p', text: 'The queue.' } ],
  },

  {
    id: 'btc-etf-flows',
    themeId: 'crypto',
    cover: { kind: 'distribution', hue: 'violet', label: 'ETF flows' },
    title: 'ETF flows tell a different story than spot price',
    lede: 'Spot Bitcoin is up 18% in three months. Net flows into the largest ETF complex are negative across the same window. Reconcile.',
    publishedAt: 'This morning',
    contributor: 'J. Wei',
    mentions: ['IBIT'],
    confidence: 'medium',
    relatedSignals: [
      { id:'rs1', label: 'Basis trade unwind risk', confidence:'medium' },
    ],
    starters: [
      'Who is buying spot if not the ETFs?',
      'What does a basis unwind look like mechanically?',
    ],
    sources: [
      { id:'s1', publisher:'BlackRock', publisherMark:'B', title:'IBIT daily flows', quote: 'Net outflows of $164M on Tuesday marked the eleventh consecutive trading day of redemptions.' },
    ],
    body: [
      { kind:'p', text: 'The basis trade — long spot ETF, short CME futures — has been the dominant marginal flow into the BTC complex since the ETFs launched. With the basis now compressed inside 6% annualised, the trade is unwinding. @onchainowl’s daily flow rollups are the cleanest read on the speed of the unwind.' },
    ],
  },

  {
    id: 'consumer-credit',
    themeId: 'consumer',
    cover: { kind: 'sparkline', hue: 'crimson', label: 'Credit card delinquencies' },
    title: 'Credit-card delinquencies are diverging by income decile',
    lede: 'The headline is fine. The bottom four deciles are at 2009 levels and worsening.',
    publishedAt: 'Last week',
    contributor: 'R. Chen',
    mentions: ['XRT'],
    confidence: 'high',
    relatedSignals: [
      { id:'rs1', label: 'Auto loan delinquencies leading', confidence:'high' },
    ],
    starters: [
      'Which retailers are most exposed to bottom-decile spend?',
    ],
    sources: [
      { id:'s1', publisher:'New York Fed', publisherMark:'F', title:'Quarterly report on household debt', quote: 'Credit card balances 90+ days delinquent rose to 7.34% in the third quarter of 2025.' },
    ],
    body: [
      { kind:'p', text: 'The aggregate prints look stable because the top three deciles have de-levered.' },
    ],
  },
];

// Saved chats (returnable from the tray rail).
const SAVED_CHATS = [
  { id: 'c1', title: 'The 2018 GPU cycle, in numbers',         when: 'Yesterday',  sourceFinding: 'nvda-decel' },
  { id: 'c2', title: 'What replaces QT — bills or coupons?',    when: 'Three days', sourceFinding: 'fed-qt-end' },
  { id: 'c3', title: 'Pair trade against First Solar',          when: 'Last week',  sourceFinding: 'solar-margins' },
];

// Pinned findings (also surfaced in the tray rail).
const PINNED = ['nvda-decel', 'fed-qt-end'];

// People — popular accounts the desk reads. Keyed by handle (no @).
// Each one is a real-feeling persona with a sparkline of engagement and a
// few recent posts. Used by PersonInline + SurfacePerson.
const PEOPLE = {
  alphaprime: {
    handle: '@alphaprime',
    name: 'Alpha Prime',
    role: 'Quant researcher · semiconductors',
    followers: '128K',
    postsWeek: 14,
    focus: ['ai-infra'],
    initials: 'AP',
    spark: [40, 44, 46, 50, 54, 56, 62, 66, 72, 74, 78, 82, 86, 90, 94],
    note: 'One of two accounts the desk reads first on any #NVDA print. The model annotations on quarterly charts catch things the sell-side reports miss — sees the curve, not the headline.',
    posts: [
      { when: '2h',  text: "Charted NVDA DC growth on the published prints. We are now two consecutive quarters with the second derivative negative. The buy-side model that gets us back to 110% requires sovereign deals slipping zero of eight.", eng: '4.2K' },
      { when: '7h',  text: "Quietly: hyperscaler capex commentary on the last three calls has shifted from 'AI infrastructure' to 'AI training and serving infrastructure'. That's a margin signal, not a growth one.", eng: '2.8K' },
      { when: '1d',  text: "AVGO ASIC roadmap is the only public schedule that has tightened, not slipped, in the last six months. Pricing it in is the trade.", eng: '5.6K' },
    ],
  },
  themacrodesk: {
    handle: '@themacrodesk',
    name: 'The Macro Desk',
    role: 'Anonymous · rates, Treasury, Fed',
    followers: '212K',
    postsWeek: 9,
    focus: ['fed'],
    initials: 'MD',
    spark: [62, 64, 64, 66, 64, 68, 70, 72, 74, 72, 76, 78, 76, 80, 82],
    note: 'Anonymously written, very plugged into front-office Treasury desks. The Fed coverage is the best on the platform; the rest is opinion.',
    posts: [
      { when: '4h',  text: "Reserves are at the bottom of the working range — 3.2T against a 3.0T floor. The next FOMC won't announce buying because it doesn't need to be announced. Watch the operations desk, not the press release.", eng: '9.1K' },
      { when: '11h', text: 'Bills vs coupons mix is the trade. The minutes quietly removed "short-dated" from the language. Read it.', eng: '3.4K' },
      { when: '2d',  text: 'Long #TLT into year-end if the operations desk leans toward coupons. Risk: a hawk talks rates back into the conversation. Sizing accordingly.', eng: '6.7K' },
    ],
  },
  tapereader: {
    handle: '@tapereader',
    name: 'Tape Reader',
    role: 'Trader · microstructure, flow',
    followers: '94K',
    postsWeek: 28,
    focus: ['ai-infra', 'crypto'],
    initials: 'TR',
    spark: [70, 72, 68, 72, 74, 76, 78, 76, 80, 84, 86, 88, 86, 88, 92],
    note: 'Posts twenty times a day, half of which is noise. The half worth reading is the late-afternoon flow recaps — block prints, options skew shifts, the things that don\u2019t make the headlines.',
    posts: [
      { when: '1h',  text: 'Large NVDA put-spread block on the screens at 14:47. Six-week tenor, strike 950/850. Smart money is hedging the holiday print, not selling the position.', eng: '2.1K' },
      { when: '3h',  text: '#IBIT outflows are decelerating but still negative. The basis is at 4.8% — below cost of capital. Trade is closing itself.', eng: '1.4K' },
      { when: '6h',  text: '#AVGO call buying on every dip. Six consecutive days. Unusual.', eng: '3.0K' },
    ],
  },
  solarskeptic: {
    handle: '@solarskeptic',
    name: 'Solar Skeptic',
    role: 'Energy analyst · former utility',
    followers: '56K',
    postsWeek: 6,
    focus: ['energy'],
    initials: 'SS',
    spark: [82, 80, 78, 76, 74, 72, 70, 68, 70, 68, 66, 64, 62, 60, 58],
    note: 'Ex-utility analyst who covers the solar manufacturing complex with operating-margin discipline. The bear case on #FSLR has aged well for fifteen months.',
    posts: [
      { when: '5h',  text: "The ITC carve-out vote is on the calendar for Q1. Two procedural votes from sunset. The position assumes you can hold through the noise.", eng: '1.8K' },
      { when: '1d',  text: 'Module ASPs are now $0.27/W. The compression has begun even before the carve-out lapses. #FSLR margin compresses from 47% to ~18% in the base case.', eng: '2.4K' },
    ],
  },
  onchainowl: {
    handle: '@onchainowl',
    name: 'On-Chain Owl',
    role: 'Pseudonymous · crypto flows, ETF data',
    followers: '174K',
    postsWeek: 22,
    focus: ['crypto'],
    initials: 'OO',
    spark: [58, 60, 64, 66, 68, 72, 76, 78, 82, 84, 86, 90, 88, 92, 94],
    note: 'Daily ETF flow rollups, basis charts, and the cleanest custody-balance data on the platform. The Bitcoin coverage is exceptional.',
    posts: [
      { when: '2h',  text: '#IBIT redemptions: $164M yesterday. Eleventh straight day of net outflows from the largest spot vehicle.', eng: '7.4K' },
      { when: '5h',  text: 'Basis is at 5.8% annualised. Below cost of capital for nearly every desk running the trade. Unwind is mechanical, not narrative.', eng: '4.1K' },
      { when: '1d',  text: 'If spot is going up while ETFs are bleeding — somebody is buying. The wallets suggest sovereign-adjacent OTC. Worth confirming.', eng: '3.3K' },
    ],
  },
  retailcassandra: {
    handle: '@retailcassandra',
    name: 'Retail Cassandra',
    role: 'Consumer credit · former bank',
    followers: '38K',
    postsWeek: 4,
    focus: ['consumer'],
    initials: 'RC',
    spark: [50, 52, 56, 58, 60, 60, 62, 64, 64, 66, 68, 68, 70, 72, 74],
    note: 'Posts rarely; when she does, the data is granular and the conclusion is sober. The bottom-decile credit-card delinquency call is hers.',
    posts: [
      { when: '6h',  text: 'Bottom four deciles now at 2009 levels on 90+ day delinquencies. The aggregate looks fine because top three have de-levered. Different stories under one chart.', eng: '1.9K' },
      { when: '2d',  text: '#XRT is the cleanest index expression. Selective shorts in the basket pick up real alpha — the index is too diversified.', eng: '1.1K' },
    ],
  },
};

Object.assign(window, { THEMES, TICKERS, FINDINGS, SAVED_CHATS, PINNED, PEOPLE });
