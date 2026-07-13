(function(){
  'use strict';

  const CONFIG = window.LOTPACK_CONFIG || {};
  let client = null;
  let currentUser = null;

  function readyConfig(){
    return Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_PUBLISHABLE_KEY);
  }

  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  }

  function ensureUi(){
    if(document.getElementById('lotpackAuthOverlay')) return;
    const style = document.createElement('style');
    style.textContent = `
      #lotpackAuthOverlay{position:fixed;inset:0;z-index:1000000;background:linear-gradient(145deg,#10243a,#003057);display:flex;align-items:center;justify-content:center;padding:18px;font-family:Arial,sans-serif}
      #lotpackAuthOverlay[hidden]{display:none!important}
      .lp-auth-card{width:min(430px,100%);background:#fff;border-radius:18px;padding:24px;box-shadow:0 22px 70px rgba(0,0,0,.4)}
      .lp-auth-brand{display:flex;align-items:center;gap:14px;margin-bottom:18px}.lp-auth-mark{background:#ffe600;padding:10px 18px;font-weight:900;transform:skew(-16deg)}
      .lp-auth-card h1{font-size:22px;margin:0}.lp-auth-card p{color:#4b5563;line-height:1.4}
      .lp-auth-card label{display:block;font-weight:700;margin:12px 0 6px}.lp-auth-card input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #9ca3af;border-radius:9px;font-size:16px;background:#fff}
      .lp-auth-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}.lp-auth-actions button{padding:12px;border-radius:9px;border:1px solid #003057;font-weight:800;cursor:pointer}.lp-auth-primary{background:#003057;color:#fff}.lp-auth-secondary{background:#fff;color:#003057}
      #lotpackAuthMessage{min-height:20px;margin-top:12px;font-weight:700}.lp-auth-error{color:#b91c1c}.lp-auth-ok{color:#166534}
      #lotpackUserBar{position:fixed;left:12px;bottom:12px;z-index:99998;background:#fff;border:1px solid #cbd5e1;border-radius:999px;padding:7px 10px;box-shadow:0 4px 14px rgba(0,0,0,.18);font:600 12px Arial,sans-serif;max-width:calc(100vw - 220px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #lotpackUserBar button{border:0;background:transparent;color:#b91c1c;font-weight:800;margin-left:8px;cursor:pointer}
      @media(max-width:600px){#lotpackUserBar{max-width:55vw;font-size:11px}.lp-auth-actions{grid-template-columns:1fr}}
      @media print{#lotpackAuthOverlay,#lotpackUserBar{display:none!important}}
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'lotpackAuthOverlay';
    overlay.innerHTML = `
      <div class="lp-auth-card">
        <div class="lp-auth-brand"><div class="lp-auth-mark">COLAS</div><div><h1>Lot Pack Login</h1><div>Secure field access</div></div></div>
        <p>Sign in once while online. Your session remains on this phone so drafts can continue to save when reception drops.</p>
        <form id="lotpackAuthForm">
          <label for="lotpackAuthEmail">Work email</label>
          <input id="lotpackAuthEmail" type="email" autocomplete="username" required>
          <label for="lotpackAuthPassword">Password</label>
          <input id="lotpackAuthPassword" type="password" autocomplete="current-password" minlength="8" required>
          <div class="lp-auth-actions">
            <button class="lp-auth-primary" type="submit">Sign in</button>
            <button class="lp-auth-secondary" id="lotpackCreateAccount" type="button">Create test account</button>
          </div>
          <div id="lotpackAuthMessage" role="status"></div>
        </form>
      </div>`;
    document.body.appendChild(overlay);

    const userBar = document.createElement('div');
    userBar.id = 'lotpackUserBar';
    userBar.hidden = true;
    document.body.appendChild(userBar);

    document.getElementById('lotpackAuthForm').addEventListener('submit', async event => {
      event.preventDefault();
      await signIn();
    });
    document.getElementById('lotpackCreateAccount').addEventListener('click', signUp);
  }

  function message(text, type){
    const el = document.getElementById('lotpackAuthMessage');
    if(!el) return;
    el.className = type === 'error' ? 'lp-auth-error' : 'lp-auth-ok';
    el.textContent = text || '';
  }

  function credentials(){
    return {
      email:(document.getElementById('lotpackAuthEmail')?.value || '').trim(),
      password:document.getElementById('lotpackAuthPassword')?.value || ''
    };
  }

  async function signIn(){
    const {email,password} = credentials();
    if(!email || !password){ message('Enter your email and password.','error'); return; }
    message('Signing in…');
    const {error} = await client.auth.signInWithPassword({email,password});
    if(error) message(error.message,'error');
  }

  async function signUp(){
    const {email,password} = credentials();
    if(!email || password.length < 8){ message('Use a valid email and a password of at least 8 characters.','error'); return; }
    message('Creating account…');
    const {data,error} = await client.auth.signUp({email,password});
    if(error){ message(error.message,'error'); return; }
    if(data.session) message('Account created and signed in.');
    else message('Account created. Check your email for the confirmation link, then sign in.');
  }

  async function signOut(){
    if(!confirm('Sign out of this phone? Drafts remain stored on the device.')) return;
    await client.auth.signOut();
  }

  function applySession(session){
    currentUser = session?.user || null;
    const overlay = document.getElementById('lotpackAuthOverlay');
    const bar = document.getElementById('lotpackUserBar');
    if(currentUser){
      overlay.hidden = true;
      bar.hidden = false;
      bar.innerHTML = `<span>${escapeHtml(currentUser.email || 'Signed in')}</span><button type="button">Sign out</button>`;
      bar.querySelector('button').addEventListener('click',signOut);
      localStorage.setItem('lotpackLastUserId',currentUser.id);
      localStorage.setItem('lotpackLastUserEmail',currentUser.email || '');
      window.dispatchEvent(new CustomEvent('lotpack-auth-ready',{detail:{user:currentUser}}));
    }else{
      overlay.hidden = false;
      bar.hidden = true;
      message(navigator.onLine ? 'Sign in to continue.' : 'Connect to the internet once to sign in on this phone.','error');
      window.dispatchEvent(new CustomEvent('lotpack-auth-required'));
    }
  }

  async function uploadSubmission(item){
    if(!client) throw new Error('Cloud client is not ready');
    const {data:{session}} = await client.auth.getSession();
    if(!session?.user) throw new Error('Sign in is required before upload');

    const row = {
      client_submission_id:item.id,
      user_id:session.user.id,
      status:'received',
      summary:item.payload?.summary || item.summary || {},
      payload:item.payload || item,
      submitted_at:item.createdAt || new Date().toISOString(),
      received_at:new Date().toISOString()
    };
    const {data,error} = await client
      .from('lot_pack_submissions')
      .upsert(row,{onConflict:'client_submission_id'})
      .select('id')
      .single();
    if(error) throw error;
    return {ok:true,submissionId:data.id};
  }

  async function init(){
    ensureUi();
    if(!readyConfig()){
      message('Supabase configuration is missing.','error');
      return;
    }
    if(!window.supabase?.createClient){
      message('Supabase library failed to load. Check the internet connection and reload once.','error');
      return;
    }
    client = window.supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_PUBLISHABLE_KEY,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
    window.LotPackCloud = {
      uploadSubmission,
      getUser:()=>currentUser,
      getLastUser:()=>({id:localStorage.getItem('lotpackLastUserId') || '',email:localStorage.getItem('lotpackLastUserEmail') || ''}),
      getClient:()=>client
    };
    const {data:{session}} = await client.auth.getSession();
    applySession(session);
    client.auth.onAuthStateChange((_event,nextSession)=>applySession(nextSession));
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
