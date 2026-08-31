# DentPilot Expo Web Deployment

هذه الحزمة تخص **Expo Web client فقط**. يتطلب التشغيل API DentPilot منشورًا منفصلًا وPostgreSQL؛ لا يمكن نشر NestJS/Fastify أو Prisma أو قاعدة البيانات ضمن Netlify static hosting.

## Netlify من المستودع

اجعل **Base directory**: `apps/mobile`، ويستخدم Netlify الملف `netlify.toml` التالي تلقائيًا:

| الإعداد | القيمة |
|---|---|
| Build command | `pnpm build` |
| Publish directory | `dist` |
| SPA fallback | `/* → /index.html` |

أضف متغير بيئة البناء العام التالي قبل البناء:

```text
EXPO_PUBLIC_API_BASE_URL=https://your-api.example.com/api/v1
```

لا تضع رمز جلسة أو كلمة مرور أو `DATABASE_URL` أو أسرار SMTP أو سر HMAC في إعدادات Web العامة. بعد ضبط المتغير، نفذ build جديدًا لأن Expo يضم القيم العامة في bundle.

## نشر حزمة Web الجاهزة

إذا استلمت `dentpilot-smile-web-deployment.zip`، فك الضغط ثم ارفع محتويات `dist/` إلى static host. يحتوي `netlify.toml` و`.env.example` للتوثيق وإعادة البناء، لكن لا يحتاج المضيف static إلى Node أو PostgreSQL لتقديم الملفات الموجودة بالفعل.
