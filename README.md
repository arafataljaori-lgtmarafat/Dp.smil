# DentPilot Smile Studio

Monorepo شخصي يتضمن **API NestJS/Fastify مع PostgreSQL/Prisma** وتطبيق **Expo React Native/Web**. يطبق Phase 2 تسجيلًا بالبريد وكلمات مرور Argon2id وجلسات Bearer opaque وحراسة API وSecureStore على الجوال. لا يتضمن هذا المستودع خدمات AI إنتاجية أو نظام عيادة/فريق.

## المتطلبات

| الأداة | الإصدار المطلوب |
|---|---:|
| Node.js | 22.13 أو أحدث ضمن Node 22 |
| pnpm | 11.24.0 |
| PostgreSQL | 16 أو أحدث |
| Docker Compose | اختياري لتشغيل PostgreSQL المحلي |

## التثبيت والبيئة

```bash
cp .env.example .env
cp apps/mobile/.env.example apps/mobile/.env
pnpm install --frozen-lockfile
pnpm --dir infrastructure/local exec docker compose up -d
pnpm db:migrate
```

غيّر `DATABASE_URL` في `.env` إذا لم تستخدم Docker المحلي. في `apps/mobile/.env` عيّن `EXPO_PUBLIC_API_BASE_URL` إلى `/api/v1` لخادم API يمكن للمحاكي أو الجهاز أو المتصفح الوصول إليه. لا تضع Bearer tokens أو كلمات المرور أو أسرار SMTP أو أي مفاتيح خلفية في ملف Expo العام.

في التطوير، يمكن إبقاء `EMAIL_DELIVERY_MODE=development` لاستلام روابط التحقق وإعادة الضبط في outbox محلي تحت `apps/api/.local/email-outbox`. في الإنتاج استخدم SMTP حقيقيًا، سر HMAC مختلفًا بطول 32 حرفًا أو أكثر، وoriginات CORS دقيقة؛ راجع `.env.example`.

## التطوير

ابدأ API:

```bash
pnpm dev:api
```

ابدأ Expo (QR أو محاكي أو متصفح):

```bash
pnpm dev:mobile
# أو
pnpm --filter @dentpilot/mobile web
```

تستخدم روابط verify/reset التطويرية المخطط `dentpilot://auth/action`. لا يعني Expo Web بديلًا عن اختبار جهاز Native.

## الاختبارات والبناء

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

تحتاج اختبارات التكامل PostgreSQL قابلًا للوصول عبر `DATABASE_URL`. لبناء Web فقط مع API خارجي واضح:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.example.com/api/v1 \
  pnpm --filter @dentpilot/mobile build
```

يُكتب التصدير الثابت إلى `apps/mobile/dist`.

## نشر Expo Web

ينشر Netlify أو أي مضيف static مجلد `apps/mobile/dist` فقط؛ **لا ينشر API أو PostgreSQL كملفات static**. انشر API منفصلًا على منصة server/container مع PostgreSQL، ثم عيّن في بيئة بناء الويب:

```text
EXPO_PUBLIC_API_BASE_URL=https://your-api.example.com/api/v1
```

يوجد `apps/mobile/netlify.toml` لإعداد publish directory وSPA fallback. عند النشر من Git اجعل base directory هو `apps/mobile`، واضبط build command على `pnpm build` أو استخدم حزمة Web الجاهزة التي تنتجها handoff.

## محتوى المستودع

```text
apps/api             NestJS + Fastify + Prisma + PostgreSQL
apps/mobile          Expo Router + React Native + Web
packages/*           domain/application/contracts المشتركة
infrastructure/local PostgreSQL Docker Compose
docs                 ADRs وتقارير Phase 2
```

## الحدود

يمثل التوليد الحالي mock output غير سريري. لا توجد OAuth أو JWT أو refresh tokens أو 2FA أو passkeys أو biometrics أو فرق أو اشتراكات أو Phase 3 في هذا التسليم.
