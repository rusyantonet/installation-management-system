# Dokumentasi Instalasi Unit

Aplikasi web untuk mencatat dan memantau instalasi perangkat MineSafeDrive pada kendaraan tambang. Dibangun dengan **Google Apps Script** (container-bound ke Google Sheets), dengan Google Sheets sebagai database dan Google Drive sebagai penyimpanan foto.

## Fitur

- **Login berbasis token** dengan tiga role: Admin, Engineer, dan Viewer.
- **Dashboard**: progress keseluruhan, jumlah unit lengkap/pending/belum diinstal, progress per device, dan device yang paling sering diganti.
- **Input Data Instalasi** per unit: status tiap device (Installed / Pending), serial number, foto (dikompres di browser, disimpan di Drive), dan remarks. Satu unit hanya punya satu data instalasi (upsert).
- **Riwayat Penggantian Perangkat**: dicatat otomatis saat SN berubah (dengan pilihan koreksi atau penggantian) atau lewat tombol Ganti Perangkat.
- **Master Data**: Unit, Device (dengan opsi wajib SN / foto), dan User.
- **Export Report** (PDF dan Excel), lihat bagian [Export](#export-report).

## Hak Akses

| Fitur | Admin | Engineer | Viewer |
|---|:-:|:-:|:-:|
| Dashboard, Data Instalasi, Riwayat Penggantian | ✔ | ✔ | ✔ |
| Export Report (PDF dan Excel) | ✔ | ✔ | ✔ |
| Input / edit instalasi, Ganti Perangkat, upload foto | ✔ | ✔ | ✘ |
| Master Unit, Master Device, User Management, Hapus data | ✔ | ✘ | ✘ |

Pembatasan role ditegakkan **di server** (`api()` di `Code.gs`). Menu yang disembunyikan di tampilan hanyalah kemudahan penggunaan, bukan pengaman.

## Arsitektur

```
Browser (Index.html + JS)
   │  google.script.run.api(action, token, params)
   ▼
Code.gs  ── api() ── ROUTES (satu pintu untuk semua aksi)
   │          ├─ auth_(token)      → token disimpan di CacheService (6 jam)
   │          ├─ cek role          → admin:true / edit:true
   │          └─ LockService       → untuk operasi tulis (w:true)
   ▼
Google Sheets (database) · Google Drive (foto) · DocumentApp (PDF) · UrlFetchApp (Excel)
```

### Sheet database

Dibuat otomatis oleh `setup()`. Semua kolom berformat teks.

| Sheet | Kolom |
|---|---|
| `Users` | id, username, name, passHash, role, active, createdAt |
| `Units` | id, unitNo, type, notes, active |
| `Devices` | id, name, needSN, needPhoto, active, sort |
| `Installations` | id, unitId, unitNo, date, remarks, details (JSON), createdBy, createdAt, updatedAt |
| `Replacements` | id, unitId, unitNo, deviceId, deviceName, date, oldSN, newSN, reason, note, photo, createdBy, createdAt |

### Aksi API

| Aksi | Akses |
|---|---|
| `login`, `logout` | publik |
| `me`, `dashboard`, `formData`, `listInstalls`, `getInstall`, `listReplacements`, `generateReport`, `generateExcel` | semua role |
| `saveInstall`, `uploadPhoto`, `replaceDevice` | Admin, Engineer |
| `deleteInstall` | Admin |
| `listUnits`, `saveUnit`, `deleteUnit`, `listDevices`, `saveDevice`, `deleteDevice`, `listUsers`, `saveUser`, `deleteUser` | Admin |

## Struktur Repository

```
.
├── Code.gs         # Backend Apps Script
├── Index.html      # Halaman web (HTML, CSS, dan script)
├── src/
│   └── app.js      # JavaScript frontend dalam bentuk terbaca (lihat catatan di bawah)
├── appsscript.json # (opsional) manifest Apps Script
└── README.md
```

> **Catatan tentang `Index.html`.** Pada versi yang berjalan, JavaScript utama disimpan sebagai teks base64 di dalam `Index.html` (array `P`, di-decode dengan `atob()`). Simpan versi terbaca `app.js` di repository agar mudah ditinjau dan diubah. Fitur tambahan (Export Excel, rename menu, role Viewer) berada di blok `<script>` terpisah di bagian bawah `Index.html`, setelah script loader base64.

## Instalasi

1. Buat **Google Sheet** baru. Buka **Extensions → Apps Script**.
2. Buat file `Code.gs` dan tempel isi `Code.gs` dari repository.
3. Buat file HTML bernama **`Index`** dan tempel isi `Index.html`. File harus diawali `<!DOCTYPE html>`, jika tidak `doGet()` akan menampilkan pesan error.
4. Jalankan fungsi berikut **satu kali** dari editor dan setujui izin yang diminta:
   - `setup()`: membuat sheet, salt password, akun admin awal, dan daftar device bawaan.
   - `authorizeReport()`: izin Google Docs/Drive untuk laporan PDF.
   - `authorizeExcel()`: izin Spreadsheet/Drive/UrlFetch untuk export Excel.
5. **Deploy → New deployment → Web app**. Atur *Execute as* dan *Who has access* sesuai kebutuhan organisasi.
6. Buka URL Web App (`/exec`) dan login dengan akun awal:

   ```
   username: admin
   password: admin123
   ```

   **Segera ganti password ini** lewat menu User Management.

> Setiap perubahan kode baru berlaku di Web App setelah membuat **versi deployment baru** (Deploy → Manage deployments → Edit → New version).

## Konfigurasi

Konstanta di bagian atas `Code.gs`:

| Konstanta | Fungsi |
|---|---|
| `APP_TITLE` | Judul halaman web |
| `REPORT_SUBTITLE` | Teks di bawah judul laporan PDF |
| `PHOTO_FOLDER_NAME` | Nama folder Drive untuk foto |
| `SESSION_SECONDS` | Lama sesi login (maks. 6 jam, batas CacheService) |
| `REQUIRE_PHOTO` | `true` jika foto wajib untuk device berstatus Installed yang membutuhkan foto |
| `REASONS` | Pilihan alasan penggantian perangkat |
| `DEFAULT_DEVICES` | Daftar device awal saat `setup()` |
| `MAX_REPORT_PHOTOS` | Batas foto per laporan PDF (default 30) |

## Export Report

Menu **Export Report** berisi dua kartu.

### Export PDF

- **Rekap semua unit**: ringkasan (progress keseluruhan, jumlah unit aktif, instalasi lengkap, instalasi pending, belum diinstal), lalu rekap per unit. Jika detail per unit disertakan, setiap unit mulai di lembaran baru.
- **Satu unit**: detail device dan serial number, riwayat penggantian di bawahnya, dan foto instalasi (jika dipilih) di lembaran baru.
- Ringkasan selalu menghitung seluruh unit aktif. Filter tanggal hanya memengaruhi tabel rekap per unit.

### Export Excel (.xlsx)

- Sheet **Detail Instalasi**: No, Unit, Tipe, Tanggal, SN DMS Camera, SN ADAS Camera, SN INCAB Camera, SN GPIO Box, SN SIM Card, Status Instalasi (Lengkap / Pending), Remarks.
- Sheet **Riwayat Penggantian**: No, Tanggal, Unit, Device, SN Lama, SN Baru, Alasan, Oleh, Catatan.
- Kolom SN dicocokkan berdasarkan **nama device**, sehingga nama di Master Device harus persis sama (`DMS Camera`, `ADAS Camera`, `INCAB Camera`, `GPIO Box`, `SIM Card`).

## Keamanan

- Password disimpan sebagai hash SHA-256 dengan salt global yang tersimpan di Script Properties (`SALT`).
- Token sesi disimpan di `CacheService` dan di `sessionStorage` browser.
- Hak akses dicek di server pada setiap aksi (`admin`, `edit`).
- Foto di Drive dibagikan dengan "anyone with the link" jika kebijakan domain mengizinkan.
- **Jangan commit** data nyata (isi spreadsheet, link foto, atau kredensial) ke repository publik.

## Batasan

- Maksimal 30 foto per laporan PDF dan ukuran PDF maksimal 24 MB.
- Pembuatan PDF memakan waktu sekitar 10–60 detik, lebih lama jika memuat foto.
- Setiap request membaca seluruh sheet terkait. Untuk data yang sangat besar (ribuan baris), pertimbangkan caching.
- Tunduk pada kuota harian Google Apps Script.

## Pengembangan

- Gunakan [clasp](https://github.com/google/clasp) untuk sinkronisasi kode antara repository dan proyek Apps Script (`clasp clone <scriptId>`, `clasp push`). Jangan commit file `.clasp.json` jika berisi ID proyek yang tidak ingin dipublikasikan.
- Menambah aksi API baru: tulis fungsi di `Code.gs`, daftarkan di `ROUTES` (beri `w: true` untuk operasi tulis, `admin: true` atau `edit: true` untuk pembatasan role), lalu panggil dari frontend dengan `call('namaAksi', params)`.
- Menambah halaman baru: tambahkan entri di `MENU` dan fungsi di `PAGES` (atau konfigurasi di `CRUD` untuk halaman master sederhana).

## Lisensi

Tentukan lisensi sesuai kebijakan organisasi Anda (misalnya MIT, atau proprietary / internal use only).
