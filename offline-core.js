(function(){
  'use strict';

  const DB_NAME = 'colas-lotpack-offline';
  const DB_VERSION = 2;
  const DRAFTS = 'drafts';
  const SUBMISSIONS = 'submissions';
  const META = 'meta';
  const CURRENT_KEY = 'colasLotPackCurrentDraftId';
  const CONFIG = window.LOTPACK_CONFIG || {};
  let dbPromise;
  let saveTimer;
  let saving = false;
  let syncRunning = false;

  function uuid(prefix){
    const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix || ''}${id}`;
  }

  function openDb(){
    if(dbPromise) return dbPromise;
    dbPromise = new Promise((resolve,reject)=>{
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS,{keyPath:'id'});
        if(!db.objectStoreNames.contains(SUBMISSIONS)){
          const store = db.createObjectStore(SUBMISSIONS,{keyPath:'id'});
          store.createIndex('status','status',{unique:false});
          store.createIndex('createdAt','createdAt',{unique:false});
        }
        if(!db.objectStoreNames.contains(META)) db.createObjectStore(META,{keyPath:'key'});
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function txRequest(storeName, mode, action){
    const db = await openDb();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction(storeName,mode);
      let request;
      try{ request = action(tx.objectStore(storeName)); }
      catch(error){ reject(error); return; }
      if(request){
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }else{
        tx.oncomplete = () => resolve();
      }
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
    });
  }

  const put = (store,value) => txRequest(store,'readwrite',s=>s.put(value)).then(()=>value);
  const get = (store,id) => txRequest(store,'readonly',s=>s.get(id)).then(v=>v || null);
  const getAll = store => txRequest(store,'readonly',s=>s.getAll()).then(v=>v || []);
  const remove = (store,id) => txRequest(store,'readwrite',s=>s.delete(id));

  function currentDraftId(){
    let id = localStorage.getItem(CURRENT_KEY);
    if(!id){ id = uuid('draft-'); localStorage.setItem(CURRENT_KEY,id); }
    return id;
  }

  function newDraftId(){
    const id = uuid('draft-');
    localStorage.setItem(CURRENT_KEY,id);
    return id;
  }

  function fieldKey(el,index){ return el.id || el.name || ('field-' + index); }

  function serializeForm(){
    const fields = {};
    const controls = Array.from(document.querySelectorAll('input,select,textarea,[contenteditable="true"]'));
    controls.forEach((el,index)=>{
      if(el.type === 'file') return;
      const key = fieldKey(el,index);
      if(el.type === 'checkbox' || el.type === 'radio') fields[key] = {kind:el.type,checked:el.checked,value:el.value};
      else if(el.isContentEditable) fields[key] = {kind:'contenteditable',value:el.innerHTML};
      else fields[key] = {kind:'value',value:el.value};
    });
    const canvases = {};
    Array.from(document.querySelectorAll('canvas')).forEach((canvas,index)=>{
      try{ canvases[canvas.id || ('canvas-' + index)] = canvas.toDataURL('image/png'); }catch(_e){}
    });
    return {fields,canvases};
  }

  function restoreSnapshot(snapshot){
    if(!snapshot) return;
    const controls = Array.from(document.querySelectorAll('input,select,textarea,[contenteditable="true"]'));
    controls.forEach((el,index)=>{
      if(el.type === 'file') return;
      const saved = snapshot.fields && snapshot.fields[fieldKey(el,index)];
      if(!saved) return;
      if(saved.kind === 'checkbox' || saved.kind === 'radio') el.checked = !!saved.checked;
      else if(saved.kind === 'contenteditable') el.innerHTML = saved.value || '';
      else el.value = saved.value == null ? '' : saved.value;
    });
    Object.entries(snapshot.canvases || {}).forEach(([key,data])=>{
      const canvas = document.getElementById(key);
      if(!canvas || !data) return;
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
      };
      img.src = data;
    });
    try{ if(typeof updateLotNo === 'function') updateLotNo(); }catch(_e){}
  }

  function value(id){ return (document.getElementById(id)?.value || '').trim(); }
  function lotSummary(){
    return {
      lotNo:value('lotNoTop') || value('lotNoFinal'),
      customer:value('customer'),
      jobNo:value('jobNo'),
      siteLocation:value('siteLocation'),
      workDate:value('workDate'),
      worker:value('printName') || value('qaConfirmedBy') || value('colasRepName')
    };
  }

  async function requestPersistentStorage(){
    try{
      if(navigator.storage?.persist){
        const granted = await navigator.storage.persist();
        await put(META,{key:'persistent-storage',granted,checkedAt:new Date().toISOString()});
      }
    }catch(error){ console.warn('[offline] persistent storage request failed',error); }
  }

  async function storageEstimate(){
    try{
      const estimate = await navigator.storage?.estimate?.();
      if(!estimate) return '';
      const used = Math.round((estimate.usage || 0)/1024/1024);
      const quota = Math.round((estimate.quota || 0)/1024/1024);
      return `${used} MB used of ${quota} MB`;
    }catch(_e){ return ''; }
  }

  function ensureUi(){
    if(document.getElementById('offlineSaveStatus')) return;
    const style = document.createElement('style');
    style.textContent = `
      #offlineSaveStatus{position:fixed;right:12px;bottom:12px;z-index:99999;padding:10px 14px;border-radius:999px;background:#1f2937;color:#fff;font:700 13px Arial,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);max-width:calc(100vw - 24px)}
      #offlineSafetyPanel{position:fixed;right:12px;bottom:62px;z-index:99998;width:min(360px,calc(100vw - 24px));background:#fff;border:2px solid #003057;border-radius:14px;padding:14px;box-shadow:0 10px 28px rgba(0,0,0,.28);font-family:Arial,sans-serif;display:none}
      #offlineSafetyPanel.open{display:block} #offlineSafetyPanel h3{margin:0 0 8px;color:#003057} #offlineSafetyPanel p{margin:7px 0;line-height:1.35}
      #offlineSafetyPanel .danger{color:#9b1c1c;font-weight:800} #offlineSafetyPanel .actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
      #offlineSafetyPanel button,#offlineSafetyPanel label{display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #003057;background:#fff;color:#003057;font-weight:800;cursor:pointer;text-align:center}
      #offlineSafetyPanel button.primary{background:#003057;color:#fff} #offlineSafetyPanel input[type=file]{display:none}
      @media print{#offlineSaveStatus,#offlineSafetyPanel{display:none!important}}
    `;
    document.head.appendChild(style);
    const bar = document.createElement('button');
    bar.id = 'offlineSaveStatus';
    bar.type = 'button';
    bar.setAttribute('aria-expanded','false');
    bar.addEventListener('click',()=>{
      const panel = document.getElementById('offlineSafetyPanel');
      const open = !panel.classList.contains('open');
      panel.classList.toggle('open',open); bar.setAttribute('aria-expanded',String(open)); refreshSafetyPanel();
    });
    document.body.appendChild(bar);

    const panel = document.createElement('div');
    panel.id = 'offlineSafetyPanel';
    panel.innerHTML = `<h3>Offline safety</h3><p id="offlineSafetyText">Checking device storage…</p><p class="danger">Never clear browser data or delete the home-screen app while a submission is pending.</p><div class="actions"><button class="primary" id="offlineSyncNow" type="button">Send now</button><button id="offlineExport" type="button">Export backup</button><label for="offlineImport">Import backup</label><input id="offlineImport" type="file" accept="application/json,.json"><button id="offlineClose" type="button">Close</button></div>`;
    document.body.appendChild(panel);
    panel.querySelector('#offlineSyncNow').addEventListener('click',syncPending);
    panel.querySelector('#offlineExport').addEventListener('click',exportBackup);
    panel.querySelector('#offlineImport').addEventListener('change',importBackup);
    panel.querySelector('#offlineClose').addEventListener('click',()=>panel.classList.remove('open'));
  }

  async function pendingItems(){
    const all = await getAll(SUBMISSIONS);
    return all.filter(x => x.status !== 'sent');
  }

  async function updateStatus(message){
    const bar = document.getElementById('offlineSaveStatus');
    if(!bar) return;
    const pending = (await pendingItems().catch(()=>[])).length;
    if(message) bar.textContent = message;
    else if(!navigator.onLine) bar.textContent = pending ? `Offline — ${pending} completed pack${pending===1?'':'s'} stored safely` : 'Offline — saving safely on this phone';
    else if(pending) bar.textContent = `Online — ${pending} pack${pending===1?'':'s'} waiting to send`;
    else bar.textContent = 'Online — saved safely on this phone';
    refreshSafetyPanel();
  }

  async function refreshSafetyPanel(){
    const text = document.getElementById('offlineSafetyText');
    if(!text) return;
    const pending = await pendingItems().catch(()=>[]);
    const estimate = await storageEstimate();
    text.innerHTML = `<strong>${pending.length}</strong> completed submission${pending.length===1?' is':'s are'} waiting on this device.<br>${navigator.onLine?'Connection detected.':'No connection detected.'}${estimate?`<br>${estimate}`:''}`;
  }

  async function saveDraft(showMessage){
    if(saving) return;
    saving = true;
    try{
      const record = {
        id:currentDraftId(),
        updatedAt:new Date().toISOString(),
        createdAt:(await get(DRAFTS,currentDraftId()))?.createdAt || new Date().toISOString(),
        appVersion:CONFIG.APP_VERSION || '',
        summary:lotSummary(),
        owner:window.LotPackCloud?.getUser?.() ? {id:window.LotPackCloud.getUser().id,email:window.LotPackCloud.getUser().email || ''} : (window.LotPackCloud?.getLastUser?.() || {}),
        snapshot:serializeForm()
      };
      await put(DRAFTS,record);
      await updateStatus('Saved safely on this phone');
      if(showMessage) alert('Draft saved safely on this phone.');
    }catch(error){
      console.error('[offline] save failed',error);
      await updateStatus('SAVE FAILED — keep this page open');
      if(showMessage) alert('The draft could not be saved. Keep this page open and export a backup.');
    }finally{ saving = false; }
  }

  function scheduleSave(){ clearTimeout(saveTimer); saveTimer = setTimeout(()=>saveDraft(false),250); }

  async function restoreCurrentDraft(){
    const record = await get(DRAFTS,currentDraftId());
    if(record?.snapshot) restoreSnapshot(record.snapshot);
  }

  async function sha256(text){
    try{
      const bytes = new TextEncoder().encode(text);
      const hash = await crypto.subtle.digest('SHA-256',bytes);
      return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
    }catch(_e){ return ''; }
  }

  async function queueSubmission(){
    await saveDraft(false);
    const draft = await get(DRAFTS,currentDraftId());
    if(!draft) throw new Error('Draft could not be read from device storage');
    const body = JSON.stringify(draft);
    const submission = {
      id:uuid('submission-'),
      draftId:draft.id,
      checksum:await sha256(body),
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString(),
      status:'pending',
      attempts:0,
      nextAttemptAt:null,
      lastError:'',
      recipient:CONFIG.DEFAULT_RECIPIENT || '',
      owner:draft.owner || {},
      summary:draft.summary || {},
      payload:draft
    };
    await put(SUBMISSIONS,submission);
    await updateStatus('Completed Lot Pack locked safely on this phone');
    await registerBackgroundSync();
    await syncPending();
    return submission;
  }

  async function registerBackgroundSync(){
    try{ const reg = await navigator.serviceWorker?.ready; if(reg?.sync) await reg.sync.register('lotpack-submit-sync'); }catch(_e){}
  }

  async function sendOne(item){
    if(!window.LotPackCloud?.uploadSubmission) throw new Error('Secure cloud connection is unavailable');
    const result = await window.LotPackCloud.uploadSubmission(item);
    item.status='sent'; item.sentAt=new Date().toISOString(); item.serverSubmissionId=result.submissionId || ''; item.lastError=''; item.nextAttemptAt=null; item.updatedAt=new Date().toISOString();
    await put(SUBMISSIONS,item);
  }

  function retryDelay(attempts){ return Math.min(6*60*60*1000, Math.max(15000, Math.pow(2,Math.min(attempts,10))*15000)); }

  async function syncPending(){
    if(syncRunning) return;
    syncRunning = true;
    try{
      if(!navigator.onLine){ await updateStatus(); return; }
      const pending = await pendingItems();
      if(!pending.length){ await updateStatus(); return; }
      if(!window.LotPackCloud?.uploadSubmission){ await updateStatus(`${pending.length} pack${pending.length===1?'':'s'} safe — sign in online to send`); return; }
      for(const item of pending.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)))){
        if(item.nextAttemptAt && Date.now() < Date.parse(item.nextAttemptAt)) continue;
        item.status='uploading'; item.attempts=(item.attempts||0)+1; item.updatedAt=new Date().toISOString(); await put(SUBMISSIONS,item);
        await updateStatus(`Sending ${item.summary?.lotNo || item.summary?.jobNo || 'Lot Pack'}…`);
        try{ await sendOne(item); }
        catch(error){
          item.status='pending'; item.lastError=String(error.message || error); item.nextAttemptAt=new Date(Date.now()+retryDelay(item.attempts)).toISOString(); item.updatedAt=new Date().toISOString(); await put(SUBMISSIONS,item);
          console.warn('[offline] send attempt failed; retained on device',error);
        }
      }
      await updateStatus();
    }finally{ syncRunning = false; }
  }

  async function exportBackup(){
    await saveDraft(false);
    const bundle = {
      format:'COLAS_LOTPACK_OFFLINE_BACKUP',
      version:2,
      exportedAt:new Date().toISOString(),
      appVersion:CONFIG.APP_VERSION || '',
      currentDraftId:currentDraftId(),
      drafts:await getAll(DRAFTS),
      submissions:await getAll(SUBMISSIONS)
    };
    const blob = new Blob([JSON.stringify(bundle)],{type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `COLAS-LotPack-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  async function importBackup(event){
    const file = event.target.files?.[0]; event.target.value=''; if(!file) return;
    try{
      const bundle = JSON.parse(await file.text());
      if(bundle.format !== 'COLAS_LOTPACK_OFFLINE_BACKUP') throw new Error('Not a valid COLAS Lot Pack backup');
      for(const draft of bundle.drafts || []) await put(DRAFTS,draft);
      for(const submission of bundle.submissions || []) await put(SUBMISSIONS,submission);
      if(bundle.currentDraftId) localStorage.setItem(CURRENT_KEY,bundle.currentDraftId);
      await restoreCurrentDraft(); await updateStatus();
      alert('Backup imported successfully. Pending submissions remain protected and will send when possible.');
    }catch(error){ alert(`Backup import failed: ${error.message || error}`); }
  }

  async function submitHandler(){
    const confirmed = confirm('Submit this completed Lot Pack? A locked copy will be stored on this phone first. It will remain here until the server confirms receipt.');
    if(!confirmed) return;
    try{
      await queueSubmission();
      alert(navigator.onLine ? 'Submission stored safely and sending has started. Check the status badge.' : 'Submission stored safely on this phone. It will keep retrying whenever reception returns.');
    }catch(error){
      console.error('[offline] queue failed',error);
      alert('Submission could not be locked into the offline queue. Do not close the app. Save the draft and export an emergency backup.');
    }
  }

  async function init(){
    ensureUi(); await openDb(); await requestPersistentStorage(); await restoreCurrentDraft();
    document.addEventListener('input',scheduleSave,true);
    document.addEventListener('change',scheduleSave,true);
    document.addEventListener('blur',scheduleSave,true);
    window.addEventListener('online',syncPending);
    window.addEventListener('lotpack-auth-ready',syncPending);
    window.addEventListener('offline',updateStatus);
    window.addEventListener('pagehide',()=>saveDraft(false));
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') saveDraft(false); else syncPending(); });
    setInterval(()=>saveDraft(false),15000);
    setInterval(()=>syncPending(),30000);
    window.saveDraft = () => saveDraft(true);
    window.emailSubmitLotPack = submitHandler;
    window.submitLotPack = submitHandler;
    window.exportLotPackBackup = exportBackup;
    navigator.serviceWorker?.addEventListener('message',event=>{ if(event.data?.type === 'RETRY_PENDING_SUBMISSIONS') syncPending(); });
    await syncPending();
  }

  if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(error=>console.error('[offline] service worker',error)));
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
