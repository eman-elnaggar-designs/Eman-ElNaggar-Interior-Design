/* ======================= script.js =======================
   Eman El-Naggar — portfolio
   Public site : loads projects from Supabase (no login needed)
   Admin       : Supabase Auth + Storage photo uploads
   ---------------------------------------------------------- */
'use strict';

/* =========================================================
   0) Supabase setup
   ========================================================= */
const FALLBACK_IMG = 'https://picsum.photos/seed/eman-fallback/1000/750.jpg';

let sb = null;             // Supabase client
let configProblem = '';    // human-readable configuration error, if any

function initSupabase() {
  const missing = [];
  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL || String(SUPABASE_URL).includes('YOUR-PROJECT-REF'))
    missing.push('SUPABASE_URL');
  if (typeof SUPABASE_PUBLISHABLE_KEY === 'undefined' || !SUPABASE_PUBLISHABLE_KEY || String(SUPABASE_PUBLISHABLE_KEY).includes('PASTE-YOUR-KEY'))
    missing.push('SUPABASE_PUBLISHABLE_KEY');
  if (missing.length) {
    configProblem = `Supabase is not configured yet — open supabase-config.js and set ${missing.join(' and ')}.`;
    console.error('[Portfolio] ' + configProblem);
    return null;
  }
  if (typeof supabase === 'undefined') {
    configProblem = 'The Supabase library failed to load. Check your internet connection or the <script> tag in the HTML.';
    console.error('[Portfolio] ' + configProblem);
    return null;
  }
  try {
    return supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
  } catch (e) {
    configProblem = 'Could not create the Supabase client: ' + e.message;
    console.error('[Portfolio] ' + configProblem);
    return null;
  }
}

function publicUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/` +
         String(path).split('/').map(encodeURIComponent).join('/');
}

/* =========================================================
   1) Shared helpers
   ========================================================= */
const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.lastElementChild.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

function imgErr(img) { img.onerror = null; img.src = FALLBACK_IMG; }

function lockUpdate() {
  const any = $('#detail')?.classList.contains('open') ||
              $('#lightbox')?.classList.contains('open') ||
              $('#menu')?.classList.contains('open') || false;
  document.body.classList.toggle('locked', any);
}

/* Reveal-on-scroll */
let io;
function initReveal() {
  io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { threshold: .12, rootMargin: '0px 0px -6% 0px' });
}
function observeReveals(root = document) {
  if (io) $$('[data-reveal]', root).forEach(el => io.observe(el));
}

/* Friendly error messages */
function friendlyAuthError(err) {
  const m = String(err?.message || '').toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Incorrect email or password — please try again.';
  if (m.includes('email not confirmed')) return 'This email has not been confirmed yet.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts — please wait a minute and try again.';
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) return 'Network error — check your connection and the URL in supabase-config.js.';
  return err?.message || 'Sign-in failed — please try again.';
}
function friendlyDbError(err) {
  const m = String(err?.message || '').toLowerCase();
  if (m.includes('row-level security') || m.includes('permission') || m.includes('policy') || m.includes('violates'))
    return 'Permission denied — this account is not the administrator, or the RLS policies from supabase-setup.sql are missing.';
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed'))
    return 'Network error — could not reach Supabase. Check the URL in supabase-config.js and your connection.';
  if (m.includes('relation') && m.includes('does not exist'))
    return 'The database tables do not exist yet — run supabase-setup.sql in the Supabase SQL Editor.';
  return err?.message || 'Something went wrong — please try again.';
}

/* Confirm + prompt modal (admin) */
let confirmCb = null, promptResolve = null;
function openConfirm(title, msg, btnText, cb) {
  const m = $('#modal');
  if (!m) { cb(); return; }
  $('#mTitle').textContent = title;
  $('#mMsg').textContent = msg;
  $('#mField').hidden = true;
  $('#mYes').textContent = btnText;
  confirmCb = cb;
  m.classList.add('open');
}
function openPrompt(title, msg, placeholder, btnText) {
  return new Promise(resolve => {
    const m = $('#modal');
    if (!m) { resolve(null); return; }
    $('#mTitle').textContent = title;
    $('#mMsg').textContent = msg;
    const input = $('#mInput');
    input.value = '';
    input.placeholder = placeholder || '';
    $('#mField').hidden = false;
    $('#mYes').textContent = btnText || 'OK';
    confirmCb = null;
    promptResolve = resolve;
    m.classList.add('open');
    setTimeout(() => input.focus(), 60);
  });
}
function closeConfirm() { $('#modal')?.classList.remove('open'); confirmCb = null; }
function settleModal(cancelled) {
  if (promptResolve) {
    const r = promptResolve;
    const v = cancelled ? null : $('#mInput').value.trim();
    promptResolve = null;
    $('#mField').hidden = true;
    $('#modal').classList.remove('open');
    r(v);
    return;
  }
  closeConfirm();
}
function initModal() {
  const m = $('#modal');
  if (!m) return;
  $('#mYes').addEventListener('click', () => settleModal(false));
  $('#mNo').addEventListener('click', () => settleModal(true));
  m.addEventListener('click', e => { if (e.target === m) settleModal(true); });
  $('#mInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#mYes').click(); } });
}

/* =========================================================
   2) Data layer (Supabase)
   ========================================================= */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapProjectRow(row) {
  const rooms = (row.rooms || []).map(r => {
    const label = r.name || '';
    const photos = (r.images || []).map(im => {
      const url = im.url || (im.storage_path ? publicUrl(im.storage_path) : FALLBACK_IMG);
      return { id: im.id, path: im.storage_path || null, extUrl: im.url || null, sortOrder: im.sort_order ?? 0, url, label };
    }).sort((a, b) => a.sortOrder - b.sortOrder);
    return { id: r.id, label, sortOrder: r.sort_order ?? 0, photos };
  }).sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    id: row.id,
    name: row.name || '',
    location: row.location || '',
    year: row.year || '',
    description: row.description || '',
    published: row.published !== false,
    coverPath: row.cover_path || null,
    coverUrl: row.cover_url || null,
    createdAt: row.created_at,
    cover: row.cover_path ? publicUrl(row.cover_path) : (row.cover_url || ''),
    rooms
  };
}

async function fetchProjectRows(includeDrafts = false) {
  if (!sb) throw new Error(configProblem || 'Supabase is not configured.');
  let query = sb.from('projects').select('*, rooms(*, images(*))').order('created_at', { ascending: false });
  if (!includeDrafts) query = query.eq('published', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapProjectRow);
}

const totalPhotoCount = p => p.rooms.reduce((n, r) => n + r.photos.length, 0);

/* Delete storage files only when no database row references them anymore */
async function deleteUnusedStorage(paths) {
  const list = [...new Set(paths.filter(Boolean))];
  if (!list.length) return;
  try {
    const [imgRes, projRes] = await Promise.all([
      sb.from('images').select('storage_path').not('storage_path', 'is', null),
      sb.from('projects').select('cover_path').not('cover_path', 'is', null)
    ]);
    if (imgRes.error) throw imgRes.error;
    if (projRes.error) throw projRes.error;
    const used = new Set([
      ...(imgRes.data || []).map(r => r.storage_path),
      ...(projRes.data || []).map(r => r.cover_path)
    ]);
    const orphans = list.filter(p => !used.has(p));
    if (orphans.length) {
      const { error } = await sb.storage.from(SUPABASE_BUCKET).remove(orphans);
      if (error) console.warn('Storage cleanup skipped:', error.message);
    }
  } catch (err) {
    console.warn('Storage cleanup skipped:', err?.message || err);
  }
}

/* Upload with real progress (XHR against the Storage REST endpoint) */
function uploadWithProgress(file, path, onProgress) {
  return new Promise((resolve, reject) => {
    sb.auth.getSession().then(({ data }) => {
      const token = data?.session?.access_token;
      if (!token) { reject(new Error('Your session has expired — please sign in again.')); return; }
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`);
      xhr.setRequestHeader('authorization', `Bearer ${token}`);
      xhr.setRequestHeader('apikey', SUPABASE_PUBLISHABLE_KEY);
      xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) { resolve(); return; }
        let msg = `Upload failed (${xhr.status})`;
        try { const j = JSON.parse(xhr.responseText); if (j.message) msg = j.message; } catch (_) {}
        reject(new Error(msg));
      };
      xhr.onerror = () => reject(new Error('Network error while uploading — please try again.'));
      xhr.send(file);
    }).catch(reject);
  });
}

/* Image validation */
const MAX_IMAGE_MB = 12;
const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
function fileValidationError(f) {
  const okExt = /\.(jpe?g|png|webp)$/i.test(f.name || '');
  if (!IMAGE_TYPES.includes(String(f.type || '').toLowerCase()) && !okExt)
    return `“${f.name || 'file'}” is not a supported image (use JPG, PNG or WebP).`;
  if (f.size > MAX_IMAGE_MB * 1024 * 1024)
    return `“${f.name}” is larger than ${MAX_IMAGE_MB} MB — please compress it first.`;
  return null;
}
function safeFileName(name) {
  const base = String(name).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (base || 'photo').slice(0, 40);
}
function fileExt(f) { const m = String(f.name || '').match(/\.([a-z0-9]+)$/i); return m ? m[1].toLowerCase() : 'jpg'; }

/* ---------------- Bootstrap ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  initModal();
  sb = initSupabase();
  if (document.body.dataset.page === 'public') initPublic();
  if (document.body.dataset.page === 'admin')  initAdmin();
});

/* =========================================================
   PUBLIC SITE
   ========================================================= */
function initPublic() {
  initReveal();
  let projects = [];

  /* Header state */
  const header = $('#header');
  const onScroll = () => header.classList.toggle('scrolled', scrollY > 40);
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });

  /* Fullscreen menu */
  const menu = $('#menu');
  $('#burger').addEventListener('click', () => { menu.classList.add('open'); menu.setAttribute('aria-hidden', 'false'); lockUpdate(); });
  function closeMenu() { menu.classList.remove('open'); menu.setAttribute('aria-hidden', 'true'); lockUpdate(); }
  $('#menuClose').addEventListener('click', closeMenu);
  $$('.menu-link').forEach(a => a.addEventListener('click', closeMenu));

  /* Projects grid */
  const grid = $('#worksGrid');
  function cardHTML(p, i) {
    const cover = p.cover || p.rooms?.[0]?.photos?.[0]?.url || FALLBACK_IMG;
    return `
      <article class="card" data-reveal data-id="${p.id}" tabindex="0" role="button" aria-label="View project: ${esc(p.name)}">
        <div class="card-media">
          <img src="${esc(cover)}" alt="${esc(p.name)} — cover" loading="lazy" onerror="imgErr(this)">
          <span class="card-num">${pad(i + 1)}</span>
          <span class="card-view"><svg class="ic"><use href="#i-up"/></svg></span>
        </div>
        <div class="card-info">
          <div>
            <h3 class="card-name">${esc(p.name)}</h3>
            <p class="card-loc">${esc(p.location) || '—'}</p>
          </div>
          <span class="card-year">${esc(p.year) || ''}</span>
        </div>
      </article>`;
  }
  function renderGrid() {
    grid.innerHTML = projects.length
      ? projects.map(cardHTML).join('')
      : `<div class="empty" data-reveal><em>Projects coming soon.</em><p>New works are being prepared — check back shortly.</p></div>`;
    observeReveals(grid);
    $$('.card', grid).forEach(card => {
      const open = () => openDetail(card.dataset.id);
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }
  function renderLoadError(message) {
    grid.innerHTML = `
      <div class="empty">
        <svg class="ic"><use href="#i-img"/></svg>
        <em>Could not load the portfolio</em>
        <p>${esc(message)}</p>
        <button class="btn btn--sm" id="retryLoad">Try Again</button>
      </div>`;
    $('#retryLoad').addEventListener('click', loadProjects);
  }
  async function loadProjects() {
    if (!sb) { renderLoadError(configProblem); return; }
    grid.innerHTML = `<div class="empty load-state"><span class="spinner"></span><em>Loading projects…</em></div>`;
    try {
      projects = await fetchProjectRows(false);
      renderGrid();
    } catch (err) {
      console.error(err);
      renderLoadError(friendlyDbError(err));
    }
  }

  /* Project detail overlay */
  const detail = $('#detail');
  let detailId = null;

  function openDetail(id) {
    const p = projects.find(x => x.id === id);
    if (!p) return;
    detailId = id;
    const idx = projects.indexOf(p);
    const rooms = p.rooms || [];
    const nPhotos = totalPhotoCount(p);

    $('#dIdx').textContent = `${pad(idx + 1)} / ${pad(projects.length)}`;
    const hero = $('#dHeroImg');
    hero.onerror = () => imgErr(hero);
    hero.src = p.cover || rooms[0]?.photos[0]?.url || FALLBACK_IMG;
    hero.alt = p.name;
    $('#dChip').style.display = nPhotos ? '' : 'none';
    $('#dName').textContent = p.name;
    $('#dLoc').textContent = p.location || '—';
    $('#dYear').textContent = p.year || '—';
    $('#dCount').textContent = `${rooms.length} ${rooms.length === 1 ? 'Space' : 'Spaces'}`;
    $('#dDesc').textContent = p.description || '';

    $('#dRooms').innerHTML = rooms.length
      ? rooms.map((r, i) => `
          <button class="room" data-i="${i}">
            <span class="room-num">${pad(i + 1)}</span>
            <img class="room-thumb" src="${esc(r.photos[0]?.url || FALLBACK_IMG)}" alt="${esc(r.label) || 'Room'}" loading="lazy" onerror="imgErr(this)">
            <span class="room-name">${esc(r.label) || 'Untitled space'}${r.photos.length > 1 ? ` <em class="room-count">${r.photos.length}</em>` : ''}</span>
            <svg class="ic"><use href="#i-arrow"/></svg>
          </button>`).join('')
      : `<p class="rooms-empty">Photography for this project is being prepared.</p>`;
    $$('#dRooms .room').forEach(rEl => rEl.addEventListener('click', () => {
      const r = rooms[+rEl.dataset.i];
      if (r && r.photos.length) openLB(r.photos, 0);
    }));

    const nx = projects[(idx + 1) % projects.length];
    $('#dNextName').textContent = nx ? nx.name : '';
    $('#dNext').style.display = projects.length > 1 ? '' : 'none';

    detail.classList.add('open');
    detail.scrollTop = 0;
    lockUpdate();
  }
  function closeDetail() { detail.classList.remove('open'); detailId = null; lockUpdate(); }

  $('#dClose').addEventListener('click', closeDetail);
  $('#dHero').addEventListener('click', () => {
    const p = projects.find(x => x.id === detailId);
    const firstRoomWithPhotos = p?.rooms?.find(r => r.photos.length);
    if (firstRoomWithPhotos) openLB(firstRoomWithPhotos.photos, 0);
  });
  $('#dNext').addEventListener('click', () => {
    const i = projects.findIndex(x => x.id === detailId);
    if (i > -1) openDetail(projects[(i + 1) % projects.length].id);
  });

  /* Lightbox */
  const lb = { items: [], i: 0 };
  const lbImg = $('#lbImg');

  function openLB(items, i = 0) {
    lb.items = items; lb.i = i;
    showLB();
    $('#lightbox').classList.add('open');
    lockUpdate();
  }
  function closeLB() { $('#lightbox').classList.remove('open'); lockUpdate(); }
  function showLB() {
    const it = lb.items[lb.i] || {};
    lbImg.classList.add('fade');
    const tmp = new Image();
    tmp.onload  = () => { lbImg.src = tmp.src; lbImg.classList.remove('fade'); };
    tmp.onerror = () => { lbImg.src = FALLBACK_IMG; lbImg.classList.remove('fade'); };
    tmp.src = it.url || FALLBACK_IMG;
    lbImg.alt = it.label || 'Project image';
    $('#lbCap').textContent = it.label || '';
    $('#lbCount').textContent = `${pad(lb.i + 1)} / ${pad(lb.items.length)}`;
  }
  const lbNext = () => { lb.i = (lb.i + 1) % lb.items.length; showLB(); };
  const lbPrev = () => { lb.i = (lb.i - 1 + lb.items.length) % lb.items.length; showLB(); };
  $('#lbNext').addEventListener('click', lbNext);
  $('#lbPrev').addEventListener('click', lbPrev);
  $('#lbClose').addEventListener('click', closeLB);
  $('#lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox' || e.target.id === 'lbStage') closeLB(); });

  document.addEventListener('keydown', e => {
    if ($('#lightbox').classList.contains('open')) {
      if (e.key === 'Escape') closeLB();
      if (e.key === 'ArrowRight') lbNext();
      if (e.key === 'ArrowLeft') lbPrev();
    } else if ($('#detail').classList.contains('open') && e.key === 'Escape') {
      closeDetail();
    }
  });

  /* Touch swipe in lightbox */
  let tX = 0;
  $('#lbStage').addEventListener('touchstart', e => { tX = e.touches[0].clientX; }, { passive: true });
  $('#lbStage').addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tX;
    if (Math.abs(dx) > 45) (dx < 0 ? lbNext : lbPrev)();
  }, { passive: true });

  /* Copy email */
  $('#copyEmail')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('hello@emanelnaggar.com');
      toast('Email copied to clipboard');
    } catch (e) {
      toast('Could not copy — long-press the address instead');
    }
  });

  /* Keep content fresh: refetch when the visitor returns to the tab
     (skipped while the detail overlay or lightbox is open) */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !sb) return;
    if ($('#detail').classList.contains('open') || $('#lightbox').classList.contains('open')) return;
    loadProjects().catch(() => {});
  });

  loadProjects();
  observeReveals();
  $('#year').textContent = new Date().getFullYear();
}

/* =========================================================
   ADMIN DASHBOARD
   ========================================================= */
function initAdmin() {
  const gate = $('#gate'), app = $('#app');
  const gateErr = $('#gateErr'), gateBtn = $('#gateBtn');
  const form = $('#projForm');
  const fName = $('#fName'), fLoc = $('#fLoc'), fYear = $('#fYear'), fDesc = $('#fDesc');
  const roomList = $('#roomList');

  let adminReady = false, entering = false;
  let allProjects = [];
  let editingId = null;
  let saving = false;

  /* Staged deletions — only applied to the database when Save is pressed */
  let deletedRoomIds = [];
  let deletedImageIds = [];
  let orphanPaths = new Set();
  let originalCoverPath = null;
  let cover = null; // null | {kind:'file',file,preview} | {kind:'url',url} | {kind:'existing',path}

  if (!sb) {
    gateErr.textContent = configProblem;
    gateErr.style.display = 'block';
    gateBtn.disabled = true;
    return;
  }

  /* ---------- Authentication ---------- */
  function showGateErr(msg) { gateErr.textContent = msg; gateErr.style.display = 'block'; }
  function clearGateErr() { gateErr.style.display = 'none'; }

  function showGate(msg) {
    adminReady = false; entering = false;
    app.hidden = true;
    gate.classList.remove('off');
    if (msg) showGateErr(msg);
  }

  async function enterDashboard() {
    if (adminReady || entering) return;
    entering = true;
    try {
      const { data, error } = await sb.auth.getUser();
      if (error) throw error;
      const user = data?.user;
      if (!user) { showGate(); return; }
      const { data: adminRow, error: aErr } = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
      if (aErr) throw aErr;
      if (!adminRow) {
        await sb.auth.signOut();
        showGate('This account is not registered as the studio administrator.');
        return;
      }
      adminReady = true;
      clearGateErr();
      $('#gateForm').reset();
      gate.classList.add('off');
      app.hidden = false;
      await refreshList();
    } catch (err) {
      showGate(friendlyDbError(err));
    } finally {
      entering = false;
    }
  }

  $('#gateForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (adminReady) return;
    const email = $('#gateEmail').value.trim();
    const password = $('#gatePass').value;
    if (!email || !password) { showGateErr('Enter your email and password.'); return; }
    clearGateErr();
    gateBtn.disabled = true;
    const original = gateBtn.innerHTML;
    gateBtn.textContent = 'Signing in…';
    try {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await enterDashboard();
    } catch (err) {
      showGateErr(friendlyAuthError(err));
      gate.classList.remove('shake'); void gate.offsetWidth; gate.classList.add('shake');
    } finally {
      gateBtn.disabled = false;
      gateBtn.innerHTML = original;
    }
  });

  $('#logout').addEventListener('click', async () => {
    try { await sb.auth.signOut(); } catch (_) {}
    showGate('Signed out.');
  });

  sb.auth.onAuthStateChange((event, session) => {
    if (!session) {
      if (adminReady) showGate('Session ended — please sign in again.');
      return;
    }
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') enterDashboard();
  });

  /* ---------- Small UI helpers ---------- */
  function moveElement(el, dir, selector) {
    const parent = el.parentElement;
    const items = [...parent.children].filter(c => c.matches(selector));
    const i = items.indexOf(el);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    if (dir < 0) parent.insertBefore(el, items[j]);
    else parent.insertBefore(items[j], el);
  }

  function setProgress(frac, label) {
    const box = $('#saveProgress'), fill = $('#saveBarFill'), status = $('#saveStatus');
    if (frac === null) { box.hidden = true; fill.style.width = '0'; return; }
    box.hidden = false;
    fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    if (label) status.textContent = label;
  }

  /* ---------- Cover image ---------- */
  function renderCover() {
    const prev = $('#coverPrev'), emptyMsg = $('#coverEmpty'), rmBtn = $('#btnCoverRemove');
    let src = '';
    if (cover) {
      if (cover.kind === 'file') src = cover.preview;
      else if (cover.kind === 'url') src = cover.url;
      else src = publicUrl(cover.path);
    }
    if (src) { prev.src = src; prev.hidden = false; emptyMsg.hidden = true; }
    else { prev.removeAttribute('src'); prev.hidden = true; emptyMsg.hidden = false; }
    rmBtn.hidden = !cover;
  }
  function setCover(next) {
    if (cover && cover.kind === 'file' && cover.preview) URL.revokeObjectURL(cover.preview);
    if (originalCoverPath && (!next || next.kind !== 'existing')) orphanPaths.add(originalCoverPath);
    cover = next;
    renderCover();
  }
  $('#btnCoverPick').addEventListener('click', () => $('#coverFile').click());
  $('#coverFile').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) {
      const err = fileValidationError(f);
      if (err) toast(err);
      else setCover({ kind: 'file', file: f, preview: URL.createObjectURL(f) });
    }
    e.target.value = '';
  });
  $('#btnCoverRemove').addEventListener('click', () => { setCover(null); $('#fCoverUrl').value = ''; });
  $('#fCoverUrl').addEventListener('input', () => {
    const v = $('#fCoverUrl').value.trim();
    if (v) {
      if (/^https?:\/\//i.test(v)) setCover({ kind: 'url', url: v });
    } else if (cover && cover.kind === 'url') {
      setCover(null);
    }
  });

  /* ---------- Rooms & photos ---------- */
  function addPhotoEl(gridEl, ph) {
    const fig = document.createElement('figure');
    fig.className = 'ph';
    const src = ph.kind === 'file' ? ph.preview
              : ph.kind === 'url' ? ph.url
              : (ph.url || publicUrl(ph.path));
    fig.innerHTML = `
      <img src="${esc(src)}" alt="" onerror="imgErr(this)">
      ${ph.kind === 'file' ? '<span class="ph-badge">New</span>' : ''}
      <button type="button" class="ph-rm" aria-label="Remove photo"><svg class="ic"><use href="#i-close"/></svg></button>
      <button type="button" class="ph-move ph-left" aria-label="Move photo earlier"><svg class="ic"><use href="#i-left"/></svg></button>
      <button type="button" class="ph-move ph-right" aria-label="Move photo later"><svg class="ic"><use href="#i-arrow"/></svg></button>`;

    if (ph.kind === 'existing') {
      fig.dataset.kind = 'existing';
      fig.dataset.photoId = ph.id;
      fig.dataset.path = ph.path || '';
      fig.dataset.url = ph.url || '';
    } else if (ph.kind === 'url') {
      fig.dataset.kind = 'url';
      fig.dataset.url = ph.url;
    } else {
      fig.dataset.kind = 'file';
      fig._file = ph.file;
      fig._preview = ph.preview;
    }

    $('.ph-rm', fig).addEventListener('click', () => {
      if (fig.dataset.kind === 'existing') {
        if (fig.dataset.photoId) deletedImageIds.push(fig.dataset.photoId);
        if (fig.dataset.path) orphanPaths.add(fig.dataset.path);
      }
      if (fig.dataset.kind === 'file' && fig._preview) URL.revokeObjectURL(fig._preview);
      fig.remove();
    });
    $('.ph-left', fig).addEventListener('click', () => moveElement(fig, -1, '.ph'));
    $('.ph-right', fig).addEventListener('click', () => moveElement(fig, 1, '.ph'));

    gridEl.insertBefore(fig, $('.ph-add', gridEl));
    return fig;
  }

  function addFilesToRoom(gridEl, fileList) {
    const files = [...fileList];
    let added = 0, rejected = 0;
    files.forEach(f => {
      const err = fileValidationError(f);
      if (err) { rejected++; console.warn(err); return; }
      addPhotoEl(gridEl, { kind: 'file', file: f, preview: URL.createObjectURL(f) });
      added++;
    });
    if (rejected) toast(`${rejected} file${rejected === 1 ? '' : 's'} skipped — use JPG, PNG or WebP up to ${MAX_IMAGE_MB} MB.`);
    if (added) toast(`${added} photo${added === 1 ? '' : 's'} added — press Save to upload`);
  }

  function stageRoomDeletion(el) {
    const roomId = el.dataset.roomId;
    if (!roomId) return; // room was never saved — nothing to delete
    deletedRoomIds.push(roomId); // image rows cascade-delete with the room
    $$('.ph[data-kind="existing"]', el).forEach(fig => {
      if (fig.dataset.path) orphanPaths.add(fig.dataset.path);
    });
  }

  function addRoomEl(room) {
    room = room || { id: null, name: '', photos: [] };
    const el = document.createElement('div');
    el.className = 'room-edit';
    if (room.id) el.dataset.roomId = room.id;
    el.innerHTML = `
      <div class="room-edit-head">
        <input class="re-name" type="text" placeholder="Room name — e.g. Living Room" value="${esc(room.name)}" aria-label="Room name">
        <div class="room-tools">
          <button type="button" class="ibtn" data-act="room-up" title="Move room up" aria-label="Move room up"><svg class="ic"><use href="#i-up2"/></svg></button>
          <button type="button" class="ibtn" data-act="room-down" title="Move room down" aria-label="Move room down"><svg class="ic"><use href="#i-down"/></svg></button>
          <button type="button" class="ibtn danger" data-act="room-del" title="Remove room" aria-label="Remove room"><svg class="ic"><use href="#i-trash"/></svg></button>
        </div>
      </div>
      <div class="photo-grid"></div>
      <div class="room-add-row">
        <button type="button" class="btn btn--sm" data-act="pick"><svg class="ic"><use href="#i-plus"/></svg>Add Photos</button>
        <button type="button" class="btn btn--sm btn--ghost" data-act="pick-url"><svg class="ic"><use href="#i-img"/></svg>By URL</button>
        <input type="file" class="re-file" accept="image/jpeg,image/jpg,image/png,image/webp" multiple hidden>
      </div>`;

    const gridEl = $('.photo-grid', el);
    (room.photos || []).forEach(ph => addPhotoEl(gridEl, ph));

    const addTile = document.createElement('button');
    addTile.type = 'button';
    addTile.className = 'ph-add';
    addTile.innerHTML = `<svg class="ic"><use href="#i-plus"/></svg><span>Add Photos</span>`;
    addTile.addEventListener('click', () => $('.re-file', el).click());
    gridEl.appendChild(addTile);

    $('.re-file', el).addEventListener('change', e => { addFilesToRoom(gridEl, e.target.files); e.target.value = ''; });
    $('[data-act="pick"]', el).addEventListener('click', () => $('.re-file', el).click());
    $('[data-act="pick-url"]', el).addEventListener('click', async () => {
      const url = await openPrompt('Add photo by URL', 'Paste a direct link to an image hosted elsewhere.', 'https://…', 'Add Photo');
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) { toast('Please paste a full image URL starting with https://'); return; }
      addPhotoEl(gridEl, { kind: 'url', url });
    });
    $('[data-act="room-up"]', el).addEventListener('click', () => moveElement(el, -1, '.room-edit'));
    $('[data-act="room-down"]', el).addEventListener('click', () => moveElement(el, 1, '.room-edit'));
    $('[data-act="room-del"]', el).addEventListener('click', () => {
      openConfirm('Remove room', `“${$('.re-name', el).value.trim() || 'Unnamed room'}” and its photos will be removed when you press Save.`, 'Remove', () => {
        stageRoomDeletion(el);
        el.remove();
      });
    });

    roomList.appendChild(el);
    return el;
  }

  $('#btnAddRoom').addEventListener('click', () => addRoomEl());

  /* ---------- Form reset / edit ---------- */
  function resetForm() {
    editingId = null;
    form.reset();
    roomList.innerHTML = '';
    deletedRoomIds = []; deletedImageIds = []; orphanPaths = new Set();
    originalCoverPath = null;
    if (cover && cover.kind === 'file' && cover.preview) URL.revokeObjectURL(cover.preview);
    cover = null;
    $('#fPublished').checked = true;
    $('#fCoverUrl').value = '';
    renderCover();
    addRoomEl();
    $('#formTitle').textContent = 'Add Project';
    $('#btnSave').textContent = 'Save Project';
    $('#btnCancelEdit').hidden = true;
    fName.closest('.field').classList.remove('invalid');
    setProgress(null);
  }
  $('#btnCancelEdit').addEventListener('click', resetForm);
  $('#btnNew').addEventListener('click', () => {
    resetForm();
    $('#formPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function startEdit(id) {
    const p = allProjects.find(x => x.id === id);
    if (!p) return;
    resetForm();
    editingId = id;
    fName.value = p.name || '';
    fLoc.value = p.location || '';
    fYear.value = p.year || '';
    fDesc.value = p.description || '';
    $('#fPublished').checked = p.published;
    originalCoverPath = p.coverPath;
    cover = p.coverPath ? { kind: 'existing', path: p.coverPath }
          : p.coverUrl ? { kind: 'url', url: p.coverUrl }
          : null;
    if (cover && cover.kind === 'url') $('#fCoverUrl').value = p.coverUrl;
    renderCover();
    roomList.innerHTML = '';
    if (p.rooms.length) {
      p.rooms.forEach(r => addRoomEl({
        id: r.id,
        name: r.label,
        photos: r.photos.map(ph => ({ kind: 'existing', id: ph.id, path: ph.path, url: ph.extUrl }))
      }));
    } else {
      addRoomEl();
    }
    $('#formTitle').textContent = 'Edit Project';
    $('#btnSave').textContent = 'Update Project';
    $('#btnCancelEdit').hidden = false;
    $('#formPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- Project list ---------- */
  async function refreshList() {
    const stat = $('#stat');
    stat.textContent = 'Loading…';
    try {
      allProjects = await fetchProjectRows(true);
      renderList();
    } catch (err) {
      console.error(err);
      stat.textContent = '—';
      $('#projList').innerHTML = `
        <div class="empty">
          <svg class="ic"><use href="#i-img"/></svg>
          <em>Could not load projects</em>
          <p>${esc(friendlyDbError(err))}</p>
          <button class="btn btn--sm" id="retryAdmin">Try Again</button>
        </div>`;
      $('#retryAdmin').addEventListener('click', refreshList);
    }
  }

  function renderList() {
    const stat = $('#stat'), box = $('#projList');
    const nPhotos = allProjects.reduce((n, p) => n + totalPhotoCount(p), 0);
    stat.textContent = `${allProjects.length} project${allProjects.length === 1 ? '' : 's'} · ${nPhotos} photo${nPhotos === 1 ? '' : 's'}`;

    if (!allProjects.length) {
      box.innerHTML = `<div class="empty"><svg class="ic"><use href="#i-img"/></svg><em>No projects yet</em><p>Add your first project using the form.</p></div>`;
      return;
    }

    box.innerHTML = allProjects.map(p => {
      const thumb = p.cover || p.rooms?.[0]?.photos?.[0]?.url || FALLBACK_IMG;
      const nP = totalPhotoCount(p);
      return `
        <div class="list-row">
          <img class="thumb" src="${esc(thumb)}" alt="" onerror="imgErr(this)">
          <div class="list-main">
            <p class="list-name">${esc(p.name)}${p.published ? '' : '<span class="draft-badge">Draft</span>'}</p>
            <p class="list-meta">${esc(p.location) || '—'} · ${p.rooms.length} room${p.rooms.length === 1 ? '' : 's'} · ${nP} photo${nP === 1 ? '' : 's'}</p>
          </div>
          <div class="list-actions">
            <button class="ibtn" data-act="edit" data-id="${p.id}" aria-label="Edit project"><svg class="ic"><use href="#i-edit"/></svg></button>
            <button class="ibtn danger" data-act="del" data-id="${p.id}" aria-label="Delete project"><svg class="ic"><use href="#i-trash"/></svg></button>
          </div>
        </div>`;
    }).join('');

    $$('.ibtn', box).forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id;
      if (b.dataset.act === 'edit') startEdit(id);
      else deleteProject(id);
    }));
  }

  function deleteProject(id) {
    const p = allProjects.find(x => x.id === id);
    openConfirm('Delete project', `“${p ? p.name : 'This project'}” and all of its photos will be permanently removed from the portfolio.`, 'Delete', async () => {
      try {
        const paths = [];
        if (p?.coverPath) paths.push(p.coverPath);
        p?.rooms.forEach(r => r.photos.forEach(ph => { if (ph.path) paths.push(ph.path); }));
        const { error } = await sb.from('projects').delete().eq('id', id);
        if (error) throw error;
        await deleteUnusedStorage(paths);
        if (editingId === id) resetForm();
        toast('Project deleted');
        await refreshList();
      } catch (err) {
        console.error(err);
        toast(friendlyDbError(err));
      }
    });
  }

  /* ---------- Save (create or update) ---------- */
  form.addEventListener('submit', e => { e.preventDefault(); if (!saving) saveProject(); });

  async function saveProject() {
    const name = fName.value.trim();
    if (!name) {
      fName.closest('.field').classList.add('invalid');
      fName.focus();
      toast('Project name is required');
      return;
    }
    fName.closest('.field').classList.remove('invalid');
    if ($('#fCoverUrl').value.trim() && !cover)
      toast('Note: the text in the cover URL field was not a valid link and was ignored.');

    saving = true;
    const saveBtn = $('#btnSave');
    saveBtn.disabled = true;
    const originalBtn = saveBtn.textContent;
    saveBtn.textContent = 'Saving…';

    try {
      const projectId = editingId || uuid();
      const stamp = Date.now();

      /* 1 — collect rooms & photos in their current (DOM) order */
      const planRooms = $$('.room-edit', roomList).map((el, idx) => {
        const roomId = el.dataset.roomId || uuid();
        return {
          roomId,
          name: $('.re-name', el).value.trim(),
          sort: idx,
          figs: $$('.ph', el).map((fig, i) => ({ fig, sort: i }))
        };
      });

      let coverPath = null, coverUrl = null;
      const tasks = []; // { file, path, fig|null }
      if (cover && cover.kind === 'file') {
        coverPath = `covers/${projectId}/${stamp}-${Math.random().toString(36).slice(2, 7)}-${safeFileName(cover.file.name)}.${fileExt(cover.file)}`;
        tasks.push({ file: cover.file, path: coverPath, fig: null });
      } else if (cover && cover.kind === 'url') {
        coverUrl = cover.url;
      } else if (cover && cover.kind === 'existing') {
        coverPath = originalCoverPath;
      }
      planRooms.forEach(r => r.figs.forEach(({ fig }) => {
        if (fig.dataset.kind === 'file' && fig._file) {
          const path = `projects/${projectId}/${r.roomId}/${stamp}-${Math.random().toString(36).slice(2, 7)}-${safeFileName(fig._file.name)}.${fileExt(fig._file)}`;
          tasks.push({ file: fig._file, path, fig });
        }
      }));

      /* 2 — upload files with progress */
      const totalBytes = tasks.reduce((n, t) => n + t.file.size, 0) || 1;
      let uploadedBytes = 0;
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        await uploadWithProgress(t.file, t.path, frac => {
          setProgress((uploadedBytes + frac * t.file.size) / totalBytes,
            `Uploading ${i + 1} / ${tasks.length} — ${Math.round(((uploadedBytes + frac * t.file.size) / totalBytes) * 100)}%`);
        });
        uploadedBytes += t.file.size;
        if (t.fig) t.fig.dataset.uploadedPath = t.path;
      }
      if (tasks.length) setProgress(1, 'Upload complete — saving…');

      /* 3 — persist to the database */
      setProgress(tasks.length ? 1 : 0.05, 'Saving project…');
      const { error: projErr } = await sb.from('projects').upsert({
        id: projectId,
        name,
        location: fLoc.value.trim() || null,
        year: fYear.value.trim() || null,
        description: fDesc.value.trim() || null,
        published: $('#fPublished').checked,
        cover_path: coverPath,
        cover_url: coverUrl,
        updated_at: new Date().toISOString()
      });
      if (projErr) throw projErr;

      if (deletedRoomIds.length) {
        const { error } = await sb.from('rooms').delete().in('id', deletedRoomIds);
        if (error) throw error;
      }
      for (const r of planRooms) {
        const { error } = await sb.from('rooms').upsert({
          id: r.roomId, project_id: projectId, name: r.name, sort_order: r.sort
        });
        if (error) throw error;
      }
      if (deletedImageIds.length) {
        const { error } = await sb.from('images').delete().in('id', deletedImageIds);
        if (error) throw error;
      }

      const imgRows = [];
      planRooms.forEach(r => r.figs.forEach(({ fig, sort }) => {
        const kind = fig.dataset.kind;
        const row = { room_id: r.roomId, project_id: projectId, sort_order: sort };
        if (kind === 'existing') {
          row.id = fig.dataset.photoId;
          row.storage_path = fig.dataset.path || null;
          row.url = fig.dataset.url || null;
        } else if (kind === 'url') {
          row.id = uuid();
          row.storage_path = null;
          row.url = fig.dataset.url || null;
        } else {
          row.id = uuid();
          row.storage_path = fig.dataset.uploadedPath || null;
          row.url = null;
        }
        if (row.storage_path || row.url) imgRows.push(row);
      }));
      if (imgRows.length) {
        const { error } = await sb.from('images').upsert(imgRows);
        if (error) throw error;
      }

      /* 4 — remove storage files that are no longer referenced anywhere */
      if (orphanPaths.size) {
        setProgress(1, 'Cleaning up…');
        const paths = [...orphanPaths];
        orphanPaths.clear();
        await deleteUnusedStorage(paths);
      }

      toast(editingId ? 'Project updated' : 'Project added');
      resetForm();
      await refreshList();
    } catch (err) {
      console.error(err);
      toast(friendlyDbError(err));
    } finally {
      saving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = originalBtn;
    }
  }

  /* ---------- Data tools: export / import (metadata backups) ---------- */
  $('#btnExport').addEventListener('click', () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      note: `Metadata backup. Uploaded image files live in Supabase Storage (bucket: ${SUPABASE_BUCKET}).`,
      projects: allProjects.map(p => ({
        id: p.id, name: p.name, location: p.location || null, year: p.year || null,
        description: p.description || null, published: p.published,
        coverPath: p.coverPath, coverUrl: p.coverUrl,
        rooms: p.rooms.map(r => ({
          name: r.label || null,
          photos: r.photos.map(ph => ({ path: ph.path, url: ph.extUrl }))
        }))
      }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'eman-portfolio-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup downloaded (metadata only — images stay in Storage)');
  });

  $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      let arr = null;
      try {
        const parsed = JSON.parse(r.result);
        arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.projects) ? parsed.projects : null);
      } catch (_) {}
      if (!arr) { toast('Invalid backup file'); e.target.value = ''; return; }
      openConfirm('Import backup',
        `${arr.length} project(s) will be added or updated. Nothing is deleted. Photos stored by path are only valid if the files already exist in this bucket (true for backups from this same Supabase project); external URLs work anywhere.`,
        'Import', () => importJson(arr));
      e.target.value = '';
    };
    r.readAsText(f);
  });

  async function importJson(arr) {
    try {
      for (let i = 0; i < arr.length; i++) {
        const raw = arr[i] || {};
        const pid = UUID_RE.test(raw.id || '') ? raw.id : uuid();

        const coverPath = typeof raw.coverPath === 'string' && raw.coverPath ? raw.coverPath : null;
        const legacyCover = typeof raw.cover === 'string' && raw.cover ? raw.cover : null;
        const coverUrl = (typeof raw.coverUrl === 'string' && raw.coverUrl) ? raw.coverUrl
                       : (legacyCover && /^https?:\/\//i.test(legacyCover) ? legacyCover : null);

        const { error: pErr } = await sb.from('projects').upsert({
          id: pid,
          name: raw.name || 'Untitled project',
          location: raw.location || null,
          year: raw.year || null,
          description: raw.description || null,
          published: raw.published !== false,
          cover_path: coverPath,
          cover_url: coverUrl,
          created_at: new Date(Date.now() - i * 1000).toISOString(), // keep backup order
          updated_at: new Date().toISOString()
        });
        if (pErr) throw pErr;

        /* new-format rooms, or legacy localStorage backups (images[{label,url}]) */
        const roomDefs = Array.isArray(raw.rooms) && raw.rooms.length
          ? raw.rooms.map(rm => ({ name: rm.name || rm.label || '', photos: (rm.photos || []).map(pp => ({ path: pp.path || null, url: pp.url || null })) }))
          : (Array.isArray(raw.images)
              ? raw.images.map(im => ({ name: im.label || '', photos: [{ path: null, url: im.url || null }] }))
              : []);

        let sort = 0;
        for (const rd of roomDefs) {
          if (!rd.name && !rd.photos.length) continue;
          const rid = uuid();
          const { error: rErr } = await sb.from('rooms').upsert({ id: rid, project_id: pid, name: rd.name, sort_order: sort++ });
          if (rErr) throw rErr;
          const rows = rd.photos
            .filter(pp => pp.path || pp.url)
            .map((pp, j) => ({ id: uuid(), room_id: rid, project_id: pid, storage_path: pp.path, url: pp.url, sort_order: j }));
          if (rows.length) {
            const { error: iErr } = await sb.from('images').upsert(rows);
            if (iErr) throw iErr;
          }
        }
      }
      toast('Backup imported');
      await refreshList();
    } catch (err) {
      console.error(err);
      toast(friendlyDbError(err));
    }
  }

  resetForm();
}