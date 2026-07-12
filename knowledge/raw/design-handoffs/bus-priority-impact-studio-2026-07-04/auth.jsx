// Sign in / Sign up — magic link only.
// One surface for both: the link creates the account on first use.
// States: enter → sending → sent (with resend cooldown + change email).

function AuthScreen() {
  const [stage, setStage] = React.useState('enter'); // enter | sending | sent
  const [email, setEmail] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const showError = touched && email.length > 0 && !valid;

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function submit(e) {
    if (e) e.preventDefault();
    setTouched(true);
    if (!valid) return;
    setStage('sending');
    setTimeout(() => { setStage('sent'); setCooldown(30); }, 950);
  }

  function resend() {
    if (cooldown > 0) return;
    setStage('sending');
    setTimeout(() => { setStage('sent'); setCooldown(30); }, 800);
  }

  function reset() {
    setStage('enter');
    setTouched(false);
  }

  return (
    <div className="bpi" style={{
      minHeight: '100vh', background: BPI.canvas || '#f0eee9',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 880,
        display: 'grid', gridTemplateColumns: '320px 1fr',
        background: BPI.card,
        borderRadius: 6,
        boxShadow: `0 0 0 1px ${BPI.rule}, 0 24px 60px -28px rgba(22,20,15,.30)`,
        overflow: 'hidden',
        minHeight: 520,
      }}>
        <BrandPanel />
        <div style={{
          padding: '54px 52px',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          {stage === 'sent'
            ? <SentPanel email={email} cooldown={cooldown} onResend={resend} onChange={reset} />
            : <FormPanel
                email={email} setEmail={setEmail}
                valid={valid} showError={showError}
                sending={stage === 'sending'}
                onSubmit={submit}
                onBlur={() => setTouched(true)}
              />}
        </div>
      </div>
    </div>
  );
}

// ── Left: branded ink panel ──────────────────────────────────
function BrandPanel() {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: BPI.ink, color: BPI.paper,
      padding: '42px 34px',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* faint route motif */}
      <RouteMotif />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
        <StudioMark size={26} tone="light" />
        <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.25 }}>
          Bus Priority<br />
          <span style={{ color: 'rgba(244,241,234,.6)', fontWeight: 400 }}>Impact Studio</span>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ position: 'relative' }}>
        <div style={{
          fontSize: 21, fontWeight: 600, letterSpacing: '-0.02em',
          lineHeight: 1.28, marginBottom: 14, textWrap: 'balance',
        }}>
          Read the corridor.<br />Make the case.
        </div>
        <div style={{
          fontSize: 12.5, lineHeight: 1.6, color: 'rgba(244,241,234,.62)',
          maxWidth: 230,
        }}>
          Speed data, interventions, and source-backed briefs for every bus
          route in the system.
        </div>
      </div>

      <div style={{
        position: 'relative', marginTop: 30,
        display: 'flex', alignItems: 'center', gap: 7,
        fontSize: 10.5, fontFamily: BPIMono, color: 'rgba(244,241,234,.4)',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: BPI.good }} />
        data current to 2026-05-12
      </div>
    </div>
  );
}

// Faint route polyline motif in the brand panel corner
function RouteMotif() {
  const stops = [[0.12, 0.92], [0.34, 0.74], [0.52, 0.78], [0.74, 0.5], [0.9, 0.32]];
  return (
    <svg width="100%" height="100%" viewBox="0 0 320 520" preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
      {[0.22, 0.46, 0.7].map((y, i) => (
        <line key={'h' + i} x1="0" y1={520 * y} x2="320" y2={520 * y}
          stroke="rgba(244,241,234,.07)" strokeWidth="1" />
      ))}
      {[0.3, 0.62].map((x, i) => (
        <line key={'v' + i} x1={320 * x} y1="0" x2={320 * x} y2="520"
          stroke="rgba(244,241,234,.07)" strokeWidth="1" />
      ))}
      <path d={'M' + stops.map(([x, y]) => `${(320 * x).toFixed(0)},${(520 * y).toFixed(0)}`).join(' L')}
        fill="none" stroke="rgba(244,241,234,.22)" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" />
      {stops.map(([x, y], i) => (
        <circle key={i} cx={320 * x} cy={520 * y} r="3.4"
          fill={BPI.ink} stroke="rgba(244,241,234,.5)" strokeWidth="1.6" />
      ))}
    </svg>
  );
}

// ── Right: email entry form ──────────────────────────────────
function FormPanel({ email, setEmail, valid, showError, sending, onSubmit, onBlur }) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <div style={{ fontSize: 23, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
        Sign in
      </div>
      <div style={{ fontSize: 13, color: BPI.ink70, marginTop: 8, lineHeight: 1.5, maxWidth: 360 }}>
        Enter your email and we’ll send a secure link to sign in.
        No password — first time here, we’ll set up your account.
      </div>

      <label style={{
        display: 'block', fontSize: 11, fontWeight: 600,
        color: BPI.ink70, letterSpacing: '0.02em',
        margin: '28px 0 7px',
      }}>
        Work email
      </label>
      <input
        type="email"
        value={email}
        autoFocus
        onChange={(e) => setEmail(e.target.value)}
        onBlur={onBlur}
        placeholder="you@agency.gov"
        style={{
          width: '100%', padding: '13px 14px',
          fontSize: 14.5, fontFamily: 'inherit', color: BPI.ink,
          background: BPI.paper,
          border: `1.5px solid ${showError ? BPI.bad : BPI.ink20}`,
          borderRadius: 4, outline: 'none',
          transition: 'border-color .15s, box-shadow .15s',
        }}
        onFocus={(e) => {
          if (!showError) e.target.style.boxShadow = `0 0 0 3px ${BPI.accentBg}`;
          if (!showError) e.target.style.borderColor = BPI.accent;
        }}
        onBlurCapture={(e) => {
          e.target.style.boxShadow = 'none';
          e.target.style.borderColor = showError ? BPI.bad : BPI.ink20;
        }}
      />
      <div style={{ minHeight: 18, marginTop: 6 }}>
        {showError && (
          <div style={{ fontSize: 11.5, color: BPI.bad, fontWeight: 500 }}>
            Enter a valid email address.
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={sending}
        style={{
          width: '100%', marginTop: 6, padding: '13px 14px',
          fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit',
          background: BPI.ink, color: BPI.paper,
          border: 'none', borderRadius: 4,
          cursor: sending ? 'default' : 'pointer',
          opacity: sending ? 0.7 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          transition: 'opacity .15s',
        }}
      >
        {sending
          ? (<><Spinner /> Sending link…</>)
          : 'Email me a sign-in link'}
      </button>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginTop: 22, fontSize: 11, color: BPI.ink55, lineHeight: 1.5,
      }}>
        <LockGlyph />
        <span>Links expire in 15 minutes and can only be used once.</span>
      </div>

      <div style={{ height: 1, background: BPI.rule, margin: '26px 0 16px' }} />
      <div style={{ fontSize: 11.5, color: BPI.ink55, lineHeight: 1.6 }}>
        By continuing you agree to the Studio’s{' '}
        <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>terms</span> and{' '}
        <span style={{ color: BPI.accent, fontWeight: 600, cursor: 'pointer' }}>privacy notice</span>.
      </div>
    </form>
  );
}

// ── Right: confirmation after link is sent ───────────────────
function SentPanel({ email, cooldown, onResend, onChange }) {
  return (
    <div>
      <div style={{
        width: 46, height: 46, borderRadius: 23,
        background: BPI.accentBg, color: BPI.accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 22,
      }}>
        <MailGlyph />
      </div>
      <div style={{ fontSize: 23, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
        Check your inbox
      </div>
      <div style={{ fontSize: 13, color: BPI.ink70, marginTop: 10, lineHeight: 1.55, maxWidth: 380 }}>
        We sent a sign-in link to{' '}
        <span style={{ fontWeight: 600, color: BPI.ink }}>{email}</span>.
        Open it on this device to continue. It expires in 15 minutes.
      </div>

      <div style={{
        marginTop: 22, padding: '12px 14px',
        background: BPI.paper, border: `1px solid ${BPI.rule}`, borderRadius: 4,
        fontSize: 11.5, color: BPI.ink55, lineHeight: 1.55,
      }}>
        Didn’t get it? Check spam, or make sure the address is spelled correctly.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 24 }}>
        <button
          onClick={onResend}
          disabled={cooldown > 0}
          style={{
            padding: '11px 16px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
            background: cooldown > 0 ? 'transparent' : BPI.ink,
            color: cooldown > 0 ? BPI.ink40 : BPI.paper,
            border: cooldown > 0 ? `1px solid ${BPI.ink20}` : 'none',
            borderRadius: 4, cursor: cooldown > 0 ? 'default' : 'pointer',
          }}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend link'}
        </button>
        <button
          onClick={onChange}
          style={{
            background: 'none', border: 'none', padding: 0,
            fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
            color: BPI.accent, cursor: 'pointer',
          }}
        >
          Use a different email
        </button>
      </div>
    </div>
  );
}

// ── small glyphs ─────────────────────────────────────────────
function Spinner() {
  return (
    <span style={{
      width: 14, height: 14, borderRadius: 7,
      border: '2px solid rgba(244,241,234,.35)',
      borderTopColor: BPI.paper,
      display: 'inline-block',
      animation: 'bpi-auth-spin 0.7s linear infinite',
    }} />
  );
}
function LockGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none"
      stroke={BPI.ink40} strokeWidth="1.3" style={{ flexShrink: 0 }}>
      <rect x="2.5" y="6" width="9" height="6.5" rx="1.3" />
      <path d="M4.3 6V4.3a2.7 2.7 0 0 1 5.4 0V6" />
    </svg>
  );
}
function MailGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7">
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M4 7l8 5.5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

if (typeof document !== 'undefined' && !document.getElementById('bpi-auth-styles')) {
  const s = document.createElement('style');
  s.id = 'bpi-auth-styles';
  s.textContent = `
    @keyframes bpi-auth-spin { to { transform: rotate(360deg); } }
    .bpi input::placeholder { color: rgba(22,20,15,.32); }
  `;
  document.head.appendChild(s);
}

Object.assign(window, { AuthScreen });
