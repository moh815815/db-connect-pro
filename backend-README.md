# DB Connect Pro — Backend

Universal Database Manager Backend (PostgreSQL, MySQL, SQLite, MongoDB, Redis)

## 🚀 Deploy على Railway (مجاني)

### الخطوة 1 — إنشاء حساب
اذهب إلى [railway.app](https://railway.app) وسجّل بحساب GitHub

### الخطوة 2 — رفع الكود على GitHub
```bash
git init
git add .
git commit -m "DB Connect Pro Backend"
git branch -M main
git remote add origin https://github.com/USERNAME/db-connect-pro.git
git push -u origin main
```

### الخطوة 3 — Deploy من Railway Dashboard
1. افتح [railway.app/new](https://railway.app/new)
2. اختر **"Deploy from GitHub repo"**
3. اختر الـ repo اللي رفعته
4. Railway هيعمل deploy تلقائي ✅

### الخطوة 4 — احصل على URL
- في Railway Dashboard → Settings → Domains
- اضغط **"Generate Domain"**
- هتاخد URL زي: `https://db-connect-pro-production.up.railway.app`

### الخطوة 5 — حدّث الـ Frontend
في ملف `db-manager.jsx` غيّر السطر الأول:
```js
const API = "https://db-connect-pro-production.up.railway.app/api";
```

## 🔧 تشغيل محلي
```bash
npm install
npm start
# يشتغل على http://localhost:3737
```

## 📡 API Endpoints
| Method | Path | الوصف |
|--------|------|-------|
| GET | /health | فحص حالة السيرفر |
| POST | /api/connect | اتصال بقاعدة بيانات |
| POST | /api/disconnect | قطع الاتصال |
| GET | /api/:id/tables | قائمة الجداول |
| GET | /api/:id/schema/:table | مخطط الجدول |
| GET | /api/:id/data/:table | بيانات الجدول |
| POST | /api/:id/query | تنفيذ SQL |
| POST | /api/:id/create-table | إنشاء جدول |
| DELETE | /api/:id/table/:table | حذف جدول |
| GET | /api/:id/export | تصدير Schema |

## قواعد البيانات المدعومة
- ✅ PostgreSQL
- ✅ MySQL
- ✅ SQLite
- ✅ MongoDB
- ✅ Redis
- ✅ Supabase (via PostgreSQL)
- ✅ Neon (via PostgreSQL)
- ✅ PlanetScale (via MySQL)
