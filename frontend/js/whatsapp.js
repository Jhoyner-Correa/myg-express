const POLL_MS = 15000;
const QR_POLL_MS = 5000;

document.addEventListener('DOMContentLoaded', async () => {
  if(typeof API !== 'undefined'){
    API.Auth?.requireAuth?.();
    API.ensureSuperadminSidebar?.();
  }

  const user = typeof API !== 'undefined' ? API.getUser?.() : null;
  const S = {
    sesiones:[],openQr:new Set(),timers:{},
    pendingDel:null,mainTimer:null,qrTimer:null,loading:false,sync:null
  };

  hydrateChrome(user);
  bindModals();
  await load();
  startPoll();
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) load(true); });
  window.addEventListener('beforeunload',cleanup);

  function hydrateChrome(u){
    set('user-nombre', u?.nombre||'Usuario');
    set('user-sede', u?.sede_nombre||'-');
    set('user-rol', u?.rol||'-');
    set('user-avatar', (u?.nombre||'U')[0].toUpperCase());
    document.getElementById('btn-logout')?.addEventListener('click',()=>API.Auth?.logout?.());
  }

  async function load(silent=false){
    if(S.loading) return;
    if(!silent){
      document.getElementById('sessions-grid').innerHTML = renderSkel();
      document.getElementById('empty-state').style.display='none';
    }
    S.loading=true;
    try{
      const data = await API.WhatsAppSesiones?.listar?.();
      const raw = data?.data||[];
      S.sesiones = raw.map(s=>({...s,estado_real:String(s.estado_real||s.estado||'disconnected').toLowerCase()}));
      S.sync = new Date();
      renderAll();
    }catch(e){
      if(!silent) renderWorkerUnavailableState(e);
    }finally{
      S.loading=false;
    }
  }

  function startPoll(){
    if(S.mainTimer) clearInterval(S.mainTimer);
    S.mainTimer = setInterval(()=>{ if(!document.hidden) load(true); }, POLL_MS);
    syncQrPoll();
  }

  function syncQrPoll(){
    if(S.qrTimer){ clearInterval(S.qrTimer); S.qrTimer=null; }
    if(S.openQr.size===0) return;
    S.qrTimer = setInterval(()=>{ if(!document.hidden) load(true); }, QR_POLL_MS);
  }

  function cleanup(){
    if(S.mainTimer) clearInterval(S.mainTimer);
    if(S.qrTimer) clearInterval(S.qrTimer);
    Object.keys(S.timers).forEach(id=>clearTimer(id));
  }

  function renderAll(){
    const grid = document.getElementById('sessions-grid');
    const empty = document.getElementById('empty-state');
    const primary = S.sesiones[0]||null;
    const conn = primary && isConn(primary.estado_real);

    set('count-total', primary?1:0);
    set('count-activas', conn?1:0);
    set('count-inactivas', primary&&!conn?1:0);
    set('count-hora', fmtTime(S.sync));
    set('count-fecha', fmtDate(S.sync));
    syncUI();

    if(!primary){
      grid.innerHTML='';
      empty.style.display='flex';
      bindEvents();
      return;
    }
    empty.style.display='none';
    grid.innerHTML = renderCard(primary);
    bindEvents();
    restoreQr();
  }

  function renderWorkerUnavailableState(error){
    const grid = document.getElementById('sessions-grid');
    const empty = document.getElementById('empty-state');
    const message = error?.serviceUnavailable
      ? 'El servicio de WhatsApp esta temporalmente fuera de linea. El resto del sistema sigue funcionando normal.'
      : (error?.message || 'No se pudieron cargar las sesiones de WhatsApp.');

    S.sesiones = [];
    set('count-total', 0);
    set('count-activas', 0);
    set('count-inactivas', 0);
    set('count-hora', '--:--');
    set('count-fecha', 'Sin sincronizacion');
    syncUI();

    if (grid) {
      grid.innerHTML = '';
    }

    if (empty) {
      empty.style.display = 'flex';
      empty.innerHTML = `
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.75V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.25A7 7 0 0 0 12 2z"/><path d="M5 5l14 14"/></svg>
        </div>
        <div class="empty-state-content">
          <h3>Worker de WhatsApp no disponible</h3>
          <p>${esc(message)}</p>
        </div>
      `;
    }

    toast(message,'error');
  }

  function renderCard(s){
    const est = s.estado_real;
    const conn = isConn(est);
    const numero = s.numero_whatsapp||'Sin numero';
    const ultima = s.ultima_conexion ? fmtDateLong(s.ultima_conexion) : 'Sin conexion registrada';
    return `
<div class="session-card" data-id="${s.id}">
  <div class="sc-header">
    <div class="sc-identity">
      <div class="sc-icon">
        <div class="sc-icon-pulse"></div>
        <svg viewBox="0 0 24 24"><path d="M20.52 3.48A11.85 11.85 0 0 0 12.05 0C5.52 0 .2 5.31.2 11.85c0 2.09.54 4.13 1.57 5.93L0 24l6.39-1.68a11.8 11.8 0 0 0 5.66 1.44h.01c6.53 0 11.85-5.31 11.85-11.85 0-3.17-1.24-6.14-3.39-8.43zM12.06 21.7h-.01a9.8 9.8 0 0 1-4.99-1.36l-.36-.21-3.79 1 1.01-3.69-.23-.38a9.8 9.8 0 0 1-1.5-5.21c0-5.43 4.42-9.85 9.86-9.85 2.63 0 5.09 1.02 6.95 2.89a9.79 9.79 0 0 1 2.89 6.96c0 5.43-4.42 9.85-9.84 9.85zm5.4-7.36c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15s-.77.97-.95 1.17c-.17.2-.35.22-.65.07-.3-.15-1.28-.47-2.43-1.49-.9-.8-1.51-1.79-1.68-2.09-.18-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.21 5.1 4.5.71.31 1.27.49 1.71.63.72.23 1.37.2 1.88.12.57-.09 1.77-.72 2.02-1.41.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z"/></svg>
      </div>
      <div>
        <div class="sc-name">${esc(s.nombre_dispositivo||'Dispositivo sin nombre')}</div>
        <div class="sc-sub">WhatsApp oficial configurado para esta sede</div>
      </div>
    </div>
    <div class="sc-badges">
      <span class="badge ${conn?'badge-active':'badge-idle'}">
        <span class="badge-dot"></span>
        ${conn?'Activa':fmtStatus(est)}
      </span>
      <span class="badge badge-ws ws-${est}">${fmtStatus(est)}</span>
    </div>
  </div>

  <div class="sc-body">
    <div class="sc-chips">
      <div class="chip">
        <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 3.95 10.91 19.79 19.79 0 0 1 .88 2.27 2 2 0 0 1 2.86.09h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 7.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <strong>${esc(numero)}</strong>
      </div>
      <div class="chip">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
        <strong>${esc(ultima)}</strong>
      </div>
      ${s.created_at?`<div class="chip"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><strong>Registrada: ${esc(fmtDateLong(s.created_at))}</strong></div>`:''}
    </div>

    <div class="sc-grid">
      <div class="sg-item">
        <div class="sg-lbl">Estado del cliente</div>
        <div class="sg-val">${esc(fmtStatus(est))}</div>
        <div class="sg-copy">Estado actual reportado por el servidor</div>
      </div>
      <div class="sg-item">
        <div class="sg-lbl">Numero vinculado</div>
        <div class="sg-val">${esc(numero)}</div>
        <div class="sg-copy">Numero de referencia registrado</div>
      </div>
      <div class="sg-item">
        <div class="sg-lbl">Ultima sincronizacion</div>
        <div class="sg-val" id="sync-display">${fmtTime(S.sync)}</div>
        <div class="sg-copy">${fmtDate(S.sync)}</div>
      </div>
    </div>

    <div id="qr-panel-${s.id}" style="display:none">
      <div class="qr-wrap">
        <div class="qr-head">
          <div class="qr-title">
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Escanear codigo QR
          </div>
          <button class="qr-close" type="button" data-action="close-qr" data-id="${s.id}">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <p class="qr-inst">Abre <strong>WhatsApp</strong> -> <strong>Dispositivos vinculados</strong> -> <strong>Vincular dispositivo</strong></p>
        <div class="qr-status-row">
          <span class="qr-pill loading" id="qr-pill-${s.id}">Preparando QR</span>
          <span class="qr-timer" id="qr-timer-${s.id}">Esperando...</span>
        </div>
        <div class="qr-display" id="qr-display-${s.id}">
          <div class="qr-loading">
            <span class="spin"></span>
            <span>Generando QR...</span>
            <small>Esto puede tardar unos segundos.</small>
          </div>
        </div>
        <div class="qr-track"><span class="qr-bar" id="qr-bar-${s.id}"></span></div>
        <div class="qr-foot">
          <span class="qr-helper" id="qr-helper-${s.id}">Cuando aparezca el codigo, escanealo desde tu celular.</span>
          <button class="btn-qr-refresh" type="button" data-action="refresh-qr" data-id="${s.id}">
            <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
            Actualizar
          </button>
        </div>
      </div>
    </div>
  </div>

  <div class="sc-actions">
    ${conn?
      `<button class="btn btn-ghost" data-action="status" data-id="${s.id}"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/></svg>Ver estado</button>`
    :
      `<button class="btn btn-blue" data-action="qr" data-id="${s.id}"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>Abrir QR</button>`
    }
    <button class="btn btn-amber" data-action="reconnect" data-id="${s.id}" ${est==='initializing'?'disabled':''}>
      <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>Reconectar
    </button>
    <button class="btn btn-red" data-action="logout" data-id="${s.id}">
      <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Cerrar sesion
    </button>
    <button class="btn btn-ghost" data-action="change">
      <svg viewBox="0 0 24 24"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>Cambiar WhatsApp
    </button>
    <button class="btn btn-dark" data-action="delete" data-id="${s.id}">
      <svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>Eliminar
    </button>
  </div>
</div>`;
  }

  function renderSkel(){
    return `<div class="sk-card skeleton-card"><div class="sk sk-h"></div><div class="sk sk-t"></div><div class="sk sk-l"></div><div class="sk sk-l s"></div><div class="sk sk-l"></div></div>`;
  }

  function bindEvents(){
    on('delete', btn=>{
      const id=+btn.dataset.id;
      const s=byId(id);
      openDel(id, s?.nombre_dispositivo||'este dispositivo');
    });
    on('qr', btn=>openQr(+btn.dataset.id));
    on('status', btn=>doAction('status',+btn.dataset.id));
    on('reconnect', btn=>doAction('reconnect',+btn.dataset.id));
    on('logout', btn=>doAction('logout',+btn.dataset.id));
    on('close-qr', btn=>closeQr(+btn.dataset.id));
    on('refresh-qr', btn=>refreshQr(+btn.dataset.id));
    on('change', ()=>openModal());
  }

  function on(action, cb){
    document.querySelectorAll(`[data-action="${action}"]`).forEach(b=>b.addEventListener('click',()=>cb(b)));
  }

  function bindModals(){
    document.getElementById('btn-open-modal')?.addEventListener('click', openModal);
    document.getElementById('btn-close-m')?.addEventListener('click', closeModal);
    document.getElementById('btn-cancel-m')?.addEventListener('click', closeModal);
    document.getElementById('btn-save-m')?.addEventListener('click', saveSession);
    document.getElementById('overlay-session')?.addEventListener('click', e=>{ if(e.target.id==='overlay-session') closeModal(); });
    document.getElementById('btn-close-del')?.addEventListener('click', closeDel);
    document.getElementById('btn-cancel-del')?.addEventListener('click', closeDel);
    document.getElementById('btn-confirm-del')?.addEventListener('click', confirmDel);
    document.getElementById('overlay-delete')?.addEventListener('click', e=>{ if(e.target.id==='overlay-delete') closeDel(); });
  }

  function openModal(){
    syncUI();
    document.getElementById('overlay-session').classList.add('open');
    setFb('','');
    document.getElementById('m-device')?.focus();
  }
  function closeModal(){
    document.getElementById('overlay-session').classList.remove('open');
    document.getElementById('m-device').value='';
    document.getElementById('m-phone').value='';
    setFb('','');
  }

  async function saveSession(){
    const nombre = document.getElementById('m-device').value.trim();
    const numero = document.getElementById('m-phone').value.trim();
    const btn = document.getElementById('btn-save-m');
    if(!nombre){ setFb('Escribe un nombre para el dispositivo.','error'); return; }
    try{
      btn.disabled=true; btn.textContent='Guardando...';
      const r = await API.WhatsAppSesiones?.crear?.({nombre_dispositivo:nombre,numero_whatsapp:numero||null});
      toast(r?.message||'Sesion guardada correctamente.','success');
      closeModal();
      await load(true);
    }catch(e){
      setFb(e?.message||'No se pudo guardar la sesion.','error');
    }finally{
      btn.disabled=false; btn.textContent=S.sesiones.length?'Cambiar WhatsApp':'Guardar sesion';
    }
  }

  function setFb(msg, type){
    const fb=document.getElementById('m-feedback');
    fb.textContent=msg||''; fb.className='fb';
    if(msg) fb.classList.add('show',type||'error');
  }

  function openDel(id,name){
    S.pendingDel={id,name};
    document.getElementById('del-msg').textContent=`Vas a eliminar la sesion "${name}". Esta accion es irreversible.`;
    document.getElementById('overlay-delete').classList.add('open');
  }
  function closeDel(){ S.pendingDel=null; document.getElementById('overlay-delete').classList.remove('open'); }

  async function confirmDel(){
    const t=S.pendingDel; if(!t) return;
    const btn=document.getElementById('btn-confirm-del');
    try{
      btn.disabled=true; btn.textContent='Eliminando...';
      await API.WhatsAppSesiones?.eliminar?.(t.id);
      closeQr(t.id); closeDel();
      toast(`Sesion "${t.name}" eliminada.`,'success');
      await load(true);
    }catch(e){
      toast(e?.message||'No se pudo eliminar.','error');
    }finally{
      btn.disabled=false; btn.textContent='Eliminar sesion';
    }
  }

  async function doAction(accion, id){
    const btn=document.querySelector(`[data-action="${accion}"][data-id="${id}"]`);
    try{
      if(btn){btn.disabled=true;btn.style.opacity='.5';}
      if(accion==='status'){
        const d=await API.WhatsAppSesiones?.obtenerStatus?.(id);
        toast(`Estado: ${fmtStatus(d?.status)}`,'info');
        await load(true);
      }else if(accion==='reconnect'){
        toast('Reconectando...','info');
        S.openQr.add(id);
        await API.WhatsAppSesiones?.reconectar?.(id);
        toast('Reconexion iniciada.','success');
        await load(true);
        setTimeout(()=>openQr(id),1800);
      }else if(accion==='logout'){
        if(!confirm('Se cerrara la sesion de este dispositivo. Continuar?')) return;
        await API.WhatsAppSesiones?.cerrar?.(id);
        closeQr(id);
        toast('Sesion cerrada.','success');
        await load(true);
      }
    }catch(e){ toast(e?.message||'Error al ejecutar accion.','error'); }
    finally{ if(btn){btn.disabled=false;btn.style.opacity='1';} }
  }

  async function openQr(id){
    const panel=document.getElementById(`qr-panel-${id}`);
    if(!panel) return;
    const s=byId(id);
    const est=s?.estado_real||'';
    S.openQr.add(id); syncQrPoll();
    panel.style.display='block';
    panel.scrollIntoView({behavior:'smooth',block:'nearest'});
    if(isConn(est)){ paintConn(id); clearTimer(id); return; }
    await renderQr(id);
    startTimer(id);
  }

  async function renderQr(id){
    const disp=document.getElementById(`qr-display-${id}`);
    const pill=document.getElementById(`qr-pill-${id}`);
    const bar=document.getElementById(`qr-bar-${id}`);
    const timer=document.getElementById(`qr-timer-${id}`);
    const helper=document.getElementById(`qr-helper-${id}`);
    if(!disp) return;
    const s=byId(id); const est=s?.estado_real||'';
    if(isConn(est)){ paintConn(id); clearTimer(id); return; }
    if(pill){pill.className='qr-pill loading';pill.textContent='Cargando QR';}
    if(bar) bar.style.width='10%';
    disp.innerHTML=`<div class="qr-loading"><span class="spin"></span><span>Obteniendo QR...</span><small>La primera carga puede tardar entre 5 y 15 segundos.</small></div>`;
    try{
      const data=await API.WhatsAppSesiones?.obtenerQr?.(id);
      const qr=data?.qr;
      if(!qr){
        if(pill){pill.className='qr-pill loading';pill.textContent='Esperando QR';}
        if(bar) bar.style.width='24%';
        disp.innerHTML='<div class="qr-aviso">QR no disponible aun. Espera unos segundos y vuelve a actualizar.</div>';
        return;
      }
      disp.innerHTML='';
      if(pill){pill.className='qr-pill ready';pill.textContent='QR listo para escanear';}
      if(bar) bar.style.width='100%';
      if(helper) helper.textContent='Escanea este codigo desde WhatsApp para vincular el dispositivo.';
      if(qr.startsWith('data:image')){
        const img=document.createElement('img'); img.src=qr; img.className='qr-img'; img.alt='QR WhatsApp';
        disp.appendChild(img); return;
      }
      if(typeof QRCode==='undefined'){ disp.innerHTML='<div class="qr-aviso">No se pudo renderizar el QR.</div>'; return; }
      const wrap=document.createElement('div');
      wrap.style.cssText='background:white;padding:10px;border-radius:10px;display:inline-block;';
      disp.appendChild(wrap);
      new QRCode(wrap,{text:qr,width:210,height:210,colorDark:'#0a0f0d',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
    }catch(e){
      if(pill){pill.className='qr-pill expired';pill.textContent='Error al cargar QR';}
      if(bar) bar.style.width='0%';
      disp.innerHTML=`<div class="qr-aviso">No se pudo obtener el QR.<br><small>${esc(e?.message||'')}</small></div>`;
    }
  }

  function startTimer(id){
    clearTimer(id);
    const timer=document.getElementById(`qr-timer-${id}`);
    const helper=document.getElementById(`qr-helper-${id}`);
    const pill=document.getElementById(`qr-pill-${id}`);
    const bar=document.getElementById(`qr-bar-${id}`);
    let secs=60;
    const tick=()=>{
      const panel=document.getElementById(`qr-panel-${id}`);
      if(!panel||panel.style.display==='none'){ clearTimer(id); return; }
      const s=byId(id); const est=s?.estado_real||'';
      if(isConn(est)){ paintConn(id); clearTimer(id); return; }
      if(timer) timer.textContent = secs>0?`QR visible por ${secs}s`:'QR posiblemente vencido';
      if(bar) bar.style.width=`${Math.max(0,(secs/60)*100)}%`;
      if(secs<=0){
        if(pill){pill.className='qr-pill expired';pill.textContent='Actualizar si no conecto';}
        if(helper) helper.textContent='Si ya lo escaneaste, espera la conexion. Si no, usa "Actualizar".';
        clearTimer(id); return;
      }
      secs--;
    };
    tick();
    S.timers[id]=setInterval(tick,1000);
  }

  async function refreshQr(id){ clearTimer(id); await renderQr(id); startTimer(id); }

  function closeQr(id){
    const panel=document.getElementById(`qr-panel-${id}`);
    if(panel) panel.style.display='none';
    S.openQr.delete(id); clearTimer(id); syncQrPoll();
  }

  async function restoreQr(){
    for(const id of S.openQr){
      const panel=document.getElementById(`qr-panel-${id}`);
      const s=byId(id); const est=s?.estado_real||'';
      if(!panel){ S.openQr.delete(id); clearTimer(id); syncQrPoll(); continue; }
      panel.style.display='block';
      if(isConn(est)){ paintConn(id); clearTimer(id); continue; }
      await renderQr(id); startTimer(id);
    }
  }

  function paintConn(id){
    const disp=document.getElementById(`qr-display-${id}`);
    const pill=document.getElementById(`qr-pill-${id}`);
    const helper=document.getElementById(`qr-helper-${id}`);
    const timer=document.getElementById(`qr-timer-${id}`);
    const bar=document.getElementById(`qr-bar-${id}`);
    const rb=document.querySelector(`[data-action="refresh-qr"][data-id="${id}"]`);
    if(pill){pill.className='qr-pill ready';pill.textContent='Sesion conectada';}
    if(timer) timer.textContent='No se necesita QR';
    if(helper) helper.textContent='Este dispositivo ya esta vinculado y listo para enviar mensajes.';
    if(bar) bar.style.width='100%';
    if(rb){rb.disabled=true;rb.textContent='Sesion activa';}
    if(disp) disp.innerHTML='<div class="qr-aviso">Esta sesion ya se encuentra conectada.<br><small>No es necesario generar un QR nuevo.</small></div>';
  }

  function syncUI(){
    const has=S.sesiones.length>0;
    const openBtn=document.getElementById('btn-open-modal');
    const sub=document.getElementById('sec-subtitle');
    const mTitle=document.getElementById('m-title');
    const mSub=document.getElementById('m-sub');
    const saveBtn=document.getElementById('btn-save-m');
    if(openBtn) openBtn.innerHTML=`<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>${has?'Cambiar WhatsApp':'Configurar WhatsApp'}`;
    if(sub) sub.textContent=has?'Esta sede ya tiene una sesion. Puedes reemplazarla si no hay envios pendientes.':'Solo se permite una sesion por sede.';
    if(mTitle) mTitle.textContent=has?'Cambiar WhatsApp':'Configurar WhatsApp';
    if(mSub) mSub.textContent=has?'La sesion actual sera reemplazada. Solo si no hay envios pendientes.':'Registra la unica sesion permitida para esta sede.';
    if(saveBtn) saveBtn.textContent=has?'Cambiar WhatsApp':'Guardar sesion';
  }

  function clearTimer(id){ if(S.timers[id]){ clearInterval(S.timers[id]); delete S.timers[id]; } }
  function byId(id){ return S.sesiones.find(s=>Number(s.id)===Number(id))||null; }
  function isConn(s){ return String(s||'').toLowerCase()==='connected'; }

  function fmtStatus(s){
    const v=String(s||'disconnected').toLowerCase();
    const m={connected:'Conectada',disconnected:'Inactiva',waiting_qr:'Esperando QR',authenticated:'Autenticada',initializing:'Iniciando',reconnecting:'Reconectando',auth_failure:'Error de acceso'};
    return m[v]||(v.charAt(0).toUpperCase()+v.slice(1).replace(/_/g,' '));
  }

  function fmtTime(d){ if(!d) return '--:--'; return new Date(d).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'}); }
  function fmtDate(d){ if(!d) return 'Sin sincronizacion'; return new Date(d).toLocaleDateString('es-PE',{day:'2-digit',month:'short',year:'numeric'}); }
  function fmtDateLong(d){ if(!d) return '-'; return new Date(d).toLocaleString('es-PE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }

  function set(id,v){ const el=document.getElementById(id); if(el) el.textContent=String(v??''); }
  function esc(v){ return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function toast(msg, type='success'){
    const t=document.getElementById('toast');
    if(!t) return;
    t.textContent=msg; t.className=`toast toast-${type} show`;
    setTimeout(()=>t.classList.remove('show'),3500);
  }
});
