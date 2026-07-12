// Thematics — connected-user state.
// The trade surfaces read off this object. In a real product this is
// brokerage + custody + on-chain — here it's an in-memory mock that
// also mutates on fill so the prototype feels live.

const ME = {
  name: 'A. Reyes',
  initials: 'AR',
  cashUSD: 128400,
  marginAvailable: 63200,
  portfolioValueUSD: 412900,
  // current positions, keyed by symbol
  positions: {
    NVDA: { qty:  24, cost:  812.40, kind: 'spot' },
    AVGO: { qty:   8, cost: 1402.10, kind: 'spot' },
    META: { qty:  12, cost:  540.00, kind: 'spot' },
    TLT:  { qty: 100, cost:   96.40, kind: 'spot' },
    IBIT: { qty:  40, cost:   54.20, kind: 'spot' },
  },
  // current vs target exposure by theme (decimals: 0.18 = 18%)
  themeExposure: {
    'ai-infra': { current: 0.18, target: 0.25 },
    'fed':      { current: 0.12, target: 0.10 },
    'energy':   { current: 0.04, target: 0.08 },
    'crypto':   { current: 0.06, target: 0.05 },
    'consumer': { current: 0.00, target: 0.03 },
  },
  risk: { maxSingleName: 0.10, maxLeverage: 5 },
  // recent fills (used for "you bought 10 of this 3d ago at $1,102")
  recentTrades: [
    { sym: 'NVDA', side: 'buy',  qty: 10, px: 1102.40, when: '3d ago' },
    { sym: 'IBIT', side: 'buy',  qty: 20, px:   58.10, when: '1w ago' },
    { sym: 'META', side: 'sell', qty:  3, px:  605.00, when: '2w ago' },
  ],
  // working / open orders
  openOrders: [],
};

// Theme membership map — which tickers belong to which theme, with weights.
// For now, "ai-infra" gets a real basket; others stub out.
const THEME_BASKETS = {
  'ai-infra': [
    { sym: 'NVDA', weight: 0.30 },
    { sym: 'AVGO', weight: 0.25 },
    { sym: 'TSM',  weight: 0.20 },
    { sym: 'AMD',  weight: 0.15 },
    { sym: 'MU',   weight: 0.10 },
  ],
  'energy': [
    { sym: 'NEE',  weight: 0.40 },
    { sym: 'FSLR', weight: 0.30 },
    { sym: 'XLE',  weight: 0.30 },
  ],
  'crypto': [
    { sym: 'IBIT', weight: 1.00 },
  ],
  'fed': [
    { sym: 'TLT',  weight: 1.00 },
  ],
  'consumer': [
    { sym: 'XRT',  weight: 1.00 },
  ],
};

// Themes a ticker belongs to (reverse lookup)
function themesFor(sym) {
  return Object.entries(THEME_BASKETS)
    .filter(([_, basket]) => basket.find(b => b.sym === sym))
    .map(([id]) => id);
}

// Helpers
function position(sym) { return ME.positions[sym] || null; }
function costBasis(sym) { const p = ME.positions[sym]; return p ? p.qty * p.cost : 0; }
function currentValue(sym) {
  const p = ME.positions[sym];
  const t = window.TICKERS?.[sym];
  if (!p || !t) return 0;
  return p.qty * t.price;
}
function unrealizedPL(sym) { return currentValue(sym) - costBasis(sym); }
function buyingPower() { return ME.cashUSD + ME.marginAvailable; }
function pct(x) { return `${(x * 100).toFixed(1)}%`; }
function pctSigned(x) { return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`; }
function money(x) {
  if (Math.abs(x) >= 1000) return '$' + Math.round(x).toLocaleString();
  return '$' + x.toFixed(2);
}
function moneySigned(x) { return (x >= 0 ? '+' : '−') + money(Math.abs(x)); }

// "Fill" the composition: mutate ME, append a recent trade.
// Returns a short receipt object the UI can show.
function fillComposition(comp) {
  // comp: { kind, sym?, themeId?, basket?, side, qty, instrument, orderType, leverage?, priceCap? }
  const t = comp.sym ? window.TICKERS[comp.sym] : null;
  const px = t ? t.price : 0;

  if (comp.kind === 'single' && comp.sym) {
    const sign = comp.side === 'buy' ? +1 : -1;
    const notional = comp.qty * px * (comp.leverage || 1);
    // snapshot for reversal
    const prev = ME.positions[comp.sym] ? { ...ME.positions[comp.sym] } : null;
    const prevCash = ME.cashUSD;
    const prevMargin = ME.marginAvailable;
    // cash impact for spot
    if (comp.instrument === 'spot') {
      ME.cashUSD -= sign * comp.qty * px;
    } else if (comp.instrument === 'perp') {
      const margin = (comp.qty * px) / (comp.leverage || 1);
      ME.marginAvailable -= sign * margin;
    }
    const cur = ME.positions[comp.sym] || { qty: 0, cost: 0, kind: comp.instrument };
    const newQty = cur.qty + sign * comp.qty;
    const newCost = newQty === 0 ? 0 :
      (cur.qty * cur.cost + sign * comp.qty * px) / newQty;
    ME.positions[comp.sym] = { qty: newQty, cost: newCost, kind: comp.instrument };
    ME.recentTrades.unshift({ sym: comp.sym, side: comp.side, qty: comp.qty, px, when: 'just now' });
    return {
      kind: 'single', sym: comp.sym, qty: comp.qty, side: comp.side, px, notional,
      _reverse: () => {
        // restore the snapshot
        if (prev) ME.positions[comp.sym] = prev;
        else delete ME.positions[comp.sym];
        ME.cashUSD = prevCash;
        ME.marginAvailable = prevMargin;
        ME.recentTrades.shift();
      },
    };
  }

  if (comp.kind === 'basket') {
    const totalNotional = comp.notional || 0;
    // snapshot
    const prevPositions = {};
    comp.basket.forEach(({ sym }) => {
      prevPositions[sym] = ME.positions[sym] ? { ...ME.positions[sym] } : null;
    });
    const prevCash = ME.cashUSD;
    comp.basket.forEach(({ sym, weight }) => {
      const tt = window.TICKERS[sym];
      if (!tt) return;
      const slice = totalNotional * weight;
      const qty = slice / tt.price;
      const cur = ME.positions[sym] || { qty: 0, cost: 0, kind: 'spot' };
      const newQty = cur.qty + qty;
      const newCost = newQty === 0 ? 0 : (cur.qty * cur.cost + qty * tt.price) / newQty;
      ME.positions[sym] = { qty: newQty, cost: newCost, kind: 'spot' };
      ME.cashUSD -= slice;
      ME.recentTrades.unshift({ sym, side: 'buy', qty, px: tt.price, when: 'just now' });
    });
    return {
      kind: 'basket', notional: totalNotional, count: comp.basket.length,
      _reverse: () => {
        Object.entries(prevPositions).forEach(([sym, snap]) => {
          if (snap) ME.positions[sym] = snap;
          else delete ME.positions[sym];
        });
        ME.cashUSD = prevCash;
        // pop the last N trades (one per basket entry)
        ME.recentTrades.splice(0, comp.basket.length);
      },
    };
  }

  return null;
}

// What does the user already have exposure to in this theme?
function themeExposureAfter(themeId, sym, addedNotional) {
  const cur = ME.themeExposure[themeId]?.current || 0;
  const target = ME.themeExposure[themeId]?.target || 0;
  const portfolio = ME.portfolioValueUSD;
  const newCurrent = cur + (addedNotional / portfolio);
  return { current: cur, target, after: newCurrent };
}

Object.assign(window, {
  ME, THEME_BASKETS, themesFor,
  position, costBasis, currentValue, unrealizedPL, buyingPower,
  pct, pctSigned, money, moneySigned,
  fillComposition, themeExposureAfter,
});
