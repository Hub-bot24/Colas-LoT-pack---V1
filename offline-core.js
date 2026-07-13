(function(){
  'use strict';

  const DB_NAME = 'colas-lotpack-offline';
  const DB_VERSION = 1;
  const DRAFTS = 'drafts';
  const SUBMISSIONS = 'submissions';
  const CURRENT_KEY = 'colasLotPackCurrentDraftId';
  const CONFIG = window.LOTPACK_CONFIG || {};
  let dbPromise;
  let saveTimer;
  let saving = false;

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
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function put(storeName, value){
    const db = await openDb();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction(storeName,'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function get(storeName,id){
    const db = await openDb();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction(storeName,'readonly');
      const req = tx.objectStore(storeName).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll(storeName){
    const db = await openDb();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction(storeName,'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function currentDraftId(){
    let id = localStorage.getItem(CURRENT_KEY);
    if(!id){
      id = 'draft-' + crypto.randomUUID();
      localStorage.setItem(CURRENT_KEY,id);
    }
    return id;
  }

  function fieldKey(el,index){
    return el.id || el.name || ('field-' + index);
  }

  function serializeForm(){
    const fields = {};
    const controls = Array.from(document.querySelectorAll('input,select,textarea,[contenteditable="true"]'));
    controls.forEach((el,index)=>{
      if(el.type === 'file') return;
      const key = fieldKey(el,index);
      if(el.type === 'checkbox' || el.type === 'radio') fields[key] = {kind:el.type, checked:el.checked, value:el.value};
      else if(el.isContentEditable) fields[key] = {kind:'contenteditable', value:el.innerHTML};
      else fields[key] = {kind:'value', value:el.value};
    });
    const canvases = {};
    Array.from(document.querySelectorAll('canvas')).forEach((canvas,index)=>{
      try{
        const key = canvas.id || ('canvas-' + index);
        canvases[key] = canvas.toDataURL('image/png');
      }catch(_e){}
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
    document.dispatchEvent(new Event('input',{bubbles:true}));
    try{ if(typeof updateLotNo === 'function') updateLotNo(); }catch(_e){}
  }

  function lotSummary(){
    const value = id => (document.getElementById(id)?.value || '').trim();
    return {
      lotNo:value('lotNoTop') || value('lotNoFinal'),
      customer:value('customer'),
      jobNo:value('jobNo'),
      siteLocation:value('siteLocation'),
      workDate:value('workDate'),
      worker:value('printName') || value('qaConfirmedBy') || value('colasRepName')
    };
  }

  function ensureStatusUi(){
    if(document.getElementById('offlineSaveStatus')) return;
    const bar = document.createElement('div');
    bar.id = 'offlineSaveStatus';
    bar.setAttribute('role','status');
    bar.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;padding:9px 12px;border-radius:999px;background:#1f2937;color:#fff;font:600 13px Arial,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);max-width:calc(100vw - 24px)';
    document.body.appendChild(bar);
    updateStatus();
  }

  async function pendingCount(){
    const all = await getAll(SUBMISSIONS);
    return all.filter(x => x.status !== 'sent').length;
  }

  async function updateStatus(message){
    const bar = document.getElementById('offlineSaveStatus');
    if(!bar) return;
    const pending = await pendingCount().catch(()=>0);
    if(message) bar.textContent = message;
    else if(!navigator.onLine) bar.textContent = pending ? `Offline — ${pending} submission pending safely` : 'Offline — saving safely on this phone';
    else if(pending) bar.textContent = `Online — ${pending} submission awaiting upload`;
    else bar.textContent = 'Online — saved on device';
  }

  async function saveDraft(showMessage){
    if(saving) return;
    saving = true;
    try{
      const record = {
        id:currentDraftId(),
        updatedAt:new Date().toISOString(),
        appVersion:CONFIG.APP_VERSION || '',
        summary:lotSummary(),
        snapshot:serializeForm()
      };
      await put(DRAFTS,record);
      await updateStatus('Saved safely on this phone');
      if(showMessage) alert('Draft saved safely on this phone.');
    }catch(error){
      console.error('[offline] save failed',error);
      await updateStatus('Save failed — keep this page open');
      if(showMessage) alert('The draft could not be saved. Keep this page open and try again.');
    }finally{
      saving = false;
    }
  }

  function scheduleSave(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(()=>saveDraft(false),600);
  }

  async function restoreCurrentDraft(){
    const record = await get(DRAFTS,currentDraftId());
    if(record?.snapshot) restoreSnapshot(record.snapshot);
  }

  async function queueSubmission(){
    await saveDraft(false);
    const draft = await get(DRAFTS,currentDraftId());
    const submission = {
      id:'submission-' + crypto.randomUUID(),
      draftId:draft.id,
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString(),
      status:'pending',
      attempts:0,
      lastError:'',
      recipient:CONFIG.DEFAULT_RECIPIENT || '',
      payload:draft
    };
    await put(SUBMISSIONS,submission);
    await updateStatus('Completed Lot Pack saved — awaiting secure upload');
    registerBackgroundSync();
    await syncPending();
    return submission;
  }

  async function registerBackgroundSync(){
    try{
      const reg = await navigator.serviceWorker?.ready;
      if(reg?.sync) await reg.sync.register('lotpack-submit-sync');
    }catch(_e){}
  }

  async function sendOne(item){
    if(!CONFIG.SUBMIT_ENDPOINT) throw new Error('Secure submission endpoint has not been configured');
    const response = await fetch(CONFIG.SUBMIT_ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(item)
    });
    if(!response.ok) throw new Error(`Server returned ${response.status}`);
    const result = await response.json().catch(()=>({ok:true}));
    if(result.ok === false) throw new Error(result.error || 'Server rejected submission');
    item.status='sent';
    item.sentAt=new Date().toISOString();
    item.serverSubmissionId=result.submissionId || '';
    item.lastError='';
    item.updatedAt=new Date().toISOString();
    await put(SUBMISSIONS,item);
  }

  async function syncPending(){
    if(!navigator.onLine){ await updateStatus(); return; }
    const all = await getAll(SUBMISSIONS);
    const pending = all.filter(x=>x.status !== 'sent');
    if(!pending.length){ await updateStatus(); return; }
    if(!CONFIG.SUBMIT_ENDPOINT){
      await updateStatus(`${pending.length} submission saved — server connection not configured yet`);
      return;
    }
    for(const item of pending){
      item.status='uploading';
      item.attempts=(item.attempts||0)+1;
      item.updatedAt=new Date().toISOString();
      await put(SUBMISSIONS,item);
      await updateStatus(`Uploading ${item.summary?.lotNo || 'Lot Pack'}…`);
      try{ await sendOne(item); }
      catch(error){
        item.status='pending';
        item.lastError=String(error.message || error);
        item.updatedAt=new Date().toISOString();
        await put(SUBMISSIONS,item);
      }
    }
    await updateStatus();
  }

  async function submitHandler(){
    const confirmed = confirm('Submit this completed Lot Pack? It will be stored safely on this phone first and uploaded when a connection is available.');
    if(!confirmed) return;
    try{
      await queueSubmission();
      if(CONFIG.SUBMIT_ENDPOINT && navigator.onLine) alert('Submission saved and upload attempted. The status indicator confirms whether anything remains pending.');
      else alert('Submission saved safely on this phone. It will upload automatically after the secure server connection is configured and internet is available.');
    }catch(error){
      console.error('[offline] queue failed',error);
      alert('Submission could not be queued. Do not close the app; press Save Draft and try again.');
    }
  }

  async function init(){
    ensureStatusUi();
    await openDb();
    await restoreCurrentDraft();
    document.addEventListener('input',scheduleSave,true);
    document.addEventListener('change',scheduleSave,true);
    window.addEventListener('online',()=>syncPending());
    window.addEventListener('offline',()=>updateStatus());
    window.addEventListener('beforeunload',()=>saveDraft(false));
    setInterval(()=>saveDraft(false),20000);
    setInterval(()=>syncPending(),60000);
    window.saveDraft = () => saveDraft(true);
    window.emailSubmitLotPack = submitHandler;
    navigator.serviceWorker?.addEventListener('message',event=>{
      if(event.data?.type === 'RETRY_PENDING_SUBMISSIONS') syncPending();
    });
    await syncPending();
  }

  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(error=>console.error('[offline] service worker',error)));
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
