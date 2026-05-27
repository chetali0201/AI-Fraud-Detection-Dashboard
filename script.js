/* ═══════════════════════════════════════════════
   AEGIS — Fraud Detection Dashboard
   script.js
═══════════════════════════════════════════════ */
'use strict';
let socket;

window.addEventListener("load", () => {

    socket = io();

});
/* ── GLOBAL STATE ── */
const STATE = {
  transactions: [],
  alerts: [],
  currentPage: 1,
  rowsPerPage: 10,
  sortCol: 'time',
  sortDir: 'desc',
  filterStatus: '',
  searchTerm: '',
  fraudPct: 0,
  darkMode: true,
  chartInstances: {},
  autoRefreshInterval: null,
  alertCount: 0,
  notifCount: 3,
};

/* ══════════════════════════════════════════════
   LOADING SCREEN
══════════════════════════════════════════════ */
const LOAD_MESSAGES = [
  'Initializing secure environment...',
  'Loading AI fraud models...',
  'Establishing encrypted connection...',
  'Calibrating threat detection...',
  'System ready.',
];

function runLoader() {
  const bar   = document.getElementById('loaderBar');
  const status = document.getElementById('statusLabel') || document.getElementById('loaderStatus');
  let progress = 0;
  let msgIdx   = 0;

  const iv = setInterval(() => {
    progress += Math.random() * 18 + 4;
    if (progress > 100) progress = 100;
    if (bar) bar.style.width = progress + '%';
    if (status && msgIdx < LOAD_MESSAGES.length) {
      status.textContent = LOAD_MESSAGES[msgIdx++];
    }
    if (progress >= 100) {
      clearInterval(iv);
      setTimeout(() => {
        const ls = document.getElementById('loadingScreen');
        if (ls) { ls.style.opacity = '0'; ls.style.transition = 'opacity 0.5s'; }
        setTimeout(() => {
          if (ls) ls.style.display = 'none';
          showLoginPage();
        }, 500);
      }, 400);
    }
  }, 280);
}

/* ══════════════════════════════════════════════
   LOGIN PAGE
══════════════════════════════════════════════ */
let failedAttempts = 0;

function showLoginPage() {
  const lp = document.getElementById('loginPage');
  if (lp) { lp.classList.remove('hidden'); lp.style.display = 'flex'; }
  initLoginParticles();
  detectDevice();
  startResendTimer();
}

function detectDevice() {
  const el = document.getElementById('deviceText');
  if (!el) return;
  const ua = navigator.userAgent;
  let device = 'Desktop Browser';
  if (/Mobi|Android/i.test(ua)) device = 'Mobile Device';
  else if (/iPad|Tablet/i.test(ua)) device = 'Tablet';
  const browser = /Chrome/i.test(ua) ? 'Chrome' : /Firefox/i.test(ua) ? 'Firefox' : /Safari/i.test(ua) ? 'Safari' : 'Browser';
  el.textContent = `${device} · ${browser} · ${window.screen.width}×${window.screen.height}`;
}

let resendCountdown = 30;
function startResendTimer() {
  const span = document.getElementById('resendTimer');
  if (!span) return;
  resendCountdown = 30;
  const iv = setInterval(() => {
    resendCountdown--;
    if (span) span.textContent = resendCountdown > 0 ? `(${resendCountdown}s)` : '';
    if (resendCountdown <= 0) clearInterval(iv);
  }, 1000);
}

function bindLoginEvents() {
  /* show/hide password */
  const togglePw = document.getElementById('togglePw');
  if (togglePw) togglePw.addEventListener('click', () => {
    const inp = document.getElementById('loginPassword');
    const ico = document.getElementById('eyeIcon');
    if (!inp) return;
    if (inp.type === 'password') {
      inp.type = 'text';
      if (ico) { ico.classList.remove('fa-eye'); ico.classList.add('fa-eye-slash'); }
    } else {
      inp.type = 'password';
      if (ico) { ico.classList.remove('fa-eye-slash'); ico.classList.add('fa-eye'); }
    }
  });

  /* login button */
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) loginBtn.addEventListener('click', handleLogin);

  /* Enter key */
  ['loginEmail','loginPassword'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  });

  /* forgot password */
  const forgotLink = document.getElementById('forgotLink');
  if (forgotLink) forgotLink.addEventListener('click', e => {
    e.preventDefault();
    showToast('Password reset link sent to your email.', 'cyan');
  });

  /* OTP boxes */
  document.querySelectorAll('.otp-box').forEach(box => {
    box.addEventListener('input', e => {
      const val = e.target.value.replace(/\D/g,'');
      e.target.value = val;
      if (val && e.target.dataset.index < 5) {
        const next = document.querySelector(`.otp-box[data-index="${+e.target.dataset.index + 1}"]`);
        if (next) next.focus();
      }
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !e.target.value && e.target.dataset.index > 0) {
        const prev = document.querySelector(`.otp-box[data-index="${+e.target.dataset.index - 1}"]`);
        if (prev) { prev.focus(); prev.value = ''; }
      }
    });
  });

  /* OTP verify */
  const otpVerifyBtn = document.getElementById('otpVerifyBtn');
  if (otpVerifyBtn) otpVerifyBtn.addEventListener('click', verifyOTP);

  /* Dismiss suspicious */
  const dismiss = document.getElementById('dismissSuspicious');
  if (dismiss) dismiss.addEventListener('click', () => {
    const o = document.getElementById('suspiciousOverlay');
    if (o) o.classList.add('hidden');
    showOtpOverlay();
  });

  /* Resend OTP */
  const resend = document.getElementById('otpResend');
  if (resend) resend.addEventListener('click', () => {
    startResendTimer();
    showToast('OTP resent to your device.', 'cyan');
  });
}

function handleLogin() {
  const email = (document.getElementById('loginEmail') || {}).value || '';
  const pw    = (document.getElementById('loginPassword') || {}).value || '';
  const btn   = document.getElementById('loginBtn');
  const loader = document.getElementById('btnLoader');
  const btnText = btn ? btn.querySelector('.btn-text') : null;

  if (!email || !pw) {
    showFailBanner('Please enter email and password.');
    return;
  }

  /* show loader */
  if (loader) loader.classList.remove('hidden');
  if (btnText) btnText.style.display = 'none';
  if (btn) btn.disabled = true;

  setTimeout(() => {
    if (loader) loader.classList.add('hidden');
    if (btnText) btnText.style.display = '';
    if (btn) btn.disabled = false;

    /* Wrong credentials simulation */
    if (pw.length < 4) {
      failedAttempts++;
      showFailBanner(`Invalid credentials. Attempt ${failedAttempts}/5`);
      if (failedAttempts >= 3) {
        const so = document.getElementById('suspiciousOverlay');
        if (so) so.classList.remove('hidden');
      }
      return;
    }

    /* Success: show suspicious if first time or show OTP directly */
    if (failedAttempts === 0) {
      showOtpOverlay();
    } else {
      const so = document.getElementById('suspiciousOverlay');
      if (so) so.classList.remove('hidden');
    }
  }, 1400);
}

function showFailBanner(msg) {
  const banner = document.getElementById('failBanner');
  const msgEl  = document.getElementById('failMsg');
  if (!banner) return;
  if (msgEl) msgEl.textContent = msg;
  banner.classList.remove('hidden');
}

function showOtpOverlay() {
  const o = document.getElementById('otpOverlay');
  if (o) { o.classList.remove('hidden'); document.querySelector('.otp-box')?.focus(); }
}

function verifyOTP() {
  const boxes = document.querySelectorAll('.otp-box');
  let otp = '';
  boxes.forEach(b => otp += b.value);
  if (otp.length < 6) {
    showToast('Please enter all 6 digits.', 'red');
    return;
  }
  const btn = document.getElementById('otpVerifyBtn');
  if (btn) { btn.textContent = 'Verifying…'; btn.disabled = true; }
  setTimeout(() => {
    const overlay = document.getElementById('otpOverlay');
    if (overlay) overlay.classList.add('hidden');
    enterDashboard();
  }, 900);
}

function enterDashboard() {
  const lp = document.getElementById('loginPage');
  const db = document.getElementById('dashboard');
  if (lp) { lp.style.opacity = '0'; lp.style.transition = 'opacity 0.5s'; }
  setTimeout(() => {
    if (lp) lp.style.display = 'none';
    if (db) { db.classList.remove('hidden'); db.style.display = 'flex'; }
    initDashboard();
  }, 500);
}

/* ══════════════════════════════════════════════
   PARTICLES
══════════════════════════════════════════════ */
function initParticles(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let particles = [];
  let W, H;

  function resize() {
    W = canvas.width  = canvas.offsetWidth  || window.innerWidth;
    H = canvas.height = canvas.offsetHeight || window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < 80; i++) particles.push(createParticle());

  function createParticle() {
    return {
      x: Math.random() * (W || 800),
      y: Math.random() * (H || 600),
      r: Math.random() * 1.5 + 0.3,
      dx: (Math.random() - 0.5) * 0.4,
      dy: (Math.random() - 0.5) * 0.4,
      opacity: Math.random() * 0.6 + 0.1,
    };
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    /* grid */
    ctx.strokeStyle = 'rgba(0,220,255,0.04)';
    ctx.lineWidth   = 1;
    for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    particles.forEach(p => {
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0 || p.x > W) p.dx *= -1;
      if (p.y < 0 || p.y > H) p.dy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,220,255,${p.opacity})`;
      ctx.fill();
    });

    /* connections */
    for (let i = 0; i < particles.length; i++) {
      for (let j = i+1; j < particles.length; j++) {
        const d = Math.hypot(particles[i].x - particles[j].x, particles[i].y - particles[j].y);
        if (d < 90) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(0,220,255,${0.06 * (1 - d/90)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

function initLoginParticles() { initParticles('loginParticles'); }

/* ══════════════════════════════════════════════
   DATA GENERATION
══════════════════════════════════════════════ */
const USERS   = ['alex.martinez','priya.sharma','david.okonkwo','mei.chen','fatima.al-rashid','james.wilson','sofia.garcia','omar.hassan','natasha.petrov','leo.tanaka'];
const LOCS    = ['New York, US','London, UK','Lagos, NG','Mumbai, IN','São Paulo, BR','Tokyo, JP','Moscow, RU','Dubai, AE','Sydney, AU','Paris, FR'];
const DEVICES = ['iPhone 15','Galaxy S24','MacBook Pro','Windows PC','iPad Pro','Pixel 8','OnePlus 12','Surface Laptop','Huawei P60','Linux Desktop'];
const IPS     = ['192.168.1.','10.0.0.','185.220.101.','91.108.4.','172.16.0.','104.28.','185.199.','198.51.100.','203.0.113.','100.64.0.'];
const STATUSES = ['safe','safe','safe','safe','safe','suspicious','suspicious','fraud'];

function randomInt(a,b) { return Math.floor(Math.random()*(b-a+1))+a; }
function randomPick(arr) { return arr[randomInt(0,arr.length-1)]; }
function randomAmount() {
  const r = Math.random();
  if (r < 0.5) return +(Math.random()*500+10).toFixed(2);
  if (r < 0.8) return +(Math.random()*5000+500).toFixed(2);
  return +(Math.random()*50000+5000).toFixed(2);
}
function randomIP() { return randomPick(IPS) + randomInt(1,255); }
function timeAgo(mins) {
  const d = new Date(Date.now() - mins*60000);
  return d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
}
function genTxnId() { return 'TXN-' + Math.random().toString(36).substr(2,8).toUpperCase(); }

function generateTransaction(idx) {
  const status  = randomPick(STATUSES);
  const amount  = randomAmount();
  const risk    = status === 'fraud' ? randomInt(75,99) :
                  status === 'suspicious' ? randomInt(40,74) :
                  randomInt(1,39);
  return {
    id:      genTxnId(),
    user:    randomPick(USERS),
    amount,
    location:randomPick(LOCS),
    device:  randomPick(DEVICES),
    ip:      randomIP(),
    time:    timeAgo(idx * randomInt(1,15)),
    risk,
    status,
  };
}

function generateTransactions(n=120) {
  STATE.transactions = Array.from({length:n}, (_,i) => generateTransaction(i));
}

function generateAlerts() {
  const templates = [
    { type:'critical', icon:'fa-triangle-exclamation', title:'High-Value Transfer', desc:'$47,250 transfer to unknown account from alex.martinez', time:'2 min ago' },
    { type:'critical', icon:'fa-location-dot', title:'Foreign IP Access', desc:'Login from Lagos, NG — IP: 185.220.101.47', time:'5 min ago' },
    { type:'warning', icon:'fa-mobile-screen-button', title:'Device Mismatch', desc:'priya.sharma logged in from unrecognized iPhone 15', time:'8 min ago' },
    { type:'warning', icon:'fa-bolt-lightning', title:'Rapid Transaction Burst', desc:'14 transactions in 3 minutes — david.okonkwo', time:'11 min ago' },
    { type:'critical', icon:'fa-key', title:'Multiple Failed Logins', desc:'6 failed login attempts — mei.chen', time:'14 min ago' },
    { type:'info', icon:'fa-user-secret', title:'Suspicious IP Activity', desc:'IP 91.108.4.93 flagged across 3 accounts', time:'18 min ago' },
    { type:'warning', icon:'fa-credit-card', title:'Unusual Spending Pattern', desc:'fatima.al-rashid spent 4× avg in last hour', time:'22 min ago' },
    { type:'critical', icon:'fa-globe', title:'VPN/Proxy Detected', desc:'james.wilson connected via anonymous proxy', time:'28 min ago' },
    { type:'info', icon:'fa-microchip', title:'AI Model Alert', desc:'Fraud probability 92% — new transaction cluster', time:'35 min ago' },
    { type:'warning', icon:'fa-clock-rotate-left', title:'Off-Hours Activity', desc:'sofia.garcia active at 3:47 AM local time', time:'41 min ago' },
  ];
  STATE.alerts = templates;
  STATE.alertCount = templates.filter(a => a.type === 'critical').length;
}

function generateUsers() {
  return USERS.map((u,i) => ({
    id: 'USR-' + String(i+1).padStart(4,'0'),
    name: u.split('.').map(s => s.charAt(0).toUpperCase()+s.slice(1)).join(' '),
    email: u + '@example.com',
    country: randomPick(LOCS),
    txns: randomInt(12,340),
    risk: randomInt(2,96),
    flags: randomInt(0,7),
    status: randomPick(['active','active','active','suspended','flagged']),
  }));
}

/* ══════════════════════════════════════════════
   DASHBOARD INIT
══════════════════════════════════════════════ */
function initDashboard() {
  generateTransactions(120);
  generateAlerts();
  initDashParticles();
  bindNavigation();
  bindTopbar();
  renderKPIs();
  renderFraudMeter();
  renderAlerts();
  renderCharts();
  renderHeatmap();
  renderNetworkGraph();
  renderTransactionTable();
  renderAlertsPage();
  renderUsersTable();
  bindReports();
  bindSettings();
  bindChatbot();
  bindNotifications();
  startAutoRefresh();
  updateAlertBadge();
}

function initDashParticles() { initParticles('dashParticles'); }

/* ══════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════ */
function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const section = item.dataset.section;
      switchSection(section, item);
    });
  });
  const toggle = document.getElementById('sidebarToggle');
  if (toggle) toggle.addEventListener('click', () => {
    const sb = document.getElementById('sidebar');
    if (sb) sb.classList.toggle('open');
  });
  const logout = document.getElementById('logoutBtn');
  if (logout) logout.addEventListener('click', () => {
    if (confirm('Sign out of AEGIS?')) location.reload();
  });
}

function switchSection(section, clickedItem) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (clickedItem) clickedItem.classList.add('active');
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  const target = document.getElementById('section-' + section);
  if (target) target.classList.remove('hidden');
  const bc = document.getElementById('breadcrumb');
  if (bc) bc.innerHTML = `Dashboard <span>/ ${clickedItem ? clickedItem.querySelector('span')?.textContent || section : section}</span>`;
  /* Re-init analytics charts on lazy load */
  if (section === 'analytics') renderAnalyticsCharts();
}

/* ══════════════════════════════════════════════
   TOPBAR
══════════════════════════════════════════════ */
function bindTopbar() {
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
  const notifBtn = document.getElementById('notifBtn');
  if (notifBtn) notifBtn.addEventListener('click', e => {
    e.stopPropagation();
    const panel = document.getElementById('notifPanel');
    if (panel) panel.classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    const panel = document.getElementById('notifPanel');
    if (panel) panel.classList.add('hidden');
  });
  const gs = document.getElementById('globalSearch');
  if (gs) gs.addEventListener('input', e => {
    const term = e.target.value.toLowerCase();
    STATE.searchTerm = term;
    STATE.currentPage = 1;
    renderTransactionTable();
  });
}

function toggleTheme() {
  STATE.darkMode = !STATE.darkMode;
  document.documentElement.setAttribute('data-theme', STATE.darkMode ? '' : 'light');
  const icon = document.getElementById('themeIcon');
  if (icon) { icon.className = STATE.darkMode ? 'fa-solid fa-moon' : 'fa-solid fa-sun'; }
}

/* ══════════════════════════════════════════════
   KPI CARDS — ANIMATED COUNTERS
══════════════════════════════════════════════ */
function renderKPIs() {
  const fraud = STATE.transactions.filter(t=>t.status==='fraud').length;
  const suspicious = STATE.transactions.filter(t=>t.status==='suspicious').length;
  const saved = STATE.transactions.filter(t=>t.status==='fraud').reduce((a,b)=>a+b.amount,0);
  animateCounter('kpi-total', STATE.transactions.length);
  animateCounter('kpi-fraud', fraud);
  animateCounter('kpi-users', randomInt(1200,1800));
  animateCounterMoney('kpi-saved', saved);
  animateCounter('kpi-risk', suspicious + fraud);
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let current = 0;
  const step = Math.ceil(target / 60);
  const iv = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current.toLocaleString();
    if (current >= target) clearInterval(iv);
  }, 20);
}

function animateCounterMoney(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let current = 0;
  const step = target / 60;
  const iv = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = '$' + Math.round(current).toLocaleString();
    if (current >= target) clearInterval(iv);
  }, 20);
}

/* ══════════════════════════════════════════════
   FRAUD METER
══════════════════════════════════════════════ */
function renderFraudMeter(pct) {
  const canvas = document.getElementById('meterCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const fraud = STATE.transactions.filter(t => t.status === 'fraud').length;
  const all   = STATE.transactions.length;
  pct = pct !== undefined ? pct : Math.round((fraud / all) * 100);
  STATE.fraudPct = pct;
  animateMeter(ctx, canvas.width, canvas.height, pct);
  updateAIEngine(pct);
}

function animateMeter(ctx, W, H, targetPct) {
  let current = 0;
  const cx = W/2, cy = H - 10;
  const R = Math.min(W/2, H) - 20;
  function draw(p) {
    ctx.clearRect(0,0,W,H);
    /* background arc */
    ctx.beginPath();
    ctx.arc(cx,cy,R,Math.PI,0);
    ctx.lineWidth = 16;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.stroke();
    /* colour arc */
    const color = p < 30 ? '#10d98a' : p < 60 ? '#ff8c42' : '#ff4466';
    const angle = Math.PI + (Math.PI * p / 100);
    ctx.beginPath();
    ctx.arc(cx,cy,R,Math.PI,angle);
    ctx.lineWidth = 16;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.shadowBlur = 18;
    ctx.shadowColor = color;
    ctx.stroke();
    ctx.shadowBlur = 0;
    /* tick marks */
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + (Math.PI * i/10);
      const x1 = cx + (R-22)*Math.cos(a), y1 = cy + (R-22)*Math.sin(a);
      const x2 = cx + (R-10)*Math.cos(a), y2 = cy + (R-10)*Math.sin(a);
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = i % 5 === 0 ? 2 : 1;
      ctx.stroke();
    }
    /* needle */
    const needleAngle = Math.PI + (Math.PI * p/100);
    const nx = cx + (R-30)*Math.cos(needleAngle);
    const ny = cy + (R-30)*Math.sin(needleAngle);
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.lineTo(nx,ny);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#fff';
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cx,cy,7,0,Math.PI*2);
    ctx.fillStyle = color;
    ctx.shadowBlur = 12; ctx.shadowColor = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    /* update text */
    const pctEl   = document.getElementById('meterPct');
    const labelEl = document.getElementById('meterLabel');
    if (pctEl) pctEl.textContent = Math.round(p) + '%';
    if (labelEl) {
      if (p < 30) { labelEl.textContent = 'SAFE'; labelEl.style.color = '#10d98a'; }
      else if (p < 60) { labelEl.textContent = 'MODERATE'; labelEl.style.color = '#ff8c42'; }
      else { labelEl.textContent = 'HIGH RISK'; labelEl.style.color = '#ff4466'; }
    }
  }
  const iv = setInterval(() => {
    current = Math.min(current + 1.5, targetPct);
    draw(current);
    if (current >= targetPct) clearInterval(iv);
  }, 20);
}

function updateAIEngine(pct) {
  const conf   = document.getElementById('aiConf');
  const cls    = document.getElementById('aiClass');
  const action = document.getElementById('aiAction');
  if (conf) conf.textContent   = (85 + Math.floor(Math.random()*12)) + '%';
  if (cls) {
    cls.textContent = pct < 30 ? 'Low Risk' : pct < 60 ? 'Moderate Risk' : 'High Risk';
    cls.style.color = pct < 30 ? 'var(--green)' : pct < 60 ? 'var(--orange)' : 'var(--red)';
  }
  if (action) action.textContent = pct < 30 ? 'Monitor Only' : pct < 60 ? 'Secondary Verification' : 'Block & Investigate';
}

/* ══════════════════════════════════════════════
   LIVE ALERTS
══════════════════════════════════════════════ */
function renderAlerts() {
  const container = document.getElementById('alertsScroll');
  if (!container) return;
  container.innerHTML = '';
  STATE.alerts.forEach((a, i) => {
    const el = document.createElement('div');
    el.className = `alert-item ${a.type}`;
    el.innerHTML = `
      <div class="alert-icon"><i class="fa-solid ${a.icon}"></i></div>
      <div class="alert-body">
        <div class="alert-title">${a.title}</div>
        <div class="alert-desc">${a.desc}</div>
      </div>
      <div class="alert-time">${a.time}</div>
    `;
    el.style.animationDelay = (i * 0.07) + 's';
    container.appendChild(el);
  });
}

function renderAlertsPage() {
  const grid = document.getElementById('alertsPageGrid');
  if (!grid) return;
  grid.innerHTML = '';
  STATE.alerts.forEach((a, i) => {
    const el = document.createElement('div');
    el.className = `alert-page-card ${a.type}`;
    el.style.animationDelay = (i * 0.06) + 's';
    el.innerHTML = `
      <div class="apc-icon"><i class="fa-solid ${a.icon}"></i></div>
      <div class="apc-body">
        <h4>${a.title}</h4>
        <p>${a.desc}</p>
        <div class="apc-meta"><span><i class="fa-regular fa-clock"></i> ${a.time}</span><span class="badge badge-${a.type==='critical'?'fraud':a.type==='warning'?'suspicious':'safe'}">${a.type.toUpperCase()}</span></div>
      </div>
    `;
    grid.appendChild(el);
  });
}

function updateAlertBadge() {
  const badge = document.getElementById('alertBadge');
  if (badge) badge.textContent = STATE.alertCount;
}

/* ══════════════════════════════════════════════
   CHARTS
══════════════════════════════════════════════ */
const NEON_COLORS = {
  cyan:   'rgba(0,220,255,',
  purple: 'rgba(168,85,247,',
  green:  'rgba(16,217,138,',
  red:    'rgba(255,68,102,',
  orange: 'rgba(255,140,66,',
  yellow: 'rgba(255,215,0,',
};

function chartDefaults() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#7a92b8', font: { size: 11 }, boxWidth: 12 } },
      tooltip: { backgroundColor: '#0c1428', titleColor: '#00dcff', bodyColor: '#e2eaf8', borderColor: 'rgba(0,220,255,0.2)', borderWidth: 1 },
    },
  };
}

function safeChart(id, config) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (STATE.chartInstances[id]) { STATE.chartInstances[id].destroy(); }
  const chart = new Chart(el, config);
  STATE.chartInstances[id] = chart;
  return chart;
}

function renderCharts() {
  /* PIE */
  const fraud = STATE.transactions.filter(t=>t.status==='fraud').length;
  const susp  = STATE.transactions.filter(t=>t.status==='suspicious').length;
  const safe  = STATE.transactions.filter(t=>t.status==='safe').length;

  safeChart('pieChart', {
    type: 'doughnut',
    data: {
      labels: ['Safe','Suspicious','Fraud'],
      datasets: [{
        data: [safe,susp,fraud],
        backgroundColor: [NEON_COLORS.green+'0.7)',NEON_COLORS.orange+'0.7)',NEON_COLORS.red+'0.7)'],
        borderColor: [NEON_COLORS.green+'1)',NEON_COLORS.orange+'1)',NEON_COLORS.red+'1)'],
        borderWidth: 2,
        hoverOffset: 6,
      }],
    },
    options: { ...chartDefaults(), cutout: '65%' },
  });

  /* LINE */
  const days = Array.from({length:30},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-29+i); return d.getDate()+'/'+( d.getMonth()+1); });
  const fraudData = days.map(()=>randomInt(2,18));
  const safData   = days.map(()=>randomInt(80,180));

  safeChart('lineChart', {
    type:'line',
    data:{
      labels:days,
      datasets:[
        { label:'Fraud', data:fraudData, borderColor:'rgba(255,68,102,1)', backgroundColor:'rgba(255,68,102,0.08)', tension:0.4, fill:true, pointRadius:2, borderWidth:2 },
        { label:'Safe',  data:safData,   borderColor:'rgba(0,220,255,1)',  backgroundColor:'rgba(0,220,255,0.05)',  tension:0.4, fill:true, pointRadius:2, borderWidth:2 },
      ],
    },
    options:{
      ...chartDefaults(),
      scales:{
        x:{ ticks:{color:'#4a6080',maxTicksLimit:8}, grid:{color:'rgba(255,255,255,0.03)'} },
        y:{ ticks:{color:'#4a6080'}, grid:{color:'rgba(255,255,255,0.04)'} },
      },
    },
  });

  /* BAR */
  const regions = ['Americas','Europe','Asia','Africa','Middle East','Oceania'];
  safeChart('barChart',{
    type:'bar',
    data:{
      labels:regions,
      datasets:[{
        label:'Fraud Cases',
        data:regions.map(()=>randomInt(8,55)),
        backgroundColor:regions.map((_,i)=>[NEON_COLORS.red,NEON_COLORS.orange,NEON_COLORS.purple,NEON_COLORS.cyan,NEON_COLORS.green,NEON_COLORS.yellow][i]+'0.7)'),
        borderColor:regions.map((_,i)=>[NEON_COLORS.red,NEON_COLORS.orange,NEON_COLORS.purple,NEON_COLORS.cyan,NEON_COLORS.green,NEON_COLORS.yellow][i]+'1)'),
        borderWidth:1,borderRadius:6,
      }],
    },
    options:{
      ...chartDefaults(),
      scales:{
        x:{ticks:{color:'#4a6080'},grid:{display:false}},
        y:{ticks:{color:'#4a6080'},grid:{color:'rgba(255,255,255,0.04)'}},
      },
    },
  });

  /* AREA — user activity */
  const hours = Array.from({length:24},(_,i)=>(i<10?'0':'')+i+':00');
  safeChart('areaChart',{
    type:'line',
    data:{
      labels:hours,
      datasets:[
        { label:'Active Users', data:hours.map((_,i)=>{ const h=i; return h>=9&&h<=21?randomInt(400,1200):randomInt(20,180); }), borderColor:'rgba(168,85,247,1)', backgroundColor:'rgba(168,85,247,0.12)', tension:0.5, fill:true, pointRadius:0, borderWidth:2 },
      ],
    },
    options:{
      ...chartDefaults(),
      scales:{
        x:{ticks:{color:'#4a6080',maxTicksLimit:8},grid:{color:'rgba(255,255,255,0.03)'}},
        y:{ticks:{color:'#4a6080'},grid:{color:'rgba(255,255,255,0.04)'}},
      },
    },
  });
}

function renderAnalyticsCharts() {
  /* Accuracy over time */
  if (!STATE.chartInstances['accuracyChart']) {
    const weeks = ['W1','W2','W3','W4','W5','W6','W7','W8'];
    safeChart('accuracyChart',{
      type:'line',
      data:{
        labels:weeks,
        datasets:[
          {label:'Precision',data:weeks.map(()=>randomInt(88,98)),borderColor:'rgba(0,220,255,1)',backgroundColor:'rgba(0,220,255,0.06)',tension:0.4,fill:true,pointRadius:4,borderWidth:2},
          {label:'Recall',   data:weeks.map(()=>randomInt(82,96)),borderColor:'rgba(168,85,247,1)',backgroundColor:'rgba(168,85,247,0.06)',tension:0.4,fill:true,pointRadius:4,borderWidth:2},
          {label:'F1 Score', data:weeks.map(()=>randomInt(85,97)),borderColor:'rgba(16,217,138,1)',backgroundColor:'rgba(16,217,138,0.04)',tension:0.4,fill:false,pointRadius:4,borderWidth:2},
        ],
      },
      options:{
        ...chartDefaults(),
        scales:{
          x:{ticks:{color:'#4a6080'},grid:{color:'rgba(255,255,255,0.04)'}},
          y:{min:70,max:100,ticks:{color:'#4a6080',callback:v=>v+'%'},grid:{color:'rgba(255,255,255,0.04)'}},
        },
      },
    });
  }

  /* Doughnut — fraud categories */
  if (!STATE.chartInstances['doughnutChart']) {
    safeChart('doughnutChart',{
      type:'doughnut',
      data:{
        labels:['Card Fraud','Account Takeover','Identity Theft','Money Laundering','Phishing','Chargeback'],
        datasets:[{
          data:[28,22,18,14,11,7],
          backgroundColor:['rgba(255,68,102,0.8)','rgba(255,140,66,0.8)','rgba(168,85,247,0.8)','rgba(0,220,255,0.8)','rgba(255,215,0,0.8)','rgba(16,217,138,0.8)'],
          borderWidth:2,hoverOffset:8,
        }],
      },
      options:{...chartDefaults(),cutout:'60%'},
    });
  }

  /* Hourly bar */
  if (!STATE.chartInstances['hourlyChart']) {
    const hours = Array.from({length:24},(_,i)=>(i<10?'0':'')+i+':00');
    safeChart('hourlyChart',{
      type:'bar',
      data:{
        labels:hours,
        datasets:[
          {label:'Transactions',data:hours.map((_,i)=>{ const h=i; return h>=9&&h<=20?randomInt(200,800):randomInt(10,100); }),backgroundColor:'rgba(0,220,255,0.5)',borderColor:'rgba(0,220,255,1)',borderWidth:1,borderRadius:4},
          {label:'Fraud',       data:hours.map(()=>randomInt(0,25)),backgroundColor:'rgba(255,68,102,0.6)',borderColor:'rgba(255,68,102,1)',borderWidth:1,borderRadius:4},
        ],
      },
      options:{
        ...chartDefaults(),
        scales:{
          x:{ticks:{color:'#4a6080',maxTicksLimit:8},grid:{display:false}},
          y:{ticks:{color:'#4a6080'},grid:{color:'rgba(255,255,255,0.04)'}},
        },
      },
    });
  }
}

/* ══════════════════════════════════════════════
   HEATMAP
══════════════════════════════════════════════ */
function renderHeatmap() {
  const canvas = document.getElementById('heatmapCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 500;
  const H = 260;
  canvas.width = W; canvas.height = H;
  ctx.clearRect(0,0,W,H);
  /* Background */
  ctx.fillStyle = 'rgba(5,11,24,0.6)';
  ctx.fillRect(0,0,W,H);
  /* Grid labels */
  const cols = ['Americas','Europe','Asia','Africa','Mid East','Oceania'];
  const rows = ['00-04','04-08','08-12','12-16','16-20','20-24'];
  const cw = (W - 80) / cols.length;
  const rh = (H - 30) / rows.length;
  ctx.font = '10px monospace'; ctx.fillStyle = 'rgba(122,146,184,0.7)';
  cols.forEach((c,i) => ctx.fillText(c, 80 + i*cw + 4, 14));
  rows.forEach((r,i) => ctx.fillText(r, 4, 30 + i*rh + rh/2 + 4));
  /* Cells */
  for (let r=0; r<rows.length; r++) {
    for (let c=0; c<cols.length; c++) {
      const val = Math.random();
      const alpha = val * 0.85 + 0.05;
      const hue = 200 - val * 200; /* cyan→red */
      ctx.fillStyle = `hsla(${hue},100%,55%,${alpha})`;
      ctx.beginPath();
      ctx.roundRect(80 + c*cw + 2, 20 + r*rh + 2, cw - 4, rh - 4, 5);
      ctx.fill();
      /* glow for high vals */
      if (val > 0.75) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = `hsla(${hue},100%,55%,0.6)`;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      /* value label */
      ctx.fillStyle = alpha > 0.5 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)';
      ctx.font = '9px monospace';
      ctx.fillText(Math.round(val*100), 80 + c*cw + cw/2 - 8, 20 + r*rh + rh/2 + 4);
    }
  }
}

/* ══════════════════════════════════════════════
   NETWORK GRAPH
══════════════════════════════════════════════ */
function renderNetworkGraph() {
  const canvas = document.getElementById('networkCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 500;
  const H = 260;
  canvas.width = W; canvas.height = H;

  const nodeData = [
    {x:0.5,y:0.5,r:14,col:'#ff4466',label:'IP Hub',type:'hub'},
    {x:0.2,y:0.3,r:10,col:'#ff8c42',label:'User A',type:'susp'},
    {x:0.8,y:0.2,r:10,col:'#ff8c42',label:'User B',type:'susp'},
    {x:0.15,y:0.7,r:8,col:'#00dcff',label:'Device',type:'device'},
    {x:0.75,y:0.75,r:8,col:'#00dcff',label:'Device',type:'device'},
    {x:0.35,y:0.15,r:7,col:'#a855f7',label:'TXN',type:'txn'},
    {x:0.65,y:0.85,r:7,col:'#a855f7',label:'TXN',type:'txn'},
    {x:0.9,y:0.5,r:9,col:'#ff4466',label:'IP',type:'susp'},
    {x:0.1,y:0.5,r:9,col:'#10d98a',label:'Safe IP',type:'safe'},
  ];
  const edges = [[0,1],[0,2],[0,7],[1,3],[2,4],[1,5],[2,6],[3,0],[4,0],[8,1]];

  const nodes = nodeData.map(n => ({...n, px: n.x*W, py: n.y*H, vx:(Math.random()-0.5)*0.3, vy:(Math.random()-0.5)*0.3}));

  function draw() {
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = 'rgba(5,11,24,0.4)';
    ctx.fillRect(0,0,W,H);

    /* edges */
    edges.forEach(([a,b]) => {
      ctx.beginPath();
      ctx.moveTo(nodes[a].px, nodes[a].py);
      ctx.lineTo(nodes[b].px, nodes[b].py);
      ctx.strokeStyle = 'rgba(0,220,255,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    /* nodes */
    nodes.forEach(n => {
      n.px += n.vx; n.py += n.vy;
      if (n.px < n.r || n.px > W-n.r) n.vx *= -1;
      if (n.py < n.r || n.py > H-n.r) n.vy *= -1;
      /* glow */
      ctx.beginPath();
      ctx.arc(n.px, n.py, n.r+6, 0, Math.PI*2);
      ctx.fillStyle = n.col.replace(')',',0.15)').replace('rgb(','rgba(').replace('#',n.col);
      const grad = ctx.createRadialGradient(n.px,n.py,0,n.px,n.py,n.r+6);
      grad.addColorStop(0, n.col.includes('#') ? hexToRgba(n.col,0.25) : n.col);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fill();
      /* node */
      ctx.beginPath();
      ctx.arc(n.px, n.py, n.r, 0, Math.PI*2);
      ctx.fillStyle = n.col;
      ctx.shadowBlur = 12; ctx.shadowColor = n.col;
      ctx.fill();
      ctx.shadowBlur = 0;
      /* label */
      ctx.font = '9px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(n.label, n.px - n.label.length*2.8, n.py + n.r + 12);
    });
    requestAnimationFrame(draw);
  }
  draw();
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ══════════════════════════════════════════════
   TRANSACTION TABLE
══════════════════════════════════════════════ */
function renderTransactionTable() {
  let data = [...STATE.transactions];

  /* filter */
  if (STATE.filterStatus) data = data.filter(t => t.status === STATE.filterStatus);
  const term = (STATE.searchTerm || '').toLowerCase();
  if (term) data = data.filter(t =>
    t.id.toLowerCase().includes(term) ||
    t.user.toLowerCase().includes(term) ||
    t.location.toLowerCase().includes(term) ||
    t.ip.includes(term) ||
    t.status.includes(term)
  );
  /* sort */
  data.sort((a,b) => {
    let av = a[STATE.sortCol], bv = b[STATE.sortCol];
    if (STATE.sortCol === 'amount' || STATE.sortCol === 'risk') { av = +av; bv = +bv; }
    if (av < bv) return STATE.sortDir === 'asc' ? -1 : 1;
    if (av > bv) return STATE.sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const total = data.length;
  const pages = Math.max(1, Math.ceil(total / STATE.rowsPerPage));
  if (STATE.currentPage > pages) STATE.currentPage = pages;
  const start = (STATE.currentPage - 1) * STATE.rowsPerPage;
  const slice = data.slice(start, start + STATE.rowsPerPage);

  const tbody = document.getElementById('txnBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  slice.forEach(t => {
    const tr = document.createElement('tr');
    if (t.status === 'fraud') tr.classList.add('fraud-row');
    const riskColor = t.risk < 40 ? 'var(--green)' : t.risk < 70 ? 'var(--orange)' : 'var(--red)';
    tr.innerHTML = `
      <td style="color:var(--cyan);font-family:monospace;font-size:0.78rem">${t.id}</td>
      <td>${t.user}</td>
      <td style="font-weight:600">$${t.amount.toLocaleString()}</td>
      <td><i class="fa-solid fa-location-dot" style="color:var(--text2);margin-right:5px;font-size:0.75rem"></i>${t.location}</td>
      <td style="font-size:0.78rem">${t.device}</td>
      <td style="font-family:monospace;font-size:0.78rem;color:var(--text2)">${t.ip}</td>
      <td>${t.time}</td>
      <td>
        <div class="risk-bar">
          <span style="color:${riskColor};font-weight:700;font-size:0.8rem;min-width:28px">${t.risk}</span>
          <div class="risk-bar-inner"><div class="risk-fill" style="width:${t.risk}%;background:${riskColor}"></div></div>
        </div>
      </td>
      <td><span class="badge badge-${t.status}">${t.status.toUpperCase()}</span></td>
    `;
    tbody.appendChild(tr);
  });

  /* pagination info */
  const info = document.getElementById('paginationInfo');
  if (info) info.textContent = `Showing ${start+1}–${Math.min(start+STATE.rowsPerPage,total)} of ${total} transactions`;

  /* page numbers */
  const pgNums = document.getElementById('pgNums');
  if (pgNums) {
    pgNums.innerHTML = '';
    for (let p=1; p<=pages; p++) {
      if (pages > 7 && p > 3 && p < pages-1 && Math.abs(p-STATE.currentPage) > 1) {
        if (p === 4) { const el = document.createElement('span'); el.textContent = '…'; el.style.cssText = 'color:var(--text2);padding:0 4px'; pgNums.appendChild(el); }
        continue;
      }
      const btn = document.createElement('span');
      btn.className = 'pg-num' + (p === STATE.currentPage ? ' active' : '');
      btn.textContent = p;
      btn.addEventListener('click', () => { STATE.currentPage = p; renderTransactionTable(); });
      pgNums.appendChild(btn);
    }
  }
}

function bindTableControls() {
  const search = document.getElementById('txnSearch');
  if (search) search.addEventListener('input', e => { STATE.searchTerm = e.target.value; STATE.currentPage = 1; renderTransactionTable(); });

  const filter = document.getElementById('statusFilter');
  if (filter) filter.addEventListener('change', e => { STATE.filterStatus = e.target.value; STATE.currentPage = 1; renderTransactionTable(); });

  const refresh = document.getElementById('refreshBtn');
  if (refresh) refresh.addEventListener('click', () => {
    generateTransactions(120);
    renderTransactionTable();
    renderKPIs();
    showToast('Transaction data refreshed.', 'cyan');
  });

  const pgPrev = document.getElementById('pgPrev');
  if (pgPrev) pgPrev.addEventListener('click', () => { if (STATE.currentPage > 1) { STATE.currentPage--; renderTransactionTable(); } });

  const pgNext = document.getElementById('pgNext');
  if (pgNext) pgNext.addEventListener('click', () => {
    const pages = Math.ceil(STATE.transactions.length / STATE.rowsPerPage);
    if (STATE.currentPage < pages) { STATE.currentPage++; renderTransactionTable(); }
  });

  document.querySelectorAll('.txn-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (STATE.sortCol === col) STATE.sortDir = STATE.sortDir === 'asc' ? 'desc' : 'asc';
      else { STATE.sortCol = col; STATE.sortDir = 'asc'; }
      renderTransactionTable();
    });
  });
}

/* ══════════════════════════════════════════════
   USERS TABLE
══════════════════════════════════════════════ */
function renderUsersTable() {
  const tbody = document.getElementById('usersBody');
  if (!tbody) return;
  const users = generateUsers();
  tbody.innerHTML = '';
  users.forEach(u => {
    const riskColor = u.risk < 40 ? 'var(--green)' : u.risk < 70 ? 'var(--orange)' : 'var(--red)';
    const statusBadge = u.status === 'active' ? 'badge-safe' : u.status === 'flagged' ? 'badge-suspicious' : 'badge-fraud';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family:monospace;font-size:0.78rem;color:var(--cyan)">${u.id}</td>
      <td style="font-weight:600">${u.name}</td>
      <td style="color:var(--text2);font-size:0.78rem">${u.email}</td>
      <td>${u.country}</td>
      <td>${u.txns.toLocaleString()}</td>
      <td style="color:${riskColor};font-weight:700">${u.risk}</td>
      <td><span class="badge badge-${u.flags > 3 ? 'fraud':'suspicious'}">${u.flags} flags</span></td>
      <td><span class="badge ${statusBadge}">${u.status.toUpperCase()}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

/* ══════════════════════════════════════════════
   REPORTS
══════════════════════════════════════════════ */
function bindReports() {
  const exportCsv = document.getElementById('exportCsv');
  if (exportCsv) exportCsv.addEventListener('click', () => {
    const headers = ['ID','User','Amount','Location','Device','IP','Time','Risk','Status'];
    const rows = STATE.transactions.map(t => [t.id,t.user,t.amount,t.location,t.device,t.ip,t.time,t.risk,t.status]);
    let csv = headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'aegis_transactions.csv'; a.click();
    URL.revokeObjectURL(url);
    showReportToast('<i class="fa-solid fa-check"></i> CSV exported successfully!');
  });

  const exportPdf = document.getElementById('exportPdf');
  if (exportPdf) exportPdf.addEventListener('click', () => { showReportToast('<i class="fa-solid fa-check"></i> PDF report generated — opening in new tab (simulated).'); });

  const exportXls = document.getElementById('exportXls');
  if (exportXls) exportXls.addEventListener('click', () => { showReportToast('<i class="fa-solid fa-check"></i> Excel workbook queued for download (simulated).'); });

  const schedule = document.getElementById('scheduleReport');
  if (schedule) schedule.addEventListener('click', () => { showReportToast('<i class="fa-solid fa-check"></i> Report schedule saved — daily at 08:00 UTC.'); });
}

function showReportToast(html) {
  const t = document.getElementById('reportToast');
  if (!t) return;
  t.innerHTML = html;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 4000);
}

/* ══════════════════════════════════════════════
   SETTINGS
══════════════════════════════════════════════ */
function bindSettings() {
  const range = document.getElementById('thresholdRange');
  const val   = document.getElementById('thresholdVal');
  if (range && val) range.addEventListener('input', () => { val.textContent = range.value + '%'; });
}

/* ══════════════════════════════════════════════
   NOTIFICATIONS
══════════════════════════════════════════════ */
function bindNotifications() {
  const list = document.getElementById('notifList');
  const notifs = [
    { color:'var(--red)',   title:'Fraud Alert', text:'High-value transfer flagged for alex.martinez' },
    { color:'var(--orange)',title:'Suspicious Login', text:'Unrecognized device login for priya.sharma' },
    { color:'var(--cyan)',  title:'AI Engine Update', text:'Model retrained — accuracy improved to 96.2%' },
    { color:'var(--green)', title:'Report Ready', text:'Weekly fraud summary ready for download' },
  ];
  if (!list) return;
  notifs.forEach(n => {
    const el = document.createElement('div');
    el.className = 'notif-item';
    el.innerHTML = `<span class="notif-dot" style="background:${n.color};box-shadow:0 0 6px ${n.color}"></span><div class="notif-text"><strong>${n.title}</strong>${n.text}</div>`;
    list.appendChild(el);
  });

  const clear = document.getElementById('clearNotif');
  if (clear) clear.addEventListener('click', e => {
    e.stopPropagation();
    if (list) list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2);font-size:0.82rem">No notifications</div>';
    const cnt = document.getElementById('notifCount');
    if (cnt) cnt.style.display = 'none';
  });
}

/* ══════════════════════════════════════════════
   CHATBOT
══════════════════════════════════════════════ */
function bindChatbot() {
  const fab   = document.getElementById('chatFab');
  const panel = document.getElementById('chatPanel');
  const close = document.getElementById('chatClose');
  const send  = document.getElementById('chatSend');
  const input = document.getElementById('chatInput');

  if (fab) fab.addEventListener('click', () => { if(panel){panel.classList.toggle('hidden'); if(!panel.classList.contains('hidden')) appendBotGreeting();}});
  if (close) close.addEventListener('click', () => { if(panel) panel.classList.add('hidden'); });

  if (send) send.addEventListener('click', sendChat);
  if (input) input.addEventListener('keydown', e => { if(e.key==='Enter') sendChat(); });

  document.querySelectorAll('.sug-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      const map = { today:'Show today\'s frauds', risk:'Highest risk users', report:'Generate report', suspicious:'Show suspicious transactions' };
      if(input) input.value = map[cmd] || cmd;
      sendChat();
    });
  });
}

let botGreeted = false;
function appendBotGreeting() {
  if (botGreeted) return;
  botGreeted = true;
  appendBotMsg('Hello! I\'m AEGIS AI — your fraud intelligence assistant. Ask me anything or use the quick commands below.');
}

function sendChat() {
  const input = document.getElementById('chatInput');
  if (!input || !input.value.trim()) return;
  const text = input.value.trim();
  input.value = '';
  appendUserMsg(text);
  showTyping();
  setTimeout(() => {
    removeTyping();
    appendBotMsg(getBotResponse(text));
  }, 900 + Math.random() * 600);
}

function getBotResponse(text) {
  const t = text.toLowerCase();
  if (t.includes('today') || t.includes('fraud')) {
    const fraud = STATE.transactions.filter(t=>t.status==='fraud');
    return `Today's fraud count: <strong>${fraud.length}</strong> transactions flagged. Total exposure: <strong>$${fraud.reduce((a,b)=>a+b.amount,0).toLocaleString()}</strong>. AI confidence: 94.7%.`;
  }
  if (t.includes('risk') || t.includes('user')) {
    return `Highest risk users right now: <strong>omar.hassan</strong> (Risk: 96), <strong>mei.chen</strong> (Risk: 92), <strong>alex.martinez</strong> (Risk: 88). I recommend secondary verification for all three.`;
  }
  if (t.includes('report')) {
    return `Report generation initiated. Summary: ${STATE.transactions.length} total transactions, ${STATE.transactions.filter(t=>t.status==='fraud').length} fraud cases, $${STATE.transactions.filter(t=>t.status==='fraud').reduce((a,b)=>a+b.amount,0).toLocaleString()} at risk. Navigate to Reports to export.`;
  }
  if (t.includes('suspicious')) {
    const susp = STATE.transactions.filter(t=>t.status==='suspicious');
    return `Found <strong>${susp.length}</strong> suspicious transactions. Top one: <strong>${susp[0]?.id}</strong> by ${susp[0]?.user} — $${susp[0]?.amount} from ${susp[0]?.location}. Recommend manual review.`;
  }
  if (t.includes('hello') || t.includes('hi')) return 'Hello! How can I assist with fraud analysis today?';
  if (t.includes('help')) return 'I can: show fraud stats, identify risky users, generate reports, or analyze suspicious activity. Just ask!';
  return `Analyzing query: <em>"${text}"</em>... Based on current data patterns, I recommend reviewing the latest high-risk flagged transactions. AI engine confidence: ${randomInt(85,98)}%.`;
}

function appendUserMsg(text) {
  const body = document.getElementById('chatBody');
  if (!body) return;
  const el = document.createElement('div');
  el.className = 'chat-msg user';
  el.textContent = text;
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
}

function appendBotMsg(html) {
  const body = document.getElementById('chatBody');
  if (!body) return;
  const el = document.createElement('div');
  el.className = 'chat-msg bot';
  el.innerHTML = html;
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
}

function showTyping() {
  const body = document.getElementById('chatBody');
  if (!body) return;
  const el = document.createElement('div');
  el.className = 'chat-msg bot chat-typing';
  el.id = 'typingIndicator';
  el.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

/* ══════════════════════════════════════════════
   AUTO-REFRESH
══════════════════════════════════════════════ */
function startAutoRefresh() {
  STATE.autoRefreshInterval = setInterval(() => {
    /* Add a new transaction */
    const newTxn = generateTransaction(0);
    STATE.transactions.unshift(newTxn);
    if (STATE.transactions.length > 200) STATE.transactions.pop();
    renderTransactionTable();
    renderKPIs();

    /* Occasionally push a new alert */
    if (Math.random() < 0.3) {
      const types = ['critical','warning','info'];
      const icons = { critical: ['fa-triangle-exclamation','fa-fire','fa-skull-crossbones'], warning:['fa-bolt-lightning','fa-mobile-screen-button'], info:['fa-microchip','fa-circle-info'] };
      const type = randomPick(types);
      const icon = randomPick(icons[type]);
      const newAlert = {
        type, icon,
        title: randomPick(['New Fraud Detected','Suspicious Activity','High Risk Login','Device Mismatch','Rapid Burst']),
        desc: `Auto-detected: ${newTxn.user} — $${newTxn.amount} from ${newTxn.location}`,
        time: 'Just now',
      };
      STATE.alerts.unshift(newAlert);
      if (STATE.alerts.length > 20) STATE.alerts.pop();
      if (type === 'critical') STATE.alertCount++;
      renderAlerts();
      renderAlertsPage();
      updateAlertBadge();
    }

    /* Update fraud meter slightly */
    const fraud = STATE.transactions.filter(t=>t.status==='fraud').length;
    const pct = Math.round((fraud / STATE.transactions.length) * 100);
    renderFraudMeter(pct);
  }, 5000);
}

/* ══════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════ */
function showToast(msg, type='cyan') {
  const el = document.getElementById('toastNotif');
  if (!el) return;
  const colorMap = { cyan:'var(--cyan)', red:'var(--red)', green:'var(--green)' };
  el.innerHTML = `<i class="fa-solid fa-circle-check" style="color:${colorMap[type]||colorMap.cyan};margin-right:8px"></i>${msg}`;
  el.style.borderLeftColor = colorMap[type]||colorMap.cyan;
  el.style.borderLeft = '3px solid ' + (colorMap[type]||colorMap.cyan);
  el.classList.remove('hidden');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.classList.add('hidden'), 3500);
}

/* ══════════════════════════════════════════════
   SESSION TIMEOUT SIMULATION
══════════════════════════════════════════════ */
function startSessionTimeout() {
  setTimeout(() => {
    showToast('Session expiring in 5 minutes due to inactivity.', 'red');
  }, 25 * 60 * 1000);
}

/* ══════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  bindLoginEvents();
  bindTableControls();
  runLoader();
});
socket.on("newAlert", (data) => {

    console.log(data);

    const alertsContainer =
        document.getElementById("alertsScroll");

    if (!alertsContainer) return;

    const div = document.createElement("div");

    div.className = "alert-item critical";

    div.innerHTML = `
        <div class="alert-icon">
            <i class="fa-solid fa-triangle-exclamation"></i>
        </div>

        <div class="alert-body">
            <div class="alert-title">
                ${data.title}
            </div>

            <div class="alert-desc">
                ${data.desc} - $${data.amount}
            </div>
        </div>

        <div class="alert-time">
            ${data.time}
        </div>
    `;

    alertsContainer.prepend(div);

});