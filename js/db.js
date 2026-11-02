/* =========================================================
   Capa de datos — se guarda en el navegador (localStorage)
   ========================================================= */
const DB = (() => {
  const KEY = 'pagocontrol_db_v1';
  let d = null;

  const blank = () => ({
    config: {
      empresa: 'SPYcomers', moneda: '$', diasAviso: 7, codigoPais: '595',
      razonSocial: '', ruc: '', actividad: '', direccion: '', telefono: '', email: '',
      timbrado: '', timbradoInicio: '', timbradoFin: '', establecimiento: '001', punto: '001',
      sigFactura: 1, sigTicket: 1, ivaDefault: '10', monedaNombre: '', leyenda: '', logo: '', logoRatio: 1,
      eslogan: '', ciudad: '', matriz: '', pieCopias: '', logo2: '', logo2Ratio: 1, presetSpy: false
    },
    usuarios: [], clientes: [], pagos: []
  });

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* Hash simple (cyrb53) para no guardar contraseñas en texto plano */
  function hash(str) {
    const s = 'pc::' + str;
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  function save() { localStorage.setItem(KEY, JSON.stringify(d)); }

  function seedAdmin() {
    d.usuarios.push({
      id: uid(), nombre: 'Administrador', usuario: 'admin', rol: 'admin',
      pass: hash('admin123'), activo: true, creado: new Date().toISOString(), ultimoAcceso: null
    });
  }

  /* Datos fiscales de Consorcio Spy E.A.S. (de la factura impresa). Solo completa lo vacío, una vez. */
  function aplicarDatosSpy() {
    const c = d.config;
    if (c.presetSpy) return;
    const P = {
      razonSocial: 'Consorcio Spy E.A.S.',
      eslogan: 'Servicio de Internet (Telecomunicaciones)',
      actividad: 'Comercio al por menor de equipos de telecomunicaciones\nInstalaciones eléctricas, electromecánicas y electrónicas',
      direccion: 'Calle Tte. Eligio Montania - Valenzuela',
      ciudad: 'Cordillera - Paraguay',
      matriz: 'Matriz: Nanawa casi Yegros - Sapucai - Cel.: (0984) 154 315 - Paraguarí - Paraguay',
      telefono: '(0984) 154 315',
      ruc: '80138884-8', timbrado: '19158753', timbradoInicio: '2026-09-30', timbradoFin: '2027-09-30',
      monedaNombre: 'guaraníes',
      pieCopias: 'Original: Cliente - Duplicado: Arch. Tributario - Triplicado: Contabilidad'
    };
    Object.entries(P).forEach(([k, v]) => { if (!c[k]) c[k] = v; });
    if (!c.establecimiento || c.establecimiento === '001') c.establecimiento = '002';
    if (!c.punto) c.punto = '001';
    if ((Number(c.sigFactura) || 1) < 1442) c.sigFactura = 1442;
    if (!c.moneda || c.moneda === '$') c.moneda = 'Gs.';
    const L = window.SPY_LOGOS;
    if (L) {
      if (!c.logo) { c.logo = L.logo; c.logoRatio = L.logoRatio; }
      if (!c.logo2) { c.logo2 = L.logo2; c.logo2Ratio = L.logo2Ratio; }
    }
    c.presetSpy = true;
    save();
  }

  function load() {
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { d = null; }
    if (!d || !Array.isArray(d.usuarios) || !d.usuarios.length) { d = blank(); seedAdmin(); save(); }
    d.config = { ...blank().config, ...(d.config || {}) };
    if (!d.config.empresa || d.config.empresa === 'Mi Empresa') { d.config.empresa = 'SPYcomers'; save(); }
    aplicarDatosSpy();
    ['clientes', 'pagos'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
  }

  const list = col => d[col].slice();
  const get = (col, id) => d[col].find(x => x.id === id) || null;

  function put(col, obj) {
    if (obj.id) {
      const i = d[col].findIndex(x => x.id === obj.id);
      if (i >= 0) d[col][i] = { ...d[col][i], ...obj, actualizado: new Date().toISOString() };
      else d[col].push(obj);
    } else {
      obj = { ...obj, id: uid(), creado: new Date().toISOString() };
      d[col].push(obj);
    }
    save();
    return obj;
  }

  function remove(col, id) {
    d[col] = d[col].filter(x => x.id !== id);
    if (col === 'clientes') d.pagos = d.pagos.filter(p => p.clienteId !== id);
    save();
  }

  function auth(usuario, pass) {
    const u = d.usuarios.find(x => x.usuario.toLowerCase() === usuario.toLowerCase());
    if (!u || u.pass !== hash(pass)) return { error: 'Usuario o contraseña incorrectos.' };
    if (!u.activo) return { error: 'Este usuario está desactivado. Contacta a un administrador.' };
    u.ultimoAcceso = new Date().toISOString();
    save();
    return { user: u };
  }

  function usesDefaultAdmin() {
    return d.usuarios.some(u => u.usuario === 'admin' && u.pass === hash('admin123'));
  }

  function demo() {
    const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    const rel = n => { const x = new Date(); x.setDate(x.getDate() + n); return iso(x); };
    const cl = [
      ['Comercial Las Palmas', '80012345-6', '0981 123 456', 'compras@laspalmas.com', 'Av. Principal 1520'],
      ['María Fernanda López', '4.512.789', '0972 555 210', 'mflopez@correo.com', 'Calle Los Lapachos 233'],
      ['Ferretería El Tornillo', '80098765-1', '0985 777 900', 'admin@eltornillo.com', 'Ruta 2 km 14'],
      ['Jorge Benítez', '3.987.654', '0991 432 110', '', 'Barrio San Vicente'],
      ['Clínica Santa Rosa', '80055511-3', '021 600 400', 'pagos@santarosa.com', 'Av. España 890']
    ].map(([nombre, documento, telefono, email, direccion]) => put('clientes', { nombre, documento, telefono, email, direccion, notas: '' }));
    const pg = [
      [0, 'Mantenimiento mensual', 450000, -40, -10, false],
      [1, 'Cuota 3/6 — Equipo de oficina', 320000, -25, 0, false],
      [2, 'Factura 001-245', 1250000, -20, 3, false],
      [3, 'Servicio de instalación', 280000, -15, 6, false],
      [4, 'Contrato anual — Cuota 5/12', 900000, -5, 18, false],
      [0, 'Mantenimiento mensual', 450000, -70, -40, true],
      [1, 'Cuota 2/6 — Equipo de oficina', 320000, -55, -30, true],
      [4, 'Contrato anual — Cuota 4/12', 900000, -35, -12, true],
      [2, 'Factura 001-198', 760000, -60, -3, false]
    ];
    pg.forEach(([ci, concepto, monto, em, ve, pagado]) => put('pagos', {
      clienteId: cl[ci].id, concepto, monto, emision: rel(em), vencimiento: rel(ve),
      estado: pagado ? 'pagado' : 'pendiente',
      fechaPago: pagado ? rel(ve - 1) : '', metodo: pagado ? 'Transferencia' : '', referencia: '', notas: ''
    }));
  }

  load();

  return {
    hash, list, get, put, remove, auth, usesDefaultAdmin, demo,
    config: () => d.config,
    setConfig: c => { d.config = { ...d.config, ...c }; save(); },
    exportar: () => JSON.stringify(d, null, 2),
    importar: json => {
      const x = JSON.parse(json);
      if (!x || !Array.isArray(x.usuarios) || !x.usuarios.some(u => u.rol === 'admin'))
        throw new Error('El archivo no es un respaldo válido del sistema.');
      d = { ...blank(), ...x }; d.config = { ...blank().config, ...x.config }; save();
    },
    reset: () => { localStorage.removeItem(KEY); load(); },
    reload: load
  };
})();
