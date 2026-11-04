# Tebak Karakter (Next.js + Neon)

1. `npm install`
2. Buat project di https://neon.tech, salin connection string ke `.env.local`:
   `DATABASE_URL=postgresql://...`
3. `npm run dev` lalu buka http://localhost:3000 di dua tab/browser berbeda.

Tabel `rooms` dibuat otomatis saat request pertama. Deploy: Vercel + isi env `DATABASE_URL`.
