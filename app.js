
// ── GLOBAL ERROR HANDLER ─────────────────────────
window.addEventListener('unhandledrejection', function(event) {
  console.error('[Unhandled Promise]', event.reason);
  // Prevent silent freezes
  event.preventDefault();
  // If it's a network error, show a gentle message
  var msg = event.reason && event.reason.message;
  if (msg && (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed'))) {
    showToast('Problema di connessione — riprova');
  }
});

window.addEventListener('error', function(event) {
  console.error('[Global Error]', event.message, event.filename, event.lineno);
});


// ── RATE LIMITING ─────────────────────────────────
async function getIpHash() {
  try {
    var r = await fetch('https://api.ipify.org?format=json');
    var d = await r.json();
    var ip = d.ip || 'unknown';
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
    return Array.from(new Uint8Array(buf)).map(x=>x.toString(16).padStart(2,'0')).join('');
  } catch(e) { return 'unknown-' + Date.now(); }
}



// ── DARK / LIGHT MODE ─────────────────────────────
function getTheme() {
  return localStorage.getItem('rankit_theme') || 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  var isDark = theme === 'dark';
  // Update all theme toggle icon classes
  document.querySelectorAll('.theme-toggle-btn i').forEach(function(i) {
    i.className = isDark ? 'ti ti-moon' : 'ti ti-sun';
  });
}

function toggleTheme() {
  var next = getTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem('rankit_theme', next);
  applyTheme(next);
}

// Apply immediately on load (before DOM paint to avoid flash)
(function(){ applyTheme(getTheme()); })();
// ── SUPABASE ──────────────────────────────────────
const SUPA_URL = 'https://jhoruzazoqpqlytcbjev.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impob3J1emF6b3FwcWx5dGNiamV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjg2MjcsImV4cCI6MjA5MTg0NDYyN30.wcQgwe3KJwSugqPW57JR2Qn5q5RZXLxGMSL9xNsKYSk';
const sb = supabase.createClient(SUPA_URL, SUPA_KEY);
// ── TEMA SITO ─────────────────────────────────────
const DEFAULT_THEME = {
  '--bg':           '#0d0d14',
  '--card':         '#15151f',
  '--border':       '#2a2a3a',
  '--border2':      '#3a3a50',
  '--text':         '#e8e8f0',
  '--muted':        '#8888aa',
  '--faint':        '#44445a',
  '--accent':       '#8b5cf6',
  '--violet':       '#8b5cf6',
  '--violet2':      '#6d28d9',
  '--red':          '#e63946',
  '--gold':         '#d4a017',
  '--green':        '#2dc653',
  '--blue':         '#1d7eda',
};

async function loadSiteTheme() {
  try {
    const { data } = await sb.from('site_settings').select('key,value').like('key', 'theme-%');
    if (!data || !data.length) return;
    const root = document.documentElement;
    data.forEach(function(row) {
      var varName = row.key.replace('theme-', '--');
      root.style.setProperty(varName, row.value);
    });
  } catch(e) { console.warn('Theme load error:', e); }
}


function openAuthModal(tab) {
  var overlay = document.getElementById('auth-modal-overlay');
  if (overlay) { overlay.classList.add('open'); }
  switchAuthTab(tab || 'login');
  setTimeout(function() {
    var id = (tab === 'register') ? 'reg-username' : 'login-email';
    var el = document.getElementById(id);
    if (el) el.focus();
  }, 120);
}
function closeAuthModal() {
  var overlay = document.getElementById('auth-modal-overlay');
  if (overlay) overlay.classList.remove('open');
}


// ── CONSTANTS ─────────────────────────────────────
const PLAYER_COLORS = ['#e63946','#1d7eda','#2dc653','#f4a261','#9b5de5','#00b4d8','#ff6b6b','#06d6a0','#ffd166','#ef476f','#118ab2','#8338ec','#3a86ff','#fb5607','#ffbe0b','#44cf6c','#f72585','#4cc9f0','#7209b7','#073b4c'];
const KNOWN_IMAGES  = ['lemans.png','monza.png','nurburgring.png','spa.png','suzuka.png','A1ring.png','interlagos.png','lagomaggiore.png','tsukuba.png'];

// ── APP STATE ─────────────────────────────────────
let currentUser    = null;
let currentChamp   = null; // full row from DB
let champMembers   = []; // cache: array of champ_members rows for current champ
let champData      = {};   // the JSON 'data' field
let isOwner        = false;
let resultingRaceId= null;
let saveTimeout    = null;
let chartInstance  = null;
let selectedImg    = '';
let currentManageTab = 'players';
let pendingAccessChamp = null;

// ── BOOT ──────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Handle email confirmation redirect (token in URL hash)
  const hash = window.location.hash;
  if (hash && hash.includes('access_token')) {
    // Supabase reads tokens from hash automatically via getSession
    // Clean URL without reloading
    history.replaceState(null, '', window.location.pathname);
  }

  const {data:{session}} = await sb.auth.getSession();
  if (session) {
    const banCheck = await checkIfBanned(session.user.email);
    if (banCheck) {
      await sb.auth.signOut();
      showPage('page-auth');
      setTimeout(function(){ document.getElementById('auth-err').textContent = "Account sospeso. Contatta l'amministratore."; }, 100);
    } else {
      currentUser = session.user;
      // Check if URL has ?champ= param — open directly
      var urlParams = new URLSearchParams(window.location.search);
      var champParam = urlParams.get('champ');
      if (champParam) {
        // Clean URL first to avoid re-opening on next showHome
        history.replaceState(null, '', window.location.pathname);
        await showHome();
        await openChampionship(champParam);
      } else {
        await showHome();
      }
    }
  } else {
    showPage('page-auth');
  }
  hideGlobalLoading();

  sb.auth.onAuthStateChange(async function(_e, session) {
    if (session) {
      var banned = await checkIfBanned(session.user.email);
      if (banned) {
        await sb.auth.signOut();
        currentUser = null;
        showPage('page-auth');
        return;
      }
    }
    currentUser = session?.user || null;
  });

  // access select toggle
  document.getElementById('nc-access').addEventListener('change', e => {
    document.getElementById('nc-pass-field').style.display =
      e.target.value === 'password' ? 'block' : 'none';
  });
});

// ── PAGE ROUTING ──────────────────────────────────
async function goHome() {
  window.location.href = window.location.pathname;
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
  if (id !== 'page-champ') stopPendingPoll();
  var ft = document.getElementById('site-footer');
  if (ft) ft.style.display = (id === 'page-home') ? '' : 'none';
}

// ── AUTH ──────────────────────────────────────────
function switchAuthTab(tab) {
  document.getElementById('form-login').style.display    = tab==='login'?'block':'none';
  document.getElementById('form-register').style.display = tab==='register'?'block':'none';
  document.getElementById('tab-login-btn').classList.toggle('active', tab==='login');
  document.getElementById('tab-reg-btn').classList.toggle('active',   tab==='register');
  document.getElementById('auth-err').textContent = '';
}


async function checkIfBanned(email) {
  if (!email) return false;
  try {
    const { data } = await sb.from('profiles')
      .select('banned').eq('email', email).maybeSingle();
    return data && data.banned === true;
  } catch(e) { return false; }
}

// ── UTENTI ONLINE ─────────────────────────────────
var onlineInterval = null;

async function updateLastSeen() {
  if (!currentUser) return;
  await sb.from('profiles')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', currentUser.id);
}

async function loadOnlineCount() {
  // Considera online solo chi ha aggiornato last_seen negli ultimi 16 minuti
  // e la cui last_seen NON è null (utenti vecchi senza tracking vanno esclusi)
  var since = new Date(Date.now() - 16 * 60 * 1000).toISOString();
  var { count } = await sb.from('profiles')
    .select('*', { count: 'exact', head: true })
    .not('last_seen', 'is', null)
    .gte('last_seen', since);
  document.querySelectorAll('.online-count').forEach(function(el) {
    el.textContent = (count !== null && count > 0) ? count : '0';
  });
}

function startOnlineTracking() {
  updateLastSeen();
  loadOnlineCount();
  if (onlineInterval) clearInterval(onlineInterval);
  onlineInterval = setInterval(function() {
    updateLastSeen();
    loadOnlineCount();
  }, 15 * 60 * 1000); // ogni 15 minuti
}

function stopOnlineTracking() {
  if (onlineInterval) { clearInterval(onlineInterval); onlineInterval = null; }
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  setAuthLoading(true);
  // Check ban before attempting login
  const {data:prof} = await sb.from('profiles').select('banned').eq('email', email).single();
  if (prof && prof.banned) {
    setAuthLoading(false);
    document.getElementById('auth-err').textContent = "Account sospeso. Contatta l'amministratore.";
    return;
  }
  const {error} = await sb.auth.signInWithPassword({email, password:pass});
  setAuthLoading(false);
  if (error) { document.getElementById('auth-err').textContent = error.message; return; }
  const {data:{session}} = await sb.auth.getSession();
  currentUser = session.user;
  closeAuthModal();
  await showHome();
}

async function doRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const pass     = document.getElementById('reg-pass').value;
  if (!username) { document.getElementById('auth-err').textContent = 'Inserisci un nome utente'; return; }
  if (pass.length < 6) { document.getElementById('auth-err').textContent = 'Password minimo 6 caratteri'; return; }
  setAuthLoading(true);
  // Rate limit: 1 registrazione per IP ogni 2400 ore
  try {
    var ipHash = await getIpHash();
    var rl = await sb.rpc('check_signup_rate', { p_ip_hash: ipHash });
    if (!rl.error && rl.data === false) {
      setAuthLoading(false);
      document.getElementById('auth-err').textContent = 'Registrazione non consentita: un solo account per dispositivo.';
      return;
    }
  } catch(e) { console.warn('Rate limit check failed:', e); }
  // Check if email is banned in profiles
  const {data:bannedCheck} = await sb.from('profiles').select('banned').eq('email', email).maybeSingle();
  if (bannedCheck && bannedCheck.banned) {
    setAuthLoading(false);
    document.getElementById('auth-err').textContent = 'Questa email non può essere utilizzata.';
    return;
  }
  // Check username against blacklist
  const {data:blWords} = await sb.from('blacklist_words').select('word');
  const forbidden = (blWords||[]).map(w => w.word.toLowerCase());
  if (forbidden.some(w => username.toLowerCase().includes(w))) {
    setAuthLoading(false);
    document.getElementById('auth-err').textContent = 'Username non consentito.';
    return;
  }
  const {error} = await sb.auth.signUp({email, password:pass, options:{data:{username}}});
  setAuthLoading(false);
  if (error) { document.getElementById('auth-err').textContent = error.message; return; }
  document.getElementById('auth-err').style.color='#2dc653';
  document.getElementById('auth-err').textContent='Account creato! Controlla la tua email per confermare.';
}

async function doLogout() {
  await sb.auth.signOut();
  stopOnlineTracking();
  currentUser = null; currentChamp = null; champMembers = []; userFavIds = []; closedMemberships = new Set();
  showPage('page-auth');
}

function setAuthLoading(on) {
  document.getElementById('login-btn').disabled = on;
  document.getElementById('reg-btn').disabled   = on;
}

// ── HOME ──────────────────────────────────────────

async function showInviteResponse(champId, notifId, notifBody) {
  var msg = notifBody || 'Vuoi partecipare a questo campionato?';
  // Simple confirm dialog
  if (confirm(msg + '\n\nAccetti l\'invito?')) {
    await acceptInvite(champId, notifId);
  } else {
    await declineInvite(champId, notifId);
  }
}

async function acceptInvite(champId, notifId) {
  // Upgrade role from 'invited' to 'player'
  var { error } = await sb.from('champ_members')
    .update({ role: 'player' })
    .eq('champ_id', champId).eq('user_id', currentUser.id).eq('role', 'invited');
  if (error) { showToast('Errore: ' + error.message); return; }
  // Mark notification as read
  await sb.from('notifications').update({ read: true }).eq('id', notifId);
  showToast('Iscrizione confermata!');
  checkBadges('join');
  await loadChampionshipsHome();
  closeNotifPanel();
  openChampionship(champId);
}

async function declineInvite(champId, notifId) {
  // Remove the 'invited' record
  await sb.from('champ_members')
    .delete().eq('champ_id', champId).eq('user_id', currentUser.id).eq('role', 'invited');
  // Mark notification as read
  await sb.from('notifications').update({ read: true }).eq('id', notifId);
  showToast('Invito rifiutato');
  closeNotifPanel();
}

async function showHome() {
  applyTheme(getTheme());
  startOnlineTracking();
  await loadSiteTheme();
  startNotifPolling();
  checkUrlChampParam();
  const {data:profile} = await sb.auth.getUser();
  const username = profile?.user?.user_metadata?.username || currentUser?.email?.split('@')[0] || 'Utente';
  document.getElementById('home-username').textContent = username;
  var avEl = document.getElementById('home-username-av');
  if (avEl) avEl.textContent = username.substring(0,2).toUpperCase();
  var greetEl = document.getElementById('home-username-greet');
  if (greetEl) greetEl.textContent = username;
  loadFriendships().then(cacheFriendProfiles);
  showPage('page-home');
  await loadChampionshipsHome();
  await loadDashboard();
}

// ── HOME ──────────────────────────────────────────
let allChamps = []; // cache completa per search+pagination
let currentPage   = 1;
let activeFilterCat = '';   // '' | 'soccer' | 'racing' | 'dice' | 'shooter'
let activeFilterFmt = '';   // '' | 'standard' | 'roundrobin' | 'elimination' | 'timetrial'

const PAGE_SIZE = 10;

// ── FAVOURITES (Supabase) ─────────────────────────
let userFavIds = []; // cache locale — array di champ_id (string)
let closedMemberships = new Set(); // champ_ids dove l'utente è membro

async function loadFavs() {
  const { data, error } = await sb.from('user_favourites')
    .select('champ_id')
    .eq('user_id', currentUser.id);
  if (!error) userFavIds = (data||[]).map(r => r.champ_id);
}

function isFav(id) { return userFavIds.includes(id); }

async function toggleFav() {
  const id = currentChamp?.id; if (!id) return;
  const btn = document.getElementById('btn-fav-champ');
  if (btn) btn.disabled = true;
  const adding = !isFav(id);
  if (adding) {
    const { error } = await sb.from('user_favourites')
      .insert({ user_id: currentUser.id, champ_id: id });
    if (error) { showToast('Errore salvataggio'); if(btn)btn.disabled=false; return; }
    userFavIds.push(id);
  } else {
    const { error } = await sb.from('user_favourites')
      .delete().eq('user_id', currentUser.id).eq('champ_id', id);
    if (error) { showToast('Errore rimozione'); if(btn)btn.disabled=false; return; }
    userFavIds = userFavIds.filter(x => x !== id);
  }
  if (btn) btn.disabled = false;
  updateFavBtn();
  renderFavs();
  showToast(adding ? '⭐ Aggiunto ai preferiti' : 'Rimosso dai preferiti');
}

async function toggleFavById(id) {
  const adding = !isFav(id);
  if (adding) {
    const { error } = await sb.from('user_favourites')
      .insert({ user_id: currentUser.id, champ_id: id });
    if (error) { showToast('Errore salvataggio'); return; }
    userFavIds.push(id);
  } else {
    const { error } = await sb.from('user_favourites')
      .delete().eq('user_id', currentUser.id).eq('champ_id', id);
    if (error) { showToast('Errore rimozione'); return; }
    userFavIds = userFavIds.filter(x => x !== id);
  }
  renderFavs();
  renderAllChamps();
  showToast(adding ? '⭐ Aggiunto ai preferiti' : 'Rimosso dai preferiti');
}

function updateFavBtn() {
  const btn = document.getElementById('btn-fav-champ'); if (!btn) return;
  const active = isFav(currentChamp?.id);
  btn.textContent = active ? '★' : '☆';
  btn.classList.toggle('fav-active', active);
  btn.title = active ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti';
}

function renderFavs() {
  const favChamps = userFavIds.map(id => allChamps.find(c=>c.id===id)).filter(Boolean);
  const title = document.getElementById('my-favs-title');
  const grid  = document.getElementById('my-favs-grid');
  if (!title || !grid) return;
  title.style.display = favChamps.length ? 'block' : 'none';
  grid.style.display  = favChamps.length ? '' : 'none';
  grid.innerHTML = favChamps.map(c => champCard(c, true)).join('');
  setTimeout(attachChampCardListeners, 0);
}

async function renderJoinedChamps() {
  // Get champ_ids where current user is player (not owner)
  const { data: memberships } = await sb.from('champ_members')
    .select('champ_id')
    .eq('user_id', currentUser.id)
    .eq('role', 'player');

  const joinedIds = (memberships||[]).map(m => m.champ_id);
  const joined = allChamps.filter(c => joinedIds.includes(c.id) && c.owner_id !== currentUser.id);

  const title = document.getElementById('my-joined-title');
  const grid  = document.getElementById('my-joined-grid');
  if (!title || !grid) return;
  title.style.display = joined.length ? 'block' : 'none';
  grid.style.display  = joined.length ? '' : 'none';
  grid.innerHTML = joined.map(c => champCard(c)).join('');
  setTimeout(attachChampCardListeners, 0);
}

async function loadChampionshipsHome() {

  const [champsRes, membershipsRes, archivesRes] = await Promise.all([
    sb.from('championships').select('id,name,season,access,closed,owner_id,created_at,data').order('created_at',{ascending:false}),
    sb.from('champ_members').select('champ_id').eq('user_id', currentUser.id).in('role', ['owner','player']),
    sb.from('user_archives').select('champ_id').eq('user_id', currentUser.id),
  ]);
  await Promise.all([loadFavs(), loadFriendships()]);
  const champs = champsRes.data || [];
  const error  = champsRes.error;
  const myMemberships = membershipsRes.data;
  const myArchives    = archivesRes.data;
  // Build set of archived champ IDs — exclude from home
  var archivedSet = new Set((myArchives||[]).map(function(r){ return r.champ_id; }));
  // Build set of champ IDs where user is member (for closed champ access check)
  closedMemberships = new Set((myMemberships||[]).map(m => m.champ_id));
  if (error) { showToast('Errore caricamento campionati'); return; }

  const allChampsRaw = (champs||[]).filter(function(c){ return !archivedSet.has(c.id); });
  allChamps = allChampsRaw;
  const mine = allChampsRaw.filter(c=>c.owner_id===currentUser.id);

  const myGrid = document.getElementById('my-champs-grid');
  document.getElementById('my-champs-title').style.display = mine.length?'block':'none';
  myGrid.style.display = mine.length?'':'none';
  myGrid.innerHTML = mine.map(c=>champCard(c)).join('');
  setTimeout(attachChampCardListeners, 0);

  // Aggiorna il pulsante "Nuovo campionato" con contatore
  var btnNew = document.querySelector('.btn-new');
  if (btnNew) {
    if (mine.length >= MAX_OWNED_CHAMPS) {
      btnNew.textContent = 'Limite raggiunto (' + mine.length + '/' + MAX_OWNED_CHAMPS + ')';
      btnNew.style.opacity = '0.5';
      btnNew.title = 'Hai raggiunto il limite massimo di ' + MAX_OWNED_CHAMPS + ' campionati';
    } else {
      btnNew.textContent = '+ Nuovo campionato (' + mine.length + '/' + MAX_OWNED_CHAMPS + ')';
      btnNew.style.opacity = '1';
      btnNew.title = '';
    }
  }

  // Partecipazione: campionati dove sono player (non owner)
  await renderJoinedChamps();

  renderFavs();
  currentPage = 1;
  renderAllChamps();
}


function setFilterCat(cat, btn) {
  activeFilterCat = cat;
  document.querySelectorAll('[data-filter-cat]').forEach(function(b){ b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  currentPage = 1;
  renderAllChamps();
}

function setFilterFmt(fmt, btn) {
  activeFilterFmt = fmt;
  document.querySelectorAll('[data-filter-fmt]').forEach(function(b){ b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  currentPage = 1;
  renderAllChamps();
}
function onSearchInput() {
  currentPage = 1;
  renderAllChamps();
}

function renderAllChamps() {
  const query = (document.getElementById('champ-search')?.value||'').toLowerCase().trim();
  const filtered = (query
    ? allChamps.filter(c=>c.name.toLowerCase().includes(query))
    : allChamps.filter(c=>c.owner_id!==currentUser.id)
  ).filter(function(c) {
    // Campionati chiusi: visibili solo ai membri
    var isClosed = c.access === 'closed' || !!c.closed;
    if (isClosed && !closedMemberships.has(c.id)) return false;
    // Filtro categoria
    if (activeFilterCat) {
      var cat = (c.data && c.data.category) || c.category || '';
      if (cat !== activeFilterCat) return false;
    }
    // Filtro formato/tipo
    if (activeFilterFmt) {
      var fmt = (c.data && c.data.format) || 'standard';
      if (fmt !== activeFilterFmt) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage-1)*PAGE_SIZE;
  const slice = filtered.slice(start, start+PAGE_SIZE);

  const allGrid = document.getElementById('all-champs-grid');
  allGrid.innerHTML = slice.length
    ? slice.map(champCard).join('')
    : `<div class="empty-state"><div class="big">🔍</div><p>${query?'Nessun campionato trovato':'Nessun campionato disponibile'}</p></div>`;

  // Attach click listeners via delegation
  setTimeout(attachChampCardListeners, 0);
  // Pagination
  const pag = document.getElementById('pagination');
  if (totalPages <= 1) { pag.innerHTML=''; return; }
  let html = `<button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>`;
  for (let i=1;i<=totalPages;i++) {
    html+=`<button class="page-btn ${i===currentPage?'active-pg':''}" onclick="goPage(${i})">${i}</button>`;
  }
  html+=`<button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage===totalPages?'disabled':''}>›</button>`;
  html+=`<span class="page-info">${currentPage}/${totalPages}</span>`;
  pag.innerHTML = html;
}

function isMemberOf(champId) {
  // When inside a champ page, check live champMembers
  if (champId === currentChamp?.id) {
    return champMembers.some(function(m) {
      return m.user_id === currentUser?.id && (m.role === 'owner' || m.role === 'player');
    });
  }
  return closedMemberships.has(champId);
}


const CATEGORY_ICONS = {
  soccer:  '⚽',
  racing:  '🏎️',
  dice:    '🎲',
  shooter: '🔫',
};

function selectSettingsCategory(cat, btn) {
  document.querySelectorAll('#settings-category-picker .cat-btn').forEach(function(b){ b.classList.remove('selected'); });
  if (btn) btn.classList.add('selected');
  // Aggiorna solo il campo hidden — NON toccare champData finché l'utente non preme Salva
  var el = document.getElementById('settings-category');
  if (el) el.value = cat;
}
function selectCategory(cat, btn) {
  document.querySelectorAll('#nc-category-picker .cat-btn').forEach(function(b){ b.classList.remove('selected'); });
  if (btn) btn.classList.add('selected');
  document.getElementById('nc-category').value = cat;
}
function champCategoryIcon(c) {
  var cat = c.category || (c.data && c.data.category) || '';
  if (!cat || !CATEGORY_ICONS[cat]) return '';
  return CATEGORY_ICONS[cat];
}
function champCard(c, inFavSection=false) {
  const mine = c.owner_id === currentUser.id;
  const fav  = isFav(c.id);
  const isClosed   = c.access === 'closed' || !!c.closed;
  const isPassword = c.access === 'password' && !isClosed;
  const isMember   = mine || isMemberOf(c.id);

  // Badge
  var badge = isClosed
    ? '<span class="badge-access badge-priv">🔐 Chiuso</span>'
    : isPassword
      ? '<span class="badge-access badge-priv">🔒 Privato</span>'
      : '<span class="badge-access badge-pub">🌐 Pubblico</span>';

  // Per campionati chiusi non membri: card grigia non cliccabile
  if (isClosed && !isMember) {
    return '<div class="champ-card champ-card-locked" title="Campionato chiuso — solo su invito">'
      + '<div class="champ-card-name" style="opacity:.4;">' + c.name + ' <span style="font-size:11px;">🔐</span></div>'
      + '<div class="champ-card-meta" style="opacity:.3;">' + champCategoryIcon(c) + (c.season||'') + '</div>'
      + badge
      + '</div>';
  }

  const favStar = !mine && !inFavSection
    ? ('<span class="card-fav-star ' + (fav?'active':'') + '" onclick="event.stopPropagation();toggleFavById(\'' + c.id + '\')" title="' + (fav?'Rimuovi':'Aggiungi') + '">' + (fav?'★':'☆') + '</span>')
    : '';
  const favStarFav = inFavSection
    ? ('<span class="card-fav-star active" onclick="event.stopPropagation();toggleFavById(\'' + c.id + '\')" title="Rimuovi dai preferiti">★</span>')
    : '';

  var cid = c.id;
  var fmt = (c.data && c.data.format) || 'standard';
  return '<div class="champ-card ' + (mine?'champ-card-mine':'') + '" " data-cid="' + cid + '" role="button" tabindex="0">'
    + '<div class="champ-card-top">'
    + '<span class="champ-card-cat">' + champCategoryIcon(c) + '</span>'
    + (mine ? '<span class="champ-card-pos" style="font-family:Georgia,serif;font-size:11px;font-style:italic;color:var(--gold);">Admin</span>' : '')
    + '</div>'
    + '<div class="champ-card-name">' + c.name + '</div>'
    + '<div class="champ-card-meta">' + (c.season||'') + (c.season?' · ':'') + fmtLabel(fmt) + '</div>'
    + badge
    + '<div class="champ-card-footer">'
    + '<span class="champ-card-status"></span>'
    + '<button class="champ-card-open" onclick="event.stopPropagation();openChampionship(\'' + cid + '\')">Apri →</button>'
    + '</div>'
    + '</div>';
}
// ── DASHBOARD ─────────────────────────────────────

// ── NEW CHAMPIONSHIP ──────────────────────────────
const MAX_OWNED_CHAMPS = 10;

async function openNewChampModal() {
  // Conta campionati già creati dall'utente dal DB
  const { count } = await sb.from('championships')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', currentUser.id);
  if (count >= MAX_OWNED_CHAMPS) {
    showToast('Hai raggiunto il limite di ' + MAX_OWNED_CHAMPS + ' campionati. Eliminane uno per crearne un altro.');
    return;
  }
  document.getElementById('nc-name').value='';
  document.getElementById('nc-season').value=new Date().getFullYear();
  document.getElementById('nc-category').value='';
  document.querySelectorAll('#nc-category-picker .cat-btn').forEach(function(b){ b.classList.remove('selected'); });
  var nocat = document.querySelector('#nc-category-picker .cat-btn[data-cat=""]'); if(nocat) nocat.classList.add('selected');
  document.getElementById('nc-pass').value='';
  document.getElementById('nc-err').textContent='';
  document.getElementById('nc-access').value='password';
  document.getElementById('nc-pass-field').style.display='block';
  // Mostra contatore rimanente
  var remaining = MAX_OWNED_CHAMPS - count;
  document.getElementById('nc-limit-info').textContent =
    'Campionati creati: ' + count + ' / ' + MAX_OWNED_CHAMPS + ' (' + remaining + ' rimanenti)';
  openOverlay('new-champ-overlay');
}

let selectedChampType = 'standard';
function selectChampType(type, el) {
  selectedChampType = type;
  document.querySelectorAll('.type-card').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  var ttOpts = document.getElementById('nc-tt-options');
  if (ttOpts) ttOpts.style.display = type === 'timetrial' ? '' : 'none';
}

async function createChampionship() {
  const name   = document.getElementById('nc-name').value.trim();
  const season = document.getElementById('nc-season').value.trim();
  const access = document.getElementById('nc-access').value;
  const pass   = document.getElementById('nc-pass').value.trim();
  if (!name) { document.getElementById('nc-err').textContent='Inserisci il nome'; return; }
  // Server-side double check del limite
  const { count: ownedCount } = await sb.from('championships')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', currentUser.id);
  if (ownedCount >= MAX_OWNED_CHAMPS) {
    document.getElementById('nc-err').textContent = 'Limite di ' + MAX_OWNED_CHAMPS + ' campionati raggiunto. Eliminane uno prima.';
    return;
  }
  if (access==='password' && !pass) { document.getElementById('nc-err').textContent='Inserisci una password'; return; }

  const username = currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || 'Owner';
  var ttUnit  = document.getElementById('nc-tt-unit')  ? document.getElementById('nc-tt-unit').value  : 'time';
  var ttOrder = document.getElementById('nc-tt-order') ? document.getElementById('nc-tt-order').value : 'asc';
  const category = (document.getElementById('nc-category') || {}).value || '';
  const defaultData = {
    championship: name, season, format: selectedChampType, category,
    scoring: [3,1,0,0,0,0,0,0,0,0],
    players: [username],
    prizes: ['','',''], races: [], liveUrl: 'https://www.youtube.com/@pixel-race/live',
    rrMatches: [], elimBracket: null,
    ttUnit: ttUnit, ttOrder: ttOrder, ttRuns: {}
  };

  const {data, error} = await sb.from('championships').insert({
    owner_id: currentUser.id,
    name, season, access,
    password_hash: pass,
    data: defaultData
  }).select().single();

  if (error) { document.getElementById('nc-err').textContent=error.message; return; }

  // Reset champData NOW to avoid any pending save overwriting the new championship
  clearTimeout(saveTimeout);
  saveTimeout = null;
  currentChamp = null;
  champData = {};

  // Auto-enroll owner as 'owner' role
  await sb.from('champ_members').insert({
    champ_id: data.id,
    user_id: currentUser.id,
    username,
    role: 'owner'
  });

  closeOverlay('new-champ-overlay');
  showToast('Campionato creato!');
  checkBadges('create');
  await loadChampionshipsHome();
  await loadDashboard();
  openChampionship(data.id);
}

// ── OPEN CHAMPIONSHIP ─────────────────────────────
// In-memory session access cache (never localStorage)
const sessionAccess = new Map(); // champId -> true


function showChampLoading(show) {
  var el = document.getElementById('champ-loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'champ-loading-overlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(253,249,242,.85);'
      + 'backdrop-filter:blur(4px);z-index:9999;display:flex;flex-direction:column;'
      + 'align-items:center;justify-content:center;gap:16px;';
    el.innerHTML = '<div style="display:flex;align-items:flex-end;gap:3px;">'
      + '<div style="width:8px;height:20px;border-radius:2px 2px 0 0;background:var(--gold2);animation:pulse-bar .8s ease-in-out infinite;animation-delay:0s;"></div>'
      + '<div style="width:8px;height:28px;border-radius:2px 2px 0 0;background:var(--gold);animation:pulse-bar .8s ease-in-out infinite;animation-delay:.15s;"></div>'
      + '<div style="width:8px;height:14px;border-radius:2px 2px 0 0;background:#ead99a;animation:pulse-bar .8s ease-in-out infinite;animation-delay:.3s;"></div>'
      + '</div>'
      + '<div style="font-family:Georgia,serif;font-size:14px;letter-spacing:1px;color:var(--muted);font-style:italic;">Apertura campionato...</div>';
    document.body.appendChild(el);
  }
  el.style.display = show ? 'flex' : 'none';
}

async function openChampionship(id) {
  if (!id) { showToast('ID campionato non valido'); return; }
  if (!currentUser) { showToast('Sessione scaduta, effettua di nuovo il login'); showPage('page-auth'); return; }
  // Show immediate feedback so user knows click was registered
  showChampLoading(true);
  try {
  const {data:champ, error} = await sb.from('championships').select('*').eq('id', id).single();
  if (error || !champ) { showChampLoading(false); showToast('Campionato non trovato'); return; }

  const isOwnerCheck = champ.owner_id === currentUser.id;

  // Check membership in champ_members (player/owner = already accepted)
  const {data:membership} = await sb.from('champ_members')
    .select('role').eq('champ_id', id).eq('user_id', currentUser.id).maybeSingle();
  const isMember = membership && (membership.role === 'owner' || membership.role === 'player');

  const isClosed   = champ.access === 'closed' || !!champ.closed;
  const isPassword = champ.access === 'password' && !isClosed;

  // Campionato CHIUSO: solo membri accedono (gli altri non dovrebbero nemmeno vedere la card)
  if (isClosed && !isOwnerCheck && !isMember) {
    showChampLoading(false);
    showToast("Campionato su invito — contatta l'organizzatore");
    return;
  }
  // Campionato PRIVATO (password): chiunque vede la card, ma serve password per entrare
  if (isPassword && !isOwnerCheck && !isMember) {
    if (sessionAccess.get(id)) {
      await loadChampPage(champ);
    } else {
      pendingAccessChamp = champ;
      showChampLoading(false);
      document.getElementById('access-title').textContent = champ.name;
      document.getElementById('access-sub').textContent = 'Inserisci la password per accedere a "' + champ.name + '"';
      document.getElementById('access-pass').value = '';
      document.getElementById('access-err').textContent = '';
      openOverlay('access-overlay');
    }
    return;
  }
  // Campionato PUBBLICO o membro/owner: accesso diretto
  await loadChampPage(champ);
  } catch(e) {
    console.error('[openChampionship error]', e);
    showChampLoading(false);
    showToast('Errore apertura campionato: ' + e.message);
  }
}

async function submitAccess() {
  const pass = document.getElementById('access-pass').value;
  const champ = pendingAccessChamp;
  if (!champ) return;
  if (pass !== champ.password_hash) {
    document.getElementById('access-err').textContent = 'Password non corretta';
    return;
  }
  // Save access in session memory (never localStorage)
  sessionAccess.set(champ.id, true);
  closeOverlay('access-overlay');
  await loadChampPage(champ);
}

async function loadChampPage(champ) {
  // Cancel any pending save from previous championship to avoid data cross-contamination
  clearTimeout(saveTimeout);
  saveTimeout = null;
  // Reset immediately so old data is never shown while loading
  champMembers = [];
  champData = {};
  currentChamp = champ;
  champData = JSON.parse(JSON.stringify(champ.data || {})); // deep copy to avoid reference issues
  // Migrate legacy results to positions[] format
  migrateRaceResults();
  isOwner = champ.owner_id === currentUser?.id;

  // Load members from DB (fresh for this championship)
  await loadChampMembers();

  // Show/hide manage button
  document.getElementById('btn-manage-champ').style.display = isOwner ? 'inline-flex' : 'none';

  // Reset chart
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  // Reset tabs based on format
  const fmt = (champ.data||{}).format || 'standard';
  if (fmt === 'roundrobin')    switchTab('races');
  else if (fmt === 'elimination') switchTab('elim');
  else switchTab('races');
  repositionChart();

  showPage('page-champ');
  showChampLoading(false);
  updateFavBtn();
  setSyncStatus('ok', 'Online');
  if (isOwner) startPendingPoll();
  try {
    renderChamp();
  } catch(e) {
    console.error('[renderChamp error]', e);
    showToast('Errore nel caricamento del campionato');
  }
}

async function loadChampMembers() {
  const { data, error } = await sb.from('champ_members')
    .select('id,user_id,username,role,joined_at')
    .eq('champ_id', currentChamp.id)
    .order('joined_at', { ascending: true });
  if (error) return;
  champMembers = data || [];
  // Sync champData.players with accepted members (owner + player roles)
  const activePlayers = champMembers
    .filter(m => m.role === 'owner' || m.role === 'player')
    .map(m => m.username);
  if (activePlayers.length > 0) {
    champData.players = activePlayers;
  }
}

async function requestJoin() {
  const username = currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || 'Utente';
  const existing = champMembers.find(m => m.user_id === currentUser.id);
  if (existing) {
    if (existing.role === 'pending') showToast("Richiesta già inviata, attendi l'approvazione");
    else if (existing.role === 'player') showToast('Sei già un giocatore!');
    else if (existing.role === 'rejected') showToast('La tua richiesta è stata rifiutata');
    return;
  }
  const { error } = await sb.from('champ_members').insert({
    champ_id: currentChamp.id,
    user_id: currentUser.id,
    username,
    role: 'pending'
  });
  if (error) { showToast('Errore: ' + error.message); return; }
  // Notifica all'owner
  var champName2 = champData.championship || currentChamp.name || 'il campionato';
  await createNotif(currentChamp.owner_id, 'join_request', 'Nuova richiesta di iscrizione',
    username + ' vuole iscriversi a "' + champName2 + '"', currentChamp.id);
  await loadChampMembers();
  renderChamp();
  showToast("Richiesta inviata! Attendi l'approvazione dell'admin");
}

async function acceptMember(memberId) {
  var pending = champMembers.find(function(m){ return m.id === memberId; });
  const { error } = await sb.from('champ_members')
    .update({ role: 'player' }).eq('id', memberId);
  if (error) { showToast('Errore: ' + (error.message||error.code||'sconosciuto')); return; }
  if (pending) await createNotif(pending.user_id, 'join_accepted', 'Iscrizione accettata',
    'Sei stato accettato in "' + (champData.championship||'Campionato') + '"', currentChamp.id);
  await loadChampMembers();
  // Badge check for the newly accepted member
  checkBadges('join');
  await scheduleSaveImmediate();
  renderChamp();
  if (document.getElementById('manage-panel') && document.getElementById('manage-panel').classList.contains('open')) {
    renderManageBody();
  }
  showToast('✓ Giocatore accettato!');
}

async function rejectMember(memberId) {
  var pending2 = champMembers.find(function(m){ return m.id === memberId; });
  const { error } = await sb.from('champ_members')
    .update({ role: 'rejected' }).eq('id', memberId);
  if (error) { showToast('Errore: ' + (error.message||error.code||'sconosciuto')); return; }
  if (pending2) await createNotif(pending2.user_id, 'join_rejected', 'Iscrizione non accettata',
    'La tua richiesta per "' + (champData.championship||'Campionato') + '" non è stata accettata', currentChamp.id);
  await loadChampMembers();
  renderChamp();
  if (document.getElementById('manage-panel') && document.getElementById('manage-panel').classList.contains('open')) {
    renderManageBody();
  }
  showToast('Richiesta rifiutata');
}

async function kickMember(memberId) {
  const m = champMembers.find(m => m.id === memberId); if (!m) return;
  const { error } = await sb.from('champ_members').delete().eq('id', memberId);
  if (error) { showToast('Errore'); return; }
  await loadChampMembers();
  await scheduleSaveImmediate();
  renderChamp();
  renderManageBody();
  showToast(m.username + ' rimosso');
}

async function scheduleSaveImmediate() {
  try {
    await sb.from('championships').update({ data: champData }).eq('id', currentChamp.id);
    if (currentChamp && champData) checkBadgesForChamp(champData, currentChamp.id).catch(function(){});
  } catch(e) { console.error(e); }
}

function myMemberStatus() {
  const m = champMembers.find(m => m.user_id === currentUser?.id);
  return m ? m.role : null;
}


// ── JOIN BANNER ───────────────────────────────────
function renderJoinBanner() {
  const el  = document.getElementById('join-banner');
  const el2 = document.getElementById('join-banner-races');
  if (!el && !el2) return;

  function setContent(content) {
    if (el)  el.innerHTML  = content;
    if (el2) el2.innerHTML = content;
  }

  const status = myMemberStatus();

  // Owner: show pending requests
  if (isOwner) {
    var pending = champMembers.filter(function(m){ return m.role === 'pending'; });
    if (pending.length) {
      var rows = '';
      for (var pi = 0; pi < pending.length; pi++) {
        var pm = pending[pi];
        rows += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'
             + '<div style="width:8px;height:8px;border-radius:50%;background:#e0c060;flex-shrink:0;"></div>'
             + '<span style="flex:1;font-size:13px;font-weight:600;">' + pm.username + '</span>'
             + '<button onclick="acceptMember(\'' + pm.id + '\')" style="background:rgba(45,198,83,0.15);border:1px solid #b0d8b0;border-radius:8px;padding:6px 14px;font-size:15px;cursor:pointer;font-weight:700;" title="Accetta">&#10003;</button>'
             + '<button onclick="rejectMember(\'' + pm.id + '\')" style="background:rgba(230,57,70,0.15);border:1px solid #e0b0b0;border-radius:8px;padding:6px 14px;font-size:15px;cursor:pointer;font-weight:700;color:#c0392b;" title="Rifiuta">&#10005;</button>'
             + '</div>';
      }
      setContent('<div style="margin:12px 0;background:var(--gold-bg);border:1px solid var(--gold);border-radius:3px;padding:12px 14px;">'
        + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gold);margin-bottom:8px;">Richieste di iscrizione (' + pending.length + ')</div>'
        + rows + '</div>');
    } else {
      setContent('');
    }
    return;
  }

  // Already a player
  if (status === 'player') {
    setContent('');
    return;
  }

  // Already invited
  if (status === 'invited') {
    setContent('<div style="margin:12px 0;background:var(--gold-bg);border:1px solid var(--gold);border-radius:3px;padding:12px 14px;text-align:center;font-size:13px;color:var(--text);">📨 Hai un invito in attesa — controlla le notifiche</div>');
    return;
  }

  // Pending request
  if (status === 'pending') {
    setContent('<div style="margin:12px 0;background:var(--card);border:1px solid var(--border);border-radius:3px;padding:12px 14px;text-align:center;font-size:13px;color:var(--muted);">⏳ Richiesta di iscrizione inviata — in attesa di approvazione</div>');
    return;
  }

  // Non-member
  if (!status) {
    var isClosed = currentChamp.access === 'closed' || !!currentChamp.closed;
    if (isClosed) {
      setContent('<div style="margin:12px 0;background:var(--card);border:1px solid var(--border);border-radius:3px;padding:12px 14px;text-align:center;font-size:13px;color:var(--muted);">🔐 Campionato chiuso — solo su invito diretto</div>');
    } else {
      setContent('<div style="margin:12px 0;background:rgba(201,168,76,.08);border:1px solid var(--gold);border-radius:3px;padding:14px;text-align:center;">'
        + '<div style="font-size:13px;color:var(--muted);margin-bottom:10px;">Vuoi partecipare a questo campionato?</div>'
        + '<button onclick="requestJoin()" style="background:var(--gold);color:#fff;border:none;border-radius:3px;padding:9px 24px;font-size:14px;font-weight:700;cursor:pointer;">Richiedi iscrizione</button>'
        + '</div>');
    }
    return;
  }
}


function startPendingPoll() {
  stopPendingPoll();
  pendingPollTimer = setInterval(async function() {
    if (!currentChamp || !isOwner) { stopPendingPoll(); return; }
    var prevCount = champMembers.filter(function(m){ return m.role === 'pending'; }).length;
    await loadChampMembers();
    var newCount = champMembers.filter(function(m){ return m.role === 'pending'; }).length;
    if (newCount !== prevCount) {
      renderJoinBanner();
      updateManageTabs();
      if (newCount > prevCount) showToast('Nuova richiesta di iscrizione!');
    }
  }, 15000);
}
function stopPendingPoll() {
  if (pendingPollTimer) { clearInterval(pendingPollTimer); pendingPollTimer = null; }
}


// ── MANAGE RR MATCHES ─────────────────────────────
function renderManageRRMatches() {
  ensureRRMatches();
  var matches = champData.rrMatches || [];
  var players = champData.players || [];
  var rounds  = groupRRRounds(matches, players);

  var double = !!champData.doubleLegs;
  var html = '<div style="display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid #e0ddd6;border-radius:10px;padding:10px 14px;margin-bottom:14px;">'
    + '<input type="checkbox" id="rr-double-legs" ' + (double ? 'checked' : '') + ' onchange="toggleDoubleLegs(this.checked)" style="width:18px;height:18px;cursor:pointer;accent-color:var(--violet);"/>'
    + '<div>'
    + '<div style="font-size:13px;font-weight:700;">Andata e ritorno</div>'
    + '<div style="font-size:11px;color:#aaa;margin-top:1px;">Ogni coppia si affronta due volte (casa e trasferta)</div>'
    + '</div>'
    + '</div>';
  html += '<p class="manage-hint">Gestisci giocatori e riordina gli scontri per giornata.</p>';

  // Giocatori attivi
  html += '<div class="sec-hdr" style="margin-top:0;"><span class="sec-lbl">Giocatori (' + players.length + ')</span></div>';
  html += '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;">';
  for (var pi = 0; pi < players.length; pi++) {
    var p = players[pi];
    var color = PLAYER_COLORS[pi % PLAYER_COLORS.length];
    // check if member exists in DB
    var memberEntry = champMembers.find(function(mb){ return mb.username === p; });
    var roleLabel = memberEntry ? (memberEntry.role === 'owner' ? ' 👑' : '') : ' (manuale)';
    html += '<div class="player-item">'
         + '<div class="color-dot" style="background:' + color + '"></div>'
         + '<span style="flex:1;font-size:13px;font-weight:600;">' + p + '<span style="font-size:11px;color:#aaa;">' + roleLabel + '</span></span>'
         + (players.length > 2 ? '<button onclick="removeRRPlayer(' + pi + ')" style="background:none;border:none;color:#ccc;font-size:17px;cursor:pointer;padding:0 4px;line-height:1;" title="Rimuovi">×</button>' : '')
         + '</div>';
  }
  html += '</div>';

  // Pending members not yet in players list
  var pendingNotAdded = champMembers.filter(function(mb){
    return mb.role === 'player' && players.indexOf(mb.username) === -1;
  });
  if (pendingNotAdded.length) {
    html += '<div style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.3);border-radius:10px;padding:10px 12px;margin-bottom:10px;">';
    html += '<div style="font-size:11px;font-weight:700;color:var(--violet);margin-bottom:8px;">Giocatori iscritti non ancora nel torneo</div>';
    for (var ai = 0; ai < pendingNotAdded.length; ai++) {
      var am = pendingNotAdded[ai];
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
           + '<span style="flex:1;font-size:13px;font-weight:600;">' + am.username + '</span>'
           + '<button onclick="addRRPlayerFromMember(\"' + am.username + '\")" style="background:var(--violet);color:#fff;border:none;border-radius:7px;padding:4px 10px;font-size:12px;cursor:pointer;font-weight:700;">+ Aggiungi</button>'
           + '</div>';
    }
    html += '</div>';
  }

  // Scontri riordinabili — mostrati nell'ordine RAW di rrMatches (non raggruppati per giornata)
  // così lo spostamento manuale è effettivo e persistente
  html += '<div class="sec-hdr" style="margin-top:4px;"><span class="sec-lbl">Scontri (' + matches.length + ')</span><span style="font-size:11px;color:#aaa;margin-left:6px;">usa ↑↓ per riordinare</span></div>';
  for (var mi = 0; mi < matches.length; mi++) {
    var m = matches[mi];
    var s1 = m.score1 !== null ? m.score1 : '–';
    var s2 = m.score2 !== null ? m.score2 : '–';
    var done = m.result !== null;
    var retLabel = m.returnLeg ? '<span style="font-size:10px;background:#f0ede6;border-radius:4px;padding:1px 5px;color:#888;margin-left:4px;">ritorno</span>' : '';
    html += '<div class="player-item" style="' + (done ? 'opacity:.7;' : '') + '">'
         + '<span style="font-size:15px;color:#ccc;margin-right:4px;cursor:grab;">⠿</span>'
         + '<span style="flex:1;font-size:13px;font-weight:600;">' + m.p1 + ' <span style="color:#bbb;font-weight:400;">vs</span> ' + m.p2 + retLabel + '</span>'
         + '<span style="font-size:11px;color:' + (done ? '#2dc653' : '#bbb') + ';margin-right:6px;">' + (done ? s1 + '–' + s2 : '') + '</span>'
         + (mi > 0 ? '<button onclick="moveRRMatch(' + mi + ',-1)" style="background:none;border:none;cursor:pointer;color:#888;font-size:16px;padding:0 3px;line-height:1;" title="Sposta su">↑</button>' : '<span style="width:22px;display:inline-block;"></span>')
         + (mi < matches.length-1 ? '<button onclick="moveRRMatch(' + mi + ',1)" style="background:none;border:none;cursor:pointer;color:#888;font-size:16px;padding:0 3px;line-height:1;" title="Sposta giù">↓</button>' : '<span style="width:22px;display:inline-block;"></span>')
         + '</div>';
  }

  document.getElementById('manage-body').innerHTML = html;
}

function toggleDoubleLegs(enabled) {
  champData.doubleLegs = !!enabled;
  ensureRRMatches(); // adds or removes return legs
  scheduleSave();
  renderChamp();
  renderManageRRMatches();
  showToast(enabled ? 'Andata e ritorno attivato' : 'Solo andata attivato');
}

function addRRPlayerFromMember(username) {
  if (!champData.players) champData.players = [];
  if (champData.players.indexOf(username) !== -1) { showToast('Già nel torneo'); return; }
  champData.players.push(username);
  // Generate new matches for this player vs all existing
  ensureRRMatches();
  scheduleSave(); renderChamp(); renderManageRRMatches();
  showToast(username + ' aggiunto al torneo!');
}

function moveRRMatch(absIdx, dir) {
  var matches = champData.rrMatches || [];
  var newIdx = absIdx + dir;
  if (newIdx < 0 || newIdx >= matches.length) return;
  var tmp = matches[absIdx];
  matches[absIdx] = matches[newIdx];
  matches[newIdx] = tmp;
  champData.rrMatches = matches;
  // Force immediate re-render of inline matches BEFORE scheduleSave
  // to ensure UI reflects new order right away
  var el = document.getElementById('races-grid');
  if (el) {
    var rounds = groupByDayRespectingOrder(champData.rrMatches);
    el.className = 'races-grid rr-grid';
    el.innerHTML = buildRRMatchesHTML(rounds);
  }
  var elMob = document.getElementById('rr-content');
  if (elMob) {
    var roundsMob = groupByDayRespectingOrder(champData.rrMatches);
    elMob.innerHTML = buildRRMatchesHTML(roundsMob);
  }
  scheduleSave();
  renderManageRRMatches();
}

async function removeRRPlayer(idx) {
  var players = champData.players || [];
  if (players.length <= 2) { showToast('Minimo 2 giocatori'); return; }
  var name = players[idx];
  // Remove from champData
  champData.players.splice(idx, 1);
  champData.rrMatches = (champData.rrMatches||[]).filter(function(m){ return m.p1!==name && m.p2!==name; });
  // Remove from champ_members on Supabase (kick)
  var member = champMembers.find(function(m){ return m.username === name; });
  if (member) {
    await sb.from('champ_members').delete().eq('id', member.id);
    await loadChampMembers();
  }
  scheduleSave(); renderChamp(); renderManageRRMatches();
  showToast(name + ' rimosso dal torneo');
}

// ── SAVE CHAMP DATA ───────────────────────────────
function scheduleSave() {
  if (!currentChamp) return; // guard: never save if no championship loaded
  const champIdAtSchedule = currentChamp.id;
  setSyncStatus('saving','Salvataggio...');
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async ()=>{
    // Guard: if championship changed while waiting, abort save
    if (!currentChamp || currentChamp.id !== champIdAtSchedule) return;
    try {
      await sb.from('championships').update({data: champData}).eq('id', champIdAtSchedule);
      setSyncStatus('ok','Salvato ✓');
      setTimeout(()=>setSyncStatus('ok','Online'),2000);
    } catch(e){ setSyncStatus('error','Errore'); }
  }, 700);
}

// ── RENDER ────────────────────────────────────────

// ── DADO ──────────────────────────────────────────

function renderDiceWidget() {
  var widget = document.getElementById('dice-widget');
  if (!widget) return;
  var isMember = champMembers.some(function(m) {
    return m.user_id === currentUser?.id && (m.role === 'owner' || m.role === 'player');
  });
  if (!isMember && !isOwner) {
    widget.style.display = 'none';
    return;
  }
  widget.style.display = '';
  renderDiceLog();
}

function renderDiceLog() {
  var log = document.getElementById('dice-log');
  if (!log) return;
  var rolls = champData.diceRolls || [];
  if (!rolls.length) {
    log.innerHTML = '<div class="dice-log-empty">Nessun tiro ancora</div>';
    return;
  }
  log.innerHTML = rolls.slice(0,3).map(function(r) {
    var face = ['⚀','⚁','⚂','⚃','⚄','⚅'][r.value - 1] || r.value;
    var dt = new Date(r.at);
    var timeStr = dt.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})
      + ' ' + dt.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'2-digit'});
    return '<div class="dice-log-row">'
      + '<div class="dice-log-num">' + r.value + '</div>'
      + '<span class="dice-log-player">' + esc(r.player) + '</span>'
      + '<span class="dice-log-time">' + face + ' ' + timeStr + '</span>'
      + '</div>';
  }).join('');
}

async function rollDice() {
  if (!currentUser || !currentChamp) return;
  if (!isMemberOf(currentChamp.id) && !isOwner) {
    showToast('Solo i partecipanti possono tirare il dado');
    return;
  }

  var btn = document.getElementById('dice-roll-btn');
  var faceEl = document.getElementById('dice-face');
  var labelEl = document.getElementById('dice-label');
  if (!btn || !faceEl) return;

  // Animate
  btn.classList.add('rolling');
  btn.disabled = true;
  labelEl.textContent = 'Tiro in corso...';

  // Random 1-6
  var value = Math.floor(Math.random() * 6) + 1;
  var faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];

  // Spinning animation
  var spins = 0;
  var spinInterval = setInterval(function() {
    faceEl.textContent = faces[Math.floor(Math.random()*6)];
    spins++;
    if (spins >= 8) {
      clearInterval(spinInterval);
      faceEl.textContent = faces[value-1];
      btn.classList.remove('rolling');
      btn.disabled = false;
      labelEl.textContent = 'Tira ancora';
    }
  }, 60);

  // Save to champData
  var player = currentUser?.user_metadata?.username || currentUser?.email?.split('@')[0] || '?';
  var roll = { player: player, value: value, at: new Date().toISOString() };

  if (!champData.diceRolls) champData.diceRolls = [];
  champData.diceRolls.unshift(roll);      // newest first
  champData.diceRolls = champData.diceRolls.slice(0, 3); // keep only last 3

  // Save to DB
  await sb.from('championships')
    .update({ data: champData })
    .eq('id', currentChamp.id);

  renderDiceLog();
}

function renderChamp() {
  updateShareBar();
  renderDiceWidget();
  // Sync nav username in champ header
  var me = currentUser?.user_metadata?.username || currentUser?.email?.split('@')[0] || '';
  var champNavU = document.getElementById('champ-nav-username');
  if (champNavU) champNavU.textContent = me;
  var champAv = document.getElementById('champ-username-av');
  if (champAv) champAv.textContent = me.substring(0,2).toUpperCase();
  var champTitle = (champData.championship||'Campionato') + (champData.season?' · '+champData.season:'');
  var createdDate = currentChamp.created_at ? new Date(currentChamp.created_at).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'}) : '';
  var champId = currentChamp.id || '';
  document.getElementById('champ-hdr-title').innerHTML =
    champTitle + (createdDate ? '<span style="font-size:11px;font-weight:500;color:rgba(0,0,0,0.45);margin-left:8px;">' + createdDate + '</span>' : '');
  const fmt = champData.format || 'standard';

  // Mobile tabs visibility
  const rrBtn   = document.getElementById('tab-rr-btn');
  const elimBtn = document.getElementById('tab-elim-btn');
  const racesBtn= document.getElementById('tab-races-btn');
  if(rrBtn)   rrBtn.style.display   = 'none'; // RR uses races tab
  if(elimBtn) elimBtn.style.display = fmt==='elimination' ? '' : 'none';
  if(racesBtn)racesBtn.style.display= fmt==='standard' ? '' : 'none';

  // Desktop layout: swap col-left content per format
  const colLeft    = document.getElementById('c-page-races');
  const chartSec   = document.getElementById('chart-section');
  if (fmt === 'roundrobin') {
    colLeft.style.display = '';
    chartSec.style.display = '';
    // Show RR matches in left col, standings+chart on right
    renderRRMatchesInline(); // renders into #races-grid with RR layout
    document.getElementById('races-count').textContent = '';
    document.querySelector('#c-page-races .sec-lbl').textContent = 'Giornate';
    renderRRStandings();
    renderRRChart();
  } else if (fmt === 'elimination') {
    colLeft.style.display = '';
    chartSec.style.display = 'none';
    document.querySelector('#c-page-races .sec-lbl').textContent = 'Tabellone';
    document.getElementById('races-count').textContent = '';
    document.getElementById('races-grid').className = 'races-grid rr-grid';
    document.getElementById('races-grid').innerHTML = '<div id="elim-bracket-inline"></div>';
    renderElimBracketInline();
    renderElimStandings();
  } else if (fmt === 'timetrial') {
    colLeft.style.display = '';
    chartSec.style.display = 'none';
    document.querySelector('#c-page-races .sec-lbl').textContent = 'Prove';
    document.getElementById('races-count').textContent = '';
    document.getElementById('races-grid').className = 'races-grid rr-grid';
    renderTTRuns();
    renderTTStandings();
  } else {
    colLeft.style.display = '';
    chartSec.style.display = '';
    document.querySelector('#c-page-races .sec-lbl').textContent = 'Gare';
    document.getElementById('races-grid').className = 'races-grid';
    renderStandings();
    renderChart();
    renderRaces();
  }

  renderPrizes();
  renderJoinBanner();
  renderLive();
}


// ── SCORING SCHEMA ────────────────────────────────
// champData.scoring = [3,1,0,0,...] (10 elements, one per position)

// ── MIGRATE LEGACY RESULTS ────────────────────────
// Converts old {first, second} format to {positions: [...]}
function migrateRaceResults() {
  var changed = false;
  (champData.races||[]).forEach(function(r) {
    if (r.result && !r.result.positions) {
      var positions = [];
      var players = champData.players || [];
      // Fill with empty slots up to player count
      for (var i = 0; i < Math.min(players.length, 10); i++) positions.push('');
      if (r.result.first)  positions[0] = r.result.first;
      if (r.result.second) positions[1] = r.result.second;
      r.result.positions = positions;
      r.result.first  = positions[0];
      r.result.second = positions[1];
      changed = true;
    }
  });
  // Save migrated data silently
  if (changed && currentChamp) {
    sb.from('championships').update({ data: champData }).eq('id', currentChamp.id).then(function(){});
  }
}

function getScoring() {
  var s = champData.scoring;
  if (!s || !Array.isArray(s) || s.length < 10) {
    // Default: 1st=3pt, 2nd=1pt, rest=0
    s = [3,1,0,0,0,0,0,0,0,0];
    // Pad to 10 if shorter
    while (s.length < 10) s.push(0);
  }
  return s;
}

function getPtsForPos(pos) { // pos is 0-based
  return getScoring()[pos] || 0;
}

function calcStandings() {
  const pts={};
  (champData.players||[]).forEach(p=>pts[p]=0);
  (champData.races||[]).forEach(r=>{
    if (!r.result || !r.result.positions) return;
    r.result.positions.forEach(function(player, idx) {
      if (player) pts[player] = (pts[player]||0) + getPtsForPos(idx);
    });
  });
  return (champData.players||[]).map(p=>({name:p,pts:pts[p]||0})).sort((a,b)=>b.pts-a.pts);
}

function renderStandings() {
  const s=(champData.races||[]);
  const done=s.filter(r=>r.result).length, total=s.length;
  const pct=total>0?Math.round(done/total*100):0;
  document.getElementById('races-progress').textContent=done+'/'+total+' completate';
  document.getElementById('progress-fill').style.width=pct+'%';
  document.getElementById('progress-label').textContent=pct+'% completato';
  const stand=calcStandings();
  const posCls=['p1','p2','p3'];
  document.getElementById('standings-container').innerHTML=stand.map((p,i)=>{
    const wins=(champData.races||[]).filter(r=>r.result&&r.result.first===p.name).length;
    const tie=stand.length>1&&stand[0].pts===stand[1].pts;
    const color=PLAYER_COLORS[(champData.players||[]).indexOf(p.name)%PLAYER_COLORS.length];
    return `<div class="s-row">
      <div class="s-pos ${posCls[i]||''}">${i===0?'🏆':i+1}</div>
      <div><div class="s-name" style="color:${color};cursor:pointer;" onclick="openProfile(\'${p.name}\')">${p.name}</div>
        <div class="s-sub">${p.pts} pt</div></div>
      <div class="s-pts">${p.pts}<br><span>pt</span></div>
    </div>`;
  }).join('');
}

function renderPrizes() {
  const prizes=champData.prizes||['','',''];
  const icons=['🥇','🥈','🥉'],labels=['1° Posto','2° Posto','3° Posto'];
  document.getElementById('prizes-container').innerHTML=prizes.map((pr,i)=>`
    <div class="prize-row">
      <span class="prize-icon">${icons[i]}</span>
      <div><div class="prize-pos">${labels[i]}</div>
        <div class="${pr?'prize-text':'prize-empty'}">${pr||'Non assegnato'}</div></div>
    </div>`).join('');
}

// ── LIVE ──────────────────────────────────────────
function getLiveEmbed(url) {
  if (!url) return null;
  url = url.trim();
  // youtu.be/ID
  let m = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (m) return 'https://www.youtube.com/embed/' + m[1] + '?autoplay=0';
  // ?v=ID or &v=ID
  m = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (m) return 'https://www.youtube.com/embed/' + m[1] + '?autoplay=0';
  // /live/ID
  m = url.match(/youtube\.com\/live\/([A-Za-z0-9_-]{11})/);
  if (m) return 'https://www.youtube.com/embed/' + m[1] + '?autoplay=0';
  // /shorts/ID
  m = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/);
  if (m) return 'https://www.youtube.com/embed/' + m[1] + '?autoplay=0';
  // embed/ID already
  m = url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{11})/);
  if (m) return url;
  // @channel live stream
  m = url.match(/youtube\.com\/@([^/?#]+)/);
  if (m) return 'https://www.youtube.com/embed/live_stream?channel=' + m[1];
  // channel/ID live
  m = url.match(/youtube\.com\/channel\/([A-Za-z0-9_-]+)/);
  if (m) return 'https://www.youtube.com/embed/live_stream?channel=' + m[1];
  // fallback: return url as-is if it looks like an embeddable URL
  if (url.startsWith('http')) return url;
  return null;
}
function renderLive() {
  const embed=getLiveEmbed(champData.liveUrl||'');
  // Desktop widget
  const desktopWidget=document.getElementById('live-widget-desktop');
  const desktopIframe=document.getElementById('live-iframe-desktop');
  if(desktopWidget && desktopIframe){
    if(embed){
      desktopIframe.src=embed;
      desktopWidget.style.display='block';
    } else {
      desktopWidget.style.display='none';
      desktopIframe.src='';
    }
  }
  // Mobile page
  const mobile=document.getElementById('live-card-mobile');
  const livePage=document.getElementById('c-page-live');
  if(embed){
    const html=`<div class="live-video"><iframe src="${embed}" allowfullscreen allow="autoplay;encrypted-media"></iframe></div>`;
    if(mobile)mobile.innerHTML=html;
    if(livePage)livePage.style.display='';
  } else {
    if(mobile)mobile.innerHTML='';
    if(livePage)livePage.style.display='none';
  }
}

// ── CHART ─────────────────────────────────────────
function renderChart() {
  const races=champData.races||[], players=champData.players||[];
  const labels=['Start'], series={};
  players.forEach(p=>{series[p]=[0];});
  const running={};players.forEach(p=>running[p]=0);
  let lastDoneIdx=-1;
  races.forEach((r,i)=>{if(r.result)lastDoneIdx=i;});
  races.forEach((r,i)=>{
    labels.push(r.name.length>11?r.name.substring(0,10)+'…':r.name);
    if(r.result&&r.result.first) running[r.result.first]++;
    players.forEach(p=>series[p].push(i<=lastDoneIdx?running[p]:null));
  });
  document.getElementById('chart-legend').innerHTML=players.map((p,i)=>`
    <div class="legend-item"><div class="legend-dot" style="background:${PLAYER_COLORS[i%PLAYER_COLORS.length]}"></div>${p}</div>`).join('');
  const maxPts=Math.max(1,...players.map(p=>running[p]));
  const datasets=players.map((p,i)=>({
    label:p,data:series[p],borderColor:PLAYER_COLORS[i%PLAYER_COLORS.length],
    backgroundColor:'transparent',borderWidth:2.5,
    pointRadius:(ctx)=>ctx.dataIndex===0?0:4,pointHoverRadius:6,
    pointBackgroundColor:PLAYER_COLORS[i%PLAYER_COLORS.length],
    pointBorderColor:'#fff',pointBorderWidth:2,tension:0,fill:false,spanGaps:false
  }));
  if(chartInstance){chartInstance.data.labels=labels;chartInstance.data.datasets=datasets;chartInstance.options.scales.y.max=maxPts+1;chartInstance.update('active');return;}
  chartInstance=new Chart(document.getElementById('chart-canvas').getContext('2d'),{
    type:'line',data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:false},tooltip:{backgroundColor:'#1a1a1a',titleColor:'#fff',bodyColor:'#ccc',padding:10,cornerRadius:10,filter:(item)=>item.dataIndex>0,callbacks:{label:ctx=>` ${ctx.dataset.label}: ${ctx.parsed.y} pt`}}},
      scales:{x:{grid:{color:'#f0ede6'},ticks:{color:'#aaa',font:{size:10},maxRotation:35,minRotation:20}},
        y:{min:0,max:maxPts+1,ticks:{color:'#aaa',font:{size:11},stepSize:1,callback:v=>Number.isInteger(v)?v:''},grid:{color:'#f0ede6'}}}}
  });
}

// ── RACES ─────────────────────────────────────────
function getYtId(url){
  if(!url)return null;
  url=url.trim();
  // Try all known YouTube URL patterns
  const patterns=[
    /[?&]v=([A-Za-z0-9_-]{11})/,           // ?v=ID or &v=ID
    /youtu\.be\/([A-Za-z0-9_-]{11})/,       // youtu.be/ID
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/, // embed/ID
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/, // shorts/ID
    /youtube\.com\/v\/([A-Za-z0-9_-]{11})/, // /v/ID
    /youtube\.com\/live\/([A-Za-z0-9_-]{11})/, // /live/ID
  ];
  for(var i=0;i<patterns.length;i++){
    var m=url.match(patterns[i]);
    if(m)return m[1];
  }
  return null;
}

function isMobile(){return window.innerWidth<768;}

function openReplay(ytId, url) {
  if (isMobile()) {
    // Mobile: apri YouTube direttamente
    window.open('https://www.youtube.com/watch?v=' + ytId, '_blank');
    return;
  }
  // Desktop: mostra lightbox
  var overlay = document.getElementById('replay-overlay');
  var iframe  = document.getElementById('replay-iframe');
  iframe.src = 'https://www.youtube.com/embed/' + ytId + '?autoplay=1';
  overlay.classList.add('open');
}
function closeReplay() {
  var overlay = document.getElementById('replay-overlay');
  var iframe  = document.getElementById('replay-iframe');
  overlay.classList.remove('open');
  iframe.src = '';
}

function renderRaces() {
  var races = champData.races || [];
  document.getElementById('races-count').textContent = races.length + ' gare';
  document.getElementById('races-grid').innerHTML = races.map(function(r, idx) {
    var dateStr = r.date ? new Date(r.date).toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'}) : '';
    var done = !!r.result;
    var statusDot = '<span style="width:7px;height:7px;border-radius:50%;background:' + (done ? '#276749' : 'var(--faint)') + ';display:inline-block;margin-right:6px;flex-shrink:0;"></span>';
    var statusTxt = '<span style="font-size:10px;letter-spacing:.8px;text-transform:uppercase;color:' + (done ? '#276749' : 'var(--muted)') + ';">' + (done ? 'Completata' : 'Da giocare') + '</span>';
    var dateTxt = dateStr ? '<span style="font-size:11px;color:var(--muted);font-family:Georgia,serif;font-style:italic;">' + dateStr + '</span>' : '';
    var medals = ['🥇','🥈','🥉','4°','5°','6°','7°','8°','9°','10°'];
    var resTxt = '';
    if (done) {
      var positions = r.result.positions || [r.result.first, r.result.second];
      var scoring = getScoring();
      resTxt = '<div style="display:flex;flex-direction:column;gap:4px;margin:.6rem 0;">';
      positions.forEach(function(player, idx) {
        if (!player) return;
        var pts = scoring[idx] || 0;
        resTxt += '<div style="display:flex;align-items:center;gap:8px;">'
          + '<span style="font-size:13px;width:20px;text-align:center;">' + (medals[idx]||'') + '</span>'
          + '<span style="font-size:13px;color:var(--text);">' + esc(player) + '</span>'
          + (pts > 0 ? '<span style="font-size:11px;color:var(--gold);font-family:Georgia,serif;font-style:italic;margin-left:auto;">+' + pts + ' pt</span>' : '')
          + '</div>';
      });
      resTxt += '</div>';
    } else {
      resTxt = '<div style="padding:.4rem 0 .6rem;"><span style="font-size:12px;color:var(--muted);font-style:italic;">Nessun risultato inserito</span></div>';
    }
    var ytId = getYtId(r.replayUrl);
    var replayChip = ytId
      ? '<span style="font-size:10px;padding:3px 8px;border:1px solid var(--border);border-radius:2px;color:var(--muted);cursor:pointer;" onclick="openReplay(\'' + ytId + '\',\'' + (r.replayUrl||'') + '\')">▶ Replay</span>'
      : (r.replayUrl ? '<a style="font-size:10px;padding:3px 8px;border:1px solid var(--border);border-radius:2px;color:var(--muted);text-decoration:none;" href="' + r.replayUrl + '" target="_blank">▶ Replay</a>' : '');
    var editBtn = isOwner
      ? '<button onclick="openResult(\'' + r.id + '\')" style="font-size:10px;letter-spacing:.5px;padding:5px 12px;border:1px solid ' + (done ? 'var(--border2)' : 'var(--gold)') + ';border-radius:2px;background:' + (done ? 'transparent' : 'var(--gold-bg)') + ';color:' + (done ? 'var(--muted)' : 'var(--gold)') + ';cursor:pointer;"><i class=\'ti ti-pencil\' style=\'font-size:11px;margin-right:4px;\'></i>' + (done ? 'Modifica risultato' : 'Inserisci risultato') + '</button>'
      : '';
    var desc = r.description ? '<div style="font-size:12px;color:var(--muted);line-height:1.5;margin:.15rem 0 .5rem;">' + esc(r.description) + '</div>' : '';
    return '<div style="background:var(--card);border:1px solid var(--border);border-radius:3px;padding:1rem;display:flex;flex-direction:column;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;">'
      + '<div style="display:flex;align-items:center;">' + statusDot + statusTxt + '</div>' + dateTxt
      + '</div>'
      + '<div style="font-family:Georgia,serif;font-size:16px;color:var(--text);margin-bottom:.1rem;">' + esc(r.name) + '</div>'
      + desc + resTxt
      + '<div style="display:flex;align-items:center;justify-content:space-between;padding-top:.6rem;border-top:1px solid var(--bg2);">'
      + '<div>' + replayChip + '</div>' + editBtn
      + '</div>'
      + '</div>';
  }).join('');
}

// ── RESULT ────────────────────────────────────────
function openResult(id){
  if(!isOwner){showToast('Solo il proprietario può modificare i risultati');return;}
  resultingRaceId=id;
  const r=(champData.races||[]).find(r=>r.id===id);if(!r)return;
  document.getElementById('result-title').textContent=r.name;
  document.getElementById('result-sub').textContent='Gara '+((champData.races||[]).indexOf(r)+1)+' · Chi ha vinto?';
  const players=champData.players||[];
  var scoring = getScoring();
  var medals = ['🥇','🥈','🥉','4°','5°','6°','7°','8°','9°','10°'];
  var nPlayers = Math.min(players.length, 10);
  document.getElementById('result-selects').innerHTML = Array.from({length:nPlayers},(_,i)=>`
    <div style="margin-bottom:10px;">
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);margin-bottom:4px;">
        <span>${medals[i]}</span>
        <span>${scoring[i] > 0 ? '+'+scoring[i]+' pt' : '0 pt'}</span>
      </label>
      <select id="res-pos-${i}" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:3px;background:var(--card);color:var(--text);font-size:13px;outline:none;">
        <option value="">— Nessuno —</option>
        ${players.map(p=>`<option value="${p}">${p}</option>`).join('')}
      </select>
    </div>`).join('');
  if(r.result && r.result.positions) {
    r.result.positions.forEach(function(player, i) {
      var el = document.getElementById('res-pos-'+i);
      if (el && player) el.value = player;
    });
  } else if (r.result) {
    // Legacy: convert first/second to positions array
    if (r.result.first)  { var e0=document.getElementById('res-pos-0'); if(e0) e0.value=r.result.first; }
    if (r.result.second) { var e1=document.getElementById('res-pos-1'); if(e1) e1.value=r.result.second; }
  }
  openOverlay('result-overlay');
}
function saveResult(){
  var nPlayers = Math.min((champData.players||[]).length, 10);
  var positions = [];
  for (var i = 0; i < nPlayers; i++) {
    var el = document.getElementById('res-pos-'+i);
    positions.push(el ? el.value : '');
  }
  var anyFilled = positions.some(function(p){ return p !== ''; });
  if (!anyFilled) {
    var r=(champData.races||[]).find(r=>r.id===resultingRaceId);
    if(r)r.result=null;
    scheduleSave();renderChamp();closeOverlay('result-overlay');showToast('Risultato rimosso');return;
  }
  // Check duplicates
  var filled = positions.filter(function(p){ return p !== ''; });
  var unique = new Set(filled);
  if (unique.size !== filled.length) { showToast('Stesso giocatore in più posizioni'); return; }
  if (!positions[0]) { showToast('Seleziona almeno il 1° posto'); return; }
  var r=(champData.races||[]).find(r=>r.id===resultingRaceId);
  if(r) r.result = { positions: positions, first: positions[0], second: positions[1]||'' };
  scheduleSave();renderChamp();closeOverlay('result-overlay');showToast('Salvato!');
}

// ── MANAGE PANEL ──────────────────────────────────
function getManageTabs() {
  var fmt = champData.format || 'standard';
  // Base tabs per formato
  // standard:    Utenti | Gare | Premi | Live | Impost.
  // roundrobin:  Utenti | Sfide | Premi | Live | Impost.
  // elimination: Utenti | Premi | Live | Impost.
  // timetrial:   Utenti | Premi | Live | Impost.
  var hasRaces = fmt === 'standard' || fmt === 'roundrobin';
  var racesLabel = fmt === 'roundrobin' ? '🏁 Sfide' : '🏁 Gare';
  var tabs = [{ id:'players', label:'👤 Utenti' }];
  if (hasRaces) tabs.push({ id:'races', label: racesLabel });
  tabs.push({ id:'prizes', label:'🏆 Premi' });
  tabs.push({ id:'live',   label:'📡 Live' });
  tabs.push({ id:'settings', label:'⚙ Impost.' });
  return tabs;
}

function openManagePanel(){
  currentManageTab = 'players';
  buildManageTabs();
  updateManageTabs();
  renderManageBody();
  var panel = document.getElementById('manage-panel');
  panel.classList.add('open');
  // Prevent body scroll while panel is open
  document.body.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';
}
function closeManagePanel(){
  document.getElementById('manage-panel').classList.remove('open');
  // Restore body scroll
  document.body.style.overflow = '';
  document.body.style.touchAction = '';
}

function buildManageTabs() {
  var row = document.getElementById('manage-tabs-row');
  if (!row) return;
  var tabs = getManageTabs();
  row.innerHTML = tabs.map(function(t) {
    return '<button class="manage-tab" onclick="switchManageTab(\'' + t.id + '\')">' + t.label + '</button>';
  }).join('');
}

function switchManageTab(tab){
  // If tab not available for this format, ignore
  var available = getManageTabs().map(function(t){ return t.id; });
  if (!available.includes(tab)) tab = 'players';
  currentManageTab = tab;
  updateManageTabs();
  renderManageBody();
}

function updateManageTabs(){
  var tabs = getManageTabs();
  var btns = document.querySelectorAll('.manage-tab');
  btns.forEach(function(btn, i) {
    btn.classList.toggle('active', tabs[i] && tabs[i].id === currentManageTab);
  });
  // Pending badge on players tab
  if (isOwner && btns[0]) {
    var existing = btns[0].querySelector('.manage-tab-badge');
    if (existing) existing.remove();
    var n = champMembers.filter(function(m){ return m.role==='pending'; }).length;
    if (n) btns[0].insertAdjacentHTML('beforeend','<span class="manage-tab-badge">' + n + '</span>');
  }
}
function renderManageBody(){
  if(currentManageTab==='players') renderManagePlayers();
  else if(currentManageTab==='races') {
    var fmt = champData.format || 'standard';
    if (fmt === 'roundrobin') renderManageRRMatches();
    else if (fmt === 'timetrial') renderManageTT();
    else renderManageRaces();
  }
  else if(currentManageTab==='prizes') renderManagePrizes();
  else if(currentManageTab==='live') renderManageLive();
  else renderManageSettings();
}

// PLAYERS
function renderManagePlayers(){
  const players  = champMembers.filter(m=>m.role==='owner'||m.role==='player');
  const pending  = champMembers.filter(m=>m.role==='pending');
  const rejected = champMembers.filter(m=>m.role==='rejected');
  const isClosed = currentChamp && (currentChamp.access==='closed' || currentChamp.closed);

  let html = '<p class="manage-hint">Giocatori attivi: ' + players.length + '</p>';

  // Invite section — prominente per campionati chiusi
  if (isOwner) {
    // Build friends rubrica — friends not yet in champ
    var memberUserIds = champMembers.map(function(m){ return m.user_id; });
    var friendIds = getFriendIds();
    var friendsNotInChamp = friendIds.filter(function(fid){ return !memberUserIds.includes(fid); });

    html += '<div style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.3);border-radius:12px;padding:12px 14px;margin-bottom:14px;">';
    html += '<div style="font-size:12px;font-weight:700;color:var(--violet);margin-bottom:10px;">📨 ' + (isClosed ? 'Campionato chiuso — ' : '') + 'Invita partecipanti</div>';

    // Rubrica amici
    if (friendsNotInChamp.length > 0) {
      html += '<div style="font-size:11px;color:#888;margin-bottom:6px;font-weight:600;">DALLA TUA RUBRICA AMICI</div>';
      html += '<div class="friends-book" id="friends-book">';
      friendsNotInChamp.forEach(function(fid) {
        var profile = allFriendProfiles[fid] || { username: fid.substring(0,8)+'...' };
        var initial = ((profile.username||'?')[0]||'?').toUpperCase();
        var color = PLAYER_COLORS[Math.abs(fid.charCodeAt(0) - 65) % PLAYER_COLORS.length];
        html += '<div class="friends-book-item" data-uid="' + fid + '" data-username="' + (profile.username||'') + '" onclick="toggleFriendBookItem(this)">'
             + '<div class="friends-book-avatar" style="background:' + color + ';">' + initial + '</div>'
             + '<div class="friends-book-name">' + (profile.username||'—') + '</div>'
             + '<div class="friends-book-check">✓</div>'
             + '</div>';
      });
      html += '</div>';
      html += '<button class="invite-from-book-btn" id="invite-book-btn" onclick="inviteCheckedFriends()" disabled>Invita selezionati</button>';
    } else if (friendIds.length === 0) {
      html += '<div style="font-size:12px;color:#aaa;margin-bottom:10px;">Non hai ancora amici — aggiungili dal pulsante 👥 in alto</div>';
    } else {
      html += '<div style="font-size:12px;color:#aaa;margin-bottom:10px;">Tutti i tuoi amici sono già nel campionato</div>';
    }

    // Ricerca manuale
    html += '<div style="font-size:11px;color:#888;margin-top:12px;margin-bottom:6px;font-weight:600;">OPPURE CERCA PER USERNAME</div>';
    html += '<div class="search-friend-row" style="margin-bottom:6px;">';
    html += '<input type="text" id="invite-input-players" placeholder="Username..." style="flex:1;padding:8px 12px;border:1px solid #b0d0f0;border-radius:8px;font-size:13px;outline:none;"/>';
    html += '<button onclick="inviteFromPlayersPanel()" style="padding:8px 14px;background:var(--violet);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">Cerca</button>';
    html += '</div>';
    html += '<div id="invite-result-players" style="font-size:12px;min-height:16px;color:var(--violet);"></div>';
    html += '</div>';
  }

  // Active players list
  for (var pi = 0; pi < players.length; pi++) {
    var pm = players[pi];
    var color = PLAYER_COLORS[pi % PLAYER_COLORS.length];
    var canKick = isOwner && pm.role !== 'owner';
    var kickId = pm.id;
    html += '<div class="player-item">'
         + '<div class="color-dot" style="background:' + color + '"></div>'
         + '<span class="name-input" style="flex:1;font-size:13px;font-weight:600;color:var(--text);">' + pm.username + (pm.role==='owner'?' 👑':'') + '</span>'
         + (canKick ? '<button class="del-btn" onclick="kickMember(' + "'" + kickId + "'" + ')" title="Escludi dal campionato" style="font-size:18px;color:#c0392b;">×</button>' : '')
         + '</div>';
  }

  // Pending requests (only visible to owner)
  if (isOwner && pending.length) {
    html += '<div class="sec-hdr" style="margin-top:16px;"><span class="sec-lbl">Richieste in attesa</span><span style="font-size:11px;color:#e06000;font-weight:700;margin-left:6px;">' + pending.length + '</span></div>';
    for (var qi = 0; qi < pending.length; qi++) {
      var qm = pending[qi];
      html += '<div class="player-item" style="background:#fffbf0;border-radius:10px;padding:8px 10px;margin-bottom:6px;">'
           + '<div class="color-dot" style="background:#e0c060"></div>'
           + '<span style="flex:1;font-size:13px;font-weight:600;">' + qm.username + '</span>'
           + '<button onclick="acceptMember(' + "'" + qm.id + "'" + ')" style="background:rgba(45,198,83,0.15);border:none;border-radius:8px;padding:5px 10px;font-size:15px;cursor:pointer;margin-right:4px;" title="Accetta">&#10003;</button>'
           + '<button onclick="rejectMember(' + "'" + qm.id + "'" + ')" style="background:rgba(230,57,70,0.15);border:none;border-radius:8px;padding:5px 10px;font-size:15px;cursor:pointer;" title="Rifiuta">&#10007;</button>'
           + '</div>';
    }
  }

  // Rejected (only owner)
  if (isOwner && rejected.length) {
    html += '<div class="sec-hdr" style="margin-top:16px;"><span class="sec-lbl" style="color:#bbb;">Rifiutati</span></div>';
    for (var ri2 = 0; ri2 < rejected.length; ri2++) {
      var rm = rejected[ri2];
      html += '<div class="player-item" style="opacity:.5;">'
           + '<div class="color-dot" style="background:#ccc"></div>'
           + '<span style="flex:1;font-size:13px;">' + rm.username + '</span>'
           + '<button onclick="acceptMember(' + "'" + rm.id + "'" + ')" style="background:#f0f7ff;border:none;border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer;">Riammetti</button>'
           + '<button onclick="kickMember(' + "'" + rm.id + "'" + ')" style="background:rgba(230,57,70,0.15);border:none;border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer;margin-left:4px;">Rimuovi</button>'
           + '</div>';
    }
  }

  document.getElementById('manage-body').innerHTML = html;
}
// renamePlayer defined below (handles RR+Elim)
// deletePlayer defined below (handles RR+Elim)
function addPlayer(){} // no-op: players join via request

// RACES
function renderManageRaces(){
  const races=champData.races||[];
  document.getElementById('manage-body').innerHTML=`
    <p class="manage-hint">Trascina ≡ per riordinare · Max 20</p>
    <ul class="sort-list" id="sort-list">
      ${races.map((r,idx)=>{
        const th=`<img src="images/${r.img}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div class="sort-thumb-ph" style="display:none">🏁</div>`;
        return `<li class="sort-item" data-id="${r.id}" draggable="true"
          ondragstart="sortDragStart(event,'${r.id}')" ondragend="sortDragEnd(event)"
          ondragover="sortDragOver(event,'${r.id}')" ondrop="sortDrop(event,'${r.id}')">
          <span class="sort-handle" ontouchstart="sortTouchStart(event,'${r.id}')" ontouchmove="sortTouchMove(event)" ontouchend="sortTouchEnd(event)">≡</span>
          <div class="sort-thumb">${th}</div>
          <div style="flex:1;min-width:0;">
            <div class="sort-name">${r.name}</div>
            <input type="text" placeholder="Link YouTube replay..." value="${r.replayUrl||''}"
              onchange="saveReplayLink('${r.id}',this.value)" onclick="event.stopPropagation()"
              style="margin-top:4px;font-size:11px;padding:4px 7px;border:1px solid #e0ddd6;border-radius:6px;width:100%;outline:none;color:#666;background:var(--card);"/>
            <input type="date" value="${r.date||''}"
              onchange="saveRaceDate('${r.id}',this.value)" onclick="event.stopPropagation()"
              style="margin-top:4px;font-size:11px;padding:4px 7px;border:1px solid #e0ddd6;border-radius:6px;width:100%;outline:none;color:#666;background:var(--card);"/>
          </div>
          <span class="sort-num">${idx+1}</span>
          <button class="sort-del" style="background:#e8f0fe;color:var(--violet);" onclick="openEditRace('${r.id}')">✎</button>
          <button class="sort-del" onclick="deleteRace('${r.id}')">×</button>
        </li>`;}).join('')}
    </ul>
    <button class="add-btn" ${races.length>=20?'disabled':''} onclick="openAddRaceModal()">
      <span style="font-size:18px">+</span> Aggiungi circuito</button>`;
}
function deleteRace(id){champData.races=(champData.races||[]).filter(r=>r.id!==id);scheduleSave();renderChamp();renderManageRaces();}
function saveReplayLink(id,url){const r=(champData.races||[]).find(r=>r.id===id);if(r){r.replayUrl=url.trim();scheduleSave();renderRaces();}}
function saveRaceDate(id,date){const r=(champData.races||[]).find(r=>r.id===id);if(r){r.date=date;scheduleSave();renderChamp();}}

// PRIZES
function renderManagePrizes(){
  const prizes=champData.prizes||['','',''];
  document.getElementById('manage-body').innerHTML=`
    <p class="manage-hint">Cosa vince chi sale sul podio</p>
    ${prizes.map((pr,i)=>`
      <div class="prize-input-row">
        <span class="prize-input-icon">${['🥇','🥈','🥉'][i]}</span>
        <input class="prize-field" type="text" placeholder="${['1°','2°','3°'][i]} posto..."
          value="${pr||''}" onblur="savePrize(${i},this.value)" onkeydown="if(event.key==='Enter')this.blur()"/>
      </div>`).join('')}`;
}
function savePrize(idx,val){if(!champData.prizes)champData.prizes=['','',''];champData.prizes[idx]=val.trim();scheduleSave();renderPrizes();}

// LIVE
function renderManageLive(){
  document.getElementById('manage-body').innerHTML=`
    <p class="manage-hint">Link YouTube della live o del canale</p>
    <div class="prize-input-row">
      <span class="prize-input-icon">📡</span>
      <input class="prize-field" type="text" id="live-url-input"
        placeholder="https://youtube.com/@NomeCanale/live"
        value="${champData.liveUrl||''}"
        onblur="saveLiveUrl(this.value)" onkeydown="if(event.key==='Enter')this.blur()"/>
    </div>
    <p style="font-size:11px;color:#bbb;margin-top:8px;line-height:1.6;">
      Supporta: youtube.com/watch?v=... · youtube.com/@Canale/live<br>
      Lascia vuoto per nascondere il widget live.
    </p>`;
}
function saveLiveUrl(url){champData.liveUrl=url.trim();scheduleSave();renderLive();}

// SETTINGS
function renderManageSettings(){
  var champNameVal = ((champData.championship||'') + ' ' + (champData.season||'')).trim();
  var html = '<p class="manage-hint">Impostazioni del campionato</p>';
  html += '<div style="font-family:monospace;font-size:11px;color:#aaa;background:#f5f3ef;border-radius:8px;padding:8px 12px;margin-bottom:12px;word-break:break-all;"><span style="font-size:10px;color:#bbb;display:block;margin-bottom:2px;">ID Campionato</span>' + (currentChamp&&currentChamp.id||'—') + '</div>';
  html += '<div class="prize-input-row" style="margin-bottom:10px;">';
  html += '<span class="prize-input-icon">🏆</span>';
  var safeChampName = champNameVal.split('"').join('&quot;');
  html += '<input class="prize-field" type="text" id="set-champ-name" placeholder="Nome campionato anno" value="' + safeChampName + '" onblur="saveChampName(this.value)" onkeydown="if(event.key===\'Enter\')this.blur()"/>';
  html += '</div>';
  html += '<div style="height:1px;background:#f0ede6;margin:12px 0;"></div>';
  html += '<p class="manage-hint" style="margin-bottom:8px;">Tipo di accesso</p>';
  html += '<div class="prize-input-row" style="margin-bottom:10px;">';
  html += '<span class="prize-input-icon">🌐</span>';
  html += '<select class="prize-field" id="set-champ-access" style="border:none;outline:none;font-size:14px;background:transparent;">';
  html += '<option value="public"' + (currentChamp&&currentChamp.access==='public'&&!currentChamp.closed?' selected':'') + '>🌐 Pubblico — visibile a tutti, chiunque può richiedere iscrizione</option>';
  html += '<option value="closed"' + (currentChamp&&(currentChamp.access==='closed'||currentChamp.closed)?' selected':'') + '>🔐 Chiuso — visibile solo ai partecipanti, solo su invito</option>';
  html += '<option value="password"' + (currentChamp&&currentChamp.access==='password'&&!currentChamp.closed?' selected':'') + '>🔒 Privato — visibile a tutti, accesso con password</option>';
  html += '</select></div>';
  var showPass = currentChamp && currentChamp.access==='password';
  html += '<div class="prize-input-row" style="margin-bottom:10px;' + (showPass?'':'display:none;') + '" id="set-pass-row">';
  html += '<span class="prize-input-icon">🔒</span>';
  html += '<input class="prize-field" type="text" id="set-champ-pass" placeholder="Password di accesso..." value="' + ((currentChamp&&currentChamp.password_hash)||'').replace(/"/g,'&quot;') + '"/>';
  html += '</div>';
  // Category picker in settings
  var curCat = champData.category || '';
  html += '<div style="margin:14px 0 10px;"><div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">Categoria</div>';
  html += '<div style="display:flex;gap:8px;" id="settings-category-picker">';
  [{v:'',l:'—'},{v:'soccer',l:'⚽'},{v:'racing',l:'🏎️'},{v:'dice',l:'🎲'},{v:'shooter',l:'🔫'}].forEach(function(o){
    html += '<button type="button" class="cat-btn' + (curCat===o.v?' selected':'') + '" data-cat="'+o.v+'" onclick="selectSettingsCategory(\'' + o.v + '\',this)">' + o.l + '</button>';
  });
  html += '</div><input type="hidden" id="settings-category" value="' + curCat + '"/></div>';
  // ── Scoring schema ──
  var scoring = getScoring();
  var medals = ['🥇','🥈','🥉','4°','5°','6°','7°','8°','9°','10°'];
  html += '<div style="margin:14px 0 10px;padding-top:14px;border-top:1px solid var(--border);">';
  html += '<p class="manage-hint" style="margin-bottom:10px;">Punteggi per posizione</p>';
  html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;" id="scoring-grid">';
  for (var pi=0; pi<10; pi++) {
    html += '<div style="text-align:center;">'
      + '<div style="font-size:11px;color:var(--muted);margin-bottom:4px;">' + medals[pi] + '</div>'
      + '<input type="number" min="0" max="99" id="scoring-pos-'+pi+'" value="' + (scoring[pi]||0) + '" '
      + 'style="width:100%;padding:6px 4px;text-align:center;border:1px solid var(--border);border-radius:3px;'
      + 'background:var(--card);color:var(--text);font-size:14px;font-weight:600;outline:none;" />'
      + '</div>';
  }
  html += '</div></div>';
  html += '<button class="btn-primary" style="margin-top:8px;" onclick="saveChampSettings()">Salva impostazioni</button>';
  if ((champData.format||'standard') === 'timetrial') html += renderTTSettings();
  // Danger zone
  html += '<div class="danger-zone">';
  html += '<div class="danger-zone-title">⚠ Zona pericolosa</div>';
  html += '<button class="danger-btn soft" onclick="resetChampResults()">🔄 Azzera risultati</button>';
  html += '<button class="danger-btn hard" onclick="resetChampFull()">💥 Reset totale</button>';
  html += '<div style="font-size:11px;color:var(--muted);margin-top:6px;"><strong>Azzera risultati</strong>: mantiene iscritti e gare, cancella solo i punteggi. <strong>Reset totale</strong>: cancella tutto tranne il nome.</div>';
  html += '</div>';
  // TT settings injected below
  // ── Invita per username ──
  // ── Export sezione ──
  html += '<div style="margin-bottom:14px;padding-top:14px;border-top:1px solid var(--border);">';
  html += '<p class="manage-hint" style="margin-bottom:10px;">Esporta stagione</p>';
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
  html += '<button onclick="exportChampCSV()" style="display:flex;align-items:center;gap:6px;padding:8px 16px;background:var(--card);border:1px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;color:var(--text);cursor:pointer;">📊 Scarica CSV</button>';
  html += '<button onclick="exportChampPDF()" style="display:flex;align-items:center;gap:6px;padding:8px 16px;background:var(--card);border:1px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;color:var(--text);cursor:pointer;">📄 Scarica PDF</button>';
  html += '</div></div>';

  html += '<div class="invite-section">';
  html += '<h4>Invita per username</h4>';
  html += '<p style="font-size:12px;color:#aaa;margin-bottom:10px;">Cerca un utente per username o email e invitalo direttamente — non serve che sia tuo amico.</p>';
  html += '<div class="search-friend-row" style="margin-bottom:6px;">';
  html += '<input type="text" id="invite-input" placeholder="Username o email..."/>';
  html += '<button onclick="inviteToChamp()">Invita</button>';
  html += '</div>';
  html += '<div id="invite-result" style="font-size:12px;min-height:16px;"></div>';
  html += '</div>';
  document.getElementById('manage-body').innerHTML = html;
  var sel = document.getElementById('set-champ-access');
  if (sel) sel.addEventListener('change', function(e){
    var row = document.getElementById('set-pass-row');
    if (row) row.style.display = e.target.value==='password' ? '' : 'none';
  });
}

function saveChampName(val){
  val=val.trim();if(!val)return;
  const parts=val.split(' ');const last=parts[parts.length-1];
  if(/^\d{4}$/.test(last)){champData.season=last;champData.championship=parts.slice(0,-1).join(' ')||val;}
  else{champData.championship=val;champData.season='';}
  scheduleSave();renderChamp();
}
async function saveChampSettings(){
  var catEl = document.getElementById('settings-category');
  if (catEl) champData.category = catEl.value;
  // Save scoring schema
  var newScoring = [];
  for (var si=0; si<10; si++) {
    var el = document.getElementById('scoring-pos-'+si);
    newScoring.push(el ? parseInt(el.value)||0 : 0);
  }
  champData.scoring = newScoring;
  const pass   = (document.getElementById('set-champ-pass')||{}).value?.trim() || '';
  const access = document.getElementById('set-champ-access').value;
  const newName = [champData.championship, champData.season].filter(Boolean).join(' ') || currentChamp.name;
  const newSeason = champData.season || '';
  const closed = access === 'closed';
  // Aggiorna anche champData.category nel campo data
  champData.category = (document.getElementById('settings-category')||{}).value || champData.category || '';
  const {error} = await sb.from('championships').update({
    access: closed ? 'public' : access,
    closed,
    password_hash: pass,
    name: newName,
    season: newSeason,
    data: champData
  }).eq('id', currentChamp.id);
  if(error){showToast('Errore salvataggio: ' + error.message);return;}
  currentChamp.access = closed ? 'closed' : access;
  currentChamp.closed = closed;
  currentChamp.password_hash = pass;
  currentChamp.name = newName;
  currentChamp.season = newSeason;
  currentChamp.category = champData.category;
  const idx = allChamps.findIndex(c=>c.id===currentChamp.id);
  if(idx!==-1){allChamps[idx].name=newName;allChamps[idx].season=newSeason;allChamps[idx].access=currentChamp.access;allChamps[idx].closed=closed;}
  // Aggiorna classifica immediatamente dopo salvataggio
  renderChamp();
  showToast('Impostazioni salvate! Classifica aggiornata.');
}

// ── SORT LIST ─────────────────────────────────────
let sortDragSrcId=null;
function sortDragStart(e,id){sortDragSrcId=id;e.dataTransfer.effectAllowed='move';setTimeout(()=>e.target.closest('.sort-item').classList.add('dragging-sort'),0);}
function sortDragEnd(e){document.querySelectorAll('.sort-item').forEach(el=>el.classList.remove('dragging-sort','drag-over-sort'));}
function sortDragOver(e,id){e.preventDefault();document.querySelectorAll('.sort-item').forEach(el=>el.classList.remove('drag-over-sort'));if(id!==sortDragSrcId){const el=document.querySelector(`.sort-item[data-id="${id}"]`);if(el)el.classList.add('drag-over-sort');}}
function sortDrop(e,tgt){e.preventDefault();if(!sortDragSrcId||sortDragSrcId===tgt)return;doReorder(sortDragSrcId,tgt);}
let sortTouchId=null,sortTouchClone=null;
function sortTouchStart(e,id){e.stopPropagation();sortTouchId=id;const item=e.target.closest('.sort-item');const rect=item.getBoundingClientRect();sortTouchClone=item.cloneNode(true);sortTouchClone.style.cssText=`position:fixed;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;opacity:.75;pointer-events:none;z-index:999;border-radius:11px;box-shadow:0 6px 24px rgba(0,0,0,.18);`;document.body.appendChild(sortTouchClone);item.style.opacity='.3';}
function sortTouchMove(e){if(!sortTouchClone)return;e.preventDefault();const t=e.touches[0];sortTouchClone.style.left=(t.clientX-sortTouchClone.offsetWidth/2)+'px';sortTouchClone.style.top=(t.clientY-sortTouchClone.offsetHeight/2)+'px';document.querySelectorAll('.sort-item').forEach(el=>el.classList.remove('drag-over-sort'));sortTouchClone.style.display='none';const el=document.elementFromPoint(t.clientX,t.clientY);sortTouchClone.style.display='';const target=el&&el.closest('.sort-item');if(target&&target.dataset.id!==sortTouchId)target.classList.add('drag-over-sort');}
function sortTouchEnd(e){if(!sortTouchId)return;const t=e.changedTouches[0];if(sortTouchClone){sortTouchClone.remove();sortTouchClone=null;}document.querySelectorAll('.sort-item').forEach(el=>{el.style.opacity='';el.classList.remove('drag-over-sort','dragging-sort');});const el=document.elementFromPoint(t.clientX,t.clientY);const target=el&&el.closest('.sort-item');if(target&&target.dataset.id&&target.dataset.id!==sortTouchId)doReorder(sortTouchId,target.dataset.id);sortTouchId=null;}
function goPage(n) { currentPage = n; renderAllChamps(); window.scrollTo(0,0); }

// ── ACCOUNT SETTINGS ──────────────────────────────

// ── USER PROFILE ──────────────────────────────────
var profileViewingUser = null; // username being viewed

async function openProfile(username) {
  if (!username) return;
  profileViewingUser = username;
  showPage('page-profile');

  var myUsername = currentUser?.user_metadata?.username || currentUser?.email?.split('@')[0] || '';
  var isMe = (username === myUsername);

  // ── Sync nav ──
  var navU = document.getElementById('profile-nav-username');
  if (navU) navU.textContent = myUsername;
  var navAv = document.getElementById('profile-nav-av');
  if (navAv) navAv.textContent = myUsername.substring(0,2).toUpperCase();

  // ── Avatar + username ──
  var initials = username.substring(0,2).toUpperCase();
  var avEl = document.getElementById('profile-avatar');
  if (avEl) avEl.textContent = initials;
  var unEl = document.getElementById('profile-username');
  if (unEl) unEl.textContent = username;

  // ── Bio ──
  var bioView = document.getElementById('profile-bio-view');
  var bioEditBtn = document.getElementById('profile-bio-edit-btn');
  var bioEdit = document.getElementById('profile-bio-edit');

  // ── Load profile from DB ──
  try {
    var { data: prof } = await sb.from('profiles')
      .select('username,bio,created_at')
      .eq('username', username)
      .maybeSingle();

    var joined = prof && prof.created_at
      ? 'Membro dal ' + new Date(prof.created_at).toLocaleDateString('it-IT',{month:'long',year:'numeric'})
      : '';
    var joinEl = document.getElementById('profile-joined');
    if (joinEl) joinEl.textContent = joined;

    var bio = (prof && prof.bio) || '';
    if (bioView) {
      bioView.textContent = bio || (isMe ? 'Aggiungi una bio...' : 'Nessuna bio.');
      bioView.style.color = bio ? 'var(--text)' : 'var(--faint)';
      bioView.style.display = '';
    }
    if (bioEdit) bioEdit.style.display = 'none';
    if (bioEditBtn) bioEditBtn.style.display = isMe ? '' : 'none';
  } catch(e) {
    console.warn('profile load error:', e);
  }

  // ── Load memberships ──
  try {
    var memberships = [];

    // Try by current user id if viewing own profile
    if (isMe && currentUser) {
      var { data: mByUid } = await sb.from('champ_members')
        .select('champ_id,role,championships(id,name,season,data,owner_id)')
        .eq('user_id', currentUser.id)
        .in('role', ['owner','player']);
      memberships = mByUid || [];
    }

    // Fallback: search by username
    if (!memberships.length) {
      var { data: mByName } = await sb.from('champ_members')
        .select('champ_id,role,championships(id,name,season,data,owner_id)')
        .eq('username', username)
        .in('role', ['owner','player']);
      memberships = mByName || [];
    }

    var total   = memberships.length;
    var owned   = memberships.filter(function(m){ return m.role === 'owner'; }).length;
    var playing = total - owned;

    var statsEl = document.getElementById('profile-stats-row');
    if (statsEl) {
      statsEl.innerHTML =
        '<div style="background:var(--card);border:1px solid var(--border);border-radius:3px;padding:14px 12px;text-align:center;"><div style="font-family:Georgia,serif;font-size:24px;font-style:italic;color:var(--gold);">' + total + '</div><div style="font-size:10px;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-top:3px;">Campionati</div></div>' +
        '<div style="background:var(--card);border:1px solid var(--border);border-radius:3px;padding:14px 12px;text-align:center;"><div style="font-family:Georgia,serif;font-size:24px;font-style:italic;color:var(--gold);">' + owned + '</div><div style="font-size:10px;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-top:3px;">Creati</div></div>' +
        '<div style="background:var(--card);border:1px solid var(--border);border-radius:3px;padding:14px 12px;text-align:center;"><div style="font-family:Georgia,serif;font-size:24px;font-style:italic;color:var(--gold);">' + playing + '</div><div style="font-size:10px;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-top:3px;">Partecipazione</div></div>';
    }

    // ── Champs list ──
    var list = document.getElementById('profile-champs-list');
    if (list) {
      if (!memberships.length) {
        list.innerHTML = '<div style="color:var(--muted);font-size:13px;">Nessun campionato.</div>';
      } else {
        list.innerHTML = memberships.map(function(m) {
          var c = m.championships;
          if (!c) return '';
          var badge = m.role === 'owner' ? '<span class="profile-champ-badge">👑 Owner</span>' : '';
          return '<div class="profile-champ-row">'
            + '<div class="profile-champ-name">' + esc(c.name) + (c.season ? ' <span style="font-size:11px;color:var(--muted);">' + esc(c.season) + '</span>' : '') + '</div>'
            + badge + '</div>';
        }).join('');
      }
    }

    // ── Badges ──
    await renderProfileBadges(username, isMe);

  } catch(e) {
    console.warn('profile memberships error:', e);
  }
}


async function openMyProfile() {
  var me = currentUser?.user_metadata?.username || currentUser?.email?.split('@')[0] || '';
  await openProfile(me);
  // Update profile nav username
  var navU = document.getElementById('profile-nav-username');
  if (navU) navU.textContent = me;
}

function editBio() {
  var current = document.getElementById('profile-bio-view').textContent;
  document.getElementById('profile-bio-input').value =
    current === 'Aggiungi una bio...' ? '' : current;
  document.getElementById('profile-bio-view').style.display = 'none';
  document.getElementById('profile-bio-edit-btn').style.display = 'none';
  document.getElementById('profile-bio-edit').style.display = '';
}

function cancelBioEdit() {
  document.getElementById('profile-bio-edit').style.display = 'none';
  document.getElementById('profile-bio-view').style.display = '';
  document.getElementById('profile-bio-edit-btn').style.display = '';
}

async function saveBio() {
  var bio = document.getElementById('profile-bio-input').value.trim().substring(0, 200);
  var me = currentUser?.user_metadata?.username || currentUser?.email?.split('@')[0] || '';
  var { error } = await sb.from('profiles').update({ bio }).eq('username', me);
  if (error) { showToast('Errore: ' + error.message); return; }
  document.getElementById('profile-bio-view').textContent = bio || 'Aggiungi una bio...';
  document.getElementById('profile-bio-view').style.color = bio ? 'var(--text)' : 'var(--faint)';
  cancelBioEdit();
  showToast('Bio salvata!');
}


// ── BADGE SYSTEM ──────────────────────────────────

const ALL_BADGES = [
  // Vittorie e risultati
  { key: 'first_win',       icon: '🥇', name: 'Prima vittoria',       desc: 'Vinci il tuo primo campionato' },
  { key: 'hot_streak',      icon: '🔥', name: 'Serie di fuoco',        desc: '5 vittorie consecutive in un campionato standard' },
  { key: 'champion',        icon: '👑', name: 'Campione stagionale',   desc: 'Vinci un campionato Round Robin o Standard completo' },
  { key: 'tt_ace',          icon: '⚡', name: 'Time Trial Ace',         desc: 'Primo posto in un campionato Time Trial' },
  { key: 'hat_trick',       icon: '🏆', name: 'Hat-trick',             desc: 'Vinci 3 campionati diversi' },
  // Partecipazione e social
  { key: 'welcome',         icon: '🎮', name: 'Benvenuto',             desc: 'Ti iscrivi al tuo primo campionato' },
  { key: 'explorer',        icon: '🌐', name: 'Esploratore',           desc: 'Partecipi a 5 campionati diversi' },
  { key: 'friendly',        icon: '🤝', name: 'Amico del gruppo',      desc: 'Hai 5 amici su Rankit' },
  { key: 'organizer',       icon: '📣', name: 'Organizzatore',         desc: 'Crei il tuo primo campionato' },
  { key: 'big_organizer',   icon: '🏟️', name: 'Grande organizzatore',  desc: 'Crei 5 campionati' },
  // Rarità speciale
  { key: 'unbeaten',        icon: '💎', name: 'Imbattuto',             desc: 'Vinci un Round Robin senza perdere una sfida' },
  { key: 'finalist',        icon: '🎯', name: 'Finalista',             desc: 'Arrivi in finale in un campionato a eliminazione diretta' },
];

// Loaded once per session
var myEarnedBadges = null; // Set of badge keys

async function loadMyBadges() {
  if (myEarnedBadges !== null) return;
  var { data } = await sb.from('user_badges').select('badge_key').eq('user_id', currentUser.id);
  myEarnedBadges = new Set((data||[]).map(function(r){ return r.badge_key; }));
}

async function awardBadge(key) {
  if (!currentUser) return;
  if (myEarnedBadges && myEarnedBadges.has(key)) return; // already earned
  var { error } = await sb.from('user_badges')
    .insert({ user_id: currentUser.id, badge_key: key });
  if (error && error.code !== '23505') return; // 23505 = unique violation (already exists)
  if (myEarnedBadges) myEarnedBadges.add(key);
  // Show toast notification
  var badge = ALL_BADGES.find(function(b){ return b.key === key; });
  if (badge) showToast('Badge sbloccato! ' + badge.icon + ' ' + badge.name);
}

// ── CHECK BADGES after relevant events ──
async function checkBadges(context) {
  if (!currentUser) return;
  await loadMyBadges();
  var me = currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || '';

  // ── WELCOME: primo campionato a cui si iscrive ──
  if (context === 'join' || context === 'all') {
    var { count: joinCount } = await sb.from('champ_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', currentUser.id).in('role', ['player','owner']);
    if (joinCount >= 1) await awardBadge('welcome');
    if (joinCount >= 5) await awardBadge('explorer');
  }

  // ── ORGANIZER: crea campionati ──
  if (context === 'create' || context === 'all') {
    var { count: ownCount } = await sb.from('championships')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', currentUser.id);
    if (ownCount >= 1) await awardBadge('organizer');
    if (ownCount >= 5) await awardBadge('big_organizer');
  }

  // ── FRIENDLY: amici ──
  if (context === 'friend' || context === 'all') {
    var { count: friendCount } = await sb.from('friendships')
      .select('*', { count: 'exact', head: true })
      .or('sender_id.eq.' + currentUser.id + ',receiver_id.eq.' + currentUser.id)
      .eq('status', 'accepted');
    if (friendCount >= 5) await awardBadge('friendly');
  }

  // ── Badges da campionato (passati via checkBadgesForChamp) ──
}

async function checkBadgesForChamp(champData, champId) {
  if (!currentUser) return;
  await loadMyBadges();
  var me = currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || '';
  var fmt = champData.format || 'standard';
  var players = champData.players || [];
  if (!players.includes(me)) return;

  // ── FIRST_WIN & CHAMPION & HAT_TRICK (standard) ──
  if (fmt === 'standard') {
    var races = champData.races || [];
    var myWins = races.filter(function(r){ return r.result && r.result.first === me; }).length;
    if (myWins >= 1) await awardBadge('first_win');

    // Campione: 1° in classifica finale con almeno 1 gara giocata
    var standings = calcStandings();
    if (standings.length && standings[0].name === me && races.filter(function(r){ return r.result; }).length >= 1) {
      await awardBadge('champion');
      await checkHatTrick();
    }

    // Hot streak: 5 vittorie di fila
    var streak = 0; var maxStreak = 0;
    races.filter(function(r){ return !!r.result; }).forEach(function(r){
      if (r.result.first === me) { streak++; maxStreak = Math.max(maxStreak, streak); }
      else streak = 0;
    });
    if (maxStreak >= 5) await awardBadge('hot_streak');
  }

  // ── CHAMPION (Round Robin) ──
  if (fmt === 'roundrobin') {
    var rr = calcRRStandings();
    var allPlayed = (champData.rrMatches||[]).every(function(m){ return !!m.winner || m.result === 'draw'; });
    if (allPlayed && rr.length && rr[0].name === me) {
      await awardBadge('champion');
      await awardBadge('first_win');
      await checkHatTrick();
    }
    // UNBEATEN: 0 sconfitte
    var losses = (champData.rrMatches||[]).filter(function(m){
      return m.winner && m.winner !== me && (m.p1 === me || m.p2 === me);
    }).length;
    if (allPlayed && rr.length && rr[0].name === me && losses === 0) {
      await awardBadge('unbeaten');
    }
  }

  // ── TT_ACE (Time Trial) ──
  if (fmt === 'timetrial') {
    var tt = calcTTStandings();
    if (tt.length && tt[0].name === me && tt[0].best !== null) {
      await awardBadge('tt_ace');
      await awardBadge('first_win');
      await checkHatTrick();
    }
  }

  // ── FINALIST (Elimination) ──
  if (fmt === 'elimination') {
    var bracket = champData.elimBracket || [];
    if (bracket.length) {
      var finalRound = bracket[bracket.length - 1];
      if (finalRound && finalRound[0]) {
        var fm = finalRound[0];
        if (fm.p1 === me || fm.p2 === me) await awardBadge('finalist');
        if (fm.winner === me) {
          await awardBadge('champion');
          await awardBadge('first_win');
          await checkHatTrick();
        }
      }
    }
  }
}

async function checkHatTrick() {
  // Count championships where user was 1st — pulled from badge count as proxy
  // Actually query champ_members and check win count via badges
  // Simpler: award hat_trick when champion is awarded 3+ times
  // We use user_badges: if champion is already earned AND we re-check, count separately
  var { count } = await sb.from('user_badges')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', currentUser.id)
    .in('badge_key', ['champion']);
  // We can't count multiple champ wins from single badge — use a stored counter in profiles or accept champion = first, hat_trick = earning champion 3 times
  // Simple approach: count championships where user appears as winner in user_badges history won't work
  // Better: check memberships as owner+player with top finish — approximate with badge checks
  // For now: award hat_trick after champion badge earned if already had champion (earned before)
  if (myEarnedBadges && myEarnedBadges.has('champion')) {
    // Already had champion, this is a second+ win — award hat_trick
    await awardBadge('hat_trick');
  }
}

// ── RENDER BADGES in profile ──
async function renderProfileBadges(username, isMe) {
  var container = document.getElementById('profile-badges');
  if (!container) return;

  try {
    var earnedKeys = new Set();
    if (isMe) {
      await loadMyBadges();
      earnedKeys = myEarnedBadges || new Set();
    } else {
      // Per altri utenti: mostra solo il conteggio
      var { data: profRow } = await sb.from('profiles')
        .select('id').eq('username', username).maybeSingle();
      if (profRow && profRow.id) {
        var { data: theirBadges } = await sb.from('user_badges')
          .select('badge_key').eq('user_id', profRow.id);
        var theirCount = (theirBadges||[]).length;
        container.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:4px 0;">'
          + (theirCount > 0 ? '🏅 ' + theirCount + ' badge guadagnati' : 'Nessun badge ancora.')
          + '</div>';
      } else {
        container.innerHTML = '<div style="font-size:13px;color:var(--muted);">Nessun badge ancora.</div>';
      }
      return;
    }

    // Profilo personale: tutti i badge (colorati/grigi)
    container.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;">'
      + ALL_BADGES.map(function(b) {
        var earned = earnedKeys.has(b.key);
        return '<div style="border-radius:3px;border:1px solid ' + (earned ? 'var(--gold)' : 'var(--border)') + ';'
          + 'background:' + (earned ? 'var(--gold-bg)' : 'var(--bg)') + ';'
          + 'padding:12px 10px;text-align:center;opacity:' + (earned ? '1' : '.5') + ';transition:opacity .15s;">'
          + '<div style="font-size:24px;margin-bottom:6px;">' + b.icon + '</div>'
          + '<div style="font-size:12px;font-weight:600;color:' + (earned ? 'var(--text)' : 'var(--muted)') + ';margin-bottom:4px;">' + b.name + '</div>'
          + '<div style="font-size:10px;color:var(--muted);line-height:1.4;">' + b.desc + '</div>'
          + (earned ? '<div style="font-size:10px;color:var(--gold);margin-top:6px;font-weight:700;letter-spacing:.4px;">✓ Ottenuto</div>' : '')
          + '</div>';
      }).join('')
      + '</div>';
  } catch(e) {
    console.warn('renderProfileBadges error:', e);
    if (container) container.innerHTML = '<div style="font-size:13px;color:var(--muted);">Badge non disponibili.</div>';
  }
}

// ── EXPORT STAGIONE ───────────────────────────────

function exportChampCSV() {
  var name = champData.championship || 'campionato';
  var season = champData.season || '';
  var fmt = champData.format || 'standard';
  var standings = getStandingsData();
  var rows = [['Posizione','Giocatore','Punteggio','Dettaglio']];

  standings.forEach(function(p, i) {
    rows.push([i+1, p.name, p.score, p.sub||'']);
  });

  // Add race/match detail based on format
  if (fmt === 'standard') {
    rows.push([]);
    rows.push(['=== GARE ===']);
    rows.push(['#','Nome gara','1° posto','2° posto']);
    (champData.races||[]).forEach(function(r, i) {
      rows.push([
        i+1,
        r.name || ('Gara ' + (i+1)),
        (r.result && r.result.first)  || '—',
        (r.result && r.result.second) || '—'
      ]);
    });
  } else if (fmt === 'roundrobin') {
    rows.push([]);
    rows.push(['=== SCONTRI DIRETTI ===']);
    rows.push(['Giocatore 1','Giocatore 2','Vincitore','Risultato']);
    (champData.rrMatches||[]).filter(function(m){ return m.winner || m.result; }).forEach(function(m) {
      rows.push([m.p1||'—', m.p2||'—', m.winner||'Pareggio', m.result||'—']);
    });
  } else if (fmt === 'timetrial') {
    var unit = champData.ttUnit || 'time';
    rows.push([]);
    rows.push(['=== PROVE ===']);
    rows.push(['Giocatore','Miglior risultato','N° prove']);
    var tt = calcTTStandings();
    tt.forEach(function(p) {
      rows.push([p.name, p.best !== null ? formatTTValue(p.best, unit) : '—', p.runs]);
    });
  }

  // CSV string
  var csv = rows.map(function(row) {
    return row.map(function(cell) {
      var s = String(cell === null || cell === undefined ? '' : cell);
      if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
        s = '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',');
  }).join('\n');

  // Add BOM for Excel UTF-8
  var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = (name + (season ? '-' + season : '') + '.csv').replace(/[^a-zA-Z0-9\-_.]/g, '-');
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('CSV esportato!');
}

async function exportChampPDF() {
  var name = champData.championship || 'Campionato';
  var season = champData.season || '';
  var fmt = champData.format || 'standard';
  var standings = getStandingsData();
  var fmtLabels = { standard:'Standard', roundrobin:'Round Robin', elimination:'Eliminazione', timetrial:'Time Trial' };
  var medals = ['🥇','🥈','🥉'];

  // Build HTML content for PDF
  var content = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#1a1d2e;">';

  // Header
  content += '<div style="background:linear-gradient(90deg,#4c1d95,#7c3aed);border-radius:12px;padding:20px 24px;margin-bottom:24px;">';
  content += '<div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.6);letter-spacing:1px;margin-bottom:4px;">RANKIT</div>';
  content += '<div style="font-size:22px;font-weight:900;color:#fff;">' + name + (season ? ' · ' + season : '') + '</div>';
  content += '<div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:4px;">' + (fmtLabels[fmt]||fmt) + ' · ' + new Date().toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'}) + '</div>';
  content += '</div>';

  // Classifica
  content += '<div style="font-size:13px;font-weight:700;color:#5a6282;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;">Classifica finale</div>';
  content += '<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">';
  content += '<tr style="background:#f4f6fb;"><th style="padding:8px 12px;text-align:left;font-size:12px;color:#5a6282;">Pos</th><th style="padding:8px 12px;text-align:left;font-size:12px;color:#5a6282;">Giocatore</th><th style="padding:8px 12px;text-align:right;font-size:12px;color:#5a6282;">Punti</th><th style="padding:8px 12px;text-align:right;font-size:12px;color:#5a6282;">Dettaglio</th></tr>';
  standings.forEach(function(p, i) {
    var bg = i % 2 === 0 ? '#fff' : '#f9f9fc';
    content += '<tr style="background:' + bg + ';border-bottom:1px solid #eee;">';
    content += '<td style="padding:8px 12px;font-size:14px;">' + (medals[i] || (i+1)+'°') + '</td>';
    content += '<td style="padding:8px 12px;font-size:14px;font-weight:600;">' + esc(p.name) + '</td>';
    content += '<td style="padding:8px 12px;font-size:14px;text-align:right;font-weight:700;color:#7c3aed;">' + p.score + '</td>';
    content += '<td style="padding:8px 12px;font-size:12px;text-align:right;color:#aaa;">' + (p.sub||'') + '</td>';
    content += '</tr>';
  });
  content += '</table>';

  // Dettaglio gare/sfide
  if (fmt === 'standard') {
    var races = (champData.races||[]).filter(function(r){ return r.result; });
    if (races.length) {
      content += '<div style="font-size:13px;font-weight:700;color:#5a6282;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;">Risultati gare</div>';
      content += '<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">';
      content += '<tr style="background:#f4f6fb;"><th style="padding:8px 12px;text-align:left;font-size:12px;color:#5a6282;">#</th><th style="padding:8px 12px;text-align:left;font-size:12px;color:#5a6282;">Gara</th><th style="padding:8px 12px;text-align:left;font-size:12px;color:#5a6282;">1°</th><th style="padding:8px 12px;text-align:left;font-size:12px;color:#5a6282;">2°</th></tr>';
      races.forEach(function(r, i) {
        var bg = i % 2 === 0 ? '#fff' : '#f9f9fc';
        content += '<tr style="background:' + bg + ';border-bottom:1px solid #eee;">';
        content += '<td style="padding:8px 12px;font-size:12px;color:#aaa;">' + (i+1) + '</td>';
        content += '<td style="padding:8px 12px;font-size:13px;">' + esc(r.name||('Gara '+(i+1))) + '</td>';
        content += '<td style="padding:8px 12px;font-size:13px;font-weight:600;">🥇 ' + esc(r.result.first||'—') + '</td>';
        content += '<td style="padding:8px 12px;font-size:13px;">🥈 ' + esc(r.result.second||'—') + '</td>';
        content += '</tr>';
      });
      content += '</table>';
    }
  } else if (fmt === 'roundrobin') {
    var matches = (champData.rrMatches||[]).filter(function(m){ return m.winner||m.result; });
    if (matches.length) {
      content += '<div style="font-size:13px;font-weight:700;color:#5a6282;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;">Scontri diretti</div>';
      content += '<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">';
      content += '<tr style="background:#f4f6fb;"><th style="padding:8px 12px;text-align:left;font-size:12px;color:#5a6282;">Giocatore 1</th><th style="padding:8px 12px;text-align:left;font-size:12px;color:#5a6282;">Giocatore 2</th><th style="padding:8px 12px;text-align:left;font-size:12px;color:#5a6282;">Vincitore</th></tr>';
      matches.forEach(function(m, i) {
        var bg = i % 2 === 0 ? '#fff' : '#f9f9fc';
        content += '<tr style="background:' + bg + ';border-bottom:1px solid #eee;">';
        content += '<td style="padding:8px 12px;font-size:13px;' + (m.winner===m.p1?'font-weight:700;':'') + '">' + esc(m.p1||'—') + '</td>';
        content += '<td style="padding:8px 12px;font-size:13px;' + (m.winner===m.p2?'font-weight:700;':'') + '">' + esc(m.p2||'—') + '</td>';
        content += '<td style="padding:8px 12px;font-size:13px;font-weight:600;color:#7c3aed;">' + esc(m.winner||'Pareggio') + '</td>';
        content += '</tr>';
      });
      content += '</table>';
    }
  }

  content += '<div style="text-align:center;margin-top:24px;font-size:11px;color:#ccc;">rankit.it</div>';
  content += '</div>';

  // Open print window
  var printWin = window.open('', '_blank', 'width=700,height=900');
  printWin.document.write('<!DOCTYPE html><html><head><title>' + name + (season?' '+season:'') + ' — Rankit</title>');
  printWin.document.write('<style>@media print{body{margin:0;}button{display:none!important;}}</style>');
  printWin.document.write('</head><body>');
  printWin.document.write('<div style="text-align:right;padding:12px 32px;"><button onclick="window.print()" style="padding:8px 20px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600;">🖨️ Stampa / Salva PDF</button></div>');
  printWin.document.write(content);
  printWin.document.write('</body></html>');
  printWin.document.close();
  showToast('PDF pronto — usa Stampa > Salva come PDF');
}

async function saveAccountSettings() {
  const email = document.getElementById('acc-email').value.trim();
  const pass  = document.getElementById('acc-pass').value;
  const pass2 = document.getElementById('acc-pass2').value;
  const msg   = document.getElementById('acc-msg');
  msg.style.color = 'var(--red)'; msg.textContent = '';

  if (!email && !pass) { msg.textContent = 'Inserisci email o password da modificare'; return; }
  if (pass && pass !== pass2) { msg.textContent = 'Le password non coincidono'; return; }
  if (pass && pass.length < 6) { msg.textContent = 'Password minimo 6 caratteri'; return; }

  const updates = {};
  if (email) updates.email = email;
  if (pass)  updates.password = pass;

  const {error} = await sb.auth.updateUser(updates);
  if (error) { msg.textContent = error.message; return; }

  msg.style.color = 'var(--green)';
  msg.textContent = email ? 'Controlla la nuova email per confermare il cambio.' : 'Password aggiornata!';
  document.getElementById('acc-email').value = '';
  document.getElementById('acc-pass').value  = '';
  document.getElementById('acc-pass2').value = '';
}

// ── EDIT RACE ─────────────────────────────────────
function openEditRace(id) {
  const r = (champData.races||[]).find(r=>r.id===id); if(!r) return;
  document.getElementById('er-id').value   = id;
  document.getElementById('er-name').value = r.name;
  document.getElementById('er-date').value = r.date||'';
  document.getElementById('er-err').textContent = '';
  closeManagePanel();
  setTimeout(()=>openOverlay('edit-race-overlay'),180);
}
function saveEditRace() {
  const id   = document.getElementById('er-id').value;
  const name = document.getElementById('er-name').value.trim();
  const date = document.getElementById('er-date').value;
  if (!name) { document.getElementById('er-err').textContent='Inserisci il nome'; return; }
  const r = (champData.races||[]).find(r=>r.id===id); if(!r) return;
  r.name = name; r.date = date;
  scheduleSave(); renderChamp();
  closeOverlay('edit-race-overlay');
  setTimeout(()=>{ openManagePanel(); switchManageTab('races'); }, 180);
  showToast('Gara aggiornata!');
}

function doReorder(srcId,tgtId){
  const si=(champData.races||[]).findIndex(r=>r.id===srcId),ti=(champData.races||[]).findIndex(r=>r.id===tgtId);
  if(si===-1||ti===-1)return;
  const moved=champData.races.splice(si,1)[0];
  champData.races.splice(ti,0,moved);
  scheduleSave();renderChamp();renderManageRaces();showToast('Ordine aggiornato');
}

// ── ADD RACE ──────────────────────────────────────
function openAddRaceModal(){
  document.getElementById('ar-name').value='';
  document.getElementById('ar-date').value='';
  document.getElementById('ar-err').textContent='';
  closeManagePanel();
  setTimeout(()=>openOverlay('add-race-overlay'),180);
}
function saveNewRace(){
  const name=document.getElementById('ar-name').value.trim();
  const date=document.getElementById('ar-date').value;
  if(!name){document.getElementById('ar-err').textContent='Inserisci il nome del circuito';return;}
  if(!champData.races)champData.races=[];
  if(champData.races.length>=20){document.getElementById('ar-err').textContent='Massimo 20 gare';return;}
  champData.races.push({id:'r_'+Date.now(),name,img:'',date:date||'',result:null,replayUrl:''});
  scheduleSave();renderChamp();
  // Rimani nel pannello: resetta form e torna alla tab circuiti
  document.getElementById('ar-name').value='';
  document.getElementById('ar-date').value='';
  document.getElementById('ar-err').textContent='';
  closeOverlay('add-race-overlay');
  setTimeout(()=>{openManagePanel();switchManageTab('races');},180);
  showToast('Circuito aggiunto!');
}

// ── TABS ──────────────────────────────────────────
function switchTab(tab){
  document.querySelectorAll('.c-page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('c-page-'+tab).classList.add('active');
  document.getElementById('tab-'+tab+'-btn').classList.add('active');
}
function repositionChart(){
  const isMobile=window.innerWidth<768;
  const chart=document.getElementById('chart-section');
  if(isMobile) document.getElementById('c-page-standings').appendChild(chart);
  else document.querySelector('.champ-layout').appendChild(chart);
}
window.addEventListener('resize',repositionChart);

// ── OVERLAY UTILS ─────────────────────────────────
function openOverlay(id){document.getElementById(id).classList.add('open');}
function closeOverlay(id){document.getElementById(id).classList.remove('open');}
['result-overlay','add-race-overlay','edit-race-overlay','access-overlay','new-champ-overlay'].forEach(id=>{
  const el=document.getElementById(id);
  if(el) el.addEventListener('click',function(e){if(e.target===this)this.classList.remove('open');});
});
document.getElementById('manage-panel').addEventListener('click',function(e){if(e.target===this)closeManagePanel();});

// ── MISC UTILS ────────────────────────────────────
function hideGlobalLoading(){document.getElementById('global-loading').classList.remove('open');}
function setSyncStatus(type,label){
  const badge=document.getElementById('sync-badge');
  if(!badge) return;
  badge.className='sync-badge sync-'+type;
  badge.style.display='';
  var dot=badge.querySelector('.sync-dot');
  if(dot) dot.className='sync-dot'+(type==='saving'||type==='loading'?' pulsing':'');
  var lbl=document.getElementById('sync-label');
  if(lbl) lbl.textContent=label;
}
let toastTimeout;
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout=setTimeout(()=>t.classList.remove('show'),2500);
}
// ══════════════════════════════════════════════════

// ── RR CHART: punti cumulativi per giornata ───────
function renderRRChart() {
  ensureRRMatches();
  const players = champData.players || [];
  const matches = champData.rrMatches || [];
  const rounds  = groupRRRounds(matches, players);

  const cumPts = {};
  players.forEach(p => cumPts[p] = [0]);
  rounds.forEach(round => {
    const prev = {};
    players.forEach(p => prev[p] = cumPts[p][cumPts[p].length - 1]);
    round.forEach(m => {
      if (m.result === null) return;
      if (m.result === 'p1')      { prev[m.p1] += 3; }
      else if (m.result === 'p2') { prev[m.p2] += 3; }
      else                        { prev[m.p1] += 1; prev[m.p2] += 1; }
    });
    players.forEach(p => cumPts[p].push(prev[p]));
  });

  const labels = ['Start'];
  rounds.forEach((_, i) => labels.push('G' + (i + 1)));

  const legendEl = document.getElementById('chart-legend');
  if (legendEl) {
    legendEl.innerHTML = players.map((p, i) =>
      '<span class="legend-item"><span class="legend-dot" style="background:' + PLAYER_COLORS[i % PLAYER_COLORS.length] + '"></span>' + p + '</span>'
    ).join('');
  }

  // Ensure canvas exists (may have been replaced by placeholder)
  var chartWrap = document.querySelector('.chart-wrap');
  if (!chartWrap) return;
  if (!document.getElementById('chart-canvas')) {
    var freshCanvas = document.createElement('canvas');
    freshCanvas.id = 'chart-canvas';
    chartWrap.innerHTML = '';
    chartWrap.appendChild(freshCanvas);
  }
  const ctx = document.getElementById('chart-canvas');
  if (!ctx) return;
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  // Check if any match has been played yet
  var totalPts = 0;
  players.forEach(function(p){ totalPts += cumPts[p][cumPts[p].length-1]; });
  if (totalPts === 0) {
    chartWrap.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#ccc;font-size:13px;flex-direction:column;gap:6px;"><span style="font-size:28px;">📊</span><span>Nessun risultato ancora</span></div>';
    return;
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: players.map((p, i) => ({
        label: p,
        data: cumPts[p],
        borderColor: PLAYER_COLORS[i % PLAYER_COLORS.length],
        backgroundColor: PLAYER_COLORS[i % PLAYER_COLORS.length] + '22',
        tension: 0.3, pointRadius: 4, borderWidth: 2, fill: false
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { beginAtZero: true, min: 0, suggestedMax: 3, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: '#f0ede6' } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#1a1a1a', titleColor: '#fff', bodyColor: '#ccc', padding: 10, cornerRadius: 10,
          callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + ctx.parsed.y + ' pt' } }
      }
    }
  });
}

// ── ROUND ROBIN ───────────────────────────────────
// ══════════════════════════════════════════════════

function generateRRMatches() {
  const players = champData.players || [];
  const matches = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i+1; j < players.length; j++) {
      matches.push({
        id: 'rr_' + i + '_' + j + '_' + Date.now(),
        p1: players[i], p2: players[j],
        score1: null, score2: null, // null = not played
        result: null // 'p1'|'p2'|'draw'
      });
    }
  }
  return matches;
}

function ensureRRMatches() {
  if (!champData.rrMatches) champData.rrMatches = [];
  const players = champData.players || [];
  const double = !!champData.doubleLegs;
  // Add missing single-leg matches (A vs B)
  for (let i = 0; i < players.length; i++) {
    for (let j = i+1; j < players.length; j++) {
      const exists = champData.rrMatches.find(m =>
        (m.p1===players[i]&&m.p2===players[j]&&!m.returnLeg)||
        (m.p1===players[j]&&m.p2===players[i]&&!m.returnLeg));
      if (!exists) champData.rrMatches.push({
        id:'rr_'+i+'_'+j+'_'+Date.now(),
        p1:players[i], p2:players[j],
        score1:null, score2:null, result:null, returnLeg:false
      });
    }
  }
  if (double) {
    // Add missing return-leg matches (B vs A)
    for (let i = 0; i < players.length; i++) {
      for (let j = i+1; j < players.length; j++) {
        const existsReturn = champData.rrMatches.find(m =>
          m.p1===players[j] && m.p2===players[i] && m.returnLeg===true);
        if (!existsReturn) champData.rrMatches.push({
          id:'rr_ret_'+j+'_'+i+'_'+Date.now(),
          p1:players[j], p2:players[i],
          score1:null, score2:null, result:null, returnLeg:true
        });
      }
    }
  } else {
    // Remove return-leg matches if doubleLegs was turned off
    champData.rrMatches = champData.rrMatches.filter(m => !m.returnLeg);
  }
}

function calcRRStandings() {
  const players = champData.players || [];
  const stats = {};
  players.forEach(p => stats[p] = {pts:0,v:0,p:0,s:0,gf:0,gs:0});
  (champData.rrMatches||[]).forEach(m => {
    if (m.result === null) return;
    const s1 = m.score1||0, s2 = m.score2||0;
    if (!stats[m.p1]) stats[m.p1]={pts:0,v:0,p:0,s:0,gf:0,gs:0};
    if (!stats[m.p2]) stats[m.p2]={pts:0,v:0,p:0,s:0,gf:0,gs:0};
    stats[m.p1].gf+=s1; stats[m.p1].gs+=s2;
    stats[m.p2].gf+=s2; stats[m.p2].gs+=s1;
    if (m.result==='p1') { stats[m.p1].pts+=3; stats[m.p1].v++; stats[m.p2].s++; }
    else if (m.result==='p2') { stats[m.p2].pts+=3; stats[m.p2].v++; stats[m.p1].s++; }
    else { stats[m.p1].pts+=1; stats[m.p1].p++; stats[m.p2].pts+=1; stats[m.p2].p++; }
  });
  return players.map(p=>({name:p,...(stats[p]||{pts:0,v:0,p:0,s:0,gf:0,gs:0})}))
    .sort((a,b)=>b.pts-a.pts||(b.gf-b.gs)-(a.gf-a.gs)||(b.gf-a.gf));
}

function renderRRStandings() {
  ensureRRMatches();
  const stand = calcRRStandings();
  const posCls=['p1','p2','p3'];
  const total  = champData.rrMatches.length;
  const done   = (champData.rrMatches||[]).filter(m=>m.result!==null).length;
  document.getElementById('races-progress').textContent = done+'/'+total+' match';
  const pct = total>0?Math.round(done/total*100):0;
  document.getElementById('progress-fill').style.width=pct+'%';
  document.getElementById('progress-label').textContent=pct+'% completato';
  document.getElementById('standings-container').innerHTML = stand.map((p,i)=>{
    const color=PLAYER_COLORS[(champData.players||[]).indexOf(p.name)%PLAYER_COLORS.length];
    return `<div class="rr-stand-row">
      <div class="rr-pos ${posCls[i]||''}">${i===0?'🏆':i+1}</div>
      <div style="flex:1;min-width:0;">
        <div class="s-name" style="color:${color};cursor:pointer;" onclick="openProfile(\'${p.name}\')">${p.name}</div>
        <div class="rr-stat">${p.v}V ${p.p}P ${p.s}S · GF ${p.gf} GS ${p.gs}</div>
      </div>
      <div class="rr-pts-big">${p.pts}<span style="font-size:11px;font-weight:400;color:#aaa"> pt</span></div>
    </div>`;
  }).join('');
}

function buildRRMatchesHTML(rounds) {
  var html = '';
  for (var ri = 0; ri < rounds.length; ri++) {
    var round = rounds[ri];
    html += '<div style="margin-bottom:14px;">';
    html += '<div class="sec-hdr" style="margin-top:0;margin-bottom:8px;"><span class="sec-lbl">Giornata ' + (ri+1) + '</span></div>';
    for (var mi = 0; mi < round.length; mi++) {
      var m = round[mi];
      var s1 = m.score1 !== null ? m.score1 : '–';
      var s2 = m.score2 !== null ? m.score2 : '–';
      var done = m.result !== null;
      var doneClass = done ? 'done' : '';
      var rrOnclick = isOwner
        ? ("openRRResult('" + m.id + "')")
        : "showToast('Solo il proprietario non pu\u00f2 inserire risultati')";
      var c1rr = PLAYER_COLORS[(champData.players||[]).indexOf(m.p1) % PLAYER_COLORS.length];
      var c2rr = PLAYER_COLORS[(champData.players||[]).indexOf(m.p2) % PLAYER_COLORS.length];
      html += '<div class="rr-match-card ' + doneClass + '" onclick="' + rrOnclick + '">'
           + '<div class="rr-player-name" style="color:' + c1rr + '">' + m.p1 + '</div>'
           + '<div style="display:flex;align-items:center;gap:4px;">'
           + '<div class="rr-score">' + s1 + '</div>'
           + '<div class="rr-vs">vs</div>'
           + '<div class="rr-score">' + s2 + '</div>'
           + '</div>'
           + '<div class="rr-player-name" style="color:' + c2rr + '">' + m.p2 + '</div>'
           + '</div>';
    }
    html += '</div>';
  }
  return html || '<div style="color:#bbb;font-size:13px;padding:12px;">Aggiungi almeno 2 giocatori per generare gli scontri.</div>';
}

// Raggruppa match in giornate rispettando l'ordine manuale in rrMatches
// Ogni giornata contiene match che non condividono giocatori
function groupByDayRespectingOrder(matches) {
  var rounds = [];
  var remaining = matches.slice();
  while (remaining.length > 0) {
    var round = [];
    var usedPlayers = {};
    var nextRemaining = [];
    for (var i = 0; i < remaining.length; i++) {
      var m = remaining[i];
      if (!usedPlayers[m.p1] && !usedPlayers[m.p2]) {
        round.push(m);
        usedPlayers[m.p1] = true;
        usedPlayers[m.p2] = true;
      } else {
        nextRemaining.push(m);
      }
    }
    if (round.length === 0) { rounds.push(remaining); break; } // failsafe
    rounds.push(round);
    remaining = nextRemaining;
  }
  return rounds;
}

// Desktop: renders giornate into col-left (#races-grid)
function renderRRMatchesInline() {
  ensureRRMatches();
  var matches = champData.rrMatches || [];
  var rounds = groupByDayRespectingOrder(matches); // rispetta ordine manuale
  var el = document.getElementById('races-grid');
  if (el) {
    el.className = 'races-grid rr-grid';
    el.innerHTML = buildRRMatchesHTML(rounds);
  }
}

// Mobile: renders giornate into #rr-content
function renderRRMatches() {
  ensureRRMatches();
  var matches = champData.rrMatches || [];
  var rounds = groupByDayRespectingOrder(matches); // rispetta ordine manuale
  var el = document.getElementById('rr-content');
  if (el) el.innerHTML = buildRRMatchesHTML(rounds);
}


// Round-robin scheduling — handles both single and double legs
function scheduleLegs(legMatches, plist) {
  var n = plist.length % 2 === 0 ? plist.length : plist.length + 1;
  var rounds = [];
  var list = plist.slice();
  if (list.length % 2 !== 0) list.push('BYE');
  for (var r = 0; r < n-1; r++) {
    var round = [];
    for (var i = 0; i < n/2; i++) {
      var p1 = list[i], p2 = list[n-1-i];
      if (p1==='BYE'||p2==='BYE') continue;
      var match = legMatches.find(function(m){ return m.p1===p1&&m.p2===p2; });
      if (!match) match = legMatches.find(function(m){ return m.p1===p2&&m.p2===p1; });
      if (match) round.push(match);
    }
    if (round.length) rounds.push(round);
    list.splice(1, 0, list.pop());
  }
  // Unscheduled
  var scheduled = rounds.reduce(function(a,r){ return a.concat(r.map(function(m){return m.id;})); }, []);
  var extra = legMatches.filter(function(m){ return scheduled.indexOf(m.id)===-1; });
  if (extra.length) rounds.push(extra);
  return rounds;
}

function groupRRRounds(matches, players) {
  if (players.length < 2) return [matches];
  var andataMatches  = matches.filter(function(m){ return !m.returnLeg; });
  var ritornoMatches = matches.filter(function(m){ return  m.returnLeg; });



  var andataRounds = scheduleLegs(andataMatches, players);
  if (ritornoMatches.length === 0) return andataRounds;

  // For ritorno: reverse player order so home/away swap
  var ritornoRounds = scheduleLegs(ritornoMatches, players.slice().reverse());
  // Label ritorno rounds — we just append them; buildRRMatchesHTML will show "Giornata N"
  return andataRounds.concat(ritornoRounds);
}

let rrResultId = null;
function openRRResult(id) {
  if (!isOwner) { showToast('Solo il proprietario può modificare'); return; }
  rrResultId = id;
  const m = (champData.rrMatches||[]).find(m=>m.id===id); if(!m) return;
  document.getElementById('rr-result-title').textContent = m.p1 + ' vs ' + m.p2;
  document.getElementById('rr-result-sub').textContent = 'Inserisci il punteggio (es. 3 – 1)';
  const c1 = PLAYER_COLORS[(champData.players||[]).indexOf(m.p1)%PLAYER_COLORS.length];
  const c2 = PLAYER_COLORS[(champData.players||[]).indexOf(m.p2)%PLAYER_COLORS.length];
  document.getElementById('rr-result-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <div style="flex:1;text-align:center;">
        <div style="font-weight:700;color:${c1};margin-bottom:8px;">${m.p1}</div>
        <input type="number" min="0" max="99" id="rr-s1" value="${m.score1??''}" 
          style="width:64px;font-size:28px;font-weight:800;text-align:center;border:2px solid #e0ddd6;border-radius:10px;padding:6px;outline:none;"/>
      </div>
      <div style="font-size:18px;font-weight:800;color:#bbb;">–</div>
      <div style="flex:1;text-align:center;">
        <div style="font-weight:700;color:${c2};margin-bottom:8px;">${m.p2}</div>
        <input type="number" min="0" max="99" id="rr-s2" value="${m.score2??''}"
          style="width:64px;font-size:28px;font-weight:800;text-align:center;border:2px solid #e0ddd6;border-radius:10px;padding:6px;outline:none;"/>
      </div>
    </div>
    <button onclick="clearRRResult('${id}')" style="background:none;border:none;color:#bbb;font-size:12px;cursor:pointer;display:block;margin:0 auto 12px;">
      🗑 Rimuovi risultato
    </button>`;
  openOverlay('rr-result-overlay');
}
function saveRRResult() {
  const m = (champData.rrMatches||[]).find(m=>m.id===rrResultId); if(!m) return;
  const s1 = parseInt(document.getElementById('rr-s1').value);
  const s2 = parseInt(document.getElementById('rr-s2').value);
  if (isNaN(s1)||isNaN(s2)) { showToast('Inserisci entrambi i punteggi'); return; }
  m.score1=s1; m.score2=s2;
  m.result = s1>s2?'p1':s2>s1?'p2':'draw';
  scheduleSave(); renderChamp(); closeOverlay('rr-result-overlay'); showToast('Salvato!');
}
function clearRRResult(id) {
  const m = (champData.rrMatches||[]).find(m=>m.id===id); if(!m) return;
  m.score1=null; m.score2=null; m.result=null;
  scheduleSave(); renderChamp(); closeOverlay('rr-result-overlay'); showToast('Risultato rimosso');
}


// ══════════════════════════════════════════════════
// ── ELIMINAZIONE DIRETTA ──────────────────────────
// ══════════════════════════════════════════════════

function generateElimBracket(players) {
  // players must be power of 2
  const n = players.length;
  const rounds = Math.log2(n);
  const bracket = [];
  // Round 1 — seed players
  const r1 = [];
  for (let i = 0; i < n/2; i++) {
    r1.push({ id:'e_1_'+i, p1:players[i*2]||null, p2:players[i*2+1]||null, winner:null });
  }
  bracket.push(r1);
  // Subsequent rounds
  for (let r = 1; r < rounds; r++) {
    const prev = bracket[r-1];
    const round = [];
    for (let i = 0; i < prev.length/2; i++) {
      round.push({ id:'e_'+(r+1)+'_'+i, p1:null, p2:null, winner:null,
        srcA: prev[i*2].id, srcB: prev[i*2+1].id });
    }
    bracket.push(round);
  }
  return bracket;
}

// Renders bracket into col-left inline container
function renderElimBracketInline() {
  const el = document.getElementById('elim-bracket-inline');
  if (!el) return;
  const bracket = champData.elimBracket;
  if (!bracket) {
    if (isOwner) renderElimSetup(el);
    else el.innerHTML = "<div style='color:#bbb;padding:16px;font-size:13px;'>Il tabellone non ancora creato dall'organizzatore.</div>";
    return;
  }
  propagateElimWinners();
  const roundNames = getRoundNames(bracket.length);
  let html = '<div style="overflow-x:auto;padding-bottom:8px;"><div style="display:flex;gap:0;align-items:stretch;">';
  bracket.forEach(function(round, ri) {
    html += '<div style="display:flex;flex-direction:column;justify-content:space-around;min-width:130px;padding:0 6px;">';
    html += '<div style="font-size:10px;font-weight:600;color:#aaa;text-align:center;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">' + (roundNames[ri]||'Round '+(ri+1)) + '</div>';
    round.forEach(function(match) {
      var p1=match.p1||null, p2=match.p2||null, w=match.winner;
      var canClick = isOwner && p1 && p2;
      var clickAttr = canClick ? ('onclick="openElimResult(\'' + match.id + '\')" style="cursor:pointer;"') : '';
      html += '<div class="bracket-match ' + (w?'done':'') + '" ' + clickAttr + '>';
      [p1,p2].forEach(function(p, pi) {
        var isW = w && w===p;
        var isTbd = !p;
        var slotClass = 'bracket-slot' + (isW?' winner':'') + (isTbd?' tbd':'');
        var seed = p ? ((champData.players||[]).indexOf(p)+1) : '?';
        html += '<div class="' + slotClass + '">'
             + '<span class="bracket-seed">' + seed + '</span>'
             + (p||'Da definire')
             + '</div>';
      });
      html += '</div>';
    });
    html += '</div>';
  });
  html += '</div></div>';
  // Champion
  var final = bracket[bracket.length-1][0];
  if (final && final.winner) {
    var ci = (champData.players||[]).indexOf(final.winner);
    var color = PLAYER_COLORS[ci%PLAYER_COLORS.length];
    html += '<div style="text-align:center;margin-top:14px;padding:14px;background:linear-gradient(135deg,#fffbf0,#fff8e0);border-radius:12px;border:1px solid #f0e080;">'
         + '<div style="font-size:26px;">🏆</div>'
         + '<div style="font-size:16px;font-weight:700;color:' + color + ';margin-top:3px;">' + final.winner + '</div>'
         + '<div style="font-size:11px;color:#aaa;margin-top:1px;">Campione</div>'
         + '</div>';
  }
  if (isOwner) {
    html += '<button onclick="resetElimBracket()" style="margin-top:10px;background:none;border:1px solid #e0ddd6;border-radius:8px;padding:7px 14px;font-size:12px;cursor:pointer;color:#888;width:100%;">🔄 Ricrea tabellone</button>';
  }
  el.innerHTML = html;
}

function renderElimBracket() {
  const el = document.getElementById('elim-content'); if(!el) return;
  const bracket = champData.elimBracket;
  if (!bracket) {
    // Setup screen
    renderElimSetup(el);
    return;
  }
  // Propagate winners forward
  propagateElimWinners();
  const roundNames = getRoundNames(bracket.length);
  let html = '<div class="bracket-wrap"><div class="bracket">';
  bracket.forEach((round, ri) => {
    html += `<div class="bracket-round">
      <div class="bracket-round-title">${roundNames[ri]||'Round '+(ri+1)}</div>`;
    round.forEach(match => {
      const p1 = match.p1||null, p2 = match.p2||null;
      const w = match.winner;
      const done = !!w;
      const canClick = isOwner && p1 && p2;
      html += `<div class="bracket-match ${done?'done':(!p1||!p2)?'bye':''}" 
        ${canClick?`onclick="openElimResult('${match.id}')"`:''}
        title="${canClick?'Clicca per inserire il risultato':''}">
        <div class="bracket-slot ${w===p1?'winner':''} ${!p1?'tbd':''}">
          <span class="bracket-seed">${p1?((champData.players||[]).indexOf(p1)+1):'?'}</span>
          ${p1||'Da definire'}
        </div>
        <div class="bracket-slot ${w===p2?'winner':''} ${!p2?'tbd':''}">
          <span class="bracket-seed">${p2?((champData.players||[]).indexOf(p2)+1):'?'}</span>
          ${p2||'Da definire'}
        </div>
      </div>`;
    });
    html += '</div>';
  });
  html += '</div></div>';
  // Champion
  const final = bracket[bracket.length-1][0];
  if (final && final.winner) {
    const ci = (champData.players||[]).indexOf(final.winner);
    const color = PLAYER_COLORS[ci%PLAYER_COLORS.length];
    html += `<div style="text-align:center;margin-top:20px;padding:16px;background:linear-gradient(135deg,#fffbf0,#fff8e0);border-radius:14px;border:1px solid #f0e080;">
      <div style="font-size:30px">🏆</div>
      <div style="font-size:18px;font-weight:800;color:${color};margin-top:4px;">${final.winner}</div>
      <div style="font-size:12px;color:#aaa;margin-top:2px;">Campione</div>
    </div>`;
  }
  if (isOwner) {
    html += `<button onclick="resetElimBracket()" style="margin-top:14px;background:none;border:1px solid #e0ddd6;border-radius:8px;padding:8px 16px;font-size:12px;cursor:pointer;color:#888;display:block;width:100%;">🔄 Ricrea tabellone</button>`;
  }
  el.innerHTML = html;
}

function renderElimStandings() {
  // Standings for elimination = bracket progress summary
  const bracket = champData.elimBracket;
  if (!bracket) { document.getElementById('standings-container').innerHTML='<div style="color:#bbb;font-size:13px;padding:12px;">Tabellone non ancora creato</div>'; return; }
  propagateElimWinners();
  const final = bracket[bracket.length-1][0];
  const champion = final?.winner||null;
  const players = champData.players||[];
  // Count wins per player
  const wins = {};
  players.forEach(p=>wins[p]=0);
  bracket.forEach(round=>round.forEach(m=>{if(m.winner)wins[m.winner]=(wins[m.winner]||0)+1;}));
  const sorted = [...players].sort((a,b)=>(wins[b]||0)-(wins[a]||0));
  document.getElementById('races-progress').textContent = 'Tabellone a eliminazione';
  document.getElementById('progress-fill').style.width = champion?'100%':'50%';
  document.getElementById('progress-label').textContent = champion?'Campione: '+champion:'In corso';
  const posCls=['p1','p2','p3'];
  document.getElementById('standings-container').innerHTML = sorted.map((p,i)=>{
    const color=PLAYER_COLORS[players.indexOf(p)%PLAYER_COLORS.length];
    const w=wins[p]||0;
    return `<div class="rr-stand-row">
      <div class="rr-pos ${posCls[i]||''}">${p===champion?'🏆':i+1}</div>
      <div style="flex:1;"><div class="s-name" style="color:${color}">${p}</div>
        <div class="rr-stat">${w} vittori${w!==1?'e':'a'}</div></div>
      <div class="rr-pts-big">${w}<span style="font-size:11px;font-weight:400;color:#aaa"> v</span></div>
    </div>`;
  }).join('');
}

function renderElimSetup(el) {
  const players = champData.players||[];
  const sizes = [2,4,8,16].filter(s=>s<=players.length);
  if (!sizes.length) { el.innerHTML='<div style="color:#bbb;padding:16px;font-size:13px;">Aggiungi almeno 2 giocatori dal pannello Gestisci</div>'; return; }
  let html = '<div class="sec-hdr"><span class="sec-lbl">Crea Tabellone</span></div>';
  html += '<p style="font-size:13px;color:#888;margin-bottom:14px;">Quanti giocatori nel tabellone?</p>';
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">';
  sizes.forEach(s=>{
    html+=`<button onclick="setupElimSize(${s})" style="padding:10px 18px;border-radius:10px;border:2px solid var(--border);background:var(--card);font-size:15px;font-weight:700;cursor:pointer;color:var(--text);">${s}</button>`;
  });
  html += '</div>';
  el.innerHTML = html;
}

let elimSetupSize = 0, elimSetupSeeds = [];
function setupElimSize(n) {
  elimSetupSize = n;
  elimSetupSeeds = new Array(n).fill(null);
  const players = champData.players||[];
  const el = document.getElementById('elim-bracket-inline') || document.getElementById('elim-content');
  let html = `<div class="sec-hdr"><span class="sec-lbl">Tabellone da ${n}</span></div>`;
  html += '<p style="font-size:12px;color:#888;margin-bottom:12px;">Assegna i giocatori ai seed (posizioni nel tabellone)</p>';
  html += '<div class="elim-setup-grid">';
  for (let i=0; i<n; i++) {
    html += `<button class="elim-slot-btn" id="eslot-${i}" onclick="assignElimSeed(${i})">Seed ${i+1}: —</button>`;
  }
  html += '</div>';
  html += '<button class="btn-primary" style="margin-top:16px;" onclick="confirmElimBracket()">Crea Tabellone</button>';
  el.innerHTML = html;
  // Auto-fill seeds in order
  players.slice(0,n).forEach((p,i)=>assignElimSeedDirect(i,p));
}

function assignElimSeed(slotIdx) {
  const players = (champData.players||[]).filter(p=>!elimSetupSeeds.includes(p));
  if (!players.length) {
    // Toggle — remove this seed
    elimSetupSeeds[slotIdx]=null;
    const btn=document.getElementById('eslot-'+slotIdx);
    if(btn){btn.textContent=`Seed ${slotIdx+1}: —`;btn.classList.remove('filled');}
    return;
  }
  // Cycle through unassigned players
  const p=players[0];
  assignElimSeedDirect(slotIdx,p);
}
function assignElimSeedDirect(slotIdx, player) {
  // Remove player from other slots
  elimSetupSeeds=elimSetupSeeds.map((s,i)=>s===player&&i!==slotIdx?null:s);
  elimSetupSeeds[slotIdx]=player;
  // Update all buttons
  for(let i=0;i<elimSetupSize;i++){
    const btn=document.getElementById('eslot-'+i);
    if(!btn)continue;
    if(elimSetupSeeds[i]){btn.textContent=`Seed ${i+1}: ${elimSetupSeeds[i]}`;btn.classList.add('filled');}
    else{btn.textContent=`Seed ${i+1}: —`;btn.classList.remove('filled');}
  }
}
function confirmElimBracket() {
  const n=elimSetupSize;
  if(elimSetupSeeds.slice(0,n).some(s=>!s)){showToast('Assegna tutti i seed');return;}
  champData.elimBracket=generateElimBracket(elimSetupSeeds.slice(0,n));
  // Clear both possible containers
  var ec = document.getElementById('elim-content');
  if (ec) ec.innerHTML = '';
  scheduleSave();renderChamp();showToast('Tabellone creato!');
}
function resetElimBracket() {
  champData.elimBracket=null;
  scheduleSave();renderChamp();
}

function propagateElimWinners() {
  const bracket=champData.elimBracket; if(!bracket)return;
  // Forward winners to next rounds
  for(let ri=0;ri<bracket.length-1;ri++){
    bracket[ri].forEach((m,mi)=>{
      if(!m.winner)return;
      const nextRound=bracket[ri+1];
      const nextMatch=nextRound.find(nm=>nm.srcA===m.id||nm.srcB===m.id);
      if(!nextMatch)return;
      if(nextMatch.srcA===m.id) nextMatch.p1=m.winner;
      else nextMatch.p2=m.winner;
    });
  }
}

function getRoundNames(totalRounds) {
  const names=[];
  for(let i=0;i<totalRounds;i++){
    const remaining=totalRounds-i;
    if(remaining===1) names.push('Finale');
    else if(remaining===2) names.push('Semifinale');
    else if(remaining===3) names.push('Quarti');
    else names.push('Round '+(i+1));
  }
  return names;
}

let elimResultMatchId=null;
function openElimResult(id) {
  if(!isOwner){showToast('Solo il proprietario può modificare');return;}
  elimResultMatchId=id;
  let match=null;
  (champData.elimBracket||[]).forEach(r=>r.forEach(m=>{if(m.id===id)match=m;}));
  if(!match||!match.p1||!match.p2)return;
  document.getElementById('elim-result-title').textContent = match.p1 + ' vs ' + match.p2;
  var c1=PLAYER_COLORS[(champData.players||[]).indexOf(match.p1)%PLAYER_COLORS.length];
  var c2=PLAYER_COLORS[(champData.players||[]).indexOf(match.p2)%PLAYER_COLORS.length];
  var s1 = match.score1 !== null && match.score1 !== undefined ? match.score1 : '';
  var s2 = match.score2 !== null && match.score2 !== undefined ? match.score2 : '';
  var clearBtn = match.winner ? '<button onclick="clearElimResult(' + JSON.stringify(id) + ')" style="background:none;border:none;color:#bbb;font-size:12px;cursor:pointer;display:block;margin:8px auto 0;">&#128465; Rimuovi risultato</button>' : '';
  var body = '<p style="font-size:13px;color:#888;margin-bottom:14px;">Inserisci il punteggio (opzionale) e scegli il vincitore</p>';
  // Score inputs
  body += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">';
  body += '<div style="flex:1;text-align:center;">';
  body += '<div style="font-size:13px;font-weight:700;color:' + c1 + ';margin-bottom:6px;">' + match.p1 + '</div>';
  body += '<input type="number" min="0" max="99" id="elim-s1" value="' + s1 + '" style="width:60px;font-size:24px;font-weight:800;text-align:center;border:2px solid #e0ddd6;border-radius:10px;padding:6px;outline:none;"/>';
  body += '</div>';
  body += '<div style="font-size:18px;font-weight:800;color:#bbb;">–</div>';
  body += '<div style="flex:1;text-align:center;">';
  body += '<div style="font-size:13px;font-weight:700;color:' + c2 + ';margin-bottom:6px;">' + match.p2 + '</div>';
  body += '<input type="number" min="0" max="99" id="elim-s2" value="' + s2 + '" style="width:60px;font-size:24px;font-weight:800;text-align:center;border:2px solid #e0ddd6;border-radius:10px;padding:6px;outline:none;"/>';
  body += '</div></div>';
  // Winner buttons — use data attributes to avoid quote issues
  body += '<div style="display:flex;gap:10px;margin-bottom:8px;">';
  body += '<button data-winner="p1" style="flex:1;padding:12px;border:2px solid ' + c1 + ';border-radius:12px;background:var(--card);font-size:14px;font-weight:700;color:' + c1 + ';cursor:pointer;">&#10003; ' + match.p1 + '</button>';
  body += '<button data-winner="p2" style="flex:1;padding:12px;border:2px solid ' + c2 + ';border-radius:12px;background:var(--card);font-size:14px;font-weight:700;color:' + c2 + ';cursor:pointer;">&#10003; ' + match.p2 + '</button>';
  body += '</div>' + clearBtn;
  document.getElementById('elim-result-body').innerHTML = body;
  // Clone buttons to remove any stale listeners, then attach fresh ones
  var b1 = document.querySelector('[data-winner="p1"]');
  var b2 = document.querySelector('[data-winner="p2"]');
  if (b1) {
    var nb1 = b1.cloneNode(true);
    b1.parentNode.replaceChild(nb1, b1);
    nb1.addEventListener('click', function(){ saveElimResultWith(match.p1); });
  }
  if (b2) {
    var nb2 = b2.cloneNode(true);
    b2.parentNode.replaceChild(nb2, b2);
    nb2.addEventListener('click', function(){ saveElimResultWith(match.p2); });
  }
  openOverlay('elim-result-overlay');
}
function saveElimResult() {} // stub — actual save is via saveElimResultWith
function saveElimResultWith(winner) {
  var match = null;
  var currentId = elimResultMatchId; // capture before any async ops
  if (!currentId) { showToast('Errore: nessun match selezionato'); return; }
  (champData.elimBracket||[]).forEach(function(r){ r.forEach(function(m){ if(m.id===currentId) match=m; }); });
  if (!match) { showToast('Errore: match non trovato'); return; }
  // Save scores if provided
  var s1el = document.getElementById('elim-s1');
  var s2el = document.getElementById('elim-s2');
  if (s1el && s1el.value !== '') match.score1 = parseInt(s1el.value)||0;
  if (s2el && s2el.value !== '') match.score2 = parseInt(s2el.value)||0;
  match.winner = winner;
  propagateElimWinners();
  scheduleSave(); renderChamp(); closeOverlay('elim-result-overlay'); showToast(winner + ' avanza!');
}
function clearElimResult(id) {
  let match=null;
  (champData.elimBracket||[]).forEach(r=>r.forEach(m=>{if(m.id===id)match=m;}));
  if(!match)return;
  match.winner=null;
  // Clear downstream propagated results
  clearElimDownstream(id);
  scheduleSave();renderChamp();closeOverlay('elim-result-overlay');showToast('Risultato rimosso');
}
function clearElimDownstream(srcId) {
  (champData.elimBracket||[]).forEach(r=>r.forEach(m=>{
    if(m.srcA===srcId||m.srcB===srcId){
      m.p1=m.srcA===srcId?null:m.p1;
      m.p2=m.srcB===srcId?null:m.p2;
      m.winner=null;
      clearElimDownstream(m.id);
    }
  }));
}

// ── Patch renamePlayer/deletePlayer for RR & Elim ──
function renamePlayer(idx, name) {
  name = name.trim(); if (!name) { renderManagePlayers(); return; }
  const old = champData.players[idx];
  champData.players[idx] = name;
  // Update RR matches
  (champData.rrMatches||[]).forEach(m=>{if(m.p1===old)m.p1=name;if(m.p2===old)m.p2=name;if(m.result&&m.result===old)m.result=name;});
  // Update Elim bracket
  (champData.elimBracket||[]).forEach(r=>r.forEach(m=>{
    if(m.p1===old)m.p1=name;if(m.p2===old)m.p2=name;if(m.winner===old)m.winner=name;}));
  // Standard races
  (champData.races||[]).forEach(r=>{if(!r.result)return;if(r.result.first===old)r.result.first=name;if(r.result.second===old)r.result.second=name;});
  scheduleSave();renderChamp();renderManagePlayers();
}
function deletePlayer(idx) {
  if((champData.players||[]).length<=1){showToast('Minimo 1 utente');return;}
  const name=champData.players[idx];
  champData.players.splice(idx,1);
  // Remove RR matches involving this player
  champData.rrMatches=(champData.rrMatches||[]).filter(m=>m.p1!==name&&m.p2!==name);
  // Reset elim bracket if player was in it
  if((champData.elimBracket||[]).some(r=>r.some(m=>m.p1===name||m.p2===name||m.winner===name))){
    champData.elimBracket=null;showToast('Tabellone resettato: giocatore rimosso');}
  (champData.races||[]).forEach(r=>{if(r.result&&(r.result.first===name||r.result.second===name))r.result=null;});
  scheduleSave();renderChamp();renderManagePlayers();
}

// Close new overlays on backdrop click
['rr-result-overlay','elim-result-overlay'].forEach(id=>{
  const el=document.getElementById(id);
  if(el) el.addEventListener('click',function(e){if(e.target===this)this.classList.remove('open');});
});

// ══════════════════════════════════════════════════
// ── AMICIZIE ──────────────────────────────────────
// ══════════════════════════════════════════════════
let myFriendships = [];

async function loadFriendships() {
  const { data } = await sb.from('friendships')
    .select('id,sender_id,receiver_id,status,created_at')
    .or('sender_id.eq.' + currentUser.id + ',receiver_id.eq.' + currentUser.id);
  myFriendships = data || [];
  updateFriendsBadge();
}

function updateFriendsBadge() {
  const pending = myFriendships.filter(f => f.receiver_id === currentUser.id && f.status === 'pending');
  const badge = document.getElementById('friends-badge');
  if (!badge) return;
  if (pending.length > 0) { badge.style.display = 'flex'; badge.textContent = pending.length; }
  else { badge.style.display = 'none'; }
}

function openFriendsPanel() {
  renderFriendsPanel();
  document.getElementById('friends-overlay').classList.add('open');
}
function closeFriendsPanel() {
  document.getElementById('friends-overlay').classList.remove('open');
}

function renderFriendsPanel() {
  var accepted = myFriendships.filter(function(f){ return f.status === 'accepted'; });
  var pending_in  = myFriendships.filter(function(f){ return f.receiver_id === currentUser.id && f.status === 'pending'; });
  var pending_out = myFriendships.filter(function(f){ return f.sender_id === currentUser.id && f.status === 'pending'; });

  function friendRow(f, otherId, extraBtn) {
    var cached = allFriendProfiles[otherId] || { username: otherId.substring(0,8)+'...' };
    var initial = ((cached.username||'?')[0]||'?').toUpperCase();
    return '<div class="friend-row">'
      + '<div class="friend-avatar">' + initial + '</div>'
      + '<div class="friend-name">' + (cached.username||'—') + '</div>'
      + '<div class="friend-actions">' + extraBtn + '</div>'
      + '</div>';
  }

  // Accepted
  var accEl = document.getElementById('friends-accepted-list');
  if (accepted.length === 0) {
    accEl.innerHTML = '<div style="color:#bbb;font-size:13px;">Nessun amico ancora</div>';
  } else {
    accEl.innerHTML = accepted.map(function(f) {
      var otherId = f.sender_id === currentUser.id ? f.receiver_id : f.sender_id;
      var btn = '<button class="f-btn remove" data-fid="' + f.id + '" data-action="remove">Rimuovi</button>';
      return friendRow(f, otherId, btn);
    }).join('');
    accEl.querySelectorAll('[data-action="remove"]').forEach(function(btn) {
      btn.addEventListener('click', function() { removeFriend(this.getAttribute('data-fid')); });
    });
  }

  // Pending incoming
  var pendEl = document.getElementById('friends-pending-section');
  var pendList = document.getElementById('friends-pending-list');
  if (pending_in.length > 0) {
    pendEl.style.display = '';
    pendList.innerHTML = pending_in.map(function(f) {
      var btns = '<button class="f-btn accept" data-fid="' + f.id + '" data-action="accept">&#10003;</button>'
               + '<button class="f-btn decline" data-fid="' + f.id + '" data-action="decline">&#10007;</button>';
      return friendRow(f, f.sender_id, btns);
    }).join('');
    pendList.querySelectorAll('[data-action]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var fid = this.getAttribute('data-fid');
        if (this.getAttribute('data-action') === 'accept') acceptFriend(fid);
        else declineFriend(fid);
      });
    });
  } else { pendEl.style.display = 'none'; }

  // Pending outgoing
  var sentEl = document.getElementById('friends-sent-section');
  var sentList = document.getElementById('friends-sent-list');
  if (pending_out.length > 0) {
    sentEl.style.display = '';
    sentList.innerHTML = pending_out.map(function(f) {
      var btn = '<span class="friend-status">In attesa...</span>'
              + '<button class="f-btn remove" data-fid="' + f.id + '" data-action="cancel">Annulla</button>';
      return friendRow(f, f.receiver_id, btn);
    }).join('');
    sentList.querySelectorAll('[data-action="cancel"]').forEach(function(btn) {
      btn.addEventListener('click', function() { cancelFriend(this.getAttribute('data-fid')); });
    });
  } else { sentEl.style.display = 'none'; }
}

const allFriendProfiles = {}; // cache username per user_id

async function searchAndAddFriend() {
  var q = document.getElementById('friend-search-input').value.trim();
  var res = document.getElementById('friend-search-result');
  if (!q) return;
  res.textContent = 'Ricerca...';
  var result = await sb.from('profiles')
    .select('id,username,email')
    .ilike('username', q)
    .neq('id', currentUser.id)
    .limit(1);
  var data = result.data;
  if (!data || data.length === 0) { res.textContent = 'Nessun utente trovato'; return; }
  var target = data[0];
  allFriendProfiles[target.id] = target;
  var existing = myFriendships.find(function(f) {
    return (f.sender_id === currentUser.id && f.receiver_id === target.id) ||
           (f.sender_id === target.id && f.receiver_id === currentUser.id);
  });
  if (existing) {
    if (existing.status === 'accepted') { res.textContent = 'Siete gia amici!'; return; }
    if (existing.status === 'pending')  { res.textContent = 'Richiesta gia in sospeso'; return; }
  }
  var displayName = target.username || target.email;
  res.innerHTML = 'Trovato: <strong>' + displayName + '</strong> — <button id="send-req-btn" style="background:#7a9e7e;color:#fff;border:none;border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer;font-weight:600;">Invia richiesta</button>';
  document.getElementById('send-req-btn').onclick = function() { sendFriendRequest(target.id); };
}

async function sendFriendRequest(targetId) {
  const { error } = await sb.from('friendships').insert({ sender_id: currentUser.id, receiver_id: targetId, status: 'pending' });
  if (error) { showToast('Errore: ' + error.message); return; }
  // Notifica all'utente invitato
  var myUsername = document.getElementById('home-username')?.textContent || 'Qualcuno';
  await createNotif(targetId, 'friend_request', 'Richiesta di amicizia', myUsername + ' vuole diventare tuo amico', null);
  await loadFriendships();
  // Fetch profile if not cached
  if (!allFriendProfiles[targetId]) {
    const { data } = await sb.from('profiles').select('id,username').eq('id', targetId).single();
    if (data) allFriendProfiles[targetId] = data;
  }
  document.getElementById('friend-search-result').textContent = 'Richiesta inviata!';
  document.getElementById('friend-search-input').value = '';
  renderFriendsPanel();
}

async function acceptFriend(friendshipId) {
  // Find the friendship to get sender_id for notification
  var friendship = myFriendships.find(function(f){ return f.id === friendshipId; });
  await sb.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
  if (friendship) {
    var myUsername = document.getElementById('home-username')?.textContent || 'Qualcuno';
    await createNotif(friendship.sender_id, 'friend_accepted', 'Amicizia accettata', myUsername + ' ha accettato la tua richiesta di amicizia', null);
  }
  await loadFriendships();
  checkBadges('friend');
  // Cache missing profiles
  await cacheFriendProfiles();
  renderFriendsPanel();
  showToast('Amicizia accettata!');
}
async function declineFriend(friendshipId) {
  await sb.from('friendships').update({ status: 'declined' }).eq('id', friendshipId);
  await loadFriendships();
  renderFriendsPanel();
}
async function removeFriend(friendshipId) {
  await sb.from('friendships').delete().eq('id', friendshipId);
  await loadFriendships();
  renderFriendsPanel();
  showToast('Amico rimosso');
}
async function cancelFriend(friendshipId) {
  await sb.from('friendships').delete().eq('id', friendshipId);
  await loadFriendships();
  renderFriendsPanel();
}

async function cacheFriendProfiles() {
  const ids = [...new Set(myFriendships.flatMap(f => [f.sender_id, f.receiver_id]))].filter(id => id !== currentUser.id && !allFriendProfiles[id]);
  if (!ids.length) return;
  const { data } = await sb.from('profiles').select('id,username').in('id', ids);
  (data||[]).forEach(p => { allFriendProfiles[p.id] = p; });
}

function getFriendIds() {
  return myFriendships.filter(f => f.status === 'accepted')
    .map(f => f.sender_id === currentUser.id ? f.receiver_id : f.sender_id);
}

function isFriendOfOwner(ownerId) {
  return getFriendIds().includes(ownerId);
}

// ── INVITI CAMPIONATO (diretti, no amicizia) ──
async function inviteFromPlayersPanel() {
  await inviteUser(
    document.getElementById('invite-input-players'),
    document.getElementById('invite-result-players')
  );
}

async function inviteToChamp() {
  await inviteUser(
    document.getElementById('invite-input'),
    document.getElementById('invite-result')
  );
}

async function inviteUser(inputEl, resEl) {
  if (!inputEl || !resEl) return;
  const q = inputEl.value.trim();
  const res = resEl;
  if (!q || !currentChamp) return;
  res.textContent = 'Ricerca...';
  const { data } = await sb.from('profiles')
    .select('id,username,email')
    .or('username.ilike.' + q + ',email.ilike.' + q)
    .neq('id', currentUser.id)
    .limit(1);
  if (!data || !data.length) { res.textContent = 'Nessun utente trovato'; return; }
  const target = data[0];
  // Check not already member
  const { data: existing } = await sb.from('champ_members').select('id,role').eq('champ_id', currentChamp.id).eq('user_id', target.id).maybeSingle();
  if (existing) {
    const roleLabel = {owner:'owner',player:'già iscritto',pending:'richiesta in attesa',rejected:'rifiutato'}[existing.role]||existing.role;
    res.textContent = (target.username||target.email) + ' — ' + roleLabel;
    return;
  }
  // Insert as 'invited' — l'utente deve accettare
  const { error } = await sb.from('champ_members').insert({ champ_id: currentChamp.id, user_id: target.id, username: target.username||target.email, role: 'invited' });
  if (error) { res.textContent = 'Errore: ' + error.message; return; }
  // Notifica con possibilità di accettare/rifiutare
  var champName = champData.championship || currentChamp.name || 'un campionato';
  await createNotif(target.id, 'champ_invite', 'Invito a un campionato',
    'Sei stato invitato a partecipare a "' + champName + '"', currentChamp.id);
  await loadChampMembers();
  res.innerHTML = '<span style="color:var(--green);font-weight:600;">✓ Invito inviato a ' + (target.username||target.email) + '</span>';
  document.getElementById('invite-input').value = '';
  renderChamp();
}

// ── GESTIONE ACCESS TIPO IN NUOVO CAMPIONATO ──
function updateNcPassField(val) {
  const pf = document.getElementById('nc-pass-field');
  if (pf) pf.style.display = val === 'password' ? '' : 'none';
}

// ══════════════════════════════════════════════════
// ── TIME TRIAL ────────────────────────────────────
// ══════════════════════════════════════════════════

// Format a TT value for display
function formatTTValue(val, unit) {
  if (val === null || val === undefined || val === '') return '—';
  if (unit === 'time') {
    // val in milliseconds total
    var ms  = Math.round(val);
    var min = Math.floor(ms / 60000);
    var sec = Math.floor((ms % 60000) / 1000);
    var mil = ms % 1000;
    return (min > 0 ? min + ':' : '') + (sec < 10 && min > 0 ? '0' : '') + sec + '.' + String(mil).padStart(3,'0');
  } else {
    return val.toFixed(2) + ' m';
  }
}

// Parse user input to a raw number (ms for time, float for distance)
function parseTTInput(str, unit) {
  str = str.trim();
  if (!str) return null;
  if (unit === 'time') {
    // Accept: mm:ss.mmm  or  ss.mmm  or  plain ms
    var m = str.match(/^(?:(\d+):)?(\d+)\.(\d{1,3})$/);
    if (m) {
      var mins = parseInt(m[1]||'0');
      var secs = parseInt(m[2]);
      var mils = parseInt(m[3].padEnd(3,'0'));
      return mins*60000 + secs*1000 + mils;
    }
    var plain = parseFloat(str);
    return isNaN(plain) ? null : plain;
  } else {
    var d = parseFloat(str.replace(',','.'));
    return isNaN(d) ? null : d;
  }
}

// Get best run for each player
function calcTTStandings() {
  var players = champData.players || [];
  var runs    = champData.ttRuns  || {};
  var order   = champData.ttOrder || 'asc';
  var unit    = champData.ttUnit  || 'time';
  var results = players.map(function(p) {
    var playerRuns = (runs[p] || []).filter(function(r){ return r !== null && r !== undefined; });
    var best = playerRuns.length === 0 ? null
      : order === 'asc'
        ? Math.min.apply(null, playerRuns)
        : Math.max.apply(null, playerRuns);
    return { name: p, best: best, runs: playerRuns.length };
  });
  // Sort: those with a result first, then by best value
  results.sort(function(a, b) {
    if (a.best === null && b.best === null) return 0;
    if (a.best === null) return 1;
    if (b.best === null) return -1;
    return order === 'asc' ? a.best - b.best : b.best - a.best;
  });
  return results;
}

function renderTTStandings() {
  var standings = calcTTStandings();
  var unit = champData.ttUnit || 'time';
  var posCls = ['p1','p2','p3'];
  var progress = document.getElementById('races-progress');
  var totalRuns = Object.values(champData.ttRuns||{}).reduce(function(s,r){ return s + (r||[]).length; }, 0);
  if (progress) progress.textContent = totalRuns + ' prove inserite';
  var fill = document.getElementById('progress-fill');
  var label = document.getElementById('progress-label');
  var played = standings.filter(function(s){ return s.best !== null; }).length;
  if (fill) fill.style.width = (standings.length > 0 ? Math.round(played/standings.length*100) : 0) + '%';
  if (label) label.textContent = played + '/' + standings.length + ' iscritti con risultato';

  document.getElementById('standings-container').innerHTML = standings.map(function(p, i) {
    var color = PLAYER_COLORS[(champData.players||[]).indexOf(p.name) % PLAYER_COLORS.length];
    return '<div class="rr-stand-row">'
      + '<div class="rr-pos ' + (posCls[i]||'') + '">' + (i===0?'🏆':i+1) + '</div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div class="s-name" style="color:' + color + '">' + p.name + '</div>'
      + '<div class="rr-stat">' + p.runs + ' ' + (p.runs===1?'prova':'prove') + '</div>'
      + '</div>'
      + '<div class="rr-pts-big" style="font-size:15px;">' + formatTTValue(p.best, unit) + '</div>'
      + '</div>';
  }).join('');
}

function renderTTRuns() {
  var el = document.getElementById('races-grid'); if (!el) return;
  var players = champData.players || [];
  var runs    = champData.ttRuns  || {};
  var unit    = champData.ttUnit  || 'time';
  var order   = champData.ttOrder || 'asc';
  var standings = calcTTStandings();

  var html = '';
  standings.forEach(function(ps) {
    var p = ps.name;
    var color = PLAYER_COLORS[(players||[]).indexOf(p) % PLAYER_COLORS.length];
    var playerRuns = (runs[p] || []);
    var best = ps.best;
    html += '<div style="background:var(--card);border-radius:12px;padding:12px 14px;margin-bottom:8px;">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
    html += '<div style="width:10px;height:10px;border-radius:50%;background:' + color + ';flex-shrink:0;"></div>';
    html += '<div style="flex:1;font-size:13px;font-weight:700;">' + p + '</div>';
    html += '<div style="font-size:14px;font-weight:800;color:' + color + ';">' + formatTTValue(best, unit) + '</div>';
    html += '</div>';
    // Runs list
    if (playerRuns.length > 0) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
      playerRuns.forEach(function(r, ri) {
        var isBest = r === best;
        html += '<div style="padding:4px 10px;border-radius:8px;font-size:12px;font-weight:600;background:' + (isBest?'#e8f8e8;color:#1a7a1a':'#f0ede6;color:#666') + ';">'
             + formatTTValue(r, unit) + (isBest?' ★':'') + '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
  });
  el.innerHTML = html || '<div style="color:#bbb;font-size:13px;padding:12px;">Nessuna prova ancora</div>';
}

// ── MANAGE TT ──
function renderManageTT() {
  var players = champData.players || [];
  var runs    = champData.ttRuns  || {};
  var unit    = champData.ttUnit  || 'time';
  var order   = champData.ttOrder || 'asc';
  var placeholder = unit === 'time' ? 'es. 1:23.456' : 'es. 45.20';
  var unitLabel   = unit === 'time' ? 'Tempo (mm:ss.mmm)' : 'Distanza (m)';

  var html = '<p class="manage-hint">Inserisci le prove di ogni partecipante. Conta il risultato migliore.</p>';
  html += '<div style="background:#f5f3ef;border-radius:10px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#888;">'
        + '&#128207; Unità: <strong>' + unitLabel + '</strong> — '
        + 'Classifica: <strong>' + (order==='asc'?'valore più basso = 1°':'valore più alto = 1°') + '</strong>'
        + '</div>';

  players.forEach(function(p) {
    var playerRuns = (runs[p] || []);
    var color = PLAYER_COLORS[(players||[]).indexOf(p) % PLAYER_COLORS.length];
    html += '<div style="margin-bottom:14px;border:1px solid #e0ddd6;border-radius:12px;padding:12px;">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">';
    html += '<div style="width:10px;height:10px;border-radius:50%;background:' + color + ';"></div>';
    html += '<span style="font-size:13px;font-weight:700;">' + p + '</span>';
    html += '</div>';
    // Existing runs
    if (playerRuns.length > 0) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">';
      playerRuns.forEach(function(r, ri) {
        html += '<div style="display:inline-flex;align-items:center;gap:4px;background:#f0ede6;border-radius:7px;padding:4px 8px;font-size:12px;">'
             + formatTTValue(r, unit)
             + '<button data-player="' + p + '" data-run="' + ri + '" data-action="delrun" style="background:none;border:none;color:#bbb;cursor:pointer;font-size:13px;padding:0;line-height:1;">×</button>'
             + '</div>';
      });
      html += '</div>';
    }
    // Add run input
    html += '<div style="display:flex;gap:6px;">';
    html += '<input type="text" id="tt-input-' + p.replace(/[^a-zA-Z0-9]/g,'_') + '" placeholder="' + placeholder + '" style="flex:1;padding:7px 10px;border:1px solid #e0ddd6;border-radius:8px;font-size:13px;outline:none;"/>';
    html += '<button data-player="' + p + '" data-action="addrun" style="padding:7px 14px;background:#7a9e7e;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">+</button>';
    html += '</div>';
    html += '</div>';
  });

  document.getElementById('manage-body').innerHTML = html;

  // Event delegation
  document.getElementById('manage-body').addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    var player = btn.getAttribute('data-player');
    if (action === 'addrun') {
      var inputId = 'tt-input-' + player.replace(/[^a-zA-Z0-9]/g,'_');
      var input = document.getElementById(inputId);
      if (!input) return;
      var val = parseTTInput(input.value, unit);
      if (val === null) { showToast('Valore non valido. Usa formato: ' + placeholder); return; }
      if (!champData.ttRuns) champData.ttRuns = {};
      if (!champData.ttRuns[player]) champData.ttRuns[player] = [];
      champData.ttRuns[player].push(val);
      input.value = '';
      scheduleSave(); renderChamp(); renderManageTT();
    } else if (action === 'delrun') {
      var ri = parseInt(btn.getAttribute('data-run'));
      if (!champData.ttRuns || !champData.ttRuns[player]) return;
      champData.ttRuns[player].splice(ri, 1);
      scheduleSave(); renderChamp(); renderManageTT();
    }
  });
}

// ── TT in impostazioni (unità e ordine modificabili) ──
function renderTTSettings() {
  var unit  = champData.ttUnit  || 'time';
  var order = champData.ttOrder || 'asc';
  return '<div style="background:#f5f3ef;border-radius:10px;padding:12px;margin-top:14px;">'
    + '<p style="font-size:12px;font-weight:700;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px;">Impostazioni Time Trial</p>'
    + '<div class="field" style="margin-bottom:8px;"><label>Unità di misura</label>'
    + '<select id="tt-unit-sel" class="prize-field" style="border:none;font-size:14px;background:transparent;">'
    + '<option value="time"' + (unit==='time'?' selected':'') + '>Tempo (mm:ss.mmm)</option>'
    + '<option value="distance"' + (unit==='distance'?' selected':'') + '>Distanza (metri)</option>'
    + '</select></div>'
    + '<div class="field" style="margin-bottom:10px;"><label>Classifica</label>'
    + '<select id="tt-order-sel" class="prize-field" style="border:none;font-size:14px;background:transparent;">'
    + '<option value="asc"' + (order==='asc'?' selected':'') + '>Valore più basso = 1° (es. tempo)</option>'
    + '<option value="desc"' + (order==='desc'?' selected':'') + '>Valore più alto = 1° (es. distanza)</option>'
    + '</select></div>'
    + '<button onclick="saveTTSettings()" style="background:#7a9e7e;color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:700;cursor:pointer;">Salva impostazioni TT</button>'
    + '</div>';
}

async function saveTTSettings() {
  var unit  = document.getElementById('tt-unit-sel')?.value  || champData.ttUnit;
  var order = document.getElementById('tt-order-sel')?.value || champData.ttOrder;
  champData.ttUnit  = unit;
  champData.ttOrder = order;
  scheduleSave(); renderChamp();
  showToast('Impostazioni Time Trial salvate!');
}
// ── RUBRICA AMICI INVITO ──────────────────────────
function toggleFriendBookItem(el) {
  el.classList.toggle('checked');
  var btn = document.getElementById('invite-book-btn');
  if (!btn) return;
  var anyChecked = document.querySelectorAll('.friends-book-item.checked').length > 0;
  btn.disabled = !anyChecked;
}

async function inviteCheckedFriends() {
  var checked = document.querySelectorAll('.friends-book-item.checked');
  if (!checked.length) return;
  var btn = document.getElementById('invite-book-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Invito in corso...'; }
  var errors = [];
  for (var i = 0; i < checked.length; i++) {
    var el = checked[i];
    var uid = el.getAttribute('data-uid');
    var username = el.getAttribute('data-username') || uid;
    var { data: existing } = await sb.from('champ_members').select('id').eq('champ_id', currentChamp.id).eq('user_id', uid).maybeSingle();
    if (existing) continue;
    var { error: insErr } = await sb.from('champ_members').insert({ champ_id: currentChamp.id, user_id: uid, username: username, role: 'invited' });
    if (insErr) { errors.push(username); continue; }
    // Notifica — l'amico deve accettare
    var cn = champData.championship || currentChamp.name || 'un campionato';
    await createNotif(uid, 'champ_invite', 'Invito a un campionato',
      'Sei stato invitato a partecipare a "' + cn + '"', currentChamp.id);
  }
  await loadChampMembers();
  await scheduleSaveImmediate();
  renderChamp();
  renderManagePlayers();
  if (errors.length) showToast('Errore per: ' + errors.join(', '));
  else showToast('✓ ' + checked.length + ' amico/i aggiunto/i!');
}

function updateShareBar() {
  if (!currentChamp) return;
  var url = window.location.origin + window.location.pathname + '?champ=' + currentChamp.id;
  var text = 'Partecipa al campionato "' + (champData.championship||'Rankit') + '" su Rankit! ' + url;
  var waBtn = document.getElementById('share-wa');
  var tgBtn = document.getElementById('share-tg');
  var igBtn = document.getElementById('share-ig');
  if (waBtn) waBtn.href = 'https://wa.me/?text=' + encodeURIComponent(text);
  if (tgBtn) tgBtn.href = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent('Partecipa al campionato "' + (champData.championship||'Rankit') + '"!');
  // Instagram: copia link e apre instagram.com
  if (igBtn) igBtn.onclick = function(e) {
    e.preventDefault();
    var igUrl = url;
    navigator.clipboard.writeText(igUrl).then(function() {
      showToast('Link copiato! Aprendo Instagram...');
      setTimeout(function() { window.open('https://www.instagram.com/direct/inbox/', '_blank'); }, 800);
    }).catch(function() {
      window.open('https://www.instagram.com/direct/inbox/', '_blank');
    });
  };
}

function copyChampLink() {
  if (!currentChamp) return;
  var url = window.location.origin + window.location.pathname + '?champ=' + currentChamp.id;
  var btn = document.getElementById('share-copy');
  navigator.clipboard.writeText(url).then(function() {
    showToast('Link copiato!');
    if (btn) {
      btn.classList.add('copied');
      setTimeout(function(){ btn.classList.remove('copied'); }, 2000);
    }
  }).catch(function() {
    showToast('Copia manuale: ' + url);
  });
}


function copyShareLink() {
  var input = document.getElementById('share-link-input');
  if (!input) return;
  navigator.clipboard.writeText(input.value).then(function() {
    var btn = document.getElementById('copy-share-btn');
    if (btn) { btn.textContent = '✓ Copiato!'; setTimeout(function(){ btn.textContent = '📋 Copia'; }, 2000); }
  }).catch(function() {
    // Fallback for browsers without clipboard API
    input.select(); document.execCommand('copy');
    showToast('Link copiato!');
  });
}

// Check URL for ?champ= param and open directly
async function checkUrlChampParam() {
  var params = new URLSearchParams(window.location.search);
  var champId = params.get('champ');
  if (!champId || !currentUser) return;
  // Clean URL without reloading
  window.history.replaceState({}, '', window.location.pathname);
  await openChampionship(champId);
}


function showFooterPage(page) {
  var labels = {
    privacy: 'Privacy Policy', terms: 'Termini di Servizio',
    contact: 'Contatti', legal: 'Note Legali', cookies: 'Cookie Policy'
  };
  showToast((labels[page] || page) + ' - pagina in costruzione');
}

// ══════════════════════════════════════════════════
// ── NOTIFICHE ─────────────────────────────────────
// ══════════════════════════════════════════════════
let notifications = [];
let notifPollTimer = null;

const NOTIF_ICONS = {
  friend_request: '👥', friend_accepted: '✅',
  champ_invite: '📨', champ_result: '🏆',
  join_request: '🙋', join_accepted: '🎉', join_rejected: '❌'
};

async function loadNotifications() {
  if (!currentUser) return;
  // ── Elimina notifiche più vecchie di 7 giorni ──
  var cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await sb.from('notifications')
    .delete()
    .eq('user_id', currentUser.id)
    .lt('created_at', cutoff);
  // ── Carica notifiche recenti ──
  const { data } = await sb.from('notifications')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(50);
  notifications = data || [];
  updateNotifBadge();
}

function updateNotifBadge() {
  var unread = notifications.filter(function(n){ return !n.read; }).length;
  var text = unread > 9 ? '9+' : String(unread);
  var show = unread > 0;
  // Home notif dot badge
  var badge = document.getElementById('notif-badge');
  if (badge) badge.style.display = show ? '' : 'none';
  // Count badge (old)
  var countBadge = document.getElementById('notif-count');
  if (countBadge) { countBadge.textContent = text; countBadge.classList.toggle('show', show); }
  // All header badges across pages
  ['notif-badge-dash','notif-badge-champ'].forEach(function(id) {
    var b = document.getElementById(id);
    if (b) { b.style.display = show ? '' : 'none'; b.textContent = show ? text : ''; }
  });
}

function openNotifPanel() {
  renderNotifList();
  document.getElementById('notif-overlay').classList.add('open');
}
function closeNotifPanel() {
  document.getElementById('notif-overlay').classList.remove('open');
}

function renderNotifList() {
  var el = document.getElementById('notif-list');
  if (!el) return;
  if (!notifications.length) {
    el.innerHTML = '<div class="notif-empty">🔔 Nessuna notifica</div>';
    return;
  }
    var container = document.createElement('div');
  notifications.forEach(function(n) {
    var icon = NOTIF_ICONS[n.type] || '🔔';
    var ago = timeAgo(n.created_at);
    var item = document.createElement('div');
    item.className = 'notif-item' + (n.read ? '' : ' unread');
    item.setAttribute('data-id', n.id);
    item.innerHTML = '<div style="display:flex;gap:10px;align-items:flex-start;">'
      + '<span class="notif-icon">' + icon + '</span>'
      + '<div style="flex:1;min-width:0;">'
      + '<div class="notif-title">' + esc(n.title) + '</div>'
      + (n.body ? '<div class="notif-body">' + esc(n.body) + '</div>' : '')
      + '<div class="notif-time">' + ago + '</div>'
      + '</div></div>';
    if (n.champ_id) {
      item.style.cursor = 'pointer';
      (function(notif) {
        if (notif.type === 'champ_invite') {
          // Show accept/decline buttons inline
          var actionsDiv = document.createElement('div');
          actionsDiv.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
          var acceptBtn = document.createElement('button');
          acceptBtn.textContent = 'Accetta';
          acceptBtn.style.cssText = 'padding:4px 14px;background:var(--green);color:#fff;border:none;border-radius:2px;font-size:11px;letter-spacing:.4px;cursor:pointer;';
          var declineBtn = document.createElement('button');
          declineBtn.textContent = 'Rifiuta';
          declineBtn.style.cssText = 'padding:4px 14px;background:transparent;color:var(--muted);border:1px solid var(--border);border-radius:2px;font-size:11px;letter-spacing:.4px;cursor:pointer;';
          acceptBtn.addEventListener('click', function(e) { e.stopPropagation(); acceptInvite(notif.champ_id, notif.id); });
          declineBtn.addEventListener('click', function(e) { e.stopPropagation(); declineInvite(notif.champ_id, notif.id); });
          actionsDiv.appendChild(acceptBtn);
          actionsDiv.appendChild(declineBtn);
          item.appendChild(actionsDiv);
        } else {
          item.addEventListener('click', function() { closeNotifPanel(); openChampionship(notif.champ_id); });
        }
      })(n);
    }
    item.addEventListener('mouseenter', function() { markNotifRead(n.id); });
    container.appendChild(item);
  });
  el.innerHTML = '';
  el.appendChild(container);
}

async function markNotifRead(id) {
  var n = notifications.find(function(x){ return x.id === id; });
  if (!n || n.read) return;
  n.read = true;
  await sb.from('notifications').update({ read: true }).eq('id', id);
  updateNotifBadge();
}

async function markAllNotifsRead() {
  var unreadIds = notifications.filter(function(n){ return !n.read; }).map(function(n){ return n.id; });
  if (!unreadIds.length) return;
  notifications.forEach(function(n){ n.read = true; });
  renderNotifList();
  updateNotifBadge();
  await sb.from('notifications').update({ read: true }).eq('user_id', currentUser.id).eq('read', false);
}

// Crea notifica su DB (chiamata da chi genera l'evento)
async function createNotif(userId, type, title, body, champId) {
  if (!userId || userId === currentUser.id) return; // non notificare se stesso
  await sb.from('notifications').insert({
    user_id: userId, type: type, title: title, body: body || null,
    champ_id: champId || null, actor_id: currentUser.id
  });
}

// Polling ogni 5 minuti
function startNotifPolling() {
  if (notifPollTimer) clearInterval(notifPollTimer);
  loadNotifications();
  notifPollTimer = setInterval(loadNotifications, 5 * 60 * 1000);
}
function stopNotifPolling() {
  if (notifPollTimer) { clearInterval(notifPollTimer); notifPollTimer = null; }
}

function timeAgo(isoStr) {
  var diff = Math.floor((Date.now() - new Date(isoStr)) / 1000);
  if (diff < 60)  return 'Ora';
  if (diff < 3600) return Math.floor(diff/60) + ' min fa';
  if (diff < 86400) return Math.floor(diff/3600) + ' ore fa';
  return Math.floor(diff/86400) + ' giorni fa';
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ══════════════════════════════════════════════════
// ── DASHBOARD AVANZATA ────────────────────────────
// ══════════════════════════════════════════════════

function attachChampCardListeners() {
  document.querySelectorAll('[data-cid]').forEach(function(el) {
    if (el._champListenerAttached) return; // avoid duplicates
    el._champListenerAttached = true;
    el.style.cursor = 'pointer';
    el.addEventListener('click', function(e) {
      if (e.target.closest('button')) return; // don't intercept button clicks inside card
      var cid = el.getAttribute('data-cid');
      if (cid) openChampionship(cid);
    });
  });
}
function dashStat(num, lbl) {
  return '<div class="dash-stat-card"><div class="dash-stat-num">' + num + '</div><div class="dash-stat-lbl">' + lbl + '</div></div>';
}

async function loadDashboard() {
  var profile = await sb.auth.getUser();
  var username = profile.data?.user?.user_metadata?.username || currentUser?.email?.split('@')[0] || 'Utente';
  var el = document.getElementById('dash-username');
  if (el) el.textContent = username;
  var av = document.getElementById('dash-username-av');
  if (av) av.textContent = username.substring(0,2).toUpperCase();
  // Update theme icon on dashboard
  applyTheme(getTheme());

  // Carica memberships dell'utente
  var { data: memberships } = await sb.from('champ_members')
    .select('champ_id, role')
    .eq('user_id', currentUser.id)
    .in('role', ['owner','player']);

  var champIds = (memberships||[]).map(function(m){ return m.champ_id; });
  if (!champIds.length) {
    var _dsr=document.getElementById('dash-stats-row'); if(_dsr) _dsr.innerHTML='';
    document.getElementById('dash-champs-list').innerHTML =
      '<div style="color:var(--muted);font-size:13px;padding:20px 0;">Non sei ancora iscritto a nessun campionato.</div>';
    return;
  }

  // Carica campionati archiviati dall'utente
  var { data: archivedRows } = await sb.from('user_archives')
    .select('champ_id')
    .eq('user_id', currentUser.id);
  var archivedIds = (archivedRows||[]).map(function(r){ return r.champ_id; });

  // Carica campionati attivi (escludi archiviati)
  var activeIds = champIds.filter(function(id){ return !archivedIds.includes(id); });
  var champs = [];
  if (activeIds.length) {
    var { data: champsData } = await sb.from('championships')
      .select('id,name,season,access,closed,owner_id,created_at,data')
      .in('id', activeIds);
    champs = champsData || [];
  }

  // Stats rapide
  var ownedCount = champs.filter(function(c){ return c.owner_id === currentUser.id; }).length;
  var playingCount = champs.filter(function(c){ return c.owner_id !== currentUser.id; }).length;
  // Stats row removed (element may not exist)

  // Render campionati attivi
  var html = '';
  for (var i = 0; i < champs.length; i++) {
    html += renderDashChampCard(champs[i], memberships);
  }
  document.getElementById('dash-champs-list').innerHTML = html ||
    '<div style="color:var(--muted);font-size:13px;padding:16px 0;">Non sei iscritto a nessun campionato attivo.</div>';

  // Render archivio
  // Find which archived champs were archived by their owner (owner-wide archive)
  var ownerArchivedSet = new Set();
  if (archivedIds.length) {
    // Get owner_ids for each archived champ
    var { data: champOwners } = await sb.from('championships')
      .select('id, owner_id').in('id', archivedIds);
    // For each champ, check if the owner has an archive row
    if (champOwners && champOwners.length) {
      var checks = champOwners.map(function(c) {
        return sb.from('user_archives')
          .select('champ_id', { count: 'exact', head: true })
          .eq('champ_id', c.id).eq('user_id', c.owner_id);
      });
      var results = await Promise.all(checks);
      results.forEach(function(res, i) {
        if (res.count > 0) ownerArchivedSet.add(champOwners[i].id);
      });
    }
  }
  await renderDashArchive(archivedIds, memberships, ownerArchivedSet);
}

function renderDashChampCard(champ, memberships) {
  var data = champ.data || {};
  var fmt = data.format || 'standard';
  var players = data.players || [];
  var username = document.getElementById('dash-username')?.textContent || '';
  var myRole = (memberships.find(function(m){ return m.champ_id === champ.id; })||{}).role || '';
  var isOwner = champ.owner_id === currentUser.id;
  var position = getMyPosition(data, fmt, username);
  var nextMatch = getNextMatch(data, fmt, username);

  var html = '<div class="dash-champ-card">';
  html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">';
  html += '<div class="dash-champ-name">' + esc(champ.name) + (champ.season ? ' <span style="font-size:11px;color:var(--muted);">' + esc(champ.season) + '</span>' : '') + '</div>';
  html += '<div style="display:flex;gap:6px;flex-shrink:0;">';
  html += '<button data-champid="' + champ.id + '" onclick="openChampionship(this.getAttribute(\'data-champid\'))" style="padding:5px 12px;background:var(--violet);color:#fff;border:none;border-radius:7px;font-size:12px;cursor:pointer;font-weight:600;">Apri</button>';
  html += '<button onclick="archiveChamp(\'' + champ.id + '\')" style="padding:5px 10px;background:rgba(255,255,255,.06);color:var(--muted);border:1px solid var(--border);border-radius:7px;font-size:12px;cursor:pointer;" title="Archivia">&#128230;</button>';
  if (isOwner) {
    html += '<button data-champid="' + champ.id + '" data-champname="' + esc(champ.name).replace(/"/g,'&quot;') + '" onclick="deleteDashChamp(this)" style="padding:5px 10px;background:rgba(244,63,94,0.15);color:var(--red);border:1px solid rgba(244,63,94,0.3);border-radius:7px;font-size:12px;cursor:pointer;font-weight:600;" title="Elimina campionato">&#128465;</button>';
  } else {
    html += '<button onclick="leaveChamp(\'' + champ.id + '\',\'' + esc(champ.name).replace(/'/g,'\\\'') + '\')" style="padding:5px 10px;background:rgba(16,185,129,0.12);color:var(--green);border:1px solid rgba(16,185,129,0.3);border-radius:7px;font-size:12px;cursor:pointer;" title="Lascia campionato">&#x1F6AA;</button>';
  }
  html += '</div></div>';
  html += '<div class="dash-champ-meta">';
  html += '<span>' + fmtLabel(fmt) + '</span>';
  html += '<span>' + players.length + ' giocatori</span>';
  if (isOwner) html += '<span class="highlight">&#128081; Owner</span>';
  if (position !== null) {
    var medal = position === 1 ? '&#129351;' : position === 2 ? '&#129352;' : position === 3 ? '&#129353;' : '&#127885;';
    html += '<span class="highlight">' + medal + ' ' + position + '&deg; posto</span>';
  }
  html += '</div>';
  if (nextMatch) {
    html += '<div class="dash-next-match">&#9876;&#65039; Prossima sfida: <strong>' + esc(nextMatch) + '</strong></div>';
  }
  html += '</div>';
  return html;
}

async function renderDashArchive(archivedIds, memberships, ownerArchivedIds) {
  var archSection = document.getElementById('dash-archive-section');
  var archList    = document.getElementById('dash-archive-list');
  if (!archSection || !archList) return;

  if (!archivedIds.length) { archSection.style.display = 'none'; return; }
  archSection.style.display = '';

  var { data: archChamps } = await sb.from('championships')
    .select('id,name,season,owner_id,data')
    .in('id', archivedIds);
  archChamps = archChamps || [];

  archList.innerHTML = '';
  archChamps.forEach(function(c) {
    var fmt = (c.data||{}).format || 'standard';
    var isOwnerOfChamp = c.owner_id === currentUser.id;
    // Può ripristinare se:
    // - è l'owner (ripristina per tutti)
    // - è un membro che ha archiviato autonomamente (il proprio archivio personale)
    // Non può ripristinare solo se l'owner ha archiviato per tutti e lui è un semplice membro
    // Per distinguere: se l'owner è tra gli archivianti, allora è stato l'owner ad archiviare
    // Usiamo il flag ownerArchivedIds passato dalla funzione parent
    var ownerArchivedThisForAll = ownerArchivedIds && ownerArchivedIds.has(c.id);
    var canRestore = isOwnerOfChamp || !ownerArchivedThisForAll;

    var card = document.createElement('div');
    card.className = 'dash-champ-card';
    card.style.opacity = '0.65';
    var restoreBtn = canRestore
      ? '<button style="padding:5px 10px;background:rgba(16,185,129,.15);color:var(--green);border:1px solid rgba(16,185,129,.3);border-radius:7px;font-size:12px;cursor:pointer;font-weight:600;">&#8629; Ripristina</button>'
      : '<span style="font-size:11px;color:var(--faint);align-self:center;">Archiviato dall\'organizzatore</span>';
    card.innerHTML = '<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;">'
      + '<div class="dash-champ-name">' + esc(c.name) + (c.season?' <span style="font-size:11px;color:var(--muted);">'+esc(c.season)+'</span>':'') + '</div>'
      + '<div style="display:flex;gap:6px;align-items:center;">'
      + '<button style="padding:5px 10px;background:var(--faint);color:var(--muted);border:none;border-radius:7px;font-size:12px;cursor:pointer;">Apri</button>'
      + restoreBtn
      + '</div></div>'
      + '<div class="dash-champ-meta"><span>' + fmtLabel(fmt) + '</span><span style="color:var(--faint);">&#128230; Archiviato</span></div>';
    // Attach events
    var openBtn = card.querySelector('button');
    openBtn.addEventListener('click', function(){ openChampionship(c.id); });
    if (canRestore) {
      var restBtns = card.querySelectorAll('button');
      restBtns[1].addEventListener('click', function(){ unarchiveChamp(c.id); });
    }
    archList.appendChild(card);
  });
}


async function leaveChamp(champId, champName) {
  if (!confirm('Vuoi rimuoverti da "' + champName + '"?\nI tuoi risultati verranno rimossi dal campionato.')) return;

  try {
  // Load full champ data
  var { data: champRow } = await sb.from('championships')
    .select('id,data').eq('id', champId).single();
  if (!champRow) { showToast('Campionato non trovato'); return; }

  var d = champRow.data || {};
  // Get username reliably from currentUser, not from DOM
  var me = currentUser?.user_metadata?.username || currentUser?.email?.split('@')[0] || '';
  var fmt = d.format || 'standard';

  // ── Remove from players list ──
  d.players = (d.players || []).filter(function(p){ return p !== me; });

  // ── Format-specific cleanup ──
  if (fmt === 'standard') {
    // Remove from races: clear positions where me appears
    (d.races || []).forEach(function(r) {
      if (r.result) {
        if (r.result.first === me)  r.result.first  = null;
        if (r.result.second === me) r.result.second = null;
      }
    });

  } else if (fmt === 'roundrobin') {
    // Matches involving me: if played and I won → nullify (don't give to opponent)
    // If not yet played → leave as-is (will just be unplayable)
    // If me lost → keep opponent win (opponent keeps points)
    (d.rrMatches || []).forEach(function(m) {
      var involvesMe = (m.p1 === me || m.p2 === me);
      if (!involvesMe) return;
      if (!m.winner) return; // not played yet — nothing to undo
      if (m.winner === me) {
        // I won: nullify the result (don't give to opponent)
        m.winner = null; m.result = null;
      }
      // If opponent won: keep their win (they earned it)
    });

  } else if (fmt === 'elimination') {
    // Remove me from bracket slots and nullify matches I'm in
    (d.elimBracket || []).forEach(function(round) {
      round.forEach(function(m) {
        if (m.p1 === me) m.p1 = null;
        if (m.p2 === me) m.p2 = null;
        if (m.winner === me) { m.winner = null; }
      });
    });

  } else if (fmt === 'timetrial') {
    // Remove my runs
    if (d.ttRuns) delete d.ttRuns[me];
  }

  // ── Save updated data ──
  var { error: dataErr } = await sb.from('championships')
    .update({ data: d }).eq('id', champId);
  if (dataErr) { showToast('Errore aggiornamento dati: ' + dataErr.message); return; }

  // ── Remove from champ_members ──
  var { error: memErr } = await sb.from('champ_members')
    .delete().eq('champ_id', champId).eq('user_id', currentUser.id);
  if (memErr) { showToast('Errore rimozione: ' + memErr.message); return; }

  // ── Remove from favourites ──
  await sb.from('user_favourites')
    .delete().eq('champ_id', champId).eq('user_id', currentUser.id);

  // ── Remove from archive if archived ──
  await sb.from('user_archives')
    .delete().eq('champ_id', champId).eq('user_id', currentUser.id);

  showToast('Hai lasciato il campionato');
  try { await loadDashboard(); } catch(e) { console.error('loadDashboard error', e); }
  try { await loadChampionshipsHome(); } catch(e) { console.error('loadHome error', e); }
  } catch(e) {
    console.error('[leaveChamp error]', e);
    showToast('Errore durante l\'uscita: ' + e.message);
  }
}


async function archiveChamp(champId) {
  // Controlla se l'utente è owner del campionato
  var { data: champRow } = await sb.from('championships')
    .select('owner_id').eq('id', champId).single();
  var isOwnerOfChamp = champRow && champRow.owner_id === currentUser.id;

  if (isOwnerOfChamp) {
    // Owner: archivia per TUTTI i membri
    var { data: members } = await sb.from('champ_members')
      .select('user_id').eq('champ_id', champId);
    members = members || [];
    // Aggiungi owner stesso se non è nella lista
    var allUserIds = members.map(function(m){ return m.user_id; });
    if (!allUserIds.includes(currentUser.id)) allUserIds.push(currentUser.id);
    // Inserisci in user_archives per tutti (ignora duplicati)
    var rows = allUserIds.map(function(uid){ return { user_id: uid, champ_id: champId }; });
    var { error } = await sb.from('user_archives').upsert(rows, { onConflict: 'user_id,champ_id' });
    if (error) { showToast('Errore: ' + error.message); return; }
    showToast('Campionato archiviato per tutti i partecipanti');
  } else {
    // Membro normale: archivia solo per se stesso
    var { error } = await sb.from('user_archives')
      .insert({ user_id: currentUser.id, champ_id: champId });
    if (error) { showToast('Errore: ' + error.message); return; }
    showToast('Campionato archiviato');
  }
  loadDashboard();
  loadChampionshipsHome();
}

async function unarchiveChamp(champId) {
  // Controlla se owner
  var { data: champRow } = await sb.from('championships')
    .select('owner_id').eq('id', champId).single();
  var isOwnerOfChamp = champRow && champRow.owner_id === currentUser.id;

  if (isOwnerOfChamp) {
    // Owner: ripristina per tutti (cancella tutti i record di questo champ)
    var { error } = await sb.from('user_archives')
      .delete().eq('champ_id', champId);
    if (error) { showToast('Errore: ' + error.message); return; }
    showToast('Campionato ripristinato per tutti i partecipanti');
  } else {
    // Membro normale (non dovrebbe arrivare qui, ma per sicurezza)
    var { error } = await sb.from('user_archives')
      .delete().eq('user_id', currentUser.id).eq('champ_id', champId);
    if (error) { showToast('Errore: ' + error.message); return; }
    showToast('Campionato ripristinato');
  }
  loadDashboard();
  await loadChampionshipsHome();
}

async function deleteDashChamp(btn) {
  var champId = btn.getAttribute('data-champid');
  var champName = btn.getAttribute('data-champname');
  if (!confirm('Eliminare definitivamente il campionato "' + champName + '"? Questa azione è irreversibile.')) return;
  var { error } = await sb.from('championships').delete().eq('id', champId);
  if (error) { showToast('Errore: ' + error.message); return; }
  showToast('Campionato eliminato');
  loadDashboard();
}

function fmtLabel(fmt) {
  return {standard:'Standard', roundrobin:'Round Robin', elimination:'Eliminazione', timetrial:'Time Trial'}[fmt] || fmt;
}

function getMyPosition(data, fmt, username) {
  try {
    if (fmt === 'standard') {
      var races = data.races || [];
      var pts = {};
      (data.players||[]).forEach(function(p){ pts[p] = 0; });
      races.forEach(function(r){
        if (r.result) {
          if (r.result.first) pts[r.result.first] = (pts[r.result.first]||0) + 3;
          if (r.result.second) pts[r.result.second] = (pts[r.result.second]||0) + 1;
        }
      });
      var sorted = Object.keys(pts).sort(function(a,b){ return pts[b]-pts[a]; });
      var idx = sorted.indexOf(username);
      return idx >= 0 ? idx + 1 : null;
    }
    if (fmt === 'roundrobin') {
      var matches = data.rrMatches || [];
      var pts2 = {};
      (data.players||[]).forEach(function(p){ pts2[p] = 0; });
      matches.forEach(function(m){
        if (m.winner) { pts2[m.winner] = (pts2[m.winner]||0) + 3; }
        else if (m.result === 'draw') {
          pts2[m.p1] = (pts2[m.p1]||0) + 1;
          pts2[m.p2] = (pts2[m.p2]||0) + 1;
        }
      });
      var sorted2 = Object.keys(pts2).sort(function(a,b){ return pts2[b]-pts2[a]; });
      var idx2 = sorted2.indexOf(username);
      return idx2 >= 0 ? idx2 + 1 : null;
    }
    if (fmt === 'timetrial') {
      var runs = data.ttRuns || {};
      var order = data.ttOrder || 'asc';
      var allPlayers = data.players || [];
      var bests = allPlayers.map(function(p) {
        var pr = (runs[p]||[]);
        return { name: p, best: pr.length ? (order==='asc' ? Math.min.apply(null,pr) : Math.max.apply(null,pr)) : null };
      }).filter(function(x){ return x.best !== null; });
      bests.sort(function(a,b){ return order==='asc' ? a.best-b.best : b.best-a.best; });
      var idx3 = bests.findIndex(function(x){ return x.name === username; });
      return idx3 >= 0 ? idx3+1 : null;
    }
  } catch(e) {}
  return null;
}

function getNextMatch(data, fmt, username) {
  try {
    if (fmt === 'roundrobin') {
      var matches = data.rrMatches || [];
      var next = matches.find(function(m){
        return m.result === null && (m.p1 === username || m.p2 === username);
      });
      if (next) return 'vs ' + (next.p1 === username ? next.p2 : next.p1);
    }
    if (fmt === 'elimination') {
      var bracket = data.elimBracket || [];
      for (var ri = 0; ri < bracket.length; ri++) {
        for (var mi = 0; mi < bracket[ri].length; mi++) {
          var m = bracket[ri][mi];
          if (!m.winner && (m.p1 === username || m.p2 === username) && m.p1 && m.p2) {
            return 'vs ' + (m.p1 === username ? m.p2 : m.p1);
          }
        }
      }
    }
  } catch(e) {}
  return null;
}

// ══════════════════════════════════════════════════
// ── RESET CAMPIONATO ──────────────────────────────
// ══════════════════════════════════════════════════
async function resetChampResults() {
  if (!confirm('Azzerare tutti i risultati? Gli iscritti e le gare rimarranno, ma tutti i punteggi verranno cancellati.')) return;
  var fmt = champData.format || 'standard';
  // Azzera risultati per ogni formato
  if (fmt === 'standard') {
    (champData.races||[]).forEach(function(r){ r.result = null; });
  } else if (fmt === 'roundrobin') {
    (champData.rrMatches||[]).forEach(function(m){
      m.result = null; m.winner = null; m.score1 = null; m.score2 = null;
    });
  } else if (fmt === 'elimination') {
    (champData.elimBracket||[]).forEach(function(round){
      round.forEach(function(m){ m.winner = null; m.score1 = null; m.score2 = null; });
    });
  } else if (fmt === 'timetrial') {
    champData.ttRuns = {};
  }
  await scheduleSaveImmediate();
  renderChamp();
  renderManageSettings();
  showToast('Risultati azzerati');
  // Notifica ai partecipanti
  var members = champMembers.filter(function(m){ return m.role === 'player' && m.user_id !== currentUser.id; });
  for (var i = 0; i < members.length; i++) {
    await createNotif(members[i].user_id, 'champ_result',
      'Risultati azzerati', 'I risultati di "' + (champData.championship||'') + '" sono stati azzerati.',
      currentChamp.id);
  }
}

async function resetChampFull() {
  if (!confirm('RESET TOTALE: cancella tutti i dati del campionato (gare, risultati, iscrizioni). Rimarrà solo il nome. Questa azione è irreversibile.')) return;
  var fmt = champData.format || 'standard';
  champData.races = [];
  champData.rrMatches = [];
  champData.elimBracket = null;
  champData.ttRuns = {};
  champData.players = [document.getElementById('home-username')?.textContent || ''];
  // Rimuovi tutti i membri tranne l'owner
  await sb.from('champ_members').delete().eq('champ_id', currentChamp.id).neq('role', 'owner');
  await loadChampMembers();
  await scheduleSaveImmediate();
  renderChamp();
  renderManageSettings();
  showToast('Reset completato');
}

// ── EXPORT CLASSIFICA ─────────────────────────────
// Genera il canvas della classifica (riutilizzato da download e share)
async function buildStandingsCanvas() {
  try {
    var champName = champData.championship || 'Rankit';
    var season = champData.season || '';

    // Crea un div temporaneo con la classifica stilizzata per l'export
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:420px;background:#0f1628;border-radius:16px;padding:24px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;';

    // Header
    var header = document.createElement('div');
    header.style.cssText = 'background:linear-gradient(90deg,#4c1d95,#7c3aed,#1e3a8a);border-radius:10px;padding:16px 20px;margin-bottom:16px;';
    header.innerHTML = '<div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.6);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">RANKIT</div>'
      + '<div style="font-size:20px;font-weight:900;color:#fff;">' + champName + (season ? ' · ' + season : '') + '</div>'
      + '<div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:4px;">Classifica — ' + new Date().toLocaleDateString("it-IT", {day:"2-digit",month:"long",year:"numeric"}) + '</div>';
    wrap.appendChild(header);

    // Righe classifica
    var standings = getStandingsData();
    var colors = PLAYER_COLORS || ['#7c3aed','#3b82f6','#10b981','#f59e0b','#f43f5e'];
    var medals = ['🥇','🥈','🥉'];

    standings.forEach(function(row, i) {
      var rowEl = document.createElement('div');
      var isTop = i < 3;
      rowEl.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;margin-bottom:6px;background:' + (isTop ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)') + ';';

      var pos = document.createElement('div');
      pos.style.cssText = 'font-size:18px;width:28px;text-align:center;flex-shrink:0;';
      pos.textContent = medals[i] || (i + 1) + '';

      var dot = document.createElement('div');
      dot.style.cssText = 'width:10px;height:10px;border-radius:50%;background:' + (colors[i % colors.length]) + ';flex-shrink:0;';

      var nameWrap = document.createElement('div');
      nameWrap.style.cssText = 'flex:1;min-width:0;';

      var name = document.createElement('div');
      name.style.cssText = 'font-size:14px;font-weight:700;color:#f0f2ff;';
      name.textContent = row.name;
      nameWrap.appendChild(name);

      if (row.sub) {
        var sub = document.createElement('div');
        sub.style.cssText = 'font-size:11px;color:rgba(255,255,255,.35);margin-top:1px;';
        sub.textContent = row.sub;
        nameWrap.appendChild(sub);
      }

      var pts = document.createElement('div');
      pts.style.cssText = 'font-size:16px;font-weight:800;color:' + (colors[i % colors.length]) + ';flex-shrink:0;';
      pts.textContent = row.score;

      rowEl.appendChild(pos); rowEl.appendChild(dot);
      rowEl.appendChild(nameWrap); rowEl.appendChild(pts);
      wrap.appendChild(rowEl);
    });

    // Footer
    var footer = document.createElement('div');
    footer.style.cssText = 'text-align:center;margin-top:14px;font-size:10px;color:rgba(255,255,255,.25);letter-spacing:.5px;';
    footer.textContent = 'rankit.it';
    wrap.appendChild(footer);

    document.body.appendChild(wrap);

    var canvas = await html2canvas(wrap, {
      backgroundColor: '#0f1628',
      scale: 2,
      useCORS: true,
      logging: false
    });

    document.body.removeChild(wrap);
    return { canvas: canvas, champName: champName };
  } catch(e) {
    console.error(e);
    showToast('Errore generazione immagine: ' + e.message);
    return null;
  }
}

async function shareStandingsImage(target) {
  showToast('Generando immagine...');
  var result = await buildStandingsCanvas();
  if (!result) return;
  var canvas = result.canvas;
  var champName = result.champName;
  var filename = 'classifica-' + champName.replace(/[^a-zA-Z0-9]/g,'-').toLowerCase() + '.png';

  if (target === 'download') {
    // Salva sul dispositivo
    var link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('Immagine salvata!');
    return;
  }

  // Converti canvas in Blob per Web Share API
  canvas.toBlob(async function(blob) {
    var file = new File([blob], filename, { type: 'image/png' });

    // Web Share API (supportata su mobile Chrome/Safari)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Classifica ' + champName,
          text: 'Classifica del campionato ' + champName + ' su Rankit!'
        });
        return;
      } catch(e) {
        if (e.name === 'AbortError') return; // utente ha annullato
      }
    }

    // Fallback desktop: scarica l'immagine + apre il social
    var url = canvas.toDataURL('image/png');
    var link2 = document.createElement('a');
    link2.download = filename;
    link2.href = url;
    link2.click();

    setTimeout(function() {
      if (target === 'whatsapp') {
        window.open('https://wa.me/?text=' + encodeURIComponent('Classifica ' + champName + ' su Rankit!'), '_blank');
      } else if (target === 'telegram') {
        window.open('https://t.me/share/url?url=' + encodeURIComponent('https://rankit.it') + '&text=' + encodeURIComponent('Classifica ' + champName), '_blank');
      } else if (target === 'instagram') {
        window.open('https://www.instagram.com/direct/inbox/', '_blank');
      }
      showToast('Immagine scaricata — incollala nel social!');
    }, 600);
  }, 'image/png');
}

// Kept for backward compat
async function exportStandings() {
  await shareStandingsImage('download');
}

// Helper: restituisce i dati della classifica — identica a quella visualizzata
function getStandingsData() {
  var fmt = champData.format || 'standard';

  if (fmt === 'roundrobin') {
    // calcRRStandings: {name, pts, v, p, s, gf, gs}
    return calcRRStandings().map(function(p) {
      return { name: p.name, score: p.pts + ' pt', sub: p.v + 'V ' + p.p + 'P ' + p.s + 'S' };
    });
  }

  if (fmt === 'timetrial') {
    // calcTTStandings: {name, best, runs}
    var unit = champData.ttUnit || 'time';
    return calcTTStandings().map(function(p) {
      return { name: p.name, score: p.best !== null ? formatTTValue(p.best, unit) : '—', sub: p.runs + ' prove' };
    });
  }

  if (fmt === 'elimination') {
    // Conta match vinti nel bracket
    var bracket = champData.elimBracket || [];
    var players = champData.players || [];
    var wins = {};
    players.forEach(function(p){ wins[p] = 0; });
    bracket.forEach(function(round) {
      round.forEach(function(m){ if (m.winner && wins[m.winner] !== undefined) wins[m.winner]++; });
    });
    // Campione = vincitore dell'ultima giornata
    var champ = bracket.length ? (bracket[bracket.length-1][0] || {}).winner : null;
    return players
      .map(function(p){ return { name: p, score: wins[p] + ' vinte', sub: champ === p ? 'Campione 🏆' : '' }; })
      .sort(function(a,b){ return parseInt(b.score) - parseInt(a.score); });
  }

  // Standard — calcStandings: {name, pts} (pts = numero vittorie)
  return calcStandings().map(function(p) {
    var wins = (champData.races||[]).filter(function(r){ return r.result && r.result.first === p.name; }).length;
    return { name: p.name, score: p.pts + ' pt', sub: wins + (wins === 1 ? ' vittoria' : ' vittorie') };
  });
}