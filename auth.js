// ─── NetLab AI — Supabase Auth Client ────────────────────────────────────────
// Shared across index.html and app.html

const SUPABASE_URL  = 'https://enqqdltgkpiarfdfkfgm.supabase.co';
const SUPABASE_ANON = 'sb_publishable_O_vvU47MMleOpP5fVBXYtQ_giNwa8Of';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

async function getUser() {
  const { data } = await sb.auth.getUser();
  return data.user;
}

async function signInWithGoogle() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href },
  });
  if (error) throw error;
}

async function signInWithEmail(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signUpWithEmail(email, password, fullName) {
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  return data;
}

async function signOut() {
  await sb.auth.signOut();
  window.location.reload();
}

// ─── User plan helpers ────────────────────────────────────────────────────────

// Returns the user's plan row or null
async function getUserPlan(userId) {
  const { data, error } = await sb
    .from('user_plans')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') console.error('getUserPlan:', error);
  return data || null;
}

// Creates a free-tier plan row when a new user signs up
async function ensureUserPlan(userId) {
  const existing = await getUserPlan(userId);
  if (existing) return existing;

  const now = new Date();
  const resetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const { data, error } = await sb.from('user_plans').insert({
    user_id: userId,
    plan: 'free',
    generations_used: 0,
    generations_reset_at: resetAt,
  }).select().single();

  if (error) console.error('ensureUserPlan:', error);
  return data;
}

// Plan limits
const PLAN_LIMITS = {
  free:       5,
  basic:      Infinity,
  pro:        Infinity,
  all_access: Infinity,
};

const PLAN_LANGUAGES = {
  free:       ['english'],
  basic:      ['english', 'malayalam'],
  pro:        ['english', 'malayalam', 'hindi'],
  all_access: ['english', 'malayalam', 'hindi'],
};

// ─── Auth Modal (injected into both pages) ───────────────────────────────────

function injectAuthModal() {
  const html = `
  <div id="auth-modal" style="display:none;position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;">
    <!-- Backdrop -->
    <div id="auth-backdrop" onclick="closeAuthModal()" style="position:absolute;inset:0;background:rgba(5,8,14,0.85);backdrop-filter:blur(6px);"></div>

    <!-- Card -->
    <div style="position:relative;z-index:1;width:100%;max-width:420px;background:#0f1520;border:1px solid #1a2332;border-radius:20px;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,0.6);">

      <!-- Header gradient bar -->
      <div style="height:3px;background:linear-gradient(90deg,#00d9ff,#0ea5e9,#a78bfa);"></div>

      <div style="padding:32px;">
        <!-- Logo + close -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="rgba(0,217,255,0.1)"/>
              <circle cx="14" cy="14" r="4" fill="#00d9ff"/>
              <line x1="14" y1="6" x2="14" y2="10" stroke="#00d9ff" stroke-width="1.5" opacity="0.5"/>
              <line x1="14" y1="18" x2="14" y2="22" stroke="#00d9ff" stroke-width="1.5" opacity="0.5"/>
              <line x1="6" y1="14" x2="10" y2="14" stroke="#00d9ff" stroke-width="1.5" opacity="0.5"/>
              <line x1="18" y1="14" x2="22" y2="14" stroke="#00d9ff" stroke-width="1.5" opacity="0.5"/>
              <circle cx="14" cy="6" r="2" fill="#0ea5e9" opacity="0.7"/>
              <circle cx="14" cy="22" r="2" fill="#0ea5e9" opacity="0.7"/>
              <circle cx="6" cy="14" r="2" fill="#0ea5e9" opacity="0.7"/>
              <circle cx="22" cy="14" r="2" fill="#0ea5e9" opacity="0.7"/>
            </svg>
            <span style="font-weight:800;font-size:16px;color:#f1f5f9;">NetLab <span style="color:#00d9ff;">AI</span></span>
          </div>
          <button onclick="closeAuthModal()" style="background:none;border:none;color:#475569;cursor:pointer;font-size:20px;line-height:1;padding:4px;">✕</button>
        </div>

        <!-- Tab switcher -->
        <div style="display:flex;background:#070b10;border:1px solid #1a2332;border-radius:10px;padding:3px;gap:3px;margin-bottom:24px;">
          <button id="tab-signin" onclick="switchAuthTab('signin')" style="flex:1;padding:8px;border-radius:7px;font-size:13px;font-weight:700;border:none;cursor:pointer;transition:all 0.15s;background:rgba(0,217,255,0.1);color:#00d9ff;border:1px solid rgba(0,217,255,0.2);">Sign In</button>
          <button id="tab-signup" onclick="switchAuthTab('signup')" style="flex:1;padding:8px;border-radius:7px;font-size:13px;font-weight:700;border:none;cursor:pointer;transition:all 0.15s;background:transparent;color:#475569;">Sign Up</button>
        </div>

        <!-- Google button -->
        <button onclick="handleGoogleSignIn()" style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:11px;background:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;color:#1e293b;cursor:pointer;transition:all 0.15s;margin-bottom:16px;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#fff'">
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>

        <!-- Divider -->
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="flex:1;height:1px;background:#1a2332;"></div>
          <span style="font-size:12px;color:#334155;">or</span>
          <div style="flex:1;height:1px;background:#1a2332;"></div>
        </div>

        <!-- Sign Up name field (hidden when signing in) -->
        <div id="field-name" style="display:none;margin-bottom:12px;">
          <input id="auth-name" type="text" placeholder="Full name" style="width:100%;background:#070b10;border:1px solid #1e2d42;border-radius:8px;color:#e2e8f0;font-size:14px;padding:11px 14px;outline:none;font-family:inherit;transition:border-color 0.15s;" onfocus="this.style.borderColor='rgba(0,217,255,0.4)'" onblur="this.style.borderColor='#1e2d42'"/>
        </div>

        <div style="margin-bottom:12px;">
          <input id="auth-email" type="email" placeholder="Email address" style="width:100%;background:#070b10;border:1px solid #1e2d42;border-radius:8px;color:#e2e8f0;font-size:14px;padding:11px 14px;outline:none;font-family:inherit;transition:border-color 0.15s;" onfocus="this.style.borderColor='rgba(0,217,255,0.4)'" onblur="this.style.borderColor='#1e2d42'"/>
        </div>

        <div style="margin-bottom:20px;">
          <input id="auth-password" type="password" placeholder="Password" style="width:100%;background:#070b10;border:1px solid #1e2d42;border-radius:8px;color:#e2e8f0;font-size:14px;padding:11px 14px;outline:none;font-family:inherit;transition:border-color 0.15s;" onfocus="this.style.borderColor='rgba(0,217,255,0.4)'" onblur="this.style.borderColor='#1e2d42'" onkeydown="if(event.key==='Enter')submitAuth()"/>
        </div>

        <!-- Error message -->
        <div id="auth-error" style="display:none;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:10px 14px;font-size:13px;color:#fca5a5;margin-bottom:14px;"></div>

        <!-- Submit button -->
        <button id="auth-submit-btn" onclick="submitAuth()" style="width:100%;padding:13px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;border:none;background:linear-gradient(135deg,#00d9ff,#0ea5e9);color:#0a0e14;transition:all 0.2s;box-shadow:0 0 20px rgba(0,217,255,0.2);">
          Sign In
        </button>

        <p id="auth-footer-text" style="text-align:center;font-size:12px;color:#334155;margin-top:16px;">
          Don't have an account? <button onclick="switchAuthTab('signup')" style="background:none;border:none;color:#00d9ff;font-size:12px;font-weight:600;cursor:pointer;">Sign up free</button>
        </p>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
}

// ─── Modal control ────────────────────────────────────────────────────────────

function openAuthModal() {
  const m = document.getElementById('auth-modal');
  m.style.display = 'flex';
  document.getElementById('auth-error').style.display = 'none';
  document.getElementById('auth-email').value = '';
  document.getElementById('auth-password').value = '';
}

function closeAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
}

let currentAuthTab = 'signin';

function switchAuthTab(tab) {
  currentAuthTab = tab;
  const isSignup = tab === 'signup';

  // Tab styles
  const signInBtn  = document.getElementById('tab-signin');
  const signUpBtn  = document.getElementById('tab-signup');

  if (isSignup) {
    signUpBtn.style.cssText  += ';background:rgba(0,217,255,0.1);color:#00d9ff;border:1px solid rgba(0,217,255,0.2);';
    signInBtn.style.cssText  += ';background:transparent;color:#475569;border:none;';
  } else {
    signInBtn.style.cssText  += ';background:rgba(0,217,255,0.1);color:#00d9ff;border:1px solid rgba(0,217,255,0.2);';
    signUpBtn.style.cssText  += ';background:transparent;color:#475569;border:none;';
  }

  document.getElementById('field-name').style.display        = isSignup ? 'block' : 'none';
  document.getElementById('auth-submit-btn').textContent     = isSignup ? 'Create Account' : 'Sign In';
  document.getElementById('auth-footer-text').innerHTML      = isSignup
    ? `Already have an account? <button onclick="switchAuthTab('signin')" style="background:none;border:none;color:#00d9ff;font-size:12px;font-weight:600;cursor:pointer;">Sign in</button>`
    : `Don't have an account? <button onclick="switchAuthTab('signup')" style="background:none;border:none;color:#00d9ff;font-size:12px;font-weight:600;cursor:pointer;">Sign up free</button>`;

  document.getElementById('auth-error').style.display = 'none';
}

function setAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.style.display = 'block';
}

async function handleGoogleSignIn() {
  try { await signInWithGoogle(); }
  catch (e) { setAuthError(e.message); }
}

async function submitAuth() {
  const btn      = document.getElementById('auth-submit-btn');
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const name     = document.getElementById('auth-name')?.value?.trim() || '';

  if (!email || !password) { setAuthError('Please fill in all fields.'); return; }
  if (currentAuthTab === 'signup' && !name) { setAuthError('Please enter your full name.'); return; }

  btn.textContent = 'Please wait…';
  btn.disabled = true;
  document.getElementById('auth-error').style.display = 'none';

  try {
    if (currentAuthTab === 'signup') {
      await signUpWithEmail(email, password, name);
      setAuthError('Check your email to confirm your account, then sign in.');
      btn.textContent = 'Create Account';
    } else {
      await signInWithEmail(email, password);
      closeAuthModal();
      window.location.reload();
    }
  } catch (e) {
    setAuthError(e.message);
    btn.textContent = currentAuthTab === 'signup' ? 'Create Account' : 'Sign In';
  } finally {
    btn.disabled = false;
  }
}

// ─── Nav user widget ──────────────────────────────────────────────────────────
// Call after DOM ready. targetId = id of the element to replace with user state.

async function initNavAuth(loginBtnId, userWidgetId) {
  injectAuthModal();

  const session = await getSession();
  const loginBtn    = document.getElementById(loginBtnId);
  const userWidget  = document.getElementById(userWidgetId);

  if (!session) {
    // Not logged in — show login button
    if (loginBtn)   loginBtn.style.display    = 'inline-flex';
    if (userWidget) userWidget.style.display  = 'none';
    return;
  }

  // Logged in
  const user = session.user;
  await ensureUserPlan(user.id);
  const planRow = await getUserPlan(user.id);
  const planLabel = { free: 'Free', basic: 'Basic ₹199', pro: 'Pro ₹399', all_access: 'All Access ₹599' };

  const initials = (user.user_metadata?.full_name || user.email || 'U')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  if (loginBtn)   loginBtn.style.display    = 'none';
  if (userWidget) {
    userWidget.style.display = 'flex';
    userWidget.innerHTML = `
      <div style="position:relative;">
        <button onclick="toggleUserMenu()" style="display:flex;align-items:center;gap:8px;background:rgba(0,217,255,0.08);border:1px solid rgba(0,217,255,0.2);border-radius:8px;padding:6px 10px;cursor:pointer;color:#e2e8f0;font-size:13px;font-weight:600;">
          <div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#00d9ff,#0ea5e9);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#0a0e14;">${initials}</div>
          <span style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${user.email}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div id="user-menu" style="display:none;position:absolute;right:0;top:calc(100% + 8px);background:#0f1520;border:1px solid #1a2332;border-radius:12px;min-width:200px;padding:8px;box-shadow:0 16px 40px rgba(0,0,0,0.5);z-index:1000;">
          <div style="padding:10px 12px;border-bottom:1px solid #1a2332;margin-bottom:6px;">
            <p style="font-size:12px;color:#475569;margin-bottom:2px;">Current plan</p>
            <p style="font-size:13px;font-weight:700;color:#00d9ff;">${planLabel[planRow?.plan || 'free'] || 'Free'}</p>
          </div>
          <a href="index.html#pricing" style="display:block;padding:9px 12px;font-size:13px;color:#94a3b8;text-decoration:none;border-radius:7px;transition:background 0.1s;" onmouseover="this.style.background='#111827'" onmouseout="this.style.background='transparent'">⬆ Upgrade Plan</a>
          <button onclick="signOut()" style="display:block;width:100%;text-align:left;padding:9px 12px;font-size:13px;color:#64748b;background:none;border:none;cursor:pointer;border-radius:7px;transition:background 0.1s;" onmouseover="this.style.background='#111827'" onmouseout="this.style.background='transparent'">Sign Out</button>
        </div>
      </div>`;
  }

  // Close menu on outside click
  document.addEventListener('click', e => {
    const menu = document.getElementById('user-menu');
    if (menu && !menu.parentElement.contains(e.target)) menu.style.display = 'none';
  });
}

function toggleUserMenu() {
  const m = document.getElementById('user-menu');
  if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
