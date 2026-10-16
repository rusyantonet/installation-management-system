/**
 * DOKUMENTASI INSTALASI PERANGKAT KENDARAAN TAMBANG
 * Google Apps Script (container-bound ke Google Sheet)
 * Langkah awal: jalankan fungsi setup() satu kali.
 */

const APP_TITLE = 'Dokumentasi Instalasi Unit';
const REPORT_SUBTITLE = 'MineSafeDrive - PT. Freeport Indonesia';   // teks di bawah judul laporan PDF
const PHOTO_FOLDER_NAME = 'Foto Instalasi Unit';
const SESSION_SECONDS = 6 * 3600;      // login berlaku 6 jam (maks CacheService)
const REQUIRE_PHOTO = false;           // ubah true jika foto wajib saat status Installed

const SHEETS = {
  Users:         ['id', 'username', 'name', 'passHash', 'role', 'active', 'createdAt'],
  Units:         ['id', 'unitNo', 'type', 'notes', 'active'],
  Devices:       ['id', 'name', 'needSN', 'needPhoto', 'active', 'sort'],
  Installations: ['id', 'unitId', 'unitNo', 'date', 'remarks', 'details', 'createdBy', 'createdAt', 'updatedAt'],
  Replacements:  ['id', 'unitId', 'unitNo', 'deviceId', 'deviceName', 'date', 'oldSN', 'newSN', 'reason', 'note', 'photo', 'createdBy', 'createdAt']
};
const REASONS = ['Rusak', 'Hilang', 'Upgrade', 'Lainnya'];

const DEFAULT_DEVICES = [
  ['DMS Camera', 1, 1], ['ADAS Camera', 1, 1], ['INCAB Camera', 1, 1], ['GPIO Box', 1, 1],
  ['Seat Vibrator', 0, 0], ['Buzzer', 0, 0], ['Strobe Lamp', 0, 0], ['GPS Antenna', 0, 0],
  ['GSM Antenna', 0, 0], ['Wifi Antenna', 0, 0], ['Bluetooth Antenna', 0, 0],
  ['Source Power', 0, 0], ['SIM Card', 1, 0], ['SSD', 0, 0]
];

/* ============ SETUP (jalankan sekali dari editor) ============ */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(name => {
    let sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const h = SHEETS[name];
    sh.getRange(1, 1, sh.getMaxRows(), h.length).setNumberFormat('@'); // semua kolom teks
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#e8a317');
    sh.setFrozenRows(1);
  });
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SALT')) props.setProperty('SALT', Utilities.getUuid());

  if (!rows_('Users').length) {
    save_('Users', { username: 'admin', name: 'Administrator', passHash: hash_('admin123'),
                     role: 'Admin', active: true, createdAt: new Date().toISOString() });
  }
  if (!rows_('Devices').length) {
    DEFAULT_DEVICES.forEach((d, i) => save_('Devices', { name: d[0], needSN: !!d[1], needPhoto: !!d[2], active: true, sort: i + 1 }));
  }
  const ss0 = ss.getSheetByName('Sheet1') || ss.getSheetByName('Sheet 1');
  if (ss0 && ss.getSheets().length > 1) ss.deleteSheet(ss0);
  Logger.log('Setup selesai. Login awal: admin / admin123 (segera ganti password).');
}

/* ============ WEB APP ============ */
function doGet() {
  try {
    const out = HtmlService.createHtmlOutputFromFile('Index');
    if (out.getContent().trim().toLowerCase().indexOf('<!doctype html') !== 0)
      throw new Error('Isi file Index salah. File Index harus berupa HTML dan diawali <!DOCTYPE html> (tempel isi Index.html).');
    return out.setTitle(APP_TITLE)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (e) {
    const msg = String(e.message).slice(0, 300).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return HtmlService.createHtmlOutput('<h3>Gagal memuat aplikasi</h3><p>' + msg + '</p>');
  }
}

/* ============ HELPER DATA ============ */
function bool_(v) { return v === true || String(v).toLowerCase() === 'true'; }
function hash_(pw) {
  const salt = PropertiesService.getScriptProperties().getProperty('SALT') || '';
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pw, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const h = SHEETS[name];
    sh.getRange(1, 1, sh.getMaxRows(), h.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#e8a317');
    sh.setFrozenRows(1);
  }
  return sh;
}
function norm_(k, v, tz) {
  if (v instanceof Date) return k === 'date' ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v.toISOString();
  return v;
}
function rows_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const v = sheet_(name).getDataRange().getValues();
  const h = v.shift();
  return v.filter(r => r[0] !== '').map((r, i) => {
    const o = { _row: i + 2 };
    h.forEach((k, j) => o[k] = norm_(k, r[j], tz));
    return o;
  });
}
function save_(name, obj) {
  const sh = sheet_(name);
  const h = SHEETS[name];
  const toRow = o => h.map(k => (o[k] === undefined || o[k] === null) ? '' : String(o[k]));
  if (!obj.id) {
    obj.id = Utilities.getUuid();
    sh.getRange(sh.getLastRow() + 1, 1, 1, h.length).setNumberFormat('@').setValues([toRow(obj)]);
  } else {
    const ex = rows_(name).find(r => r.id === obj.id);
    if (!ex) throw new Error('Data tidak ditemukan');
    obj = Object.assign({}, ex, obj);
    sh.getRange(ex._row, 1, 1, h.length).setNumberFormat('@').setValues([toRow(obj)]);
  }
  return obj;
}
function del_(name, id) {
  const ex = rows_(name).find(r => r.id === id);
  if (!ex) throw new Error('Data tidak ditemukan');
  sheet_(name).deleteRow(ex._row);
}
function natural_(a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true }); }

/* ============ AUTH ============ */
function login_(p) {
  const un = String(p.username || '').trim().toLowerCase();
  const u = rows_('Users').find(x => String(x.username).toLowerCase() === un);
  if (!u || !bool_(u.active) || u.passHash !== hash_(String(p.password || '')))
    throw new Error('Username atau password salah, atau akun nonaktif.');
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('t_' + token, u.id, SESSION_SECONDS);
  return { token: token, user: pubUser_(u) };
}
function pubUser_(u) { return { id: u.id, username: u.username, name: u.name, role: u.role, active: bool_(u.active) }; }
function auth_(token) {
  const id = token && CacheService.getScriptCache().get('t_' + token);
  const u = id && rows_('Users').find(x => x.id === id);
  if (!u || !bool_(u.active)) throw new Error('Sesi berakhir, silakan login kembali.');
  return u;
}

/* ============ ROUTER (satu pintu untuk semua aksi) ============ */
// admin:true = hanya Admin | w:true = operasi tulis (dikunci agar tidak bentrok)
const ROUTES = {
  me:            { fn: (p, u) => pubUser_(u) },
  dashboard:     { fn: () => dashboard_() },
  formData:      { fn: () => formData_() },
  listInstalls:  { fn: () => listInstalls_() },
  getInstall:    { fn: p => getInstall_(p) },
  saveInstall:   { fn: (p, u) => saveInstall_(p, u), w: true , edit: true },
  deleteInstall: { fn: p => del_('Installations', p.id), w: true, admin: true },
  uploadPhoto:   { fn: p => uploadPhoto_(p) , edit: true },
  replaceDevice: { fn: (p, u) => replaceDevice_(p, u), w: true, edit: true },
  listReplacements: { fn: p => listReplacements_(p) },
  generateReport: { fn: (p, u) => generateReport_(p, u) },
  generateExcel: { fn: (p, u) => generateExcel_(p, u) },
  listUnits:     { fn: () => rows_('Units').sort((a, b) => natural_(a.unitNo, b.unitNo)).map(unitOut_), admin: true },
  saveUnit:      { fn: p => saveUnit_(p), w: true, admin: true },
  deleteUnit:    { fn: p => deleteUnit_(p), w: true, admin: true },
  listDevices:   { fn: () => rows_('Devices').sort((a, b) => a.sort - b.sort).map(deviceOut_), admin: true },
  saveDevice:    { fn: p => saveDevice_(p), w: true, admin: true },
  deleteDevice:  { fn: p => del_('Devices', p.id), w: true, admin: true },
  listUsers:     { fn: () => rows_('Users').map(pubUser_), admin: true },
  saveUser:      { fn: (p, u) => saveUser_(p, u), w: true, admin: true },
  deleteUser:    { fn: (p, u) => deleteUser_(p, u), w: true, admin: true }
};

function api(action, token, p) {
  let lock = null;
  try {
    p = p || {};
    if (action === 'login') return { ok: true, data: login_(p) };
    if (action === 'logout') { CacheService.getScriptCache().remove('t_' + token); return { ok: true }; }
    const u = auth_(token);
    const r = ROUTES[action];
    if (!r) throw new Error('Aksi tidak dikenal');
    if (r.admin && u.role !== 'Admin') throw new Error('Akses ditolak: khusus Admin.');
    if (r.edit && u.role === 'Viewer') throw new Error('Akses ditolak: akun Viewer hanya bisa melihat data.');
    if (r.w) { lock = LockService.getScriptLock(); lock.waitLock(20000); }
    const d = r.fn(p, u);
    return { ok: true, data: d === undefined ? null : JSON.parse(JSON.stringify(d)) };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    if (lock) lock.releaseLock();
  }
}

/* ============ MASTER ============ */
function unitOut_(u) { return { id: u.id, unitNo: u.unitNo, type: u.type, notes: u.notes, active: bool_(u.active) }; }
function deviceOut_(d) { return { id: d.id, name: d.name, needSN: bool_(d.needSN), needPhoto: bool_(d.needPhoto), active: bool_(d.active), sort: Number(d.sort) || 0 }; }

function saveUnit_(p) {
  const no = String(p.unitNo || '').trim();
  if (!no) throw new Error('Nomor unit wajib diisi');
  if (rows_('Units').some(x => x.id !== p.id && String(x.unitNo).toLowerCase() === no.toLowerCase()))
    throw new Error('Nomor unit sudah ada');
  return save_('Units', { id: p.id, unitNo: no, type: p.type || '', notes: p.notes || '', active: !!p.active }).id;
}
function deleteUnit_(p) {
  if (rows_('Installations').some(i => i.unitId === p.id))
    throw new Error('Unit sudah punya data instalasi. Nonaktifkan saja, atau hapus data instalasinya dulu.');
  del_('Units', p.id);
}
function saveDevice_(p) {
  const name = String(p.name || '').trim();
  if (!name) throw new Error('Nama device wajib diisi');
  const all = rows_('Devices');
  if (all.some(x => x.id !== p.id && String(x.name).toLowerCase() === name.toLowerCase()))
    throw new Error('Nama device sudah ada');
  const sort = p.id ? undefined : (all.reduce((m, x) => Math.max(m, Number(x.sort) || 0), 0) + 1);
  return save_('Devices', { id: p.id, name: name, needSN: !!p.needSN, needPhoto: !!p.needPhoto, active: !!p.active, sort: sort }).id;
}
function saveUser_(p, me) {
  const un = String(p.username || '').trim().toLowerCase();
  if (!un || !String(p.name || '').trim()) throw new Error('Username dan nama wajib diisi');
  if (!['Admin', 'Engineer', 'Viewer'].includes(p.role)) throw new Error('Role tidak valid');
  const all = rows_('Users');
  if (all.some(x => x.id !== p.id && String(x.username).toLowerCase() === un)) throw new Error('Username sudah dipakai');
  if (!p.id && !p.password) throw new Error('Password wajib diisi untuk user baru');
  if (p.password && String(p.password).length < 6) throw new Error('Password minimal 6 karakter');
  if (p.id === me.id && (!p.active || p.role !== 'Admin')) throw new Error('Anda tidak bisa menonaktifkan / menurunkan role akun sendiri');
  const o = { id: p.id, username: un, name: String(p.name).trim(), role: p.role, active: !!p.active };
  if (p.password) o.passHash = hash_(String(p.password));
  if (!p.id) o.createdAt = new Date().toISOString();
  return save_('Users', o).id;
}
function deleteUser_(p, me) {
  if (p.id === me.id) throw new Error('Anda tidak bisa menghapus akun sendiri');
  del_('Users', p.id);
}

/* ============ INSTALASI ============ */
function formData_() {
  return {
    units: rows_('Units').filter(u => bool_(u.active)).sort((a, b) => natural_(a.unitNo, b.unitNo)).map(unitOut_),
    devices: rows_('Devices').filter(d => bool_(d.active)).sort((a, b) => a.sort - b.sort).map(deviceOut_),
    doneUnitIds: rows_('Installations').map(i => i.unitId)
  };
}
function instOut_(i) {
  const d = JSON.parse(i.details || '[]');
  const n = d.filter(x => x.status === 'Installed').length;
  return { id: i.id, unitId: i.unitId, unitNo: i.unitNo, date: i.date, remarks: i.remarks, details: d,
           installed: n, total: d.length, pct: d.length ? Math.round(n * 100 / d.length) : 0,
           createdBy: i.createdBy, updatedAt: i.updatedAt };
}
function listInstalls_() {
  return rows_('Installations').map(instOut_).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
function getInstall_(p) {
  const i = rows_('Installations').find(x => x.unitId === p.unitId);
  return i ? instOut_(i) : null;
}
function saveInstall_(p, u) {
  const unit = rows_('Units').find(x => x.id === p.unitId);
  if (!unit) throw new Error('Pilih nomor unit terlebih dahulu');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) throw new Error('Tanggal instalasi wajib diisi');
  const devs = {};
  rows_('Devices').forEach(d => devs[d.id] = d);
  const details = (p.details || []).map(x => {
    const d = devs[x.deviceId];
    if (!d) throw new Error('Device tidak ditemukan');
    if (!['Installed', 'Pending'].includes(x.status)) throw new Error('Pilih status untuk ' + d.name);
    const sn = String(x.sn || '').trim();
    if (x.status === 'Installed' && bool_(d.needSN) && !sn) throw new Error('Serial Number ' + d.name + ' wajib diisi');
    if (x.status === 'Installed' && bool_(d.needPhoto) && REQUIRE_PHOTO && !x.photo) throw new Error('Foto ' + d.name + ' wajib diunggah');
    return { deviceId: d.id, name: d.name, status: x.status,
             sn: bool_(d.needSN) ? sn : '', photo: bool_(d.needPhoto) ? (x.photo || '') : '' };
  });
  if (!details.length) throw new Error('Tidak ada device untuk disimpan');
  const now = new Date().toISOString();
  const ex = rows_('Installations').find(i => i.unitId === p.unitId); // satu unit = satu data (upsert)
  const obj = Object.assign(ex ? { id: ex.id } : { createdBy: u.name, createdAt: now }, {
    unitId: unit.id, unitNo: unit.unitNo, date: p.date, remarks: p.remarks || '',
    details: JSON.stringify(details), updatedAt: now
  });
  const oldD = ex ? JSON.parse(ex.details || '[]') : [];
  const repl = [];
  (p.changes || []).forEach(ch => {
    if (ch.type !== 'replace') return;
    const nd = details.find(x => x.deviceId === ch.deviceId), od = oldD.find(x => x.deviceId === ch.deviceId);
    if (!nd || !od || od.status !== 'Installed' || nd.status !== 'Installed' || !od.sn || nd.sn === od.sn) return;
    if (!REASONS.includes(ch.reason)) throw new Error('Pilih alasan penggantian untuk ' + nd.name);
    repl.push({ nd: nd, od: od, ch: ch });
  });
  const saved = save_('Installations', obj);
  repl.forEach(x => addRepl_(unit, x.nd, {
    date: /^\d{4}-\d{2}-\d{2}$/.test(x.ch.date || '') ? x.ch.date : p.date,
    oldSN: x.od.sn, newSN: x.nd.sn, reason: x.ch.reason, note: x.ch.note, photo: x.nd.photo
  }, u, now));
  return { id: saved.id };
}
/* ============ RIWAYAT PENGGANTIAN ============ */
function addRepl_(unit, entry, o, u, now) {
  save_('Replacements', { unitId: unit.id, unitNo: unit.unitNo, deviceId: entry.deviceId, deviceName: entry.name,
    date: o.date, oldSN: o.oldSN || '', newSN: o.newSN || '', reason: o.reason, note: o.note || '',
    photo: o.photo || '', createdBy: u.name, createdAt: now });
}
function listReplacements_(p) {
  return rows_('Replacements').filter(r => !p.unitId || r.unitId === p.unitId).map(r => ({
      id: r.id, unitId: r.unitId, unitNo: r.unitNo, deviceName: r.deviceName, date: r.date, oldSN: r.oldSN,
      newSN: r.newSN, reason: r.reason, note: r.note, photo: r.photo, createdBy: r.createdBy, createdAt: r.createdAt }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
}
function replaceDevice_(p, u) {
  const unit = rows_('Units').find(x => x.id === p.unitId);
  if (!unit) throw new Error('Unit tidak ditemukan');
  const ins = rows_('Installations').find(i => i.unitId === p.unitId);
  if (!ins) throw new Error('Unit belum punya data instalasi');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) throw new Error('Tanggal penggantian wajib diisi');
  if (!REASONS.includes(p.reason)) throw new Error('Pilih alasan penggantian');
  const details = JSON.parse(ins.details || '[]');
  const e = details.find(x => x.deviceId === p.deviceId);
  if (!e) throw new Error('Device tidak ada pada unit ini');
  if (e.status !== 'Installed') throw new Error('Hanya device berstatus Installed yang bisa diganti');
  const dev = rows_('Devices').find(d => d.id === p.deviceId);
  const needSN = dev ? bool_(dev.needSN) : !!e.sn;
  const newSN = String(p.newSN || '').trim();
  if (needSN) {
    if (!newSN) throw new Error('Serial Number baru wajib diisi');
    if (newSN === e.sn) throw new Error('Serial Number baru sama dengan yang lama');
  }
  const now = new Date().toISOString();
  addRepl_(unit, e, { date: p.date, oldSN: e.sn, newSN: needSN ? newSN : '', reason: p.reason, note: p.note, photo: p.photo }, u, now);
  e.sn = needSN ? newSN : '';
  if (dev && bool_(dev.needPhoto)) e.photo = p.photo || '';
  save_('Installations', { id: ins.id, details: JSON.stringify(details), updatedAt: now });
  return { done: true };
}
function uploadPhoto_(p) {
  const it = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(PHOTO_FOLDER_NAME);
  const name = String(p.name || 'foto').replace(/[^\w.\-]/g, '_') + '_' + Date.now() + '.jpg';
  const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(p.data), 'image/jpeg', name));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* kebijakan domain */ }
  return { id: file.getId() };
}

/* ============ LAPORAN PDF ============ */
// Jalankan authorizeReport() SEKALI dari editor untuk memberi izin Google Docs/Drive.
function authorizeReport() {
  const d = DocumentApp.create('tmp-authorize');
  DriveApp.getFileById(d.getId()).setTrashed(true);
  Logger.log('Izin laporan PDF OK');
}
const MAX_REPORT_PHOTOS = 30;
const MON_ = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const RC_ = { ink: '#1d2327', mut: '#6b767c', amber: '#b87d00', head: '#22292e', pend: '#b45309', line: '#cfd4cc' };
function fmtD_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? (+m[3]) + ' ' + MON_[+m[2] - 1] + ' ' + m[1] : (s || '-');
}
function para_(body, text, size, bold, color, after, before) {
  const p = body.appendParagraph(String(text) || ' ');
  p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  const t = p.editAsText();
  t.setFontFamily('Arial'); t.setFontSize(size); t.setBold(!!bold); t.setForegroundColor(color || RC_.ink);
  p.setSpacingAfter(after == null ? 4 : after);
  p.setSpacingBefore(before || 0);
  return p;
}
function tbl_(body, header, rows, widths) {
  const data = [header].concat(rows.length ? rows : [header.map((_, i) => i === 0 ? 'Tidak ada data' : '-')]);
  const t = body.appendTable(data);
  const st = {};
  st[DocumentApp.Attribute.FONT_FAMILY] = 'Arial';
  st[DocumentApp.Attribute.FONT_SIZE] = 9;
  st[DocumentApp.Attribute.BOLD] = false;
  st[DocumentApp.Attribute.FOREGROUND_COLOR] = RC_.ink;
  st[DocumentApp.Attribute.BORDER_COLOR] = RC_.line;
  st[DocumentApp.Attribute.BORDER_WIDTH] = 0.5;
  t.setAttributes(st);
  widths.forEach((w, i) => t.setColumnWidth(i, w));
  if (data.length * header.length <= 120) {            // tabel kecil: set ukuran font per sel agar pasti
    for (let r = 1; r < data.length; r++) for (let c = 0; c < header.length; c++) t.getCell(r, c).editAsText().setFontSize(9).setBold(false).setForegroundColor(RC_.ink);
  }
  for (let c = 0; c < header.length; c++) {
    const cell = t.getRow(0).getCell(c);
    cell.setBackgroundColor(RC_.head);
    cell.editAsText().setFontSize(9).setForegroundColor('#ffffff').setBold(true);
  }
  return t;
}
function generateReport_(p, u) {
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const isUnit = p.scope === 'unit';
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const from = re.test(p.from || '') ? p.from : '', to = re.test(p.to || '') ? p.to : '';
  if (from && to && from > to) throw new Error('Tanggal awal tidak boleh setelah tanggal akhir');

  const allUnits = rows_('Units');
  const allIns = rows_('Installations').map(instOut_);
  let ins;
  if (isUnit) {
    ins = allIns.filter(i => i.unitId === p.unitId);
    if (!ins.length) throw new Error('Unit belum punya data instalasi');
  } else {
    ins = allIns.filter(i => (!from || i.date >= from) && (!to || i.date <= to));
    if (!ins.length) throw new Error('Tidak ada data instalasi pada rentang tanggal tersebut');
  }
  ins.sort((a, b) => natural_(a.unitNo, b.unitNo));
  const typeOf = {};
  allUnits.forEach(x => typeOf[x.id] = x.type);

  const detail = isUnit || !!p.detail, photos = detail && !!p.photos, history = !!p.history;
  let nPhotos = 0;
  if (photos) ins.forEach(i => i.details.forEach(d => { if (d.photo) nPhotos++; }));
  if (nPhotos > MAX_REPORT_PHOTOS)
    throw new Error('Foto terlalu banyak (' + nPhotos + '). Maksimal ' + MAX_REPORT_PHOTOS + ' foto per laporan. Persempit rentang tanggal, matikan opsi foto, atau buat laporan per unit.');
  let repl = [];
  if (history) {
    const ids = {};
    ins.forEach(i => ids[i.unitId] = 1);
    repl = listReplacements_({}).filter(r => ids[r.unitId] && (isUnit || ((!from || r.date >= from) && (!to || r.date <= to))));
  }

  const stamp = Utilities.formatDate(new Date(), tz, 'yyyyMMdd_HHmm');
  const label = isUnit ? String(ins[0].unitNo).replace(/[^\w\-]/g, '_') : 'Rekap';
  const name = 'Laporan_Instalasi_' + label + '_' + stamp + '.pdf';
  const doc = DocumentApp.create(name.replace(/\.pdf$/, ''));
  const id = doc.getId();
  try {
    const body = doc.getBody();
    body.setPageWidth(595.28); body.setPageHeight(841.89);
    body.setMarginTop(40); body.setMarginBottom(40); body.setMarginLeft(36); body.setMarginRight(36);

    const p0 = body.getChild(0).asParagraph();
    p0.setText('LAPORAN INSTALASI PERANGKAT');
    const t0 = p0.editAsText();
    t0.setFontFamily('Arial'); t0.setFontSize(20); t0.setBold(true); t0.setForegroundColor(RC_.head);
    p0.setSpacingAfter(2);
    para_(body, REPORT_SUBTITLE, 12, false, RC_.amber, 2);
    if (!isUnit) para_(body, 'Periode tanggal instalasi: ' + (from || to ? (from ? fmtD_(from) : 'awal') + ' s/d ' + (to ? fmtD_(to) : 'sekarang') : 'Semua periode'), 9, false, RC_.mut, 8);

    if (!isUnit) {
      // Ringkasan dihitung dari seluruh unit aktif (sama dengan Dashboard)
      const active = allUnits.filter(x => bool_(x.active));
      const activeIds = {};
      active.forEach(x => activeIds[x.id] = 1);
      const insAct = allIns.filter(i => activeIds[i.unitId]);
      const complete = insAct.filter(i => i.pct === 100).length;
      const pending = insAct.length - complete;
      const notYet = active.length - insAct.length;
      const overall = active.length ? Math.round(insAct.reduce((s, i) => s + i.pct, 0) / active.length) : 0;

      para_(body, 'Ringkasan', 13, true, RC_.head, 4, 8);
      tbl_(body, ['Ringkasan', 'Jumlah'], [
        ['Progress keseluruhan', overall + '%'],
        ['Jumlah unit aktif', String(active.length)],
        ['Jumlah instalasi lengkap (100%)', String(complete)],
        ['Jumlah instalasi pending (sebagian device pending)', String(pending)],
        ['Jumlah belum diinstal', String(notYet)]
      ], [330, 193]);
      if (from || to) para_(body, 'Catatan: ringkasan mencakup seluruh unit aktif tanpa dibatasi periode. Tabel rekap per unit mengikuti periode di atas.', 8, false, RC_.mut, 4, 4);

      para_(body, 'Rekap per Unit', 13, true, RC_.head, 4, 10);
      tbl_(body, ['No', 'Unit', 'Tipe', 'Tanggal', 'Progress', 'Device Pending'],
        ins.map((i, k) => [String(k + 1), String(i.unitNo), typeOf[i.unitId] || '-', fmtD_(i.date),
          i.installed + '/' + i.total + ' (' + i.pct + '%)',
          i.details.filter(d => d.status === 'Pending').map(d => d.name).join(', ') || '-']),
        [28, 70, 80, 70, 75, 200]);
    }

    if (detail) {
      ins.forEach((i, k) => {
        // Rekap: setiap unit di lembaran baru. Laporan satu unit: tanpa page break di awal.
        const brk = !isUnit || k > 0;
        if (brk) body.appendPageBreak();

        para_(body, String(i.unitNo) + (typeOf[i.unitId] ? ' \u00B7 ' + typeOf[i.unitId] : ''), 14, true, RC_.head, 2, brk ? 0 : 14);
        para_(body, 'Tanggal instalasi: ' + fmtD_(i.date) + ' \u00B7 Progress: ' + i.installed + '/' + i.total + ' (' + i.pct + '%)', 9, false, RC_.mut, 8);
        const dt = tbl_(body, ['Device', 'Status', 'Serial Number'],
          i.details.map(d => [d.name, d.status, d.sn || '-']), [190, 90, 243]);
        i.details.forEach((d, r) => {
          if (d.status === 'Pending') dt.getCell(r + 1, 1).editAsText().setForegroundColor(RC_.pend).setBold(true);
        });

        // Riwayat penggantian: tepat di bawah detail instalasi
        if (history) {
          para_(body, 'Riwayat Penggantian', 11, true, RC_.head, 4, 10);
          const hs = repl.filter(r => r.unitId === i.unitId);
          if (!hs.length) para_(body, 'Tidak ada penggantian perangkat.', 9, false, RC_.mut, 4);
          else tbl_(body, ['Tanggal', 'Device', 'SN Lama', 'SN Baru', 'Alasan'],
            hs.map(r => [fmtD_(r.date), r.deviceName, r.oldSN || '-', r.newSN || '-',
              r.reason + (r.note ? ' - ' + r.note : '') + ' (oleh ' + r.createdBy + ')']), [66, 104, 80, 80, 193]);
        }

        // Foto instalasi: selalu di lembaran baru
        const list = photos ? i.details.filter(d => d.photo) : [];
        if (list.length) {
          body.appendPageBreak();
          para_(body, 'Foto Instalasi', 11, true, RC_.head, 4, 0);
          const grid = [];
          for (let r = 0; r < Math.ceil(list.length / 2); r++) grid.push(['', '']);
          const gt = body.appendTable(grid);
          gt.setBorderWidth(0);
          gt.setColumnWidth(0, 261); gt.setColumnWidth(1, 261);
          list.forEach((d, n) => {
            const cell = gt.getCell(Math.floor(n / 2), n % 2);
            cell.setText(d.name + (d.sn ? ' - SN ' + d.sn : ''));
            cell.editAsText().setFontSize(9).setBold(true);
            try {
              const img = cell.appendImage(DriveApp.getFileById(d.photo).getBlob());
              const w = img.getWidth(), h = img.getHeight();
              img.setWidth(240).setHeight(Math.round(h * 240 / w));
            } catch (e) { cell.appendParagraph('(foto tidak tersedia)'); }
          });
        }
      });
    } else if (history) {
      para_(body, 'Riwayat Penggantian Perangkat', 13, true, RC_.head, 4, 12);
      if (!repl.length) para_(body, 'Tidak ada penggantian perangkat pada laporan ini.', 9, false, RC_.mut, 4);
      else tbl_(body, ['Tanggal', 'Unit', 'Device', 'SN Lama', 'SN Baru', 'Alasan'],
        repl.map(r => [fmtD_(r.date), String(r.unitNo), r.deviceName, r.oldSN || '-', r.newSN || '-',
          r.reason + (r.note ? ' - ' + r.note : '') + ' (oleh ' + r.createdBy + ')']), [62, 60, 92, 74, 74, 161]);
    }

    doc.saveAndClose();
    const bytes = DriveApp.getFileById(id).getAs('application/pdf').getBytes();
    if (bytes.length > 24 * 1024 * 1024) throw new Error('Ukuran PDF terlalu besar. Kurangi jumlah unit atau matikan opsi foto.');
    return { name: name, base64: Utilities.base64Encode(bytes), size: bytes.length, units: ins.length, photos: nPhotos };
  } finally {
    try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* abaikan */ }
  }
}

/* ============ DASHBOARD ============ */
function dashboard_() {
  const units = rows_('Units').filter(u => bool_(u.active)).sort((a, b) => natural_(a.unitNo, b.unitNo));
  const ids = {};
  units.forEach(u => ids[u.id] = 1);
  const byUnit = {};
  rows_('Installations').filter(i => ids[i.unitId]).forEach(i => byUnit[i.unitId] = instOut_(i));

  const list = units.map(u => {
    const b = byUnit[u.id];
    return { unitNo: u.unitNo, type: u.type, date: b ? b.date : '', installed: b ? b.installed : 0,
             total: b ? b.total : 0, pct: b ? b.pct : 0, started: !!b };
  });
  const dev = {};
  rows_('Devices').filter(d => bool_(d.active)).sort((a, b) => a.sort - b.sort).forEach(d => dev[d.name] = 0);
  Object.keys(byUnit).forEach(k => byUnit[k].details.forEach(x => {
    if (x.status === 'Installed' && x.name in dev) dev[x.name]++;
  }));
  const rp = rows_('Replacements'), rc = {};
  rp.forEach(r => rc[r.deviceName] = (rc[r.deviceName] || 0) + 1);
  const total = units.length;
  const complete = list.filter(x => x.started && x.pct === 100).length;
  const started = list.filter(x => x.started).length;
  return {
    total: total, started: started, complete: complete, partial: started - complete, notStarted: total - started,
    overall: total ? Math.round(list.reduce((s, x) => s + x.pct, 0) / total) : 0,
    devices: Object.keys(dev).map(n => ({ name: n, installed: dev[n] })),
    units: list,
    replTotal: rp.length,
    replByDevice: Object.keys(rc).map(n => ({ name: n, count: rc[n] })).sort((a, b) => b.count - a.count).slice(0, 5)
  };
}

/* ============ EXPORT EXCEL ============ */
// Jalankan authorizeExcel() SEKALI dari editor untuk memberi izin Spreadsheet/Drive/UrlFetch.
function authorizeExcel() {
  const ss = SpreadsheetApp.create('tmp-authorize-xlsx');
  const r = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx',
    { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  DriveApp.getFileById(ss.getId()).setTrashed(true);
  Logger.log('Izin Excel OK (HTTP ' + r.getResponseCode() + ')');
}
const XLSX_SN_DEVICES = ['DMS Camera', 'ADAS Camera', 'INCAB Camera', 'GPIO Box', 'SIM Card'];

function writeSheet_(sh, header, rows, widths) {
  const n = header.length;
  sh.getRange(1, 1, Math.max(rows.length + 1, 2), n).setNumberFormat('@');   // semua teks (SN tidak berubah format)
  sh.getRange(1, 1, 1, n).setValues([header])
    .setFontWeight('bold').setBackground('#e8a317').setFontColor('#1d2327').setVerticalAlignment('middle');
  if (rows.length) {
    sh.getRange(2, 1, rows.length, n).setValues(rows).setVerticalAlignment('top');
    sh.getRange(1, 1, rows.length + 1, n).createFilter();
  }
  sh.setFrozenRows(1);
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
}

function generateExcel_(p, u) {
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const from = re.test(p.from || '') ? p.from : '', to = re.test(p.to || '') ? p.to : '';
  if (from && to && from > to) throw new Error('Tanggal awal tidak boleh setelah tanggal akhir');

  const typeOf = {};
  rows_('Units').forEach(x => typeOf[x.id] = x.type);
  const ins = rows_('Installations').map(instOut_)
    .filter(i => (!from || i.date >= from) && (!to || i.date <= to))
    .sort((a, b) => natural_(a.unitNo, b.unitNo));
  if (!ins.length) throw new Error('Tidak ada data instalasi pada rentang tanggal tersebut');

  // Sheet 1: Detail Instalasi (satu baris per unit)
  const head1 = ['No', 'Unit', 'Tipe', 'Tanggal'].concat(XLSX_SN_DEVICES.map(n => 'SN ' + n), ['Status Instalasi', 'Remarks']);
  const rows1 = ins.map((i, k) => [String(k + 1), String(i.unitNo), typeOf[i.unitId] || '-', fmtD_(i.date)]
    .concat(XLSX_SN_DEVICES.map(n => {
      const d = i.details.find(x => x.name === n);
      return !d ? '-' : (d.sn || (d.status === 'Pending' ? 'Pending' : '-'));
    }))
    .concat([i.pct === 100 ? 'Lengkap' : 'Pending', i.remarks || '']));

  // Sheet 2: Riwayat Penggantian
  const withHist = p.history !== false;
  let rows2 = [];
  if (withHist) {
    const ids = {};
    ins.forEach(i => ids[i.unitId] = 1);
    rows2 = listReplacements_({})
      .filter(r => ids[r.unitId] && (!from || r.date >= from) && (!to || r.date <= to))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || natural_(a.unitNo, b.unitNo))
      .map((r, k) => [String(k + 1), fmtD_(r.date), String(r.unitNo), r.deviceName, r.oldSN || '-', r.newSN || '-',
                      r.reason, r.createdBy, r.note || '']);
  }

  const stamp = Utilities.formatDate(new Date(), tz, 'yyyyMMdd_HHmm');
  const name = 'Data_Instalasi_' + stamp + '.xlsx';
  const ss = SpreadsheetApp.create(name.replace(/\.xlsx$/, ''));
  const id = ss.getId();
  try {
    const s1 = ss.getSheets()[0];
    s1.setName('Detail Instalasi');
    writeSheet_(s1, head1, rows1, [40, 90, 110, 95, 140, 140, 140, 140, 140, 120, 240]);
    if (withHist) {
      const s2 = ss.insertSheet('Riwayat Penggantian');
      writeSheet_(s2, ['No', 'Tanggal', 'Unit', 'Device', 'SN Lama', 'SN Baru', 'Alasan', 'Oleh', 'Catatan'],
        rows2, [40, 95, 90, 140, 140, 140, 90, 120, 240]);
    }
    SpreadsheetApp.flush();
    const res = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('Gagal membuat file Excel (HTTP ' + res.getResponseCode() + '). Pastikan authorizeExcel() sudah dijalankan.');
    const bytes = res.getBlob().getBytes();
    return { name: name, base64: Utilities.base64Encode(bytes), size: bytes.length, units: rows1.length, repl: rows2.length, withHist: withHist };
  } finally {
    try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* abaikan */ }
  }
}
