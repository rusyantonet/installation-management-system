# Dokumentasi Developer: Installation Management System (IMS)

Dokumen teknis untuk tim developer. Mencakup arsitektur, model data, hak akses, katalog API, alur kerja utama, cara deploy, dan cara mengembangkan fitur. Status kode: checkpoint awal ditambah pembaruan role (Manager dan akses per project) dan modul Panduan (wiki).

## 1. Ringkasan

IMS adalah aplikasi web untuk mendokumentasikan instalasi perangkat (kamera, GPIO Box, antena, dan lain-lain) pada unit kendaraan tambang, dengan dukungan banyak project.

| Aspek | Keterangan |
| --- | --- |
| Platform | Google Apps Script (container-bound ke Google Sheet), dipublikasikan sebagai Web App |
| Database | Google Sheet (satu sheet per entitas) |
| Penyimpanan file | Google Drive (foto instalasi) |
| Frontend | Satu file HTML (vanilla JS, tanpa framework dan tanpa build step) |
| Backend | Satu file Code.gs, dengan satu fungsi pintu masuk `api(action, token, p)` |
| Autentikasi | Token sesi di CacheService, password di-hash SHA-256 plus salt |
| Laporan | PDF (via Google Docs) dan Excel (via ekspor Google Sheets) |
| Bahasa antarmuka | Indonesia |

Fitur utama: multi-project, role (Admin, Manager, Engineer, Viewer), input dan riwayat instalasi per unit, penggantian perangkat, dashboard progres, export PDF dan Excel, serta modul Panduan yang bisa diedit Admin dan dibaca publik dari halaman login.

## 2. Arsitektur

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

Prinsip desain:

- **Satu pintu masuk.** Semua aksi frontend memanggil fungsi `api`. Tidak ada fungsi server lain yang dipanggil langsung dari browser, kecuali yang tidak dipakai UI.
- **Server adalah satu-satunya otoritas akses.** Frontend hanya mengatur tampilan. Setiap route divalidasi ulang di server.
- **Project scoping.** Setiap request berjalan di bawah satu project aktif (`CUR_PROJECT`). Data entitas bertipe scoped selalu difilter berdasarkan project tersebut.
- **Respons seragam.** `{ ok: true, data }` atau `{ ok: false, error }`. Tidak ada exception yang bocor ke klien.

## 3. Struktur File

| File | Isi |
| --- | --- |
| `Code.gs` | Seluruh logika backend: setup, router, auth, domain, laporan, dashboard, panduan |
| `Index.html` | HTML, CSS, dan loader script. Logika JS utama disimpan sebagai array `P` berisi string base64 URL-safe |
| Blok patch di `Index.html` | Dua blok `<script>` tambahan sesudah loader: patch Role dan patch Panduan |

Nama file HTML di editor Apps Script harus persis **Index** (dibaca oleh `doGet` melalui `createHtmlOutputFromFile('Index')`). `doGet` juga memvalidasi bahwa isinya diawali `<!DOCTYPE html`; jika tidak, halaman menampilkan pesan kesalahan.

## 4. Konfigurasi

Konstanta di bagian atas Code.gs:

| Konstanta | Fungsi |
| --- | --- |
| `APP_TITLE` | Judul tab browser |
| `REPORT_SUBTITLE` | Subjudul laporan cadangan bila nama project kosong |
| `PHOTO_FOLDER_NAME` | Nama folder Drive tujuan foto (dibuat otomatis jika belum ada) |
| `SESSION_SECONDS` | Masa berlaku sesi. 6 jam adalah batas maksimum CacheService |
| `REQUIRE_PHOTO` | `true` untuk mewajibkan foto pada device berstatus Installed yang butuh foto |
| `LOGIN_BG_FILE_ID` | ID file gambar Drive untuk latar halaman login (di bawah 2,5 MB) |
| `REASONS` | Alasan penggantian: Rusak, Hilang, Upgrade, Lainnya |
| `ROLES` | Admin, Manager, Engineer, Viewer |
| `GUIDE_ROLES` | Dipertahankan untuk kompatibilitas data. Panduan kini dibaca publik (lihat bagian 11) |
| `MAX_REPORT_PHOTOS` | Maksimal 30 foto per laporan PDF |
| `DEFAULT_DEVICES` | Daftar 14 device standar beserta flag butuh SN dan butuh foto |

Index.html memiliki `APP_CREDIT` (teks kredit) dan `LOGIN_BG_DARKEN` (kegelapan lapisan latar login).

Identitas lingkungan seperti ID file Drive, URL Web App, dan ID spreadsheet tidak boleh ditulis di dokumen publik atau repositori terbuka.

## 5. Model Data

Setiap sheet memiliki baris header (didefinisikan di `SHEETS`) dan **seluruh kolom diformat sebagai teks** (`@`), agar serial number dan tanggal tidak diubah otomatis oleh Sheets. Fungsi `save_` mengubah semua nilai menjadi string saat menulis.

| Sheet | Kolom | Catatan |
| --- | --- | --- |
| Projects | id, name, active, createdAt | Master project |
| Users | id, username, name, passHash, role, active, createdAt, projectIds | `projectIds` berisi id project dipisah koma. Kosong untuk Admin |
| Units | id, unitNo, type, notes, active, projectId | Scoped per project |
| Devices | id, name, needSN, needPhoto, active, sort, projectId | Scoped. Master device dimiliki tiap project |
| Installations | id, unitId, unitNo, date, remarks, details, createdBy, createdAt, updatedAt, projectId | `details` berisi JSON. Satu unit satu baris |
| Replacements | id, unitId, unitNo, deviceId, deviceName, date, oldSN, newSN, reason, note, photo, createdBy, createdAt, projectId | Scoped |
| Guide | id, title, body, roles, public, active, sort, updatedAt, updatedBy | Global (tidak per project) |

Sheet yang dipisah per project terdaftar di `SCOPED_`: Units, Devices, Installations, Replacements.

Bentuk JSON pada kolom `details`:

```
[ { deviceId, name, status: 'Installed' | 'Pending', sn, photo } ]
```

Catatan penting model data:

- `photo` menyimpan ID file Drive, bukan URL.
- `name` pada details adalah salinan nama device saat disimpan, sehingga laporan lama tetap terbaca meski nama device diubah.
- Tanggal disimpan sebagai teks `yyyy-MM-dd`. Fungsi `norm_` menormalkan nilai Date dari Sheets memakai zona waktu spreadsheet.
- Nilai boolean disimpan sebagai string. Selalu bacanya lewat `bool_()`.
- ID dibuat dengan `Utilities.getUuid()`.
- Kolom `public` pada Guide masih ada di sheet tetapi tidak lagi memengaruhi tampilan.

## 6. Autentikasi, Sesi, dan Hak Akses

### 6.1 Login

1. Frontend memanggil `publicProjects` (tanpa token) untuk mengisi dropdown project.
2. `login_` mencari user berdasarkan username (tidak peka huruf besar), memeriksa status aktif, lalu membandingkan hash password.
3. Server memeriksa project: harus ada, aktif, dan `canAccessProject_(user, project)` benar. Admin selalu lolos, role lain harus punya project tersebut di `projectIds`.
4. Server membuat token UUID dan menyimpan dua entri di CacheService: `t_<token>` berisi id user, dan `p_<token>` berisi id project, keduanya dengan TTL `SESSION_SECONDS`.
5. Frontend menyimpan token di `sessionStorage` (kunci `tk`) dan project terakhir di `localStorage` (kunci `lastProject`).

### 6.2 Pemeriksaan di setiap request

Urutan di `api()`:

1. Aksi publik diproses tanpa token: `publicProjects`, `loginBg`, `login`, `logout`, `publicGuide`.
2. `auth_(token)` membaca id user dari cache, memuat user dari sheet Users (data selalu segar), dan menolak jika user tidak ada atau nonaktif.
3. Project diambil dari `p_<token>`, lalu diperiksa ulang dengan `canAccessProject_`. Akibatnya pencabutan akses project berlaku langsung pada request berikutnya.
4. Variabel global `CUR_PROJECT` dan `CUR_PROJECT_NAME` diisi. Setiap eksekusi Apps Script terisolasi, jadi nilai ini aman dari tabrakan antar request.
5. Flag route diperiksa: `admin`, `mgr`, `edit`.
6. Route bertanda `w` mengambil `LockService.getScriptLock()` dengan `waitLock(20000)` sebelum menulis.

### 6.3 Matriks hak akses

| Flag route | Siapa yang lolos |
| --- | --- |
| (tanpa flag) | Semua role yang sudah login |
| `edit` | Semua kecuali Viewer |
| `mgr` | Admin dan Manager |
| `admin` | Admin saja |

| Kemampuan | Admin | Manager | Engineer | Viewer |
| --- | --- | --- | --- | --- |
| Dashboard, Data Instalasi, Riwayat, Export, Panduan | Ya | Ya | Ya | Ya |
| Input dan edit instalasi, ganti perangkat, unggah foto | Ya | Ya | Ya | Tidak |
| Hapus instalasi | Ya | Ya | Tidak | Tidak |
| Master Unit dan Master Device | Ya | Ya | Tidak | Tidak |
| User Management | Semua akun | Akun di project aktif, hanya Engineer dan Viewer yang dapat diubah | Tidak | Tidak |
| Master Project | Ya | Tidak | Tidak | Tidak |
| Kelola artikel Panduan | Ya | Tidak | Tidak | Tidak |

Aturan User Management di `saveUser_` dan `deleteUser_`:

- Tidak ada user yang bisa menonaktifkan dirinya sendiri atau mengubah role sendiri, dan tidak bisa menghapus akun sendiri.
- Role selain Admin wajib punya minimal satu project. Role Admin menyimpan `projectIds` kosong.
- Manager hanya dapat membuat atau mengubah role Engineer dan Viewer. Akun Admin dan Manager lain tidak bisa diubah Manager.
- Manager hanya melihat user yang `projectIds`-nya memuat project aktif, dan tidak pernah melihat Admin.
- Saat Manager mengedit user, project di luar milik Manager dipertahankan, sedangkan project milik Manager diganti sesuai pilihan.
- Saat Manager menghapus user: jika user masih punya project lain, user hanya dikeluarkan dari project aktif; jika tidak, akun dihapus.

## 7. Katalog API

Semua aksi dipanggil lewat `api(action, token, p)`. Kolom Flag memakai notasi: **w** = dikunci tulis, **edit** = bukan Viewer, **mgr** = Admin atau Manager, **admin** = Admin saja.

| Aksi | Flag | Fungsi |
| --- | --- | --- |
| publicProjects | publik | Daftar project aktif untuk dropdown login |
| loginBg | publik | Gambar latar login dalam bentuk data URL |
| publicGuide | publik | Semua artikel Panduan yang aktif |
| login, logout | publik | Mulai dan akhiri sesi |
| me | - | Profil user dan project aktif |
| dashboard | - | Ringkasan progres project |
| formData | - | Unit aktif, device aktif, dan id unit yang sudah punya data |
| listInstalls, getInstall | - | Daftar instalasi, atau satu instalasi per unit |
| saveInstall | w, edit | Simpan atau perbarui instalasi (upsert per unit) beserta penggantian |
| deleteInstall | w, mgr | Hapus instalasi |
| uploadPhoto | edit | Unggah foto JPEG ke Drive, mengembalikan id file |
| replaceDevice | w, edit | Catat penggantian satu perangkat |
| listReplacements | - | Riwayat penggantian, dapat difilter per unit |
| generateReport | - | Buat PDF (base64) |
| generateExcel | - | Buat Excel (base64) |
| listGuide | - | Artikel Panduan. Admin melihat semua termasuk draft |
| saveGuide, deleteGuide | w, admin | Kelola artikel Panduan |
| listProjects, saveProject, deleteProject | admin (tulis juga w) | Master project |
| assignableProjects | mgr | Project yang boleh ditetapkan ke user (Admin: semua, Manager: miliknya) |
| listUnits, saveUnit, deleteUnit | mgr (tulis juga w) | Master unit |
| listDevices, saveDevice, deleteDevice | mgr (tulis juga w) | Master device |
| listUsers, saveUser, deleteUser | mgr (tulis juga w) | User management |

Tanggal pada parameter memakai format `yyyy-MM-dd`. Hasil `fn` selalu dilewatkan `JSON.parse(JSON.stringify(...))` agar aman melintasi `google.script.run`.

## 8. Backend: Modul dan Aturan Penting

### 8.1 Helper data

| Fungsi | Peran |
| --- | --- |
| `sheet_(name)` | Mengambil sheet, membuatnya lengkap dengan header jika belum ada |
| `rows_(name)` | Membaca seluruh sheet menjadi array objek (dengan `_row` sebagai nomor baris) |
| `prows_(name)` | Seperti `rows_`, tetapi hanya baris milik `CUR_PROJECT` |
| `save_(name, obj)` | Insert jika tanpa `id`, update jika ada `id` (menggabungkan dengan baris lama). Menyuntikkan `projectId` untuk sheet scoped |
| `del_(name, id)` | Hapus baris. Untuk sheet scoped, menolak data milik project lain |
| `bool_`, `norm_`, `natural_` | Konversi boolean, normalisasi tanggal, dan urut alami (nomor unit) |

### 8.2 Aturan yang sering terlewat

- **Selalu gunakan `prows_` untuk entitas scoped.** `rows_` mengembalikan data semua project. Memakainya untuk sheet scoped akan membocorkan data antar project.
- **Update parsial.** `save_` dengan `id` menggabungkan objek lama dan baru. Kolom yang tidak dikirim tetap utuh. Ini dimanfaatkan, misalnya, saat mengubah hanya `projectIds`.
- **Header harus cocok dengan `SHEETS`.** Jika sebuah kolom ditambahkan ke `SHEETS` tetapi sheet lama belum diperbarui (dengan menjalankan `setup()`), nilai kolom itu akan hilang saat menyimpan.
- **Satu unit, satu instalasi.** `saveInstall_` melakukan upsert berdasarkan `unitId` di dalam project aktif.
- **Validasi di server.** Contohnya: status hanya Installed atau Pending, SN wajib untuk device Installed yang butuh SN, dan alasan penggantian harus ada di `REASONS`.
- **Penghapusan dijaga.** Unit tidak bisa dihapus jika punya instalasi. Project tidak bisa dihapus jika punya unit, instalasi, atau penggantian, dan project aktif tidak bisa dihapus atau dinonaktifkan.
- **Project baru** menyiapkan master device sendiri: standar, kosong, atau salinan dari project lain (`seedDevices_`, `copyDevices_`).

### 8.3 Penggantian perangkat

Ada dua jalur yang menghasilkan baris di Replacements:

1. **Dari form instalasi** (`saveInstall_`): jika SN suatu device Installed berubah, klien mengirim `changes` berisi keputusan tiap device, yaitu `fix` (koreksi, tanpa riwayat) atau `replace` (dengan alasan, tanggal, catatan). Hanya entri bertipe `replace` yang dicatat.
2. **Dari tombol Ganti Perangkat** (`replaceDevice_`): menulis riwayat dan langsung memperbarui `details` pada instalasi unit.

## 9. Frontend

### 9.1 Struktur

`Index.html` berisi markup halaman login dan kerangka aplikasi, CSS (variabel warna di `:root`), loader, dan dua blok patch. Logika utama aplikasi disimpan sebagai array `P` berisi string base64 URL-safe. Loader menggabungkannya, mengubah `-` menjadi `+` dan `_` menjadi `/`, menambah padding `=`, lalu mengeksekusinya lewat elemen `<script>` dan `atob`.

**Konsekuensi:** JS utama tidak terbaca di dalam file. Alasan awal pemakaian encoding ini tidak terdokumentasi; konfirmasikan dengan pembuat aplikasi sebelum mengubah mekanismenya. Lihat bagian 9.5 untuk cara mendecode dan mengenkode ulang.

### 9.2 Global penting (hasil decode)

Catatan: daftar ini disusun dari isi kode yang di-decode. Verifikasi terhadap hasil decode di repositori Anda.

| Nama | Fungsi |
| --- | --- |
| `$`, `esc` | `querySelector` singkat, dan escape HTML (wajib untuk setiap teks yang disisipkan ke `innerHTML`) |
| `S` | State: `token`, `user`, `page`, `pre` (unit yang dipilih sebelumnya) |
| `call(action, p)` | Membungkus `google.script.run.api`; mengembalikan Promise, menolak jika `ok` salah |
| `toast`, `fail` | Notifikasi; `fail` memanggil `logout(true)` jika pesan memuat Sesi berakhir |
| `modal(html, wide)`, `confirmBox(msg)` | Dialog |
| `MENU` | Daftar menu: `[id, label, ikon, adminOnly, sembunyiUntukViewer]` |
| `allowed()` | Menyaring MENU berdasarkan `S.user.role` |
| `start()`, `go(id)` | Menampilkan aplikasi setelah login, dan berpindah halaman |
| `PAGES` | Peta id halaman ke fungsi render: dashboard, input, installs, history, report (dan guide dari patch) |
| `CRUD`, `pageCrud(id)` | Halaman CRUD generik untuk projects, units, devices (users digantikan patch) |
| `compress(file)` | Memperkecil foto (sisi terpanjang 1280 px, JPEG kualitas 0,8) sebelum unggah |
| `askChanges`, `replaceModal` | Dialog perubahan SN dan dialog Ganti Perangkat |

Halaman Export membuat PDF dan Excel dari respons base64 menjadi Blob URL.

### 9.3 Patch Role

Blok `<script>` pertama sesudah loader:

- **Manager diperlakukan sebagai Admin di tampilan.** Wrapper `start()` mengubah `S.user.role` dari Manager menjadi Admin, dan menyimpan role asli di `S.user.realRole`. Alasannya: kode terdecode memiliki beberapa pengecekan `role === 'Admin'` untuk menampilkan menu dan tombol (misalnya tombol Hapus instalasi). Dengan cara ini kode terdecode tidak perlu diubah.
- **Menu Master Project disembunyikan untuk Manager** (tombol dihapus dari sidebar setelah `start()`).
- **Halaman User Management baru**: `delete CRUD.users` lalu `PAGES.users` mendefinisikan halaman khusus dengan pilihan project (checkbox), aturan role per pembuat, dan tombol Hapus atau Keluarkan.

**Aturan untuk kode baru:** untuk memeriksa admin sungguhan di frontend, gunakan `!S.user.realRole && S.user.role === 'Admin'`. Jangan mengandalkan `S.user.role` saja. Pengecekan frontend hanya mengatur tampilan; keamanan tetap ada di server.

### 9.4 Patch Panduan

Blok `<script>` kedua:

- Menambah menu **Panduan** (`MENU.push`) dan halaman `PAGES.guide` dengan daftar isi, pencarian, dan konten.
- Tombol **Butuh bantuan?** di halaman login memanggil `publicGuide` dan menampilkan semua artikel aktif dalam dialog (accordion).
- Admin mendapat tombol Tambah, Edit, Hapus, dan Pratinjau. Form edit memuat judul, isi, urutan, dan status Aktif, serta peringatan bahwa semua artikel aktif bersifat publik.
- Fungsi `md()` adalah mini-markdown. **Semua teks di-escape terlebih dahulu**, baru diberi format. Sintaks: `## Judul`, `- poin`, `1. langkah`, `**tebal**`, dan kode inline dengan backtick. Tabel belum didukung.

### 9.5 Decode dan encode ulang JS utama

Simpan JS utama sebagai file teks biasa (misalnya `app.js`) dan jadikan itu sumber kebenaran. Contoh skrip Node.js:

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
// ENCODE: app.js -> potongan array P (tempel ke Index.html)
const fs = require('fs');
const b64 = fs.readFileSync('app.js').toString('base64')
  .split('+').join('-').split('/').join('_').replace(/=+$/, '');
const lines = b64.match(/.{1,100}/g).map(l => `'${l}'`);
console.log(lines.join(',\n'));
```

Jika skrip decode tidak menghasilkan JS yang valid, periksa dulu format array `P` di file Anda; skrip mengasumsikan setiap elemen adalah string bertanda kutip tunggal yang dipisah koma. Setelah mengubah `app.js`, enkode ulang, ganti isi array `P`, lalu deploy versi baru.

## 10. Alur Utama

### 10.1 Simpan instalasi

1. Klien memilih unit; jika unit sudah punya data, `getInstall` mengisi form dan menyimpan salinan nilai asli untuk membandingkan SN.
2. Foto dikompres di klien, lalu dikirim lewat `uploadPhoto`, dan klien memegang id file Drive.
3. Saat simpan, jika SN device Installed berubah, klien menampilkan `askChanges` dan mengirim keputusan lewat `changes`.
4. `saveInstall_` memvalidasi tiap device, melakukan upsert, lalu menulis baris penggantian untuk keputusan bertipe `replace`.

### 10.2 Dashboard

`dashboard_` hanya menghitung unit aktif. Progres keseluruhan adalah rata-rata persentase tiap unit, dengan unit yang belum punya data dihitung 0. Ringkasan di laporan PDF memakai rumus yang sama.

## 11. Modul Panduan

- Disimpan di sheet **Guide** dan bersifat **global** (tidak per project).
- `publicGuide_` mengembalikan semua artikel aktif, diurutkan menurut `sort` lalu judul. `listGuide_` mengembalikan artikel aktif ke semua role, dan semua artikel (termasuk draft) ke Admin.
- `saveGuide_` memvalidasi judul (maks 120 karakter) dan isi (wajib, maks 40.000 karakter), serta menetapkan urutan otomatis jika tidak diisi.
- `setup()` mengisi artikel awal (`GUIDE_SEED`) jika sheet masih kosong. Perubahan `GUIDE_SEED` tidak mengubah artikel yang sudah ada.
- **Kebijakan isi:** semua artikel aktif dapat dibaca tanpa login. Jangan menulis username, password, id file, tautan internal, atau data sensitif lain. Untuk menyimpan draft, matikan status Aktif.

## 12. Pelaporan

### 12.1 PDF (`generateReport_`)

1. Membuat Google Doc sementara, mengisinya (judul, ringkasan, tabel, foto), lalu menyimpan dan menutup dokumen.
2. Mengekspor ke PDF lewat `DriveApp.getFileById(id).getAs('application/pdf')`, lalu memindahkan Doc sementara ke tempat sampah di blok `finally`.
3. Mengembalikan base64 beserta metadata. Batas ukuran 24 MB, dan batas foto 30 per laporan.

Cakupan: satu unit (selalu dengan detail) atau rekap semua unit dengan filter tanggal. Ringkasan rekap mencakup seluruh unit aktif tanpa dibatasi periode. Waktu pembuatan sekitar 10 sampai 60 detik, dan makin lama jika foto banyak.

### 12.2 Excel (`generateExcel_`)

1. Membuat spreadsheet sementara dengan sheet Detail Instalasi (satu baris per unit, kolom SN dibuat dari device aktif yang butuh SN, ditambah device lama yang masih punya SN tersimpan) dan opsional Riwayat Penggantian.
2. Mengekspor ke XLSX lewat `UrlFetchApp` ke URL ekspor Google Sheets dengan `ScriptApp.getOAuthToken()`, lalu membuang file sementara.

Kedua fitur memerlukan otorisasi satu kali (`authorizeReport()` dan `authorizeExcel()`).

## 13. Setup dan Deployment

### 13.1 Instalasi awal

1. Buat Google Sheet kosong, lalu buka Extensions, Apps Script.
2. Buat file `Code.gs` (isi backend) dan file HTML bernama `Index` (isi `Index.html` lengkap termasuk blok patch).
3. Jalankan `setup()` satu kali. Fungsi ini membuat semua sheet dan header, salt password, akun Admin awal, project default, device standar, dan artikel Panduan awal. **Ganti password akun awal segera setelah login pertama.**
4. Jalankan `authorizeReport()` dan `authorizeExcel()` satu kali masing-masing, dan setujui izin yang diminta.
5. Deploy: Deploy, New deployment, tipe Web app. Tentukan nilai Execute as dan Who has access sesuai kebijakan, dan catat nilainya di dokumen internal tim.

### 13.2 Setiap perubahan

- Setiap perubahan kode memerlukan **Deploy, Manage deployments, New version** agar berlaku di URL Web App.
- Jika perubahan menambah sheet atau kolom di `SHEETS`, jalankan `setup()` lagi. Fungsi ini idempoten: ia menulis ulang header, menambah sheet yang belum ada, dan melakukan migrasi (misalnya user non-Admin lama yang belum punya project diberi akses ke semua project).
- Halaman harus dibuka lewat URL Web App (`/exec`), bukan dari editor atau file lokal. Kalau tidak, `google.script.run` tidak tersedia dan halaman menampilkan pesan diagnostik.

## 14. Cara Menambah Fitur

### 14.1 Aksi API baru

1. Tulis fungsi domain di Code.gs. Gunakan `prows_` untuk data scoped dan lempar `Error` berpesan jelas (pesan ini akan tampil sebagai toast).
2. Daftarkan di `ROUTES` dengan flag yang tepat: `w` bila menulis, `edit` jika Viewer tidak boleh, `mgr` atau `admin` bila perlu pembatasan role.
3. Jika menambah kolom, ubah `SHEETS` lalu jalankan `setup()`.

### 14.2 Halaman baru

1. Tambahkan fungsi `PAGES.namaHalaman = async () => {...}` yang mengisi `#main`. Gunakan `call()` untuk data, `esc()` untuk semua teks dinamis, `fail()` untuk error.
2. Tambahkan entri `MENU.push([id, label, ikon, adminOnly, sembunyiUntukViewer])`. Ingat bahwa flag adminOnly membandingkan dengan `S.user.role === 'Admin'` (Manager lolos berkat patch role).
3. Jangan menaruh logika akses di frontend saja. Ulangi di route server.

### 14.3 Konvensi

- Pesan kesalahan dan label antarmuka dalam bahasa Indonesia.
- Seluruh interpolasi ke `innerHTML` harus melewati `esc()`.
- Operasi tulis harus lewat route bertanda `w` agar terkunci.
- Jangan memakai `localStorage` untuk data sensitif. Token sesi memakai `sessionStorage`.

## 15. Keamanan dan Batasan Saat Ini

| Area | Kondisi | Saran |
| --- | --- | --- |
| Hash password | SHA-256 plus satu salt global, satu putaran | Cukup untuk skala internal, tetapi lemah terhadap brute force offline bila sheet bocor. Batasi akses edit ke Sheet dan Apps Script |
| Pembatasan percobaan login | Belum ada | Pertimbangkan penghitung gagal login di CacheService |
| Aksi publik | `publicProjects`, `publicGuide`, `loginBg` dapat dipanggil tanpa login | Daftar nama project terbuka. Pertimbangkan menyaringnya jika nama project sensitif |
| Panduan publik | Semua artikel aktif terbaca tanpa login | Kebijakan isi di bagian 11 wajib dipatuhi |
| Foto di Drive | Dibagikan sebagai siapa saja yang memiliki tautan (jika kebijakan domain mengizinkan) | Tautan tidak dapat ditebak tetapi bersifat publik bagi yang memegangnya |
| Pengecekan role di frontend | Hanya untuk tampilan | Jangan menambah aksi tanpa flag di server |
| Token sesi | UUID di CacheService, TTL 6 jam, tanpa pencabutan terpusat | Logout menghapus token. Menonaktifkan user berlaku di request berikutnya |
| Eksekusi akun | Backend berjalan dengan akun pemilik atau sesuai pengaturan deployment | Dokumentasikan akun yang dipakai |

Hak akses Apps Script dan Google Sheet adalah celah terbesar: siapa pun yang dapat mengedit sheet dapat mengubah role atau membaca hash password. Batasi daftar editor.

## 16. Performa dan Kuota

- Setiap request membaca seluruh sheet Users dan Projects (untuk auth), ditambah sheet yang dipakai fungsinya, memakai `getDataRange().getValues()`. Biaya naik seiring jumlah baris, terutama Installations karena kolom `details` berisi JSON.
- Belum ada cache untuk data master. Bila lambat, kandidat optimasi: cache Users dan Projects di CacheService dengan invalidasi saat tulis, dan batasi kolom yang dibaca.
- Operasi paling berat: pembuatan PDF (Docs plus ekspor plus foto) dan Excel. Keduanya dibatasi oleh batas waktu eksekusi dan kuota harian Apps Script (Drive, UrlFetch, pembuatan dokumen). Cek halaman kuota resmi Google untuk akun yang dipakai.
- Foto dikompres di klien (maks 1280 px) untuk menghemat unggahan dan ukuran PDF.
- Waktu dan ukuran belum diukur secara sistematis. Catat angka nyata dari produksi sebelum menetapkan target.

## 17. Pengujian

Belum ada tes otomatis. Gunakan checklist manual berikut setiap kali mengubah akses atau data.

**Akses dan role**

1. Engineer yang hanya punya Project A tidak bisa login ke Project B.
2. Manager A hanya melihat user di Project A, tidak melihat Admin, dan tidak bisa mengubah Admin atau Manager lain.
3. Manager tidak melihat menu Master Project, dan pemanggilan `listProjects` langsung ditolak.
4. Viewer tidak melihat menu Input, dan `saveInstall` ditolak server.
5. Mencabut akses project user saat ia masih login mengakhiri sesinya pada request berikutnya.

**Data**

6. Menyimpan instalasi dua kali untuk unit yang sama tidak membuat data ganda.
7. Mengubah SN: pilihan Koreksi tidak membuat riwayat, pilihan Penggantian membuat riwayat.
8. Data project A tidak muncul di project B pada semua halaman.
9. Menghapus unit yang punya instalasi ditolak. Menghapus project yang punya data ditolak.

**Laporan**

10. PDF satu unit dan rekap berhasil. Lebih dari 30 foto menghasilkan pesan yang jelas.
11. Excel memuat kolom SN sesuai device project.

**Panduan**

12. Butuh bantuan di halaman login menampilkan semua artikel aktif, dan artikel draft tidak muncul.
13. Menulis HTML atau `<script>` di isi artikel tampil sebagai teks biasa.

## 18. Riwayat Versi dan Rollback

| Versi | Perubahan |
| --- | --- |
| Checkpoint awal | Multi-project, role Admin, Engineer, dan Viewer, instalasi, penggantian, laporan PDF dan Excel, dashboard |
| Update role | Role Manager, akses per project (`Users.projectIds`), User Management terfilter per project, halaman user baru, patch role di frontend |
| Penyesuaian | Master Project khusus Admin (Manager tidak memiliki akses) |
| Panduan | Sheet Guide, menu Panduan, editor untuk Admin, tombol Butuh bantuan di login |
| Panduan publik | Semua artikel aktif tampil di login, pengaturan peran pembaca dan penanda publik dihapus dari form |

**Rollback:**

- Frontend: hapus blok patch Panduan, atau kedua blok patch, untuk kembali ke tampilan sebelumnya. JS utama tidak berubah di semua versi.
- Backend: kembalikan Code.gs dari backup, lalu Deploy New version. Kolom `projectIds` dan sheet Guide yang sudah ada tidak mengganggu versi lama (kolom yang tidak dikenal diabaikan), tetapi `rows_` versi lama tidak akan memakainya.
- Sebelum mengubah apa pun, simpan salinan Code.gs, Index.html, dan ekspor Google Sheet.

## 19. Utang Teknis dan Saran Pengembangan

1. **Sumber JS utama.** Simpan `app.js` sebagai sumber kebenaran di repositori dan buat skrip build untuk mengenkodenya ke `Index.html` (bagian 9.5). Ini mengurangi risiko dan mempercepat perubahan.
2. **Patch frontend.** Jika `app.js` sudah tersedia, gabungkan isi kedua blok patch ke dalamnya dan hapus peretasan `S.user.role = 'Admin'` untuk Manager dengan mengganti pengecekan role di sumber.
3. **Repositori dan CI.** Pakai `clasp` untuk sinkronisasi Apps Script dengan Git, dan tambahkan linting.
4. **Tes otomatis.** Pisahkan logika murni (validasi, aturan akses user) agar dapat diuji di luar Apps Script.
5. **Performa.** Cache data master dan kurangi pembacaan sheet penuh per request.
6. **Keamanan.** Pembatasan percobaan login, hash password yang lebih kuat, dan penyaringan daftar project di halaman login.
7. **Panduan.** Dukungan tabel dan gambar di mini-markdown, dan pengaturan panduan per project bila diperlukan.

Kontak pembuat aplikasi: Rusyanto. Perbarui dokumen ini setiap kali ada perubahan skema, route, atau aturan akses.
