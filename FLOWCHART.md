# Flowchart Installation Management System (IMS)

Diagram di bawah ditulis dengan Mermaid. Warna: kuning = keputusan, merah = penolakan, abu-abu = langkah biasa.

## 1. Alur login dan akses menu

```mermaid
flowchart TD
    A[Buka aplikasi] --> B["Login dan pilih project<br/>Username dan password"]
    B --> C{Akses project valid?}
    C -- Tidak --> X["Ditolak<br/>Pilih project lain"]
    C -- Ya --> D[Menu sesuai role]
    D --> R1["Admin<br/>Semua fitur"]
    D --> R2["Manager<br/>Hampir semua"]
    D --> R3["Engineer<br/>Input dan lihat"]
    D --> R4["Viewer<br/>Hanya melihat"]

    classDef decision fill:#FAEEDA,stroke:#854F0B,color:#412402
    classDef reject fill:#FCEBEB,stroke:#A32D2D,color:#501313
    class C decision
    class X reject
```

Catatan: Manager tidak mendapat Master Project dan Import Data. Kelola artikel Panduan hanya untuk Admin.

## 2. Alur input data instalasi

```mermaid
flowchart TD
    A[Pilih unit dan tanggal] --> B["Status tiap device<br/>Installed atau Pending"]
    B --> C["Isi SN dan foto<br/>Device Installed saja"]
    C --> D{SN lama berubah?}
    D -- Tidak --> S["Simpan ke server<br/>Divalidasi dan dikunci"]
    D -- Ya --> E{Jenis perubahan?}
    E -- Koreksi --> K["Koreksi<br/>Tanpa riwayat"]
    E -- Penggantian --> P["Penggantian<br/>Masuk riwayat"]
    K --> S
    P --> S

    classDef decision fill:#FAEEDA,stroke:#854F0B,color:#412402
    class D,E decision
```

Catatan: satu unit hanya punya satu data instalasi. Menyimpan ulang memperbarui data yang sama.

## 3. Alur pengecekan setiap request di server

```mermaid
flowchart TD
    A["Frontend panggil api()<br/>action, token, params"] --> B{Sesi dan project valid?}
    B -- Tidak --> X1["Sesi berakhir<br/>Login ulang"]
    B -- Ya --> C{Role diizinkan?}
    C -- Tidak --> X2["Akses ditolak<br/>Role tidak cukup"]
    C -- Ya --> D["Jalankan route<br/>Dikunci jika menulis"]
    D --> E[Respons ok atau error]

    classDef decision fill:#FAEEDA,stroke:#854F0B,color:#412402
    classDef reject fill:#FCEBEB,stroke:#A32D2D,color:#501313
    class B,C decision
    class X1,X2 reject
```

Catatan: aksi publik (login, daftar project di halaman login, dan panduan publik) tidak melewati pengecekan sesi dan role.
