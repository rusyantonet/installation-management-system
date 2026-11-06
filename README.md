# Installation Management System (IMS)

Aplikasi web untuk mendokumentasikan instalasi perangkat pada unit kendaraan tambang, dari pencatatan di lapangan sampai laporan. Mendukung banyak project, akses per project, role bertingkat, riwayat penggantian perangkat, dashboard progres, import data lama, serta laporan PDF dan Excel.

Dibangun di atas **Google Sheets + Google Apps Script + Google Drive**, tanpa server sendiri dan tanpa framework frontend.

> Status: digunakan secara internal. Dokumentasi ini ditujukan untuk developer yang akan memasang, memelihara, atau mengembangkan aplikasi.

<!-- TODO: tambahkan tangkapan layar (gunakan data contoh, bukan data asli) -->
<!-- ![Dashboard](docs/images/dashboard.png) -->

## Daftar Isi

- [Fitur](#fitur)
- [Arsitektur](#arsitektur)
- [Struktur Repositori](#struktur-repositori)
- [Instalasi](#instalasi)
- [Konfigurasi](#konfigurasi)
- [Peran dan Hak Akses](#peran-dan-hak-akses)
- [Model Data](#model-data)
- [API Ringkas](#api-ringkas)
- [Import Data Lama](#import-data-lama)
- [Pengembangan](#pengembangan)
- [Update dan Deployment](#update-dan-deployment)
- [Keamanan](#keamanan)
- [Batasan](#batasan)
- [Roadmap](#roadmap)
- [Kontribusi](#kontribusi)
- [Lisensi](#lisensi)

## Fitur

**Pencatatan instalasi**
- Satu data instalasi per unit: status tiap perangkat (Installed atau Pending), serial number, dan foto dari kamera ponsel.
- Foto dikompres di browser (sisi terpanjang 1280 px) sebelum diunggah ke Google Drive.
- Perubahan serial number dibedakan antara **koreksi salah ketik** dan **penggantian perangkat** (dicatat di riwayat).

**Multi-project dan akses**
- Data dipisah per project (unit, device, instalasi, penggantian).
- Selain Admin, user hanya bisa login ke project yang ditentukan Admin.
- Empat role: Admin, Manager, Engineer, Viewer.

**Pemantauan dan pelaporan**
- Dashboard progres per project, per unit, dan per perangkat, serta perangkat yang paling sering diganti.
- Riwayat penggantian dengan pencarian dan filter tanggal.
- Export laporan **PDF** (rekap atau satu unit, opsional detail, foto, dan riwayat) dan **Excel**.

**Pengelolaan**
- Master Project, Master Unit, Master Device, dan User Management.
- **Import Data** (khusus Admin) dari CSV, dengan simulasi sebelum menyimpan dan tombol batalkan.
- **Panduan** di dalam aplikasi yang bisa diedit Admin. Semua artikel aktif juga bisa dibaca dari halaman login lewat tombol *Butuh bantuan?*.

## Arsitektur

```
Browser (Index.html)
   |  google.script.run.api(action, token, params)
   v
Code.gs  api()  ->  ROUTES[action]  ->  fungsi domain
   |                                  |
   |-- CacheService (token sesi)      |-- SpreadsheetApp (sheet = tabel)
   |-- LockService (operasi tulis)    |-- DriveApp (foto, file sementara)
   |                                  |-- DocumentApp / UrlFetchApp (PDF, Excel)
```

Prinsip utama:

- **Satu pintu masuk.** Semua aksi frontend lewat fungsi `api(action, token, p)`. Respons selalu `{ ok: true, data }` atau `{ ok: false, error }`.
- **Server adalah otoritas akses.** Pengecekan role di frontend hanya mengatur tampilan; setiap route divalidasi ulang di server.
- **Scoping per project.** Setiap request berjalan di bawah satu project aktif. Gunakan `prows_()` (bukan `rows_()`) untuk data milik project.

| Komponen | Teknologi |
|---|---|
| Backend | Google Apps Script (container-bound ke Google Sheet) |
| Database | Google Sheets (satu sheet per entitas) |
| File | Google Drive (foto instalasi) |
| Frontend | Satu file HTML, vanilla JS, tanpa build step |
| Sesi | Token UUID di CacheService (6 jam), password SHA-256 plus salt |
| Laporan | Google Docs ke PDF, Google Sheets ke XLSX |

## Struktur Repositori

```
.
├── Code.gs        # Seluruh logika backend
├── Index.html     # HTML, CSS, loader, dan blok patch frontend
├── README.md
└── docs/          # (opsional) dokumentasi tambahan dan gambar
```

Catatan tentang `Index.html`:

- Logika JS utama disimpan sebagai array `P` berisi string **base64 URL-safe**, lalu dieksekusi oleh loader di file yang sama.
- Fitur yang ditambahkan belakangan dipasang sebagai blok `<script>` terpisah sesudah loader, **dengan urutan**: patch Role, patch Panduan, patch Import. Urutan ini penting karena beberapa patch membungkus fungsi `start()` dan `go()`.
- Disarankan menyimpan JS utama sebagai `app.js` biasa di repositori dan meng-encode-nya saat build. Lihat [Pengembangan](#pengembangan).

## Instalasi

### Prasyarat

- Akun Google (gmail biasa atau Workspace). Jenis akun memengaruhi kuota harian Apps Script.
- Akses ke Google Sheets, Drive, dan Apps Script.

### Langkah

1. Buat Google Sheet kosong, lalu buka **Extensions, Apps Script**.
2. Buat file **`Code.gs`** dan tempel isi `Code.gs` dari repositori.
3. Buat file HTML bernama **`Index`** (persis, tanpa ekstensi di editor) dan tempel isi `Index.html` lengkap, termasuk semua blok patch.
4. Atur konstanta di bagian atas `Code.gs` (lihat [Konfigurasi](#konfigurasi)).
5. Jalankan fungsi **`setup()`** satu kali. Fungsi ini membuat semua sheet dan header, salt password, akun Admin awal, project default, device standar, dan artikel Panduan awal. Kredensial awal ditampilkan di Execution log. **Segera ganti password setelah login pertama.**
6. Jalankan **`authorizeReport()`** dan **`authorizeExcel()`** satu kali masing-masing, lalu setujui izin yang diminta.
7. **Deploy, New deployment, Web app.** Atur *Execute as* dan *Who has access* sesuai kebijakan Anda, lalu buka URL `/exec`.

> Aplikasi harus dibuka lewat URL `/exec` hasil deployment. Membukanya dari editor atau sebagai file lokal tidak akan berfungsi karena `google.script.run` tidak tersedia.

## Konfigurasi

Konstanta di bagian atas `Code.gs`:

| Konstanta | Fungsi |
|---|---|
| `APP_TITLE` | Judul tab browser |
| `REPORT_SUBTITLE` | Subjudul laporan cadangan bila nama project kosong |
| `PHOTO_FOLDER_NAME` | Nama folder Drive tujuan foto (dibuat otomatis) |
| `SESSION_SECONDS` | Masa berlaku sesi (maksimum 6 jam, batas CacheService) |
| `REQUIRE_PHOTO` | `true` untuk mewajibkan foto pada device Installed yang butuh foto |
| `LOGIN_BG_FILE_ID` | ID file gambar Drive untuk latar halaman login (di bawah 2,5 MB) |
| `REASONS` | Alasan penggantian: Rusak, Hilang, Upgrade, Lainnya |
| `MAX_REPORT_PHOTOS` | Maksimal foto per laporan PDF (30) |
| `DEFAULT_DEVICES` | Daftar device standar beserta flag butuh SN dan butuh foto |

Di `Index.html`: `APP_CREDIT` (teks kredit di footer) dan `LOGIN_BG_DARKEN` (kegelapan lapisan latar login).

## Peran dan Hak Akses

| Kemampuan | Admin | Manager | Engineer | Viewer |
|---|---|---|---|---|
| Project yang bisa dipilih saat login | Semua | Yang ditentukan Admin | Yang ditentukan Admin | Yang ditentukan Admin |
| Dashboard, Data Instalasi, Riwayat, Export, Panduan | Ya | Ya | Ya | Ya |
| Input dan edit instalasi, ganti perangkat | Ya | Ya | Ya | Tidak |
| Hapus data instalasi | Ya | Ya | Tidak | Tidak |
| Master Unit dan Master Device | Ya | Ya (project sendiri) | Tidak | Tidak |
| User Management | Semua akun | Akun di project aktif (hanya Engineer dan Viewer yang dapat diubah) | Tidak | Tidak |
| Master Project | Ya | Tidak | Tidak | Tidak |
| Import Data | Ya | Tidak | Tidak | Tidak |
| Kelola artikel Panduan | Ya | Tidak | Tidak | Tidak |

Flag pada tabel `ROUTES` di `Code.gs`:

- tanpa flag: semua role yang sudah login
- `edit`: semua kecuali Viewer
- `mgr`: Admin dan Manager
- `admin`: Admin saja
- `w`: operasi tulis (dikunci dengan `LockService`)

## Model Data

Setiap sheet memiliki baris header sesuai `SHEETS` di `Code.gs`. Semua kolom diformat sebagai **teks** agar serial number dan tanggal tidak diubah otomatis.

| Sheet | Kolom | Catatan |
|---|---|---|
| Projects | id, name, active, createdAt | |
| Users | id, username, name, passHash, role, active, createdAt, projectIds | `projectIds` dipisah koma, kosong untuk Admin |
| Units | id, unitNo, type, notes, active, projectId | Scoped per project |
| Devices | id, name, needSN, needPhoto, active, sort, projectId | Scoped per project |
| Installations | id, unitId, unitNo, date, remarks, details, createdBy, createdAt, updatedAt, projectId | `details` berisi JSON. Satu unit satu baris |
| Replacements | id, unitId, unitNo, deviceId, deviceName, date, oldSN, newSN, reason, note, photo, createdBy, createdAt, projectId | Scoped per project |
| Guide | id, title, body, roles, public, active, sort, updatedAt, updatedBy | Global. Kolom `roles` dan `public` tidak lagi memengaruhi tampilan |

Bentuk JSON pada kolom `details`:

```json
[ { "deviceId": "...", "name": "DMS Camera", "status": "Installed", "sn": "...", "photo": "<ID file Drive>" } ]
```

Jika menambah kolom di `SHEETS`, jalankan `setup()` lagi agar header sheet yang sudah ada diperbarui. Tanpa itu, nilai kolom baru hilang saat menyimpan.

## API Ringkas

Semua aksi dipanggil lewat `api(action, token, p)`.

| Kelompok | Aksi |
|---|---|
| Publik (tanpa token) | `publicProjects`, `publicGuide`, `loginBg`, `login`, `logout` |
| Semua role | `me`, `dashboard`, `formData`, `listInstalls`, `getInstall`, `listReplacements`, `generateReport`, `generateExcel`, `listGuide` |
| Bukan Viewer | `saveInstall`, `uploadPhoto`, `replaceDevice` |
| Admin dan Manager | `deleteInstall`, `listUnits`, `saveUnit`, `deleteUnit`, `listDevices`, `saveDevice`, `deleteDevice`, `listUsers`, `saveUser`, `deleteUser`, `assignableProjects` |
| Admin | `listProjects`, `saveProject`, `deleteProject`, `saveGuide`, `deleteGuide`, `importRun`, `importUndo` |

Menambah aksi baru: tulis fungsi domain, daftarkan di `ROUTES` dengan flag yang tepat, dan gunakan `prows_()` untuk data milik project.

## Import Data Lama

Menu **Import Data** (khusus Admin) mengimpor data dari CSV ke project yang sedang aktif.

1. Pilih jenis data: **Data Instalasi** (satu baris per unit) atau **Riwayat Penggantian**.
2. **Unduh template.** Template dibuat dari Master Device project aktif, sehingga nama kolom selalu cocok.
3. Isi dari data lama, simpan sebagai CSV (disarankan UTF-8). Pemisah koma, titik koma, dan tab dikenali otomatis.
4. Klik **Periksa data** untuk simulasi (tidak menulis apa pun). Perbaiki baris yang ditolak.
5. Klik **Impor sekarang**. Data hasil import diberi penanda `createdBy = Import <tanggal jam>`.
6. Jika salah, klik **Batalkan import ini** sebelum menutup halaman.

Aturan ringkas: nomor unit unik per project, tanggal `yyyy-mm-dd` atau `dd/mm/yyyy`, nama device harus sama persis dengan Master Device, dan alasan penggantian harus salah satu dari Rusak, Hilang, Upgrade, Lainnya. Batas 2000 baris dan 5 MB per file. **Backup Google Sheet sebelum import pertama.**

## Pengembangan

### Mengedit JS utama (base64)

JS utama tidak terbaca langsung di `Index.html`. Decode ke `app.js`, edit, lalu encode ulang.

```js
// DECODE: Index.html -> app.js
const fs = require('fs');
const html = fs.readFileSync('Index.html', 'utf8');
const start = html.indexOf('var P = [') + 'var P = ['.length;
const end = html.indexOf('];', start);
const parts = html.slice(start, end).split(',').map(s => s.trim().replace(/^'|'$/g, ''));
let b = parts.join('').split('-').join('+').split('_').join('/');
while (b.length % 4) b += '=';
fs.writeFileSync('app.js', Buffer.from(b, 'base64').toString('utf8'));
```

```js
// ENCODE: app.js -> potongan array P (tempel kembali ke Index.html)
const fs = require('fs');
const b64 = fs.readFileSync('app.js').toString('base64')
  .split('+').join('-').split('/').join('_').replace(/=+$/, '');
const lines = b64.match(/.{1,100}/g).map(l => `'${l}'`);
console.log(lines.join(',\n'));
```

### Konvensi

- Pesan dan label antarmuka dalam bahasa Indonesia.
- Setiap teks dinamis yang disisipkan ke `innerHTML` wajib melewati `esc()`.
- Operasi tulis harus lewat route bertanda `w`.
- Pengecekan role di frontend hanya untuk tampilan. Ulangi selalu di route server.
- Di frontend, role Manager sengaja ditampilkan sebagai `Admin` (role asli di `S.user.realRole`). Untuk memeriksa Admin sungguhan gunakan `!S.user.realRole && S.user.role === 'Admin'`.

### Pengujian

Belum ada tes otomatis. Gunakan checklist manual setiap kali mengubah akses atau data:

1. User non-Admin tidak bisa login ke project yang bukan miliknya.
2. Manager hanya melihat user di project aktif dan tidak melihat Admin.
3. Viewer tidak bisa menyimpan data (cek ditolak di server).
4. Simpan instalasi dua kali untuk unit yang sama tidak membuat data ganda.
5. Mengubah SN: *Koreksi* tidak membuat riwayat, *Penggantian* membuat riwayat.
6. Data satu project tidak muncul di project lain.
7. PDF dan Excel berhasil dibuat.
8. Import: simulasi, impor, impor ulang (harus dilewati), dan batalkan.

## Update dan Deployment

- Setiap perubahan kode memerlukan **Deploy, Manage deployments, New version** agar berlaku di URL Web App.
- Jika perubahan menambah sheet atau kolom, jalankan `setup()` lagi. Fungsi ini idempoten.
- Hapus versi deploy lama secara berkala. Apps Script membatasi jumlah versi per script.
- Sebelum mengubah apa pun, simpan salinan `Code.gs`, `Index.html`, dan ekspor Google Sheet.

### Memindahkan ke akun Google lain

- **Salin nilai `SALT`** dari Script Properties project lama ke project baru **sebelum** menjalankan `setup()`. Tanpa salt yang sama, semua password tidak berlaku.
- Foto di Drive harus ikut dipindahkan. ID file disimpan di sheet, dan salinan file mendapat ID baru.
- Akun baru harus men-deploy ulang, sehingga URL Web App berubah.
- Kuota Apps Script mengikuti akun yang menjalankan.

## Keamanan

- Password di-hash SHA-256 dengan salt global (satu putaran). Batasi siapa yang boleh mengedit Google Sheet dan Apps Script, karena editor dapat mengubah role atau membaca hash.
- Belum ada pembatasan percobaan login.
- `publicProjects` dan `publicGuide` dapat dipanggil tanpa login. **Jangan menulis data sensitif di artikel Panduan** (username, password, ID file, tautan internal).
- Foto dibagikan sebagai "siapa saja yang memiliki tautan" bila kebijakan domain mengizinkan.

### Sebelum mendorong ke GitHub

- [ ] Ganti `LOGIN_BG_FILE_ID` dengan placeholder.
- [ ] Ganti `REPORT_SUBTITLE` dan teks lain yang memuat nama perusahaan atau klien.
- [ ] Pastikan tidak ada URL Web App, ID spreadsheet, ID file Drive, atau kredensial di kode, komentar, dan tangkapan layar.
- [ ] Jangan pernah menyimpan nilai `SALT` di repositori.
- [ ] Gunakan data contoh untuk semua gambar dokumentasi.

## Batasan

Karena memakai Google Sheets dan Apps Script sebagai fondasi:

- Waktu eksekusi maksimal 6 menit per request. PDF dengan banyak foto menjadi yang paling berisiko, sehingga dibatasi 30 foto per laporan.
- Kuota harian berlaku untuk pembuatan dokumen, spreadsheet, dan URL Fetch, dan berbeda antara akun biasa dan Workspace. Lihat dokumentasi resmi Google untuk angka terbaru.
- Setiap request membaca sheet secara penuh, sehingga performa menurun saat data mencapai ribuan baris.
- Tidak ada mode offline dan tidak ada transaksi atomik antar sheet.
- Aplikasi bergantung pada satu akun Google pemilik.

Detail dan rencana migrasi (misalnya ke Firestore) tersedia di dokumentasi developer.

## Roadmap

- [ ] Simpan JS utama sebagai `app.js` plus skrip build ke `Index.html`
- [ ] Cache data master untuk mengurangi pembacaan sheet
- [ ] Pembatasan percobaan login dan hash password yang lebih kuat
- [ ] Dukungan tabel dan gambar di editor Panduan
- [ ] Evaluasi migrasi data ke database terkelola

## Kontribusi

1. Buat branch dari `main`.
2. Lakukan perubahan kecil dan terfokus, ikuti konvensi di bagian [Pengembangan](#pengembangan).
3. Uji dengan checklist manual di atas, termasuk akses antar role.
4. Ajukan pull request dengan deskripsi perubahan, bagian kode yang terpengaruh, dan cara mengujinya.

## Lisensi

Belum ditentukan. Tambahkan file `LICENSE` sebelum repositori dipublikasikan.

## Kredit

Developed by Rusyanto.
