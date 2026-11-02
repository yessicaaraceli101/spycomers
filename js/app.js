/* =========================================================
   SPYcomers — lógica de la aplicación
   ========================================================= */
(() => {
  'use strict';

  /* ---------- Utilidades ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const SESSION = 'pagocontrol_session';
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const METODOS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque', 'Otro'];

  let me = null;
  let view = 'dashboard';
  const F = { pagos: 'todos', qp: '', qc: '', qu: '' };
  const isAdmin = () => !!me && me.rol === 'admin';

  /* ---------- Fechas y dinero ---------- */
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hoy = () => iso(new Date());
  const parse = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const daysUntil = s => Math.round((parse(s) - parse(hoy())) / 86400000);
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const addMonths = (s, n) => {
    const d = parse(s), day = d.getDate();
    const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(day, last));
    return iso(t);
  };
  const fmtDate = s => { if (!s) return '—'; const d = parse(s); return `${String(d.getDate()).padStart(2, '0')} ${MESES[d.getMonth()]} ${d.getFullYear()}`; };
  const fmtDateTime = s => s ? new Date(s).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Nunca';
  const money = n => {
    const v = Math.abs(Number(n) || 0);
    const [i, dec] = v.toFixed(2).split('.');
    return `${(Number(n) < 0 ? '-' : '')}${DB.config().moneda} ${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${dec !== '00' ? ',' + dec : ''}`;
  };
  const sum = arr => arr.reduce((s, p) => s + Number(p.monto || 0), 0);
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const byVenc = (a, b) => a.vencimiento.localeCompare(b.vencimiento);
  const avatar = (u, extra = '') => `<div class="avatar ${u.rol === 'admin' ? 'orange' : ''} ${extra}">${u.foto ? `<img src="${u.foto}" alt="">` : esc(initials(u.nombre))}</div>`;
  const rolBadge = u => `<span class="badge solid b-${u.rol === 'admin' ? 'admin' : 'usuario'}">${u.rol === 'admin' ? 'Administrador' : 'Usuario'}</span>`;
  const estadoBadge = u => u.activo ? '<span class="badge solid b-activo">Activo</span>' : '<span class="badge solid b-inactivo">Inactivo</span>';

  function estado(p) {
    if (p.estado === 'pagado') return { k: 'pagado', t: 'Pagado', d: p.fechaPago ? `Pagado el ${fmtDate(p.fechaPago)}` : 'Pagado' };
    const n = daysUntil(p.vencimiento);
    if (n < 0) return { k: 'vencido', t: 'Vencido', d: `Venció hace ${plural(-n, 'día', 'días')}` };
    if (n === 0) return { k: 'hoy', t: 'Vence hoy', d: 'Vence hoy' };
    if (n <= DB.config().diasAviso) return { k: 'proximo', t: 'Por vencer', d: `Vence en ${plural(n, 'día', 'días')}` };
    return { k: 'pendiente', t: 'Pendiente', d: `Vence en ${plural(n, 'día', 'días')}` };
  }
  const badge = e => `<span class="badge b-${e.k}">${e.t}</span>`;

  function alertas() {
    const r = { vencidos: [], hoy: [], proximos: [] };
    DB.list('pagos').filter(p => p.estado !== 'pagado').forEach(p => {
      const e = estado(p).k;
      if (e === 'vencido') r.vencidos.push(p);
      else if (e === 'hoy') r.hoy.push(p);
      else if (e === 'proximo') r.proximos.push(p);
    });
    Object.values(r).forEach(a => a.sort(byVenc));
    return r;
  }
  const alertCount = () => { const a = alertas(); return a.vencidos.length + a.hoy.length + a.proximos.length; };
  function telWa(tel) {
    let d = String(tel || '').replace(/\D/g, '');
    const cp = String(DB.config().codigoPais || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('00')) return d.slice(2);
    if (cp && d.startsWith(cp) && d.length > 10) return d;
    if (d.startsWith('0')) d = d.slice(1);
    return cp + d;
  }
  const IVA_TXT = { '10': 'IVA 10%', '5': 'IVA 5%', exenta: 'Exenta' };
  const clienteNombre = id => (DB.get('clientes', id) || {}).nombre || 'Cliente eliminado';

  /* ---------- Modales ---------- */
  const modalStack = [];
  function modal({ title, body, footer = '', size = '', onMount, onClose }) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head"><h3>${title}</h3>
          <button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>`;
    $('#modal-root').appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('show'));
    let closed = false;
    const close = () => {
      if (closed) return; closed = true;
      wrap.classList.remove('show');
      document.removeEventListener('keydown', onKey);
      modalStack.splice(modalStack.indexOf(api), 1);
      setTimeout(() => wrap.remove(), 200);
      onClose && onClose();
    };
    const onKey = e => { if (e.key === 'Escape' && modalStack[modalStack.length - 1] === api) close(); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
    wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
    const api = { el: wrap, close };
    modalStack.push(api);
    onMount && onMount(wrap, close);
    const first = wrap.querySelector('input:not([readonly]),select,textarea');
    setTimeout(() => (first || wrap.querySelector('[data-ok]') || wrap.querySelector('button')).focus(), 60);
    return api;
  }
  const closeTopModal = () => { const m = modalStack[modalStack.length - 1]; m && m.close(); };

  function confirmar({ title = 'Confirmar acción', message, ok = 'Confirmar', okClass = 'btn-primary', tipo = '', iconName = 'info' }) {
    return new Promise(res => {
      let answered = false;
      modal({
        title, size: 'sm',
        body: `<div class="confirm">${icon(iconName, 44, tipo)}<p>${message}</p></div>`,
        footer: `<button type="button" class="btn btn-danger" data-close>${icon('x', 18)} Cancelar</button>
                 <button type="button" class="btn ${okClass}" data-ok>${icon('check', 18)} ${ok}</button>`,
        onMount: (el, close) => { el.querySelector('[data-ok]').onclick = () => { answered = true; res(true); close(); }; },
        onClose: () => { if (!answered) res(false); }
      });
    });
  }

  function toast(msg, tipo = 'ok') {
    const ic = { ok: 'checkCircle', warn: 'alert', error: 'alert', info: 'info' }[tipo];
    const t = document.createElement('div');
    t.className = `toast ${tipo}`;
    t.innerHTML = `${icon(ic, 20)}<span>${esc(msg)}</span>`;
    $('#toast-root').appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3400);
  }

  const field = (label, input, cls = '', hint = '') => `<label class="field ${cls}"><span>${label}</span>${input}${hint ? `<small>${hint}</small>` : ''}</label>`;
  const req = t => `${t} <b>*</b>`;
  const formData = form => Object.fromEntries(new FormData(form).entries());
  const footerSave = (formId, text = 'Guardar') =>
    `<button type="button" class="btn btn-danger" data-close>${icon('x', 18)} Cancelar</button>
     <button type="submit" form="${formId}" class="btn btn-primary">${icon('check', 18)} ${text}</button>`;
  const emptyState = (ic, title, text, action = '') => `<div class="empty">${icon(ic, 44)}<h4>${title}</h4><p>${text}</p>${action}</div>`;

  /* ---------- Navegación ---------- */
  const NAV = [
    { id: 'dashboard', t: 'Inicio', i: 'dashboard', sub: 'Resumen general de cobros' },
    { id: 'clientes', t: 'Clientes', i: 'users', sub: 'Tu cartera de clientes' },
    { id: 'pagos', t: 'Pagos', i: 'wallet', sub: 'Pagos pendientes y cobrados' },
    { id: 'comprobantes', t: 'Comprobantes', i: 'file', sub: 'Facturas y tickets emitidos' },
    { id: 'recordatorios', t: 'Recordatorios', i: 'bell', sub: 'Vencimientos que requieren atención' },
    { id: 'usuarios', t: 'Usuarios', i: 'shield', sub: 'Administradores y usuarios del sistema', admin: true },
    { id: 'config', t: 'Configuración', i: 'sliders', sub: 'Empresa, avisos y respaldos', admin: true },
    { id: 'perfil', t: 'Mi perfil', i: 'user', sub: 'Tus datos y contraseña' }
  ];

  function renderChrome() {
    const count = alertCount();
    $('#brand-name').textContent = DB.config().empresa || 'SPYcomers';
    $('#nav').innerHTML = NAV.filter(n => !n.admin || isAdmin()).map(n => `
      <button class="nav-item ${view === n.id ? 'active' : ''}" data-nav="${n.id}">
        ${icon(n.i)}<span>${n.t}</span>
        ${n.id === 'recordatorios' && count ? `<em class="nav-count">${count}</em>` : ''}
      </button>`).join('');
    $('#me-card').innerHTML = `${avatar(me)}<div><strong>${esc(me.nombre)}</strong><small>${me.rol === 'admin' ? 'Administrador' : 'Usuario'} · Ver perfil</small></div>`;
    $('#btn-bell').innerHTML = icon('bell', 22) + (count ? `<span class="dot">${count > 99 ? '99+' : count}</span>` : '');
    const n = NAV.find(x => x.id === view);
    $('#page-title').textContent = n.t;
    $('#page-sub').textContent = n.sub;
  }

  function go(v) {
    const n = NAV.find(x => x.id === v);
    if (!n || (n.admin && !isAdmin())) v = 'dashboard';
    view = v;
    render();
    $('#app').classList.remove('nav-open');
    window.scrollTo({ top: 0 });
  }

  function render() {
    renderChrome();
    $('#content').innerHTML = VIEWS[view]();
  }

  /* =========================================================
     VISTAS
     ========================================================= */
  const VIEWS = {};

  /* ---------- Inicio ---------- */
  VIEWS.dashboard = () => {
    const pagos = DB.list('pagos');
    const pend = pagos.filter(p => p.estado !== 'pagado');
    const a = alertas();
    const mes = hoy().slice(0, 7);
    const cobradoMes = pagos.filter(p => p.estado === 'pagado' && (p.fechaPago || '').startsWith(mes));
    const dias = DB.config().diasAviso;
    const h = new Date().getHours();
    const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    const f0 = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const fecha = f0.charAt(0).toUpperCase() + f0.slice(1);
    const sinClientes = !DB.list('clientes').length;

    const stat = (ic, color, label, value, sub) => `
      <div class="card stat"><div class="stat-top"><span>${label}</span>${icon(ic, 22, color)}</div>
      <div class="stat-value">${value}</div><small>${sub}</small></div>`;

    const proximos = pend.slice().sort(byVenc).slice(0, 6);
    const ultimos = pagos.filter(p => p.estado === 'pagado').sort((x, y) => (y.fechaPago || '').localeCompare(x.fechaPago || '')).slice(0, 5);

    return `
      <section class="card hero">
        <div><h2>${saludo}, ${esc(me.nombre.split(' ')[0])}</h2>
          <p class="muted">${fecha}</p></div>
        <div class="hero-actions">
          <button class="btn btn-ghost" data-act="new-cliente">${icon('userPlus', 18)} Nuevo cliente</button>
          <button class="btn btn-orange" data-act="new-pago">${icon('plus', 18)} Registrar pago pendiente</button>
        </div>
      </section>

      ${sinClientes ? `<section class="card">${emptyState('sparkles', 'Empieza registrando tu primer cliente',
        'Agrega clientes, luego sus pagos pendientes con fecha de vencimiento y el sistema te avisará a tiempo.',
        `<div class="hero-actions" style="justify-content:center"><button class="btn btn-primary" data-act="new-cliente">${icon('userPlus', 18)} Agregar cliente</button>
        ${isAdmin() ? `<button class="btn btn-soft" data-act="demo">${icon('database', 18)} Cargar datos de ejemplo</button>` : ''}</div>`)}</section>` : ''}

      <section class="stats">
        ${stat('wallet', 'c-sky', 'Por cobrar', money(sum(pend)), plural(pend.length, 'pago pendiente', 'pagos pendientes'))}
        ${stat('alert', 'c-red', 'Vencidos', money(sum(a.vencidos)), plural(a.vencidos.length, 'pago vencido', 'pagos vencidos'))}
        ${stat('clock', 'c-orange', 'Vencen pronto', money(sum([...a.hoy, ...a.proximos])), `Hoy y próximos ${dias} días`)}
        ${stat('trending', 'c-green', 'Cobrado este mes', money(sum(cobradoMes)), plural(cobradoMes.length, 'cobro registrado', 'cobros registrados'))}
      </section>

      <section class="grid-2">
        <div class="card">
          <div class="card-head"><h3>Próximos vencimientos</h3><button class="link" data-nav="recordatorios">Ver recordatorios</button></div>
          ${proximos.length ? `<div class="due-list">${proximos.map(p => dueItem(p)).join('')}</div>`
            : emptyState('checkCircle', 'Todo al día', 'No hay pagos pendientes por ahora.')}
        </div>
        <div class="card">
          <div class="card-head"><h3>Últimos cobros</h3><button class="link" data-nav="pagos" data-filter="pagados">Ver pagados</button></div>
          ${ultimos.length ? `<div class="due-list">${ultimos.map(p => dueItem(p, false)).join('')}</div>`
            : emptyState('wallet', 'Aún sin cobros', 'Cuando marques un pago como cobrado aparecerá aquí.')}
        </div>
      </section>`;
  };

  function dueItem(p, withActions = true, extra = '') {
    const e = estado(p);
    const d = parse(p.estado === 'pagado' && p.fechaPago ? p.fechaPago : p.vencimiento);
    return `
      <div class="due-item">
        <div class="due-date ${e.k}"><strong>${String(d.getDate()).padStart(2, '0')}</strong><span>${MESES[d.getMonth()]}</span></div>
        <div class="due-info"><strong>${esc(clienteNombre(p.clienteId))}</strong><small>${esc(p.concepto)} · ${e.d}</small></div>
        <div class="due-right"><strong>${money(p.monto)}</strong>${badge(e)}</div>
        ${withActions && p.estado !== 'pagado' ? `<div class="due-actions">${extra}
          <button class="icon-btn i-green" data-act="cobrar" data-id="${p.id}" title="Registrar cobro">${icon('checkCircle')}</button></div>` : ''}
      </div>`;
  }

  /* ---------- Clientes ---------- */
  VIEWS.clientes = () => `
    <div class="toolbar">
      <div class="search">${icon('search', 18)}<input id="q-clientes" placeholder="Buscar por nombre, documento, teléfono o correo" value="${esc(F.qc)}"></div>
      <button class="btn btn-orange" data-act="new-cliente">${icon('plus', 18)} Nuevo cliente</button>
    </div>
    <div class="card table-card" id="list-clientes">${listClientes()}</div>`;

  function listClientes() {
    const q = norm(F.qc);
    const pagos = DB.list('pagos');
    const rows = DB.list('clientes')
      .filter(c => !q || norm([c.nombre, c.documento, c.telefono, c.email].join(' ')).includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (!rows.length) return q ? emptyState('search', 'Sin resultados', 'Prueba con otro nombre, documento o teléfono.')
      : emptyState('users', 'Aún no hay clientes', 'Registra tu primer cliente para empezar a controlar sus pagos.',
        `<button class="btn btn-primary" data-act="new-cliente">${icon('userPlus', 18)} Agregar cliente</button>`);
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>Cliente</th><th>Contacto</th><th class="r">Saldo pendiente</th><th>Situación</th><th class="r">Acciones</th></tr></thead>
      <tbody>${rows.map(c => {
        const ps = pagos.filter(p => p.clienteId === c.id && p.estado !== 'pagado');
        const vencidos = ps.filter(p => estado(p).k === 'vencido').length;
        const pronto = ps.filter(p => ['hoy', 'proximo'].includes(estado(p).k)).length;
        const sit = vencidos ? badge({ k: 'vencido', t: plural(vencidos, 'vencido', 'vencidos') })
          : pronto ? badge({ k: 'proximo', t: plural(pronto, 'por vencer', 'por vencer') })
          : ps.length ? badge({ k: 'pendiente', t: plural(ps.length, 'pendiente', 'pendientes') })
          : badge({ k: 'pagado', t: 'Al día' });
        return `<tr>
          <td><div class="cell-person"><div class="avatar">${esc(initials(c.nombre))}</div>
            <div class="cell-main"><strong>${esc(c.nombre)}</strong><small>${esc(c.documento || 'Sin documento')}</small></div></div></td>
          <td>${c.telefono ? `<div class="contact-line">${icon('phone', 14)} ${esc(c.telefono)}</div>` : ''}
              ${c.email ? `<div class="contact-line">${icon('mail', 14)} ${esc(c.email)}</div>` : ''}
              ${!c.telefono && !c.email ? '<span class="muted">—</span>' : ''}</td>
          <td class="r amount">${money(sum(ps))}</td>
          <td>${sit}</td>
          <td><div class="actions">
            <button class="icon-btn i-sky" data-act="view-cliente" data-id="${c.id}" title="Ver ficha">${icon('eye')}</button>
            <button class="icon-btn i-orange" data-act="new-pago" data-cliente="${c.id}" title="Nuevo pago">${icon('plus')}</button>
            <button class="icon-btn i-sky" data-act="edit-cliente" data-id="${c.id}" title="Editar">${icon('edit')}</button>
            ${isAdmin() ? `<button class="icon-btn i-red" data-act="del-cliente" data-id="${c.id}" title="Eliminar">${icon('trash')}</button>` : ''}
          </div></td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function formCliente(id) {
    const c = id ? DB.get('clientes', id) : {};
    modal({
      title: id ? 'Editar cliente' : 'Nuevo cliente',
      body: `<form id="f-cliente" class="form-grid" novalidate>
        ${field(req('Nombre o razón social'), `<input name="nombre" required maxlength="120" value="${esc(c.nombre)}" placeholder="Ej. Comercial San José">`, 'full')}
        ${field('Documento / RUC', `<input name="documento" maxlength="40" value="${esc(c.documento)}" placeholder="CI o RUC">`)}
        ${field('Teléfono / WhatsApp', `<input name="telefono" maxlength="40" value="${esc(c.telefono)}" placeholder="Ej. 0981 123 456">`)}
        ${field('Correo electrónico', `<input name="email" type="email" maxlength="120" value="${esc(c.email)}" placeholder="cliente@correo.com">`)}
        ${field('Dirección', `<input name="direccion" maxlength="160" value="${esc(c.direccion)}" placeholder="Calle, número, ciudad">`)}
        ${field('Notas', `<textarea name="notas" maxlength="500" placeholder="Información adicional">${esc(c.notas)}</textarea>`, 'full')}
      </form>`,
      footer: footerSave('f-cliente', id ? 'Guardar cambios' : 'Guardar cliente'),
      onMount: (el, close) => el.querySelector('form').addEventListener('submit', e => {
        e.preventDefault();
        const v = formData(e.target);
        v.nombre = v.nombre.trim();
        if (!v.nombre) return toast('Escribe el nombre del cliente.', 'warn');
        if (v.email && !/^\S+@\S+\.\S+$/.test(v.email)) return toast('El correo no tiene un formato válido.', 'warn');
        DB.put('clientes', id ? { ...v, id } : v);
        close(); render();
        toast(id ? 'Cliente actualizado' : 'Cliente guardado');
      })
    });
  }

  function verCliente(id) {
    const c = DB.get('clientes', id);
    if (!c) return;
    const ps = DB.list('pagos').filter(p => p.clienteId === id);
    const pend = ps.filter(p => p.estado !== 'pagado').sort(byVenc);
    const pag = ps.filter(p => p.estado === 'pagado').sort((a, b) => (b.fechaPago || '').localeCompare(a.fechaPago || ''));
    const det = (ic, label, val) => `<div class="detail">${icon(ic, 18)}<div><small>${label}</small><span>${esc(val || '—')}</span></div></div>`;
    modal({
      title: esc(c.nombre), size: 'lg',
      body: `
        <div class="details">
          ${det('idCard', 'Documento / RUC', c.documento)}${det('phone', 'Teléfono', c.telefono)}
          ${det('mail', 'Correo', c.email)}${det('mapPin', 'Dirección', c.direccion)}
          ${c.notas ? `<div style="grid-column:1/-1">${det('file', 'Notas', c.notas)}</div>` : ''}
        </div>
        <div class="summary-row" style="margin-top:20px">
          <div class="summary-box orange"><small>Saldo pendiente</small><strong>${money(sum(pend))}</strong></div>
          <div class="summary-box"><small>Total cobrado</small><strong>${money(sum(pag))}</strong></div>
          <div class="summary-box"><small>Pagos registrados</small><strong>${ps.length}</strong></div>
        </div>
        <h4 class="section-title">Pendientes</h4>
        ${pend.length ? `<div class="due-list">${pend.map(p => dueItem(p)).join('')}</div>` : '<p class="muted">Sin pagos pendientes.</p>'}
        <h4 class="section-title">Historial de cobros</h4>
        ${pag.length ? `<div class="due-list">${pag.map(p => dueItem(p, false)).join('')}</div>` : '<p class="muted">Aún no hay cobros registrados.</p>'}`,
      footer: `<button type="button" class="btn btn-danger" data-close>${icon('x', 18)} Cerrar</button>
        <button type="button" class="btn btn-soft" data-act="edit-cliente" data-id="${id}" data-swap>${icon('edit', 18)} Editar cliente</button>
        <button type="button" class="btn btn-orange" data-act="new-pago" data-cliente="${id}" data-swap>${icon('plus', 18)} Nuevo pago</button>`
    });
  }

  async function delCliente(id) {
    const c = DB.get('clientes', id);
    const n = DB.list('pagos').filter(p => p.clienteId === id).length;
    const ok = await confirmar({
      title: 'Eliminar cliente', iconName: 'trash', tipo: 'danger', ok: 'Sí, eliminar', okClass: 'btn-orange',
      message: `Se eliminará a <strong>${esc(c.nombre)}</strong>${n ? ` y sus <strong>${plural(n, 'pago', 'pagos')}</strong>` : ''}. Esta acción no se puede deshacer.`
    });
    if (!ok) return;
    DB.remove('clientes', id); render(); toast('Cliente eliminado');
  }

  /* ---------- Pagos ---------- */
  const FILTROS = [
    ['todos', 'Todos'], ['pendientes', 'Pendientes'], ['vencidos', 'Vencidos'], ['proximos', 'Por vencer'], ['pagados', 'Pagados']
  ];
  function filtrarPagos(f) {
    const all = DB.list('pagos');
    return {
      todos: all,
      pendientes: all.filter(p => p.estado !== 'pagado'),
      vencidos: all.filter(p => estado(p).k === 'vencido'),
      proximos: all.filter(p => ['hoy', 'proximo'].includes(estado(p).k)),
      pagados: all.filter(p => p.estado === 'pagado')
    }[f] || all;
  }

  VIEWS.pagos = () => `
    <div class="toolbar">
      <div class="search">${icon('search', 18)}<input id="q-pagos" placeholder="Buscar por cliente o concepto" value="${esc(F.qp)}"></div>
      <button class="btn btn-orange" data-act="new-pago">${icon('plus', 18)} Nuevo pago</button>
    </div>
    <div class="chips" id="chips-pagos">${chipsPagos()}</div>
    <div class="card table-card" id="list-pagos">${listPagos()}</div>`;

  const chipsPagos = () => FILTROS.map(([k, t]) =>
    `<button class="chip ${F.pagos === k ? 'active' : ''}" data-act="filter" data-f="${k}">${t} <em>${filtrarPagos(k).length}</em></button>`).join('');

  function listPagos() {
    const q = norm(F.qp);
    const rows = filtrarPagos(F.pagos)
      .filter(p => !q || norm(clienteNombre(p.clienteId) + ' ' + p.concepto).includes(q))
      .sort((a, b) => (a.estado === 'pagado') - (b.estado === 'pagado') ||
        (a.estado === 'pagado' ? (b.fechaPago || '').localeCompare(a.fechaPago || '') : byVenc(a, b)));
    if (!rows.length) return q || F.pagos !== 'todos'
      ? emptyState('search', 'No hay pagos en esta vista', 'Cambia el filtro o la búsqueda para ver otros pagos.')
      : emptyState('wallet', 'Aún no hay pagos', 'Registra un pago pendiente con su fecha de vencimiento y recibirás avisos antes de que venza.',
        `<button class="btn btn-orange" data-act="new-pago">${icon('plus', 18)} Registrar pago</button>`);
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>Cliente</th><th>Concepto</th><th class="r">Monto</th><th>Vencimiento</th><th>Estado</th><th class="r">Acciones</th></tr></thead>
      <tbody>${rows.map(p => {
        const e = estado(p);
        return `<tr>
          <td><div class="cell-main"><strong>${esc(clienteNombre(p.clienteId))}</strong></div></td>
          <td><div class="cell-main"><strong style="font-weight:600">${esc(p.concepto)}</strong>${p.metodo && p.estado === 'pagado' ? `<small>${esc(p.metodo)}${p.referencia ? ' · ' + esc(p.referencia) : ''}</small>` : ''}</div></td>
          <td class="r amount">${money(p.monto)}</td>
          <td><div class="cell-main"><strong style="font-weight:600">${fmtDate(p.vencimiento)}</strong><small>${e.d}</small></div></td>
          <td>${badge(e)}</td>
          <td><div class="actions">
            ${p.estado !== 'pagado'
              ? `<button class="icon-btn i-green" data-act="cobrar" data-id="${p.id}" title="Registrar cobro">${icon('checkCircle')}</button>`
              : isAdmin() ? `<button class="icon-btn i-orange" data-act="revertir" data-id="${p.id}" title="Volver a pendiente">${icon('undo')}</button>` : ''}
            <button class="icon-btn i-orange" data-act="doc" data-id="${p.id}" title="Factura o ticket">${icon('file')}</button>
            <button class="icon-btn i-sky" data-act="edit-pago" data-id="${p.id}" title="Editar">${icon('edit')}</button>
            ${isAdmin() ? `<button class="icon-btn i-red" data-act="del-pago" data-id="${p.id}" title="Eliminar">${icon('trash')}</button>` : ''}
          </div></td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function formPago(id, clienteId) {
    const clientes = DB.list('clientes').sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (!clientes.length) {
      toast('Primero registra un cliente.', 'warn');
      return formCliente();
    }
    const p = id ? DB.get('pagos', id) : { clienteId: clienteId || '', emision: hoy(), vencimiento: addDays(hoy(), 30) };
    modal({
      title: id ? 'Editar pago' : 'Registrar pago pendiente',
      body: `<form id="f-pago" class="form-grid" novalidate>
        ${field(req('Cliente'), `<select name="clienteId" required><option value="">Selecciona un cliente</option>
          ${clientes.map(c => `<option value="${c.id}" ${c.id === p.clienteId ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>`, 'full')}
        ${field(req('Concepto'), `<input name="concepto" required maxlength="140" value="${esc(p.concepto)}" placeholder="Ej. Factura 001-245, cuota de préstamo">`, 'full')}
        ${field(req('Monto'), `<input name="monto" type="number" min="0" step="any" inputmode="decimal" required value="${esc(p.monto)}" placeholder="0">`)}
        ${field('Tipo de IVA', `<select name="iva">${Object.entries(IVA_TXT).map(([k, t]) => `<option value="${k}" ${(p.iva || DB.config().ivaDefault) === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`, '', 'El monto ya incluye el IVA.')}
        ${field('Fecha de emisión', `<input name="emision" type="date" value="${esc(p.emision)}">`)}
        ${field(req('Fecha de vencimiento'), `<input name="vencimiento" type="date" required value="${esc(p.vencimiento)}">`)}
        ${!id ? field('Cantidad de cuotas', `<input name="cuotas" type="number" min="1" max="60" value="1">`, '', 'Si son varias, se crea una por mes desde el vencimiento.')
          : field('Estado', `<input readonly value="${p.estado === 'pagado' ? 'Pagado' : 'Pendiente'}">`)}
        ${field('Nota de remisión N°', `<input name="remision" maxlength="30" value="${esc(p.remision)}" placeholder="Opcional">`)}
        ${field('Notas', `<textarea name="notas" maxlength="500" placeholder="Detalles del pago">${esc(p.notas)}</textarea>`, 'full')}
      </form>`,
      footer: footerSave('f-pago', id ? 'Guardar cambios' : 'Guardar pago'),
      onMount: (el, close) => el.querySelector('form').addEventListener('submit', e => {
        e.preventDefault();
        const v = formData(e.target);
        const monto = Number(v.monto);
        if (!v.clienteId) return toast('Selecciona un cliente.', 'warn');
        if (!v.concepto.trim()) return toast('Escribe el concepto del pago.', 'warn');
        if (!(monto > 0)) return toast('Ingresa un monto mayor a cero.', 'warn');
        if (!v.vencimiento) return toast('Indica la fecha de vencimiento.', 'warn');
        const base = { clienteId: v.clienteId, concepto: v.concepto.trim(), monto, iva: v.iva || '10', emision: v.emision, vencimiento: v.vencimiento, notas: v.notas, remision: (v.remision || '').trim() };
        if (id) {
          DB.put('pagos', { ...base, id });
          toast('Pago actualizado');
        } else {
          const n = Math.min(60, Math.max(1, parseInt(v.cuotas, 10) || 1));
          for (let i = 0; i < n; i++) {
            DB.put('pagos', { ...base, concepto: n > 1 ? `${base.concepto} — Cuota ${i + 1}/${n}` : base.concepto,
              vencimiento: addMonths(base.vencimiento, i), estado: 'pendiente', fechaPago: '', metodo: '', referencia: '', registradoPor: me.nombre });
          }
          toast(n > 1 ? `${n} cuotas registradas` : 'Pago registrado');
        }
        close(); render();
      })
    });
  }

  function cobrar(id) {
    const p = DB.get('pagos', id);
    if (!p) return;
    modal({
      title: 'Registrar cobro',
      body: `
        <div class="summary-row" style="margin-bottom:18px">
          <div class="summary-box"><small>Cliente</small><strong style="font-size:15px">${esc(clienteNombre(p.clienteId))}</strong></div>
          <div class="summary-box orange"><small>${esc(p.concepto)}</small><strong>${money(p.monto)}</strong></div>
        </div>
        <form id="f-cobro" class="form-grid" novalidate>
          ${field(req('Fecha de pago'), `<input name="fechaPago" type="date" required value="${hoy()}">`)}
          ${field('Método de pago', `<select name="metodo">${METODOS.map(m => `<option>${m}</option>`).join('')}</select>`)}
          ${field('Referencia', `<input name="referencia" maxlength="80" placeholder="Ej. N° de transferencia">`)}
          ${field('Emitir comprobante', `<select name="emitir">
            <option value="">No emitir ahora</option>
            <option value="ticket" ${p.docs && p.docs.ticket ? 'disabled' : ''}>Ticket</option>
            <option value="factura" ${p.docs && p.docs.factura ? 'disabled' : ''}>Factura</option></select>`)}
        </form>`,
      footer: footerSave('f-cobro', 'Confirmar cobro'),
      onMount: (el, close) => el.querySelector('form').addEventListener('submit', e => {
        e.preventDefault();
        const v = formData(e.target);
        if (!v.fechaPago) return toast('Indica la fecha de pago.', 'warn');
        DB.put('pagos', { id, estado: 'pagado', fechaPago: v.fechaPago, metodo: v.metodo, referencia: v.referencia.trim(), cobradoPor: me.nombre });
        close();
        if (modalStack.length) closeTopModal();
        render();
        toast(`Cobro de ${money(p.monto)} registrado`);
        if (v.emitir) { emitir(id, v.emitir); setTimeout(() => comprobante(id, v.emitir), 250); }
      })
    });
  }

  async function revertir(id) {
    const p = DB.get('pagos', id);
    const ok = await confirmar({
      title: 'Volver a pendiente', iconName: 'undo', tipo: 'warn', ok: 'Sí, revertir', okClass: 'btn-orange',
      message: `El pago <strong>${esc(p.concepto)}</strong> volverá a figurar como pendiente y se borrarán los datos del cobro.`
    });
    if (!ok) return;
    DB.put('pagos', { id, estado: 'pendiente', fechaPago: '', metodo: '', referencia: '' });
    render(); toast('El pago volvió a pendiente', 'info');
  }

  async function delPago(id) {
    const p = DB.get('pagos', id);
    const ok = await confirmar({
      title: 'Eliminar pago', iconName: 'trash', tipo: 'danger', ok: 'Sí, eliminar', okClass: 'btn-orange',
      message: `Se eliminará <strong>${esc(p.concepto)}</strong> por <strong>${money(p.monto)}</strong> de ${esc(clienteNombre(p.clienteId))}. Esta acción no se puede deshacer.`
    });
    if (!ok) return;
    DB.remove('pagos', id); render(); toast('Pago eliminado');
  }

  /* ---------- Comprobantes (factura / ticket) ---------- */
  const DOC_TXT = { factura: 'Factura', ticket: 'Ticket' };
  const docBadge = t => `<span class="badge b-${t}">${DOC_TXT[t]}</span>`;

  function siguienteNumero(tipo) {
    const cfg = DB.config();
    const n = Number(tipo === 'factura' ? cfg.sigFactura : cfg.sigTicket) || 1;
    return { n, numero: `${cfg.establecimiento || '001'}-${cfg.punto || '001'}-${String(n).padStart(7, '0')}` };
  }

  function emitir(id, tipo) {
    const p = DB.get('pagos', id);
    if (!p || (p.docs && p.docs[tipo])) return;
    const { n, numero } = siguienteNumero(tipo);
    DB.setConfig({ [tipo === 'factura' ? 'sigFactura' : 'sigTicket']: n + 1 });
    DB.put('pagos', { id, docs: { ...(p.docs || {}), [tipo]: {
      numero, fecha: hoy(), emitidoPor: me.nombre, condicion: p.estado === 'pagado' ? 'Contado' : 'Crédito' } } });
    toast(`${DOC_TXT[tipo]} N° ${numero} ${tipo === 'factura' ? 'emitida' : 'emitido'}`);
  }

  function crearPdf(id, tipo) {
    if (!Comprobante.disponible()) { toast('No se pudo cargar el generador de PDF. Revisa que la carpeta js/vendor esté completa.', 'error'); return null; }
    const p = DB.get('pagos', id), c = DB.get('clientes', p.clienteId) || { nombre: 'Cliente eliminado' }, d = p.docs[tipo];
    const doc = Comprobante.crear(tipo, p, c, d, DB.config(), { money, fmtDate });
    const limpio = String(c.nombre).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
    return { doc, p, c, d, name: `${DOC_TXT[tipo]}-${d.numero}-${limpio}.pdf` };
  }

  function mensajeDoc(p, c, d, tipo) {
    const base = `Hola ${c.nombre || ''}, le enviamos su ${tipo === 'factura' ? 'factura' : 'ticket'} N° ${d.numero} por ${money(p.monto)}.`;
    const extra = p.estado === 'pagado' ? ' ¡Muchas gracias por su pago!' : ` Fecha de vencimiento: ${fmtDate(p.vencimiento)}.`;
    return `${base}${extra} — ${DB.config().empresa}`;
  }

  const puedeCompartir = () => {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] })); }
    catch (e) { return false; }
  };

  async function enviarDoc(id, tipo, modo = 'wa') {
    const r = crearPdf(id, tipo);
    if (!r) return;
    const msg = mensajeDoc(r.p, r.c, r.d, tipo);
    if (modo === 'share') {
      const file = new File([r.doc.output('blob')], r.name, { type: 'application/pdf' });
      try { await navigator.share({ files: [file], title: r.name, text: msg }); }
      catch (e) { if (e.name !== 'AbortError') toast('No se pudo compartir desde este navegador. Usa el botón WhatsApp.', 'warn'); }
      return;
    }
    r.doc.save(r.name);
    const tel = telWa(r.c.telefono);
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    toast(tel ? 'PDF descargado. En el chat de WhatsApp adjúntalo con el clip › Documento.'
      : 'PDF descargado. El cliente no tiene teléfono: elige el contacto en WhatsApp y adjunta el PDF.', 'info');
  }

  function descargarDoc(id, tipo) { const r = crearPdf(id, tipo); if (r) { r.doc.save(r.name); toast('PDF descargado'); } }
  function imprimirDoc(id, tipo) {
    const r = crearPdf(id, tipo);
    if (!r) return;
    r.doc.autoPrint();
    const w = window.open(r.doc.output('bloburl'), '_blank');
    if (!w) toast('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes.', 'warn');
  }

  function comprobante(id, tipo = 'factura') {
    const p0 = DB.get('pagos', id);
    if (!p0) return;
    if (!p0.docs?.factura && p0.docs?.ticket && tipo === 'factura' && arguments.length < 2) tipo = 'ticket';
    let actual = tipo, url = null;
    modal({
      title: 'Factura y ticket', size: 'xl',
      body: '<div class="doc-tabs" id="doc-tabs"></div><div id="doc-area"></div>',
      footer: '<span id="doc-foot" style="display:contents"></span>',
      onClose: () => url && URL.revokeObjectURL(url),
      onMount: (el, close) => {
        const paint = () => {
          const p = DB.get('pagos', id);
          const c = DB.get('clientes', p.clienteId) || {};
          const d = p.docs && p.docs[actual];
          el.querySelector('#doc-tabs').innerHTML = ['factura', 'ticket'].map(t =>
            `<button class="chip ${actual === t ? 'active' : ''}" data-tab="${t}">${icon(t === 'factura' ? 'file' : 'ticket', 16)} ${t === 'factura' ? 'Factura A4' : 'Ticket 80 mm'}${p.docs && p.docs[t] ? ` <em>${p.docs[t].numero}</em>` : ''}</button>`).join('');
          const foot = el.querySelector('#doc-foot');
          const area = el.querySelector('#doc-area');
          if (url) { URL.revokeObjectURL(url); url = null; }
          if (!d) {
            const cfg = DB.config();
            const faltan = actual === 'factura' && !cfg.ruc;
            area.innerHTML = emptyState(actual === 'factura' ? 'file' : 'ticket', `Este pago aún no tiene ${actual === 'factura' ? 'factura' : 'ticket'}`,
              `${esc(c.nombre || '')} · ${esc(p.concepto)} · <strong>${money(p.monto)}</strong><br>Se le asignará el número <strong>${siguienteNumero(actual).numero}</strong>.` +
              (faltan ? `<br><br><span class="c-orange">Faltan los datos fiscales de la empresa (RUC, timbrado). ${isAdmin() ? 'Complétalos en Configuración.' : 'Pide a un administrador que los complete.'}</span>` : ''));
            foot.innerHTML = `<button type="button" class="btn btn-danger" data-close>${icon('x', 18)} Cerrar</button>
              ${faltan && isAdmin() ? `<button type="button" class="btn btn-soft" data-nav="config">${icon('sliders', 18)} Ir a Configuración</button>` : ''}
              <button type="button" class="btn btn-orange" data-emit>${icon('check', 18)} Emitir ${actual === 'factura' ? 'factura' : 'ticket'}</button>`;
            foot.querySelector('[data-emit]').onclick = async () => {
              const ok = await confirmar({ title: `Emitir ${actual === 'factura' ? 'factura' : 'ticket'}`, iconName: actual === 'factura' ? 'file' : 'ticket', tipo: 'warn',
                ok: 'Sí, emitir', okClass: 'btn-orange',
                message: `Se emitirá con el N° <strong>${siguienteNumero(actual).numero}</strong> a nombre de <strong>${esc(c.nombre || '')}</strong> por <strong>${money(p.monto)}</strong>.` });
              if (!ok) return;
              emitir(id, actual); paint(); render();
            };
            return;
          }
          const r = crearPdf(id, actual);
          if (!r) return;
          url = URL.createObjectURL(r.doc.output('blob'));
          area.innerHTML = `<div class="doc-meta">${docBadge(actual)} <strong>N° ${esc(d.numero)}</strong> · ${fmtDate(d.fecha)} · ${esc(d.condicion)} ${badge(estado(p))}</div>
            <iframe class="doc-preview" src="${url}#toolbar=0&navpanes=0&view=FitH" title="Vista previa"></iframe>`;
          foot.innerHTML = `<button type="button" class="btn btn-danger" data-close>${icon('x', 18)} Cerrar</button>
            <button type="button" class="btn btn-soft" data-d="print">${icon('printer', 18)} Imprimir</button>
            <button type="button" class="btn btn-primary" data-d="pdf">${icon('download', 18)} Descargar PDF</button>
            ${puedeCompartir() ? `<button type="button" class="btn btn-soft" data-d="share">${icon('share', 18)} Compartir</button>` : ''}
            <button type="button" class="btn btn-green" data-d="wa">${icon('message', 18)} Enviar por WhatsApp</button>`;
        };
        el.addEventListener('click', e => {
          const t = e.target.closest('[data-tab]');
          if (t) { actual = t.dataset.tab; return paint(); }
          const b = e.target.closest('[data-d]');
          if (!b) return;
          ({ print: () => imprimirDoc(id, actual), pdf: () => descargarDoc(id, actual), share: () => enviarDoc(id, actual, 'share'), wa: () => enviarDoc(id, actual, 'wa') })[b.dataset.d]();
        });
        paint();
      }
    });
  }

  const F2 = { qd: '', td: 'todos' };
  VIEWS.comprobantes = () => `
    <div class="toolbar">
      <div class="search">${icon('search', 18)}<input id="q-docs" placeholder="Buscar por número o cliente" value="${esc(F2.qd)}"></div>
      <button class="btn btn-orange" data-nav="pagos" data-filter="todos">${icon('plus', 18)} Emitir desde Pagos</button>
    </div>
    <div class="chips" id="chips-docs">${chipsDocs()}</div>
    <div class="card table-card" id="list-docs">${listDocs()}</div>`;

  function allDocs() {
    return DB.list('pagos').flatMap(p => Object.entries(p.docs || {}).map(([tipo, d]) => ({ tipo, d, p })))
      .sort((a, b) => b.d.fecha.localeCompare(a.d.fecha) || b.d.numero.localeCompare(a.d.numero));
  }
  const chipsDocs = () => [['todos', 'Todos'], ['factura', 'Facturas'], ['ticket', 'Tickets']].map(([k, t]) =>
    `<button class="chip ${F2.td === k ? 'active' : ''}" data-act="filter-docs" data-f="${k}">${t} <em>${allDocs().filter(x => k === 'todos' || x.tipo === k).length}</em></button>`).join('');

  function listDocs() {
    const q = norm(F2.qd);
    const rows = allDocs().filter(x => (F2.td === 'todos' || x.tipo === F2.td) && (!q || norm(x.d.numero + ' ' + clienteNombre(x.p.clienteId)).includes(q)));
    if (!rows.length) return q || F2.td !== 'todos'
      ? emptyState('search', 'Sin resultados', 'Prueba con otro número o nombre de cliente.')
      : emptyState('file', 'Aún no hay comprobantes', 'Emite una factura o un ticket desde la lista de pagos con el botón de documento, o al registrar un cobro.',
        `<button class="btn btn-primary" data-nav="pagos">${icon('wallet', 18)} Ir a Pagos</button>`);
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>Número</th><th>Tipo</th><th>Cliente</th><th>Fecha</th><th class="r">Total</th><th>Pago</th><th class="r">Acciones</th></tr></thead>
      <tbody>${rows.map(({ tipo, d, p }) => `<tr>
        <td><div class="cell-main"><strong>${esc(d.numero)}</strong><small>${esc(d.condicion)}</small></div></td>
        <td>${docBadge(tipo)}</td>
        <td><div class="cell-main"><strong>${esc(clienteNombre(p.clienteId))}</strong><small>${esc(p.concepto)}</small></div></td>
        <td>${fmtDate(d.fecha)}</td>
        <td class="r amount">${money(p.monto)}</td>
        <td>${badge(estado(p))}</td>
        <td><div class="actions">
          <button class="icon-btn i-sky" data-act="doc" data-id="${p.id}" data-tipo="${tipo}" title="Ver">${icon('eye')}</button>
          <button class="icon-btn i-sky" data-act="doc-pdf" data-id="${p.id}" data-tipo="${tipo}" title="Descargar PDF">${icon('download')}</button>
          <button class="icon-btn i-green" data-act="doc-wa" data-id="${p.id}" data-tipo="${tipo}" title="Enviar por WhatsApp">${icon('message')}</button>
        </div></td></tr>`).join('')}</tbody></table></div>`;
  }

  /* ---------- Recordatorios ---------- */
  function mensajeRecordatorio(p) {
    const c = DB.get('clientes', p.clienteId) || {};
    const n = daysUntil(p.vencimiento);
    const cuando = n < 0 ? `venció el ${fmtDate(p.vencimiento)}` : n === 0 ? 'vence hoy' : `vence el ${fmtDate(p.vencimiento)}`;
    return `Hola ${c.nombre || ''}, le recordamos que el pago de "${p.concepto}" por ${money(p.monto)} ${cuando}. Muchas gracias. — ${DB.config().empresa}`;
  }

  VIEWS.recordatorios = () => {
    const a = alertas();
    const dias = DB.config().diasAviso;
    const notifOk = 'Notification' in window && Notification.permission === 'granted';
    const extra = p => {
      const c = DB.get('clientes', p.clienteId) || {};
      const tel = telWa(c.telefono);
      const msg = encodeURIComponent(mensajeRecordatorio(p));
      return `${tel ? `<a class="icon-btn i-green" target="_blank" rel="noopener" href="https://wa.me/${tel}?text=${msg}" title="Enviar recordatorio por WhatsApp">${icon('message')}</a>` : ''}
              ${c.email ? `<a class="icon-btn i-sky" href="mailto:${esc(c.email)}?subject=${encodeURIComponent('Recordatorio de pago')}&body=${msg}" title="Enviar recordatorio por correo">${icon('mail')}</a>` : ''}`;
    };
    const group = (ic, color, title, arr, vacio) => `
      <div class="card">
        <div class="group-title">${icon(ic, 20, color)} ${title} <em>${arr.length}</em></div>
        ${arr.length ? `<div class="due-list">${arr.map(p => dueItem(p, true, extra(p))).join('')}</div>` : `<p class="muted" style="padding:6px 0">${vacio}</p>`}
      </div>`;
    return `
      <section class="card reminder-banner">
        ${icon('bell', 34, 'big')}
        <div><h3>Avisos con ${plural(dias, 'día', 'días')} de anticipación</h3>
          <p class="muted">Al iniciar sesión verás un resumen de vencimientos. Desde aquí puedes enviar recordatorios por WhatsApp o correo.</p></div>
        ${'Notification' in window ? (notifOk
          ? `<span class="badge b-pagado">Notificaciones activas</span>`
          : `<button class="btn btn-primary" data-act="notif">${icon('bell', 18)} Activar notificaciones</button>`) : ''}
      </section>
      ${group('alert', 'c-red', 'Vencidos', a.vencidos, 'No hay pagos vencidos.')}
      ${group('clock', 'c-orange', 'Vencen hoy', a.hoy, 'Nada vence hoy.')}
      ${group('calendar', 'c-sky', `Próximos ${dias} días`, a.proximos, 'No hay vencimientos próximos.')}`;
  };

  async function pedirNotif() {
    if (!('Notification' in window)) return toast('Este navegador no admite notificaciones.', 'warn');
    const r = await Notification.requestPermission();
    if (r === 'granted') { toast('Notificaciones activadas'); notificar(true); }
    else toast('El navegador bloqueó las notificaciones.', 'warn');
    render();
  }

  function notificar(force = false) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const key = 'pc_notif_' + hoy();
    if (!force && sessionStorage.getItem(key)) return;
    const a = alertas();
    const partes = [];
    if (a.vencidos.length) partes.push(plural(a.vencidos.length, 'vencido', 'vencidos'));
    if (a.hoy.length) partes.push(`${a.hoy.length} vence${a.hoy.length === 1 ? '' : 'n'} hoy`);
    if (a.proximos.length) partes.push(plural(a.proximos.length, 'por vencer', 'por vencer'));
    if (!partes.length) return;
    try { new Notification('SPYcomers · Recordatorio de cobros', { body: `Tienes ${partes.join(', ')}.` }); } catch (e) { /* algunos navegadores lo bloquean en archivos locales */ }
    sessionStorage.setItem(key, '1');
  }

  function resumenInicio() {
    const a = alertas();
    const total = a.vencidos.length + a.hoy.length + a.proximos.length;
    if (!total) return;
    const fila = (ic, color, txt, arr) => arr.length ? `<div class="detail">${icon(ic, 20, color)}<div><span>${txt}</span><small>${money(sum(arr))}</small></div></div>` : '';
    modal({
      title: 'Recordatorio de vencimientos', size: 'sm',
      body: `<div class="confirm">${icon('bell', 44, 'warn')}<p>Hay <strong>${plural(total, 'pago', 'pagos')}</strong> que requieren tu atención.</p></div>
        <div style="display:grid;gap:12px;margin:8px 0 4px">
          ${fila('alert', 'c-red', plural(a.vencidos.length, 'pago vencido', 'pagos vencidos'), a.vencidos)}
          ${fila('clock', 'c-orange', `${plural(a.hoy.length, 'pago vence', 'pagos vencen')} hoy`, a.hoy)}
          ${fila('calendar', 'c-sky', `${plural(a.proximos.length, 'pago vence', 'pagos vencen')} en los próximos ${DB.config().diasAviso} días`, a.proximos)}
        </div>`,
      footer: `<button type="button" class="btn btn-danger" data-close>${icon('x', 18)} Cerrar</button>
        <button type="button" class="btn btn-primary" data-ok data-nav="recordatorios">${icon('bell', 18)} Ver recordatorios</button>`,
      onMount: (el, close) => el.querySelector('[data-ok]').addEventListener('click', close)
    });
  }

  /* ---------- Usuarios ---------- */
  VIEWS.usuarios = () => `
    <div class="toolbar">
      <div class="search">${icon('search', 18)}<input id="q-usuarios" placeholder="Buscar por nombre o usuario" value="${esc(F.qu)}"></div>
      <button class="btn btn-orange" data-act="new-user">${icon('userPlus', 18)} Nuevo usuario</button>
    </div>
    <div class="card table-card" id="list-usuarios">${listUsuarios()}</div>`;

  function listUsuarios() {
    const q = norm(F.qu);
    const rows = DB.list('usuarios').filter(u => !q || norm(u.nombre + ' ' + u.usuario).includes(q))
      .sort((a, b) => (a.rol !== 'admin') - (b.rol !== 'admin') || a.nombre.localeCompare(b.nombre));
    if (!rows.length) return emptyState('search', 'Sin resultados', 'No hay usuarios que coincidan con la búsqueda.');
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th class="r">Acciones</th></tr></thead>
      <tbody>${rows.map(u => `<tr>
        <td><div class="cell-person">${avatar(u)}
          <div class="cell-main"><strong>${esc(u.nombre)}${u.id === me.id ? ' <span class="muted" style="font-weight:600">(tú)</span>' : ''}</strong></div></div></td>
        <td>${esc(u.usuario)}</td>
        <td>${rolBadge(u)}</td>
        <td>${estadoBadge(u)}</td>
        <td class="muted">${fmtDateTime(u.ultimoAcceso)}</td>
        <td><div class="actions">
          <button class="icon-btn i-sky" data-act="edit-user" data-id="${u.id}" title="Editar">${icon('edit')}</button>
          <button class="icon-btn i-red" data-act="del-user" data-id="${u.id}" title="Eliminar">${icon('trash')}</button>
        </div></td></tr>`).join('')}</tbody></table></div>`;
  }

  const adminsActivos = () => DB.list('usuarios').filter(u => u.rol === 'admin' && u.activo);

  function formUser(id) {
    const u = id ? DB.get('usuarios', id) : { rol: 'usuario', activo: true };
    const self = id === me.id;
    modal({
      title: id ? 'Editar usuario' : 'Nuevo usuario',
      body: `<form id="f-user" class="form-grid" novalidate>
        ${field(req('Nombre completo'), `<input name="nombre" required maxlength="80" value="${esc(u.nombre)}" placeholder="Ej. Ana Martínez">`, 'full')}
        ${field(req('Usuario'), `<input name="usuario" required maxlength="40" autocomplete="off" value="${esc(u.usuario)}" placeholder="Ej. ana">`, '', 'Sin espacios. Se usa para iniciar sesión.')}
        ${field(req('Rol'), `<select name="rol" ${self ? 'disabled' : ''}>
          <option value="usuario" ${u.rol === 'usuario' ? 'selected' : ''}>Usuario</option>
          <option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>Administrador</option></select>`, '',
          self ? 'No puedes cambiar tu propio rol.' : 'Los administradores gestionan usuarios, configuración y eliminaciones.')}
        ${field(id ? 'Nueva contraseña' : req('Contraseña'), `<input name="pass" type="password" minlength="6" autocomplete="new-password" placeholder="${id ? 'Déjala vacía para no cambiarla' : 'Mínimo 6 caracteres'}">`)}
        ${field(id ? 'Repetir nueva contraseña' : req('Repetir contraseña'), `<input name="pass2" type="password" autocomplete="new-password" placeholder="Repite la contraseña">`)}
        <label class="switch full" style="grid-column:1/-1"><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''} ${self ? 'disabled' : ''}> Usuario activo (puede iniciar sesión)</label>
      </form>`,
      footer: footerSave('f-user', id ? 'Guardar cambios' : 'Crear usuario'),
      onMount: (el, close) => el.querySelector('form').addEventListener('submit', e => {
        e.preventDefault();
        const f = e.target;
        const v = formData(f);
        const nombre = (v.nombre || '').trim();
        const usuario = (v.usuario || '').trim().toLowerCase();
        const rol = self ? me.rol : v.rol;
        const activo = self ? true : f.activo.checked;
        if (!nombre) return toast('Escribe el nombre completo.', 'warn');
        if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) return toast('El usuario debe tener al menos 3 caracteres, sin espacios.', 'warn');
        if (DB.list('usuarios').some(x => x.usuario === usuario && x.id !== id)) return toast('Ese nombre de usuario ya existe.', 'warn');
        if (!id && !v.pass) return toast('Define una contraseña.', 'warn');
        if (v.pass && v.pass.length < 6) return toast('La contraseña debe tener al menos 6 caracteres.', 'warn');
        if (v.pass !== v.pass2) return toast('Las contraseñas no coinciden.', 'warn');
        if (id && u.rol === 'admin' && u.activo && (rol !== 'admin' || !activo) && adminsActivos().length <= 1)
          return toast('Debe quedar al menos un administrador activo.', 'warn');
        const data = { nombre, usuario, rol, activo };
        if (v.pass) data.pass = DB.hash(v.pass);
        if (id) DB.put('usuarios', { ...data, id });
        else DB.put('usuarios', { ...data, ultimoAcceso: null });
        if (self) me = DB.get('usuarios', me.id);
        close(); render();
        toast(id ? 'Usuario actualizado' : 'Usuario creado');
      })
    });
  }

  async function delUser(id) {
    const u = DB.get('usuarios', id);
    const self = id === me.id;
    if (u.rol === 'admin' && u.activo && adminsActivos().length <= 1)
      return toast('Debe quedar al menos un administrador activo. Crea otro administrador antes de eliminar este.', 'warn');
    const ok = await confirmar({
      title: self ? 'Eliminar mi cuenta' : 'Eliminar usuario', iconName: 'trash', tipo: 'danger', ok: 'Sí, eliminar', okClass: 'btn-orange',
      message: self
        ? 'Tu cuenta se eliminará y se cerrará la sesión. Los clientes y pagos registrados se conservan.'
        : `<strong>${esc(u.nombre)}</strong> ya no podrá ingresar al sistema. Los clientes y pagos registrados se conservan.`
    });
    if (!ok) return;
    DB.remove('usuarios', id);
    if (self) { localStorage.removeItem(SESSION); me = null; showLogin(); return toast('Tu cuenta fue eliminada', 'info'); }
    render(); toast('Usuario eliminado');
  }

  /* ---------- Configuración ---------- */
  VIEWS.config = () => {
    const c = DB.config();
    return `<div class="settings-grid">
      <section class="card">
        <div class="card-head"><h3>Datos de la empresa</h3>${icon('building', 22, 'c-sky')}</div>
        <p class="card-sub">Se muestran en el menú y en los mensajes de recordatorio.</p>
        <form id="f-config" class="form-grid" novalidate>
          ${field(req('Nombre de la empresa'), `<input name="empresa" required maxlength="60" value="${esc(c.empresa)}">`, 'full')}
          ${field(req('Símbolo de moneda'), `<input name="moneda" required maxlength="5" value="${esc(c.moneda)}" placeholder="$, Gs., S/">`)}
          ${field(req('Días de anticipación'), `<input name="diasAviso" type="number" min="1" max="60" required value="${esc(c.diasAviso)}">`, '', 'Cuántos días antes del vencimiento avisar.')}
          ${field('Código de país para WhatsApp', `<input name="codigoPais" maxlength="4" inputmode="numeric" value="${esc(c.codigoPais)}" placeholder="595">`, '', 'Se antepone a los teléfonos que empiezan con 0.')}
        </form>
        <div class="form-actions"><button type="submit" form="f-config" class="btn btn-primary">${icon('check', 18)} Guardar configuración</button></div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Respaldo de datos</h3>${icon('database', 22, 'c-orange')}</div>
        <p class="card-sub">Los datos se guardan en este navegador. Descarga respaldos con frecuencia.</p>
        <div class="setting-row"><div><h4>Descargar respaldo</h4><p>Archivo .json con usuarios, clientes y pagos.</p></div>
          <button class="btn btn-soft" data-act="export">${icon('download', 18)} Descargar</button></div>
        <div class="setting-row"><div><h4>Restaurar respaldo</h4><p>Reemplaza todos los datos actuales.</p></div>
          <button class="btn btn-soft" data-act="import">${icon('upload', 18)} Restaurar</button></div>
        <div class="setting-row"><div><h4>Datos de ejemplo</h4><p>Agrega clientes y pagos ficticios para probar.</p></div>
          <button class="btn btn-soft" data-act="demo">${icon('sparkles', 18)} Cargar</button></div>
        <div class="setting-row"><div><h4>Borrar todo</h4><p>Elimina todos los datos y vuelve al usuario inicial.</p></div>
          <button class="btn btn-danger" data-act="reset">${icon('trash', 18)} Borrar</button></div>
        <input type="file" id="file-import" accept=".json,application/json" hidden>
      </section>
      <section class="card span-2">
        <div class="card-head"><h3>Datos de facturación</h3>${icon('file', 22, 'c-sky')}</div>
        <p class="card-sub">Aparecen en las facturas y tickets en PDF.</p>
        <div style="display:flex;gap:28px;flex-wrap:wrap;margin-bottom:18px">
        ${[['', 'Logo principal (izquierda)'], ['2', 'Logo secundario (derecha)']].map(([n, t]) => `
          <div style="display:grid;gap:8px">
            <span class="muted" style="font-size:13px;font-weight:700">${t}</span>
            <div class="logo-row">
              <div class="logo-box">${c['logo' + n] ? `<img src="${c['logo' + n]}" alt="${t}">` : icon('image', 26)}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="button" class="btn btn-soft btn-sm" data-act="pick-logo" data-n="${n}">${icon('upload', 16)} ${c['logo' + n] ? 'Cambiar' : 'Subir'}</button>
                ${c['logo' + n] ? `<button type="button" class="btn btn-danger btn-sm" data-act="del-logo" data-n="${n}">${icon('trash', 16)} Quitar</button>` : ''}
              </div>
            </div>
          </div>`).join('')}
          <input type="file" id="file-logo" accept="image/png,image/jpeg,image/webp" hidden>
        </div>
        <form id="f-fact" class="form-grid cols-3" novalidate>
          ${field('Razón social', `<input name="razonSocial" maxlength="100" value="${esc(c.razonSocial)}" placeholder="${esc(c.empresa)}">`)}
          ${field('RUC de la empresa', `<input name="ruc" maxlength="20" value="${esc(c.ruc)}" placeholder="Ej. 80012345-6">`)}
          ${field('Lema o servicio', `<input name="eslogan" maxlength="100" value="${esc(c.eslogan)}" placeholder="Ej. Servicio de Internet">`)}
          ${field('Actividad económica', `<textarea name="actividad" maxlength="300" placeholder="Una actividad por línea">${esc(c.actividad)}</textarea>`, 'full', 'Escribe cada actividad en una línea.')}
          ${field('Dirección', `<input name="direccion" maxlength="140" value="${esc(c.direccion)}">`)}
          ${field('Ciudad / departamento', `<input name="ciudad" maxlength="100" value="${esc(c.ciudad)}" placeholder="Ej. Cordillera - Paraguay">`)}
          ${field('Matriz / sucursal', `<input name="matriz" maxlength="160" value="${esc(c.matriz)}" placeholder="Matriz: dirección - Cel.">`)}
          ${field('Teléfono', `<input name="telefono" maxlength="40" value="${esc(c.telefono)}">`)}
          ${field('Correo', `<input name="email" type="email" maxlength="120" value="${esc(c.email)}">`)}
          ${field('N° de timbrado', `<input name="timbrado" maxlength="20" value="${esc(c.timbrado)}">`)}
          ${field('Inicio de vigencia', `<input name="timbradoInicio" type="date" value="${esc(c.timbradoInicio)}">`)}
          ${field('Fin de vigencia', `<input name="timbradoFin" type="date" value="${esc(c.timbradoFin)}">`)}
          ${field('Establecimiento', `<input name="establecimiento" maxlength="3" inputmode="numeric" value="${esc(c.establecimiento)}">`)}
          ${field('Punto de expedición', `<input name="punto" maxlength="3" inputmode="numeric" value="${esc(c.punto)}">`)}
          ${field('IVA por defecto', `<select name="ivaDefault">${Object.entries(IVA_TXT).map(([k, t]) => `<option value="${k}" ${c.ivaDefault === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
          ${field('Próximo N° de factura', `<input name="sigFactura" type="number" min="1" value="${esc(c.sigFactura)}">`, '', `Siguiente: ${siguienteNumero('factura').numero}`)}
          ${field('Próximo N° de ticket', `<input name="sigTicket" type="number" min="1" value="${esc(c.sigTicket)}">`, '', `Siguiente: ${siguienteNumero('ticket').numero}`)}
          ${field('Moneda en letras', `<input name="monedaNombre" maxlength="30" value="${esc(c.monedaNombre)}" placeholder="Ej. guaraníes">`, '', 'Para el total en letras.')}
          ${field('Copias (pie derecho)', `<input name="pieCopias" maxlength="160" value="${esc(c.pieCopias)}" placeholder="Original: Cliente - Duplicado: Arch. Tributario">`, 'span-2')}
          ${field('Leyenda al pie', `<textarea name="leyenda" maxlength="300" placeholder="Ej. Gracias por su compra.">${esc(c.leyenda)}</textarea>`, 'full')}
        </form>
        <div class="form-actions"><button type="submit" form="f-fact" class="btn btn-primary">${icon('check', 18)} Guardar datos de facturación</button></div>
      </section>
    </div>`;
  };

  /* ---------- Perfil ---------- */
  VIEWS.perfil = () => `
    <section class="card profile-head">
      ${avatar(me, 'xl')}
      <div class="info">
        <h2>${esc(me.nombre)}</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${rolBadge(me)}${estadoBadge(me)}</div>
        <small class="muted">Usuario: ${esc(me.usuario)}${me.cargo ? ' · ' + esc(me.cargo) : ''}</small>
      </div>
      <div class="acts">
        <button class="btn btn-soft" data-act="pick-foto">${icon('upload', 18)} ${me.foto ? 'Cambiar foto' : 'Subir foto'}</button>
        ${me.foto ? `<button class="btn btn-danger" data-act="del-foto">${icon('trash', 18)} Quitar foto</button>` : ''}
      </div>
      <input type="file" id="file-foto" accept="image/*" hidden>
    </section>
    <div class="settings-grid">
      <section class="card">
        <div class="card-head"><h3>Mis datos</h3>${icon('user', 22, 'c-sky')}</div>
        <form id="f-perfil" class="form-grid" novalidate>
          ${field(req('Nombre completo'), `<input name="nombre" required maxlength="80" value="${esc(me.nombre)}">`, 'full')}
          ${field(req('Usuario'), `<input name="usuario" required maxlength="40" autocomplete="off" value="${esc(me.usuario)}">`, '', 'Con este nombre inicias sesión.')}
          ${field('Cargo', `<input name="cargo" maxlength="60" value="${esc(me.cargo)}" placeholder="Ej. Cobranzas">`)}
          ${field('Teléfono', `<input name="telefono" maxlength="40" value="${esc(me.telefono)}" placeholder="Ej. 0981 123 456">`)}
          ${field('Correo electrónico', `<input name="email" type="email" maxlength="120" value="${esc(me.email)}" placeholder="tu@correo.com">`)}
        </form>
        <div class="form-actions"><button type="submit" form="f-perfil" class="btn btn-primary">${icon('check', 18)} Guardar cambios</button></div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Cambiar contraseña</h3>${icon('lock', 22, 'c-orange')}</div>
        <form id="f-pass" class="form-grid" novalidate>
          ${field(req('Contraseña actual'), `<input name="actual" type="password" required autocomplete="current-password">`, 'full')}
          ${field(req('Nueva contraseña'), `<input name="nueva" type="password" required minlength="6" autocomplete="new-password" placeholder="Mínimo 6 caracteres">`)}
          ${field(req('Repetir nueva'), `<input name="nueva2" type="password" required autocomplete="new-password">`)}
        </form>
        <div class="form-actions"><button type="submit" form="f-pass" class="btn btn-orange">${icon('lock', 18)} Cambiar contraseña</button></div>
        <div class="setting-row" style="margin-top:18px">
          <div><h4>Eliminar mi cuenta</h4><p>Se borra tu usuario y se cierra la sesión.</p></div>
          <button class="btn btn-danger" data-act="del-user" data-id="${me.id}">${icon('trash', 18)} Eliminar</button>
        </div>
      </section>
    </div>`;

  function leerLogo(file) {
    return new Promise((res, rej) => {
      if (!file.type.startsWith('image/')) return rej(new Error('Elige un archivo de imagen (PNG o JPG).'));
      const r = new FileReader();
      r.onerror = () => rej(new Error('No se pudo leer la imagen.'));
      r.onload = () => {
        const img = new Image();
        img.onerror = () => rej(new Error('No se pudo abrir la imagen.'));
        img.onload = () => {
          const max = 400, k = Math.min(1, max / Math.max(img.width, img.height));
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          res({ data: cv.toDataURL('image/png'), ratio: cv.width / cv.height });
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  function leerFoto(file) {
    return new Promise((res, rej) => {
      if (!file.type.startsWith('image/')) return rej(new Error('Elige un archivo de imagen.'));
      const r = new FileReader();
      r.onerror = () => rej(new Error('No se pudo leer la imagen.'));
      r.onload = () => {
        const img = new Image();
        img.onerror = () => rej(new Error('No se pudo abrir la imagen.'));
        img.onload = () => {
          const s = 256, cv = document.createElement('canvas');
          cv.width = cv.height = s;
          const m = Math.min(img.width, img.height);
          cv.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
          res(cv.toDataURL('image/jpeg', 0.85));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  /* =========================================================
     EVENTOS
     ========================================================= */
  document.addEventListener('click', async e => {
    const nav = e.target.closest('[data-nav]');
    if (nav && me) {
      if (nav.dataset.filter) F.pagos = nav.dataset.filter;
      if (nav.closest('.modal-backdrop') && !nav.hasAttribute('data-ok')) closeTopModal();
      return go(nav.dataset.nav);
    }
    const a = e.target.closest('[data-act]');
    if (!a || !me) return;
    if (a.hasAttribute('data-swap')) closeTopModal();
    const id = a.dataset.id;
    switch (a.dataset.act) {
      case 'menu': $('#app').classList.toggle('nav-open'); break;
      case 'logout': return logout();
      case 'new-cliente': return formCliente();
      case 'edit-cliente': return formCliente(id);
      case 'view-cliente': return verCliente(id);
      case 'del-cliente': return delCliente(id);
      case 'new-pago': return formPago(null, a.dataset.cliente);
      case 'edit-pago': return formPago(id);
      case 'del-pago': return delPago(id);
      case 'cobrar': return cobrar(id);
      case 'doc': return a.dataset.tipo ? comprobante(id, a.dataset.tipo) : comprobante(id);
      case 'doc-pdf': return descargarDoc(id, a.dataset.tipo);
      case 'doc-wa': return enviarDoc(id, a.dataset.tipo, 'wa');
      case 'filter-docs':
        F2.td = a.dataset.f;
        $('#chips-docs').innerHTML = chipsDocs();
        $('#list-docs').innerHTML = listDocs();
        break;
      case 'pick-logo': { const fi = $('#file-logo'); fi.dataset.n = a.dataset.n || ''; return fi.click(); }
      case 'del-logo': {
        const ok = await confirmar({ title: 'Quitar logo', iconName: 'image', tipo: 'warn', ok: 'Sí, quitar', okClass: 'btn-orange', message: 'Las facturas y tickets se generarán sin logo.' });
        const n = a.dataset.n || '';
        if (ok) { DB.setConfig({ ['logo' + n]: '', ['logo' + n + 'Ratio']: 1 }); render(); toast('Logo quitado'); }
        break;
      }
      case 'revertir': return revertir(id);
      case 'filter':
        F.pagos = a.dataset.f;
        $('#chips-pagos').innerHTML = chipsPagos();
        $('#list-pagos').innerHTML = listPagos();
        break;
      case 'notif': return pedirNotif();
      case 'new-user': return formUser();
      case 'edit-user': return formUser(id);
      case 'del-user': return delUser(id);
      case 'pick-foto': return $('#file-foto').click();
      case 'del-foto': {
        const ok = await confirmar({ title: 'Quitar foto de perfil', iconName: 'user', tipo: 'warn', ok: 'Sí, quitar', okClass: 'btn-orange',
          message: 'Se mostrarán tus iniciales en lugar de la foto.' });
        if (ok) { DB.put('usuarios', { id: me.id, foto: '' }); me = DB.get('usuarios', me.id); render(); toast('Foto quitada'); }
        break;
      }
      case 'export': return exportar();
      case 'import': return $('#file-import').click();
      case 'demo': {
        const ok = await confirmar({ title: 'Cargar datos de ejemplo', iconName: 'sparkles', ok: 'Sí, cargar',
          message: 'Se agregarán <strong>5 clientes</strong> y <strong>9 pagos</strong> ficticios. Podrás eliminarlos después.' });
        if (ok) { DB.demo(); go('dashboard'); toast('Datos de ejemplo cargados'); }
        break;
      }
      case 'reset': {
        const ok = await confirmar({ title: 'Borrar todos los datos', iconName: 'alert', tipo: 'danger', ok: 'Sí, borrar todo', okClass: 'btn-orange',
          message: 'Se eliminarán <strong>todos los usuarios, clientes y pagos</strong>. Se restablecerá el usuario <strong>admin / admin123</strong>. Descarga un respaldo antes si lo necesitas.' });
        if (ok) { DB.reset(); localStorage.removeItem(SESSION); me = null; showLogin(); toast('Datos borrados', 'info'); }
        break;
      }
    }
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'q-clientes') { F.qc = t.value; $('#list-clientes').innerHTML = listClientes(); }
    if (t.id === 'q-pagos') { F.qp = t.value; $('#list-pagos').innerHTML = listPagos(); }
    if (t.id === 'q-docs') { F2.qd = t.value; $('#list-docs').innerHTML = listDocs(); }
    if (t.id === 'q-usuarios') { F.qu = t.value; $('#list-usuarios').innerHTML = listUsuarios(); }
  });

  document.addEventListener('submit', e => {
    const f = e.target;
    if (f.id === 'f-config') {
      e.preventDefault();
      const v = formData(f);
      const dias = parseInt(v.diasAviso, 10);
      if (!v.empresa.trim() || !v.moneda.trim()) return toast('Completa el nombre de la empresa y la moneda.', 'warn');
      if (!(dias >= 1 && dias <= 60)) return toast('Los días de anticipación deben estar entre 1 y 60.', 'warn');
      DB.setConfig({ empresa: v.empresa.trim(), moneda: v.moneda.trim(), diasAviso: dias, codigoPais: (v.codigoPais || '').replace(/\D/g, '') });
      render(); toast('Configuración guardada');
    }
    if (f.id === 'f-fact') {
      e.preventDefault();
      const v = formData(f);
      const sf = parseInt(v.sigFactura, 10), st = parseInt(v.sigTicket, 10);
      if (!(sf >= 1) || !(st >= 1)) return toast('Los próximos números deben ser 1 o mayor.', 'warn');
      if (!/^\d{3}$/.test(v.establecimiento) || !/^\d{3}$/.test(v.punto)) return toast('Establecimiento y punto de expedición deben tener 3 dígitos (ej. 001).', 'warn');
      if (v.timbradoInicio && v.timbradoFin && v.timbradoFin < v.timbradoInicio) return toast('La fecha de fin del timbrado es anterior a la de inicio.', 'warn');
      const keys = ['eslogan', 'ciudad', 'matriz', 'pieCopias', 'razonSocial', 'ruc', 'actividad', 'direccion', 'telefono', 'email', 'timbrado', 'timbradoInicio', 'timbradoFin', 'establecimiento', 'punto', 'ivaDefault', 'monedaNombre', 'leyenda'];
      const data = Object.fromEntries(keys.map(k => [k, (v[k] || '').trim()]));
      DB.setConfig({ ...data, sigFactura: sf, sigTicket: st });
      render(); toast('Datos de facturación guardados');
    }
    if (f.id === 'f-perfil') {
      e.preventDefault();
      const v = formData(f);
      const nombre = v.nombre.trim(), usuario = v.usuario.trim().toLowerCase(), email = v.email.trim();
      if (!nombre) return toast('Escribe tu nombre.', 'warn');
      if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) return toast('El usuario debe tener al menos 3 caracteres, sin espacios.', 'warn');
      if (DB.list('usuarios').some(x => x.usuario === usuario && x.id !== me.id)) return toast('Ese nombre de usuario ya existe.', 'warn');
      if (email && !/^\S+@\S+\.\S+$/.test(email)) return toast('El correo no tiene un formato válido.', 'warn');
      DB.put('usuarios', { id: me.id, nombre, usuario, cargo: v.cargo.trim(), telefono: v.telefono.trim(), email });
      me = DB.get('usuarios', me.id);
      render(); toast('Perfil actualizado');
    }
    if (f.id === 'f-pass') {
      e.preventDefault();
      const v = formData(f);
      if (DB.hash(v.actual) !== me.pass) return toast('La contraseña actual no es correcta.', 'error');
      if (v.nueva.length < 6) return toast('La nueva contraseña debe tener al menos 6 caracteres.', 'warn');
      if (v.nueva !== v.nueva2) return toast('Las contraseñas nuevas no coinciden.', 'warn');
      DB.put('usuarios', { id: me.id, pass: DB.hash(v.nueva) }); me = DB.get('usuarios', me.id);
      f.reset(); toast('Contraseña actualizada');
    }
  });

  document.addEventListener('change', async e => {
    if (e.target.id === 'file-logo' && e.target.files[0]) {
      const file = e.target.files[0];
      e.target.value = '';
      const n = e.target.dataset.n || '';
      try { const { data, ratio } = await leerLogo(file); DB.setConfig({ ['logo' + n]: data, ['logo' + n + 'Ratio']: ratio }); render(); toast('Logo actualizado'); }
      catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (e.target.id === 'file-foto' && e.target.files[0]) {
      const file = e.target.files[0];
      e.target.value = '';
      try {
        const foto = await leerFoto(file);
        DB.put('usuarios', { id: me.id, foto }); me = DB.get('usuarios', me.id);
        render(); toast('Foto de perfil actualizada');
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (e.target.id !== 'file-import' || !e.target.files[0]) return;
    const file = e.target.files[0];
    e.target.value = '';
    const ok = await confirmar({ title: 'Restaurar respaldo', iconName: 'upload', tipo: 'warn', ok: 'Sí, restaurar', okClass: 'btn-orange',
      message: `Se reemplazarán todos los datos actuales por los de <strong>${esc(file.name)}</strong>. Tendrás que iniciar sesión de nuevo.` });
    if (!ok) return;
    try {
      DB.importar(await file.text());
      localStorage.removeItem(SESSION); me = null; showLogin();
      toast('Respaldo restaurado. Inicia sesión.', 'info');
    } catch (err) { toast(err.message || 'No se pudo leer el archivo.', 'error'); }
  });

  function exportar() {
    const blob = new Blob([DB.exportar()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `respaldo-spycomers-${hoy()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Respaldo descargado');
  }

  /* =========================================================
     SESIÓN
     ========================================================= */
  async function logout() {
    const ok = await confirmar({ title: 'Salir del sistema', iconName: 'logout', tipo: 'danger', ok: 'Sí, salir', okClass: 'btn-danger',
      message: '¿Deseas cerrar tu sesión? Tendrás que ingresar de nuevo con tu usuario y contraseña.' });
    if (!ok) return;
    localStorage.removeItem(SESSION); me = null;
    showLogin(); toast('Sesión cerrada', 'info');
  }

  function showLogin() {
    while (modalStack.length) closeTopModal();
    $('#app').classList.add('hidden');
    $('#login-view').classList.remove('hidden');
    $('#login-form').reset();
    $('#lg-error').classList.add('hidden');
    const hint = $('#lg-hint');
    if (DB.usesDefaultAdmin()) {
      hint.innerHTML = `${icon('info', 18)}<span>Primer ingreso: usuario <strong>admin</strong> y contraseña <strong>admin123</strong>. Cámbiala desde Mi perfil.</span>`;
      hint.classList.remove('hidden');
    } else hint.classList.add('hidden');
    setTimeout(() => $('#lg-user').focus(), 50);
  }

  function startApp(fresh) {
    $('#login-view').classList.add('hidden');
    $('#app').classList.remove('hidden');
    view = 'dashboard';
    render();
    if (fresh) {
      setTimeout(resumenInicio, 350);
      if (DB.usesDefaultAdmin() && me.usuario === 'admin' && DB.hash('admin123') === me.pass)
        setTimeout(() => toast('Estás usando la contraseña inicial. Cámbiala en Mi perfil.', 'warn'), 900);
    }
    notificar();
  }

  $('#login-form').addEventListener('submit', e => {
    e.preventDefault();
    const r = DB.auth($('#lg-user').value.trim(), $('#lg-pass').value);
    const err = $('#lg-error');
    if (r.error) { err.textContent = r.error; err.classList.remove('hidden'); return; }
    me = r.user;
    localStorage.setItem(SESSION, me.id);
    startApp(true);
  });

  $('#lg-eye').addEventListener('click', () => {
    const p = $('#lg-pass');
    const show = p.type === 'password';
    p.type = show ? 'text' : 'password';
    $('#lg-eye').innerHTML = icon(show ? 'eyeOff' : 'eye', 18);
    $('#lg-eye').setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });

  /* Sincroniza si se usa en varias pestañas */
  window.addEventListener('storage', e => {
    if (e.key !== 'pagocontrol_db_v1' || !me) return;
    DB.reload();
    const fresh = DB.get('usuarios', me.id);
    if (!fresh || !fresh.activo) { me = null; localStorage.removeItem(SESSION); return showLogin(); }
    me = fresh;
    if (!modalStack.length) render();
  });

  /* Revisión periódica de vencimientos (cambio de día, avisos) */
  let lastDay = hoy();
  setInterval(() => {
    if (!me) return;
    if (hoy() !== lastDay) { lastDay = hoy(); if (!modalStack.length) render(); }
    renderChrome();
    notificar();
  }, 60000);

  /* ---------- Arranque ---------- */
  function init() {
    $('#lg-logo').innerHTML = icon('logo', 30);
    $('#sb-logo').innerHTML = icon('logo', 26);
    $('#lg-eye').innerHTML = icon('eye', 18);
    $('#btn-menu').innerHTML = icon('menu', 22);
    $('#btn-logout').innerHTML = `${icon('logout', 18)}<span class="btn-logout-text">Salir</span>`;


    const sid = localStorage.getItem(SESSION);
    const u = sid && DB.get('usuarios', sid);
    if (u && u.activo) { me = u; startApp(false); }
    else showLogin();
  }
  init();
})();