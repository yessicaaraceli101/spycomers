/* =========================================================
   Generación de comprobantes en PDF (Factura A4 y Ticket 80 mm)
   ========================================================= */
const Comprobante = (() => {
  const SKY = [14, 165, 233], ORA = [249, 115, 22], INK = [12, 42, 62], MUT = [85, 112, 134],
        LIGHT = [240, 249, 255], CREAM = [255, 247, 237], GREEN = [22, 163, 74];

  /* Las fuentes estándar del PDF solo admiten caracteres latinos */
  const s = v => String(v ?? '').replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/₲/g, 'Gs.').replace(/…/g, '...').replace(/[^\x00-\xFF]/g, '');

  /* ---------- Número a letras ---------- */
  const U = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece',
    'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés',
    'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
  const D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
  const menor1000 = x => {
    if (x === 100) return 'cien';
    const c = Math.floor(x / 100), r = x % 100;
    let out = C[c];
    if (r) out += (out ? ' ' : '') + (r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' y ' + U[r % 10] : ''));
    return out;
  };
  const apocope = t => t.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');
  function letras(n) {
    n = Math.floor(Math.abs(n));
    if (n === 0) return 'cero';
    const mm = Math.floor(n / 1e6), m = Math.floor((n % 1e6) / 1000), r = n % 1000;
    let out = '';
    if (mm) out += (mm === 1 ? 'un millón' : apocope(letras(mm)) + ' millones') + ' ';
    if (m) out += (m === 1 ? 'mil' : apocope(menor1000(m)) + ' mil') + ' ';
    if (r) out += menor1000(r);
    return out.trim();
  }
  function totalEnLetras(v, monedaNombre) {
    const ent = Math.floor(v), dec = Math.round((v - ent) * 100);
    return `${monedaNombre ? apocope(letras(ent)) : letras(ent)}${dec ? ` con ${String(dec).padStart(2, '0')}/100` : ''}${monedaNombre ? ' ' + monedaNombre : ''}`.toUpperCase();
  }

  /* ---------- Importes e IVA (precios con IVA incluido) ---------- */
  function calc(p) {
    const t = Number(p.monto) || 0;
    const tipo = p.iva || '10';
    const r = v => Number.isInteger(t) ? Math.round(v) : Math.round(v * 100) / 100;
    const k = {
      total: t,
      exenta: tipo === 'exenta' ? t : 0,
      g5: tipo === '5' ? t : 0,
      g10: tipo === '10' ? t : 0,
      iva5: tipo === '5' ? r(t / 21) : 0,
      iva10: tipo === '10' ? r(t / 11) : 0
    };
    k.ivaTotal = k.iva5 + k.iva10;
    return k;
  }

  /* ---------- Utilidades de formato ---------- */
  const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const dmy = v => v ? String(v).split('-').reverse().join('/') : '-';
  const num = v => {
    const n = Number(v) || 0;
    const [i, dc] = Math.abs(n).toFixed(2).split('.');
    return (n < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dc !== '00' ? ',' + dc : '');
  };
  const imgFmt = data => /^data:image\/jpe?g/i.test(data || '') ? 'JPEG' : 'PNG';
  const fitImg = (doc, data, ratio, x, y, maxW, maxH, align = 'center') => {
    if (!data) return 0;
    let h = maxH, w = h * (ratio || 1);
    if (w > maxW) { w = maxW; h = w / (ratio || 1); }
    const ix = align === 'center' ? x + (maxW - w) / 2 : align === 'right' ? x + maxW - w : x;
    try { doc.addImage(data, imgFmt(data), ix, y + (maxH - h) / 2, w, h); } catch (e) { return 0; }
    return w;
  };

  /* ---------- Factura (mismo diseño que la factura impresa) ---------- */
  function a4(p, c, d, cfg, H) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const L = 10, R = 287;
    const LINE = [38, 42, 50], PEN = [22, 52, 140], RED = [214, 40, 40], GRAY = [125, 132, 142];
    const k = calc(p);
    const font = (fam, st, size, color = LINE) => { doc.setFont(fam, st); doc.setFontSize(size); doc.setTextColor(...color); };
    const stroke = (w = 0.45, col = LINE) => { doc.setLineWidth(w); doc.setDrawColor(...col); };
    const under = (x1, x2, y) => { stroke(0.25, GRAY); doc.line(x1, y, x2, y); stroke(); };
    const dotted = (x1, x2, y) => { stroke(0.3, GRAY); doc.setLineDashPattern([0.4, 0.9], 0); doc.line(x1, y, x2, y); doc.setLineDashPattern([], 0); stroke(); };
    const check = (x, y, on) => {
      stroke(0.45); doc.roundedRect(x, y - 4.4, 5.2, 5.2, 1, 1, 'S');
      if (on) { font('helvetica', 'bold', 11, PEN); doc.text('X', x + 2.6, y - 0.2, { align: 'center' }); }
    };
    const pen = (t, x, y, opt = {}, size = 10.5) => { font('helvetica', 'normal', size, PEN); doc.text(s(t), x, y, opt); };
    doc.setProperties({ title: `Factura ${d.numero}`, creator: s(cfg.empresa) });
    stroke();

    /* ===== Encabezado izquierdo: empresa ===== */
    doc.roundedRect(L, 8, 190, 52, 4, 4, 'S');
    const w1 = fitImg(doc, cfg.logo, cfg.logoRatio, 13, 11, 50, 46);
    const w2 = fitImg(doc, cfg.logo2, cfg.logo2Ratio, 152, 13, 45, 40, 'right');
    const tl = w1 ? 13 + 50 + 2 : 15, tr = w2 ? 152 : 196, cx = (tl + tr) / 2, tw = tr - tl;
    let size = 21;
    const nombre = s(cfg.razonSocial || cfg.empresa);
    doc.setFont('helvetica', 'bold');
    while (size > 12) { doc.setFontSize(size); if (doc.getTextWidth(nombre) <= tw) break; size -= 0.5; }
    font('helvetica', 'bold', size, LINE); doc.text(nombre, cx, 20, { align: 'center' });
    let y = 26.5;
    if (cfg.eslogan) { font('helvetica', 'normal', 10, LINE); doc.text(s(cfg.eslogan), cx, y, { align: 'center', maxWidth: tw }); y += 5.5; }
    if (cfg.actividad) {
      font('helvetica', 'normal', 7.3, LINE);
      String(cfg.actividad).split(/\n/).forEach(l => doc.splitTextToSize(s(l), tw).forEach(x => { doc.text(x, cx, y, { align: 'center' }); y += 3.3; }));
      y += 2;
    }
    font('times', 'bold', 9.5, LINE);
    [cfg.direccion, cfg.ciudad].filter(Boolean).forEach(l => { doc.text(s(l), cx, y, { align: 'center', maxWidth: tw }); y += 4.4; });
    if (cfg.matriz) { font('helvetica', 'bold', 6, LINE); doc.text(doc.splitTextToSize(s(cfg.matriz), tw + 8), cx, Math.max(y + 0.5, 54), { align: 'center' }); }
    else if (cfg.telefono) { font('helvetica', 'bold', 7, LINE); doc.text(s(`Tel.: ${cfg.telefono}`), cx, Math.max(y + 0.5, 54), { align: 'center' }); }

    /* ===== Encabezado derecho: timbrado ===== */
    const bx = 204, bw = R - bx, bc = bx + bw / 2;
    doc.roundedRect(bx, 8, bw, 52, 4, 4, 'S');
    font('times', 'bold', 13, LINE); doc.text(s(`TIMBRADO N°.: ${cfg.timbrado || '-'}`), bc, 15.5, { align: 'center' });
    font('times', 'normal', 10, LINE);
    doc.text(s(`Fecha Inicio Vigencia: ${dmy(cfg.timbradoInicio)}`), bc, 21, { align: 'center' });
    doc.text(s(`Fecha Fin Vigencia: ${dmy(cfg.timbradoFin)}`), bc, 25.8, { align: 'center' });
    font('times', 'bold', 15.5, LINE); doc.text(s(`R.U.C.: ${cfg.ruc || '-'}`), bc, 33, { align: 'center' });
    font('helvetica', 'bold', 20, LINE); doc.text('FACTURA', bc, 41.5, { align: 'center' });
    doc.line(bx, 45, R, 45);
    const [est, pto, nro] = String(d.numero).split('-');
    font('times', 'bold', 13.5, LINE); doc.text(s(`N°${est}-${pto}`), bx + 4, 55);
    font('helvetica', 'normal', 22, RED); doc.text(s(nro || ''), R - 4, 56, { align: 'right' });

    /* ===== Datos del cliente ===== */
    doc.roundedRect(L, 63, 277, 37, 4, 4, 'S');
    const f = new Date((d.fecha || '2000-01-01') + 'T12:00:00');
    const lab = (t, x, yy) => { font('helvetica', 'normal', 10.5, LINE); doc.text(s(t), x, yy); return x + doc.getTextWidth(s(t)) + 1.2; };
    let x = lab('Fecha de Emisión,', L + 4, 72);
    under(x, x + 18, 72.6); pen(String(f.getDate()).padStart(2, '0'), x + 9, 71.6, { align: 'center' }); x += 19.5;
    x = lab('de', x, 72);
    under(x, x + 58, 72.6); pen(MESES_L[f.getMonth()], x + 29, 71.6, { align: 'center' }); x += 59.5;
    x = lab('de 20', x, 72);
    under(x, x + 14, 72.6); pen(String(f.getFullYear()).slice(2), x + 7, 71.6, { align: 'center' });
    const credito = d.condicion === 'Crédito';
    x = lab('Cond. de Venta:', 203, 72);
    x = lab('Contado', x + 1, 72); check(x, 72, !credito);
    x = lab('Crédito', x + 8, 72); check(x, 72, credito);

    x = lab('Nombre o Razón Social:', L + 4, 80.6);
    under(x, R - 4, 81.2); pen(c.nombre, x + 2, 80.2, { maxWidth: R - x - 8 });
    x = lab('Dirección:', L + 4, 89.2);
    under(x, 196, 89.8); pen(c.direccion || '', x + 2, 88.8, { maxWidth: 196 - x - 4 }, 9.5);
    x = lab('R.U.C.:', 199, 89.2);
    under(x, R - 4, 89.8); pen(c.documento || '', x + 2, 88.8);
    x = lab('Nota de Remisión N°:', L + 4, 97.6);
    under(x, 196, 98.2); pen(p.remision || '', x + 2, 97.2);
    x = lab('Tel.:', 199, 97.6);
    under(x, R - 4, 98.2); pen(c.telefono || '', x + 2, 97.2);

    /* ===== Detalle ===== */
    const T = 103, HB = 116, RH = 6.5, NR = 7, RE = HB + RH * NR, B = RE + 8;
    const c1 = 30, c2 = 134, c3 = 166, c4 = 203, c5 = 242;
    doc.roundedRect(L, T, 277, B - T, 4, 4, 'S');
    doc.line(L, HB, R, HB);
    doc.line(c3, T + 6.5, R, T + 6.5);
    [c1, c2].forEach(cx_ => doc.line(cx_, T, cx_, RE));
    doc.line(c3, T, c3, B);
    [c4, c5].forEach(cx_ => doc.line(cx_, T + 6.5, cx_, B));
    for (let i = 1; i <= NR; i++) doc.line(L, HB + RH * i, R, HB + RH * i);

    font('helvetica', 'bold', 10, LINE);
    doc.text('CANT.', (L + c1) / 2, 111.3, { align: 'center' });
    doc.text('D E S C R I P C I Ó N', (c1 + c2) / 2, 111.3, { align: 'center' });
    doc.text('PRECIO', (c2 + c3) / 2, 108.6, { align: 'center' });
    doc.text('UNITARIO', (c2 + c3) / 2, 113.4, { align: 'center' });
    doc.text('VALOR DE VENTAS', (c3 + R) / 2, 108, { align: 'center' });
    doc.text('EXENTAS', (c3 + c4) / 2, 114, { align: 'center' });
    doc.text('IVA 5 %', (c4 + c5) / 2, 114, { align: 'center' });
    doc.text('IVA 10 %', (c5 + R) / 2, 114, { align: 'center' });

    const ry = HB + 4.6;
    font('helvetica', 'normal', 10.5, PEN);
    const desc = doc.splitTextToSize(s(p.concepto), c2 - c1 - 6).slice(0, NR);
    doc.text('1', (L + c1) / 2, ry, { align: 'center' });
    desc.forEach((l, i) => doc.text(l, c1 + 3, ry + RH * i));
    doc.text(num(k.total), c3 - 3, ry, { align: 'right' });
    if (k.exenta) doc.text(num(k.exenta), c4 - 3, ry, { align: 'right' });
    if (k.g5) doc.text(num(k.g5), c5 - 3, ry, { align: 'right' });
    if (k.g10) doc.text(num(k.g10), R - 3, ry, { align: 'right' });
    if (p.notas && desc.length < NR - 1) {
      font('helvetica', 'italic', 8.5, PEN);
      doc.splitTextToSize(s(p.notas), c2 - c1 - 6).slice(0, NR - desc.length - 1)
        .forEach((l, i) => doc.text(l, c1 + 3, ry + RH * (desc.length + i)));
    }
    if (p.estado === 'pagado') {
      const sy = HB + RH * 4 + 1.2;
      doc.setFillColor(22, 163, 74); doc.roundedRect(c1 + 30, sy, 50, RH * 2 + 0.6, 2, 2, 'F');
      font('helvetica', 'bold', 12, [255, 255, 255]); doc.text('PAGADO', c1 + 55, sy + 6, { align: 'center' });
      font('helvetica', 'normal', 7.5, [255, 255, 255]);
      doc.text(s(`${dmy(p.fechaPago)}${p.metodo ? ' - ' + p.metodo : ''}`), c1 + 55, sy + 10.6, { align: 'center' });
    }

    font('helvetica', 'normal', 11, LINE); doc.text('SUB - TOTALES', L + 4, B - 2.5);
    font('helvetica', 'normal', 10.5, PEN);
    doc.text(k.exenta ? num(k.exenta) : '', c4 - 3, B - 2.5, { align: 'right' });
    doc.text(k.g5 ? num(k.g5) : '', c5 - 3, B - 2.5, { align: 'right' });
    doc.text(k.g10 ? num(k.g10) : '', R - 3, B - 2.5, { align: 'right' });

    /* ===== Total y liquidación ===== */
    const TT = B + 3;
    doc.roundedRect(L, TT, 277, 29, 4, 4, 'S');
    font('helvetica', 'bold', 13.5, LINE); doc.text('TOTAL A PAGAR', L + 4, TT + 10);
    const mon = String(cfg.moneda || '');
    const esUsd = /u\$|usd|us\$|d[oó]lar/i.test(mon + ' ' + (cfg.monedaNombre || ''));
    font('helvetica', 'normal', 12.5, LINE); doc.text('GS.', 68, TT + 10); check(77.5, TT + 10.4, !esUsd);
    font('helvetica', 'normal', 12.5, LINE); doc.text('U$', 86, TT + 10); check(93.5, TT + 10.4, esUsd);
    font('helvetica', 'bold', 9, LINE); doc.text('(En Letras)', 104, TT + 9.5);
    dotted(122, 238, TT + 10.4);
    dotted(L + 2, R - 2, TT + 18);
    font('helvetica', 'normal', 8.8, PEN);
    const son = doc.splitTextToSize(s(totalEnLetras(k.total, cfg.monedaNombre)), 114);
    doc.text(son[0], 123, TT + 9.4);
    if (son.length > 1) doc.text(doc.splitTextToSize(son.slice(1).join(' '), 270)[0], L + 4, TT + 17);
    doc.roundedRect(241, TT + 3, 43, 10, 2, 2, 'S');
    font('helvetica', 'bold', 12.5, PEN); doc.text(num(k.total), 281, TT + 10, { align: 'right' });

    font('helvetica', 'bold', 11, LINE); x = L + 4;
    doc.text('LIQUIDACIÓN DEL IVA:(5%)', x, TT + 25.3);
    pen(num(k.iva5), x + doc.getTextWidth('LIQUIDACIÓN DEL IVA:(5%)') + 4, TT + 25.3);
    font('helvetica', 'bold', 11, LINE); doc.text('(10%)', 130, TT + 25.3); pen(num(k.iva10), 145, TT + 25.3);
    font('helvetica', 'bold', 11, LINE); doc.text('TOTAL IVA:', 215, TT + 25.3); pen(num(k.ivaTotal), R - 4, TT + 25.3, { align: 'right' });

    /* ===== Pie ===== */
    font('helvetica', 'normal', 6.8, LINE);
    if (cfg.leyenda) doc.text(doc.splitTextToSize(s(cfg.leyenda), 150), L + 1, TT + 33);
    const copias = s(cfg.pieCopias || 'Original: Cliente');
    doc.text(doc.splitTextToSize(copias, 120), R - 1, TT + 33, { align: 'right' });
    return doc;
  }

  /* ---------- Ticket 80 mm ---------- */
  function ticket(p, c, d, cfg, H) {
    const { jsPDF } = window.jspdf;
    const k = calc(p);
    const $ = v => s(H.money(v));
    const W = 80, M = 5, CX = W / 2, TW = W - M * 2;

    const draw = doc => {
      const font = (st, size, color = INK) => { doc.setFont('helvetica', st); doc.setFontSize(size); doc.setTextColor(...color); };
      const center = (t, y, lh = 4) => { const l = doc.splitTextToSize(s(t), TW); doc.text(l, CX, y, { align: 'center' }); return y + l.length * lh; };
      const row = (l, r, y) => { doc.text(s(l), M, y); doc.text(s(r), W - M, y, { align: 'right' }); return y + 4.4; };
      const sep = y => { doc.setLineDashPattern([0.8, 0.8], 0); doc.setDrawColor(170, 185, 196); doc.line(M, y, W - M, y); doc.setLineDashPattern([], 0); return y + 4.5; };

      let y = 6;
      if (cfg.logo || cfg.logo2) {
        const h = 16, both = cfg.logo && cfg.logo2;
        if (both) { fitImg(doc, cfg.logo, cfg.logoRatio, M, y, TW / 2 - 1, h, 'right'); fitImg(doc, cfg.logo2, cfg.logo2Ratio, CX + 1, y, TW / 2 - 1, h, 'left'); }
        else fitImg(doc, cfg.logo || cfg.logo2, cfg.logo ? cfg.logoRatio : cfg.logo2Ratio, M, y, TW, h);
        y += h + 2;
      }
      font('bold', 12, INK); y = center(cfg.razonSocial || cfg.empresa, y + 3, 5);
      font('normal', 7.5, MUT);
      if (cfg.eslogan) y = center(cfg.eslogan, y);
      font('normal', 6.8, MUT);
      if (cfg.actividad) String(cfg.actividad).split(/\n/).forEach(l => { y = center(l, y, 3.2); });
      font('bold', 7.5, INK);
      if (cfg.direccion) y = center(cfg.direccion, y + 0.6);
      if (cfg.ciudad) y = center(cfg.ciudad, y);
      font('normal', 6.5, MUT);
      if (cfg.matriz) y = center(cfg.matriz, y, 3.2);
      else if (cfg.telefono) y = center(`Tel: ${cfg.telefono}`, y);
      y = sep(y + 1);
      font('bold', 8.5, INK);
      if (cfg.timbrado) y = center(`TIMBRADO N°: ${cfg.timbrado}`, y + 0.5);
      font('normal', 7.5, INK);
      if (cfg.timbradoInicio) y = center(`Fecha Inicio Vigencia: ${dmy(cfg.timbradoInicio)}`, y);
      if (cfg.timbradoFin) y = center(`Fecha Fin Vigencia: ${dmy(cfg.timbradoFin)}`, y);
      font('bold', 9, INK);
      if (cfg.ruc) y = center(`R.U.C.: ${cfg.ruc}`, y, 4.4);
      y = sep(y + 1);

      font('bold', 10, ORA); y = center('TICKET', y + 1, 4.6);
      font('bold', 9.5); y = center(`N° ${d.numero}`, y, 5);
      font('normal', 8);
      y = row('Fecha de emisión:', dmy(d.fecha), y + 1);
      y = row('Condición:', d.condicion || 'Contado', y);
      if (d.condicion === 'Crédito') y = row('Vence:', dmy(p.vencimiento), y);
      y = sep(y);

      font('normal', 7.5, MUT); doc.text('Cliente', M, y); y += 4;
      font('bold', 8.5); const cn = doc.splitTextToSize(s(c.nombre), TW); doc.text(cn, M, y); y += cn.length * 4.2;
      font('normal', 8);
      if (c.documento) y = row('RUC / CI:', c.documento, y);
      if (c.telefono) y = row('Teléfono:', c.telefono, y);
      if (p.remision) y = row('Nota de remisión N°:', p.remision, y);
      y = sep(y);

      font('bold', 8.5); const ds = doc.splitTextToSize(s(p.concepto), TW); doc.text(ds, M, y); y += ds.length * 4.2;
      font('normal', 8);
      y = row(`1 x ${$(k.total)}   (${p.iva === 'exenta' ? 'Exenta' : 'IVA ' + (p.iva || '10') + '%'})`, $(k.total), y);
      y = sep(y + 1);

      font('bold', 12); doc.text('TOTAL', M, y + 2); doc.setTextColor(...ORA); doc.text($(k.total), W - M, y + 2, { align: 'right' });
      y += 8;
      font('normal', 7, MUT); y = center(`Son: ${totalEnLetras(k.total, cfg.monedaNombre)}`, y, 3.6);
      y += 2;
      font('normal', 8);
      if (k.exenta) y = row('Exentas:', $(k.exenta), y);
      if (k.g5) y = row('Gravadas 5%:', $(k.g5), y);
      if (k.g10) y = row('Gravadas 10%:', $(k.g10), y);
      y = row('IVA 5%:', $(k.iva5), y);
      y = row('IVA 10%:', $(k.iva10), y);
      font('bold', 8); y = row('Total IVA:', $(k.ivaTotal), y);

      if (p.estado === 'pagado') {
        y += 2;
        doc.setFillColor(...GREEN); doc.roundedRect(M, y, TW, 11, 2, 2, 'F');
        font('bold', 9.5, [255, 255, 255]); doc.text('PAGADO', CX, y + 4.8, { align: 'center' });
        font('normal', 7, [255, 255, 255]); doc.text(s(`${dmy(p.fechaPago)}${p.metodo ? ' - ' + p.metodo : ''}`), CX, y + 8.8, { align: 'center' });
        y += 15;
      } else y += 2;

      y = sep(y);
      font('normal', 7, MUT);
      if (cfg.leyenda) y = center(cfg.leyenda, y, 3.4) + 1;
      if (cfg.pieCopias) { font('normal', 6.5, MUT); y = center(cfg.pieCopias, y, 3.2) + 1; }
      font('bold', 8.5, SKY); y = center('¡Gracias por su preferencia!', y + 1, 4);
      return y;
    };

    const tmp = new jsPDF({ unit: 'mm', format: [W, 600] });
    const h = Math.max(draw(tmp) + 6, 90);
    const doc = new jsPDF({ unit: 'mm', format: [W, h] });
    doc.setProperties({ title: `Ticket ${d.numero}`, creator: s(cfg.empresa) });
    draw(doc);
    return doc;
  }

  function crear(tipo, ...args) { return tipo === 'ticket' ? ticket(...args) : a4(...args); }

  return { crear, calc, letras, totalEnLetras, disponible: () => !!(window.jspdf && window.jspdf.jsPDF) };
})();
