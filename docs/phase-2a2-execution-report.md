# تقرير تنفيذ Phase 2A.2 — Authentication API & Security Enforcement

**الحالة:** مكتمل ومتحقق.  
**حدود التنفيذ:** API وPostgreSQL فقط. لم يبدأ Phase 2B Mobile Authentication.

> **PHASE 2A COMPLETE — READY FOR SECURITY REVIEW**

## النتيجة التنفيذية

حوّل التنفيذ API من ممثل تطوير HTTP مؤقت إلى مصادقة فعلية بجلسات Bearer opaque. كل مسار API محمي افتراضيًا، ما عدا health وعمليات auth العامة المحددة. يستخرج كل مسار مملوك `ownerUserId` من جلسة المستخدم المصادق عليها فقط؛ وتعود الموارد التابعة لمستخدم آخر بـ`404` لمنع كشف الملكية.

| المجال | التنفيذ المتحقق |
|---|---|
| التسجيل والتحقق | `POST /auth/register` ينشئ مستخدمًا pending وكلمة مرور Argon2id وهاش رمز تحقق وحدث `UserRegistered` ضمن معاملة، ثم يسلم البريد بعد commit. التحقق يستهلك الرمز ذريًا ويفعل الحساب. |
| البريد | outbox تطويري خاص بصلاحيات الدليل `0700` والملف `0600`، وSMTP في الإنتاج. الإنتاج يرفض outbox أو SMTP/سر HMAC الناقصين. |
| الجلسات | توكن opaque عشوائي 256 بت، يعاد مرة واحدة عند login، ويخزن SHA-256 فقط في `auth_sessions`. لا توجد JWT أو refresh token أو cookie. |
| الحراسة | `AuthenticationGuard` مسجل عالميًا كـdefault-deny؛ يتحقق من Bearer وصلاحية/إلغاء/انتهاء الجلسة وحالة الحساب، ثم يضع `HumanActorContext`. |
| استعادة الوصول | forgot/reset، تغيير كلمة المرور، logout/logout-all، سرد الجلسات، وإلغاء جلسة محددة. reset وchange-password يلغيان كل الجلسات الفعالة. |
| مقاومة التعداد | login غير الموجود وكلمة المرور الخاطئة يعيدان `INVALID_CREDENTIALS` نفسه، مع dummy Argon2 hash محفوظ؛ forgot/resend يعتمدان استجابة غير كاشفة. |
| حدود المعدل | جدول PostgreSQL دائم مع HMAC-SHA-256 للمفاتيح و`INSERT … ON CONFLICT … DO UPDATE … RETURNING` ذري. أول تجاوز فقط لكل bucket/نافذة يسجل `RateLimitExceeded` بلا بريد أو IP خام. |
| الملكية والوسائط | كل حالات Foundation تستعمل الممثل المصادق عليه. الوسائط تحتاج Bearer والمالك وتعيد `Cache-Control: private, no-store` و`X-Content-Type-Options: nosniff`. |
| التوليد | يبقى صاحب طلب التوليد إنسانًا مصادقًا؛ يعمل `generation-worker` ممثل نظام صريح، ولا توجد هوية HTTP تطويرية. |

## نقاط API

| المجموعة | الطرق |
|---|---|
| عامة | `GET /api/v1/health`؛ `POST /api/v1/auth/register`، `verify-email`، `resend-verification`، `login`، `forgot-password`، `reset-password`. |
| جلسة | `POST /api/v1/auth/logout` و`logout-all`، وكلاهما محمي. |
| الحساب | `GET/PATCH /api/v1/account/me`، `POST /api/v1/account/change-password`، `GET /api/v1/account/sessions`، `DELETE /api/v1/account/sessions/:sessionId`. |
| Foundation المحمية | الحالات، رفع/قراءة الوسائط، المشروعات، Jobs التوليد، النتيجة والتاريخ؛ كلها تأخذ الملكية من Bearer فقط. |

تستخدم الأخطاء عقودًا ثابتة وآمنة، منها `UNAUTHENTICATED` و`INVALID_CREDENTIALS` و`ACCOUNT_NOT_VERIFIED` و`ACCOUNT_DISABLED` و`SESSION_EXPIRED` و`SESSION_REVOKED` و`RATE_LIMITED` و`INVALID_ACTION_TOKEN` و`ACTION_TOKEN_EXPIRED` و`EMAIL_DELIVERY_UNAVAILABLE`. تعيد حالة حد المعدل `429` مع رأس `Retry-After`.

## المعمارية والأمان

| المكون | القرار المنفذ |
|---|---|
| `AuthService` | معاملات التسجيل والتحقق والرموز والجلسات وكلمات المرور وSecurityEvents. يبقى تسليم البريد خارج المعاملة كي لا تعكس نجاح الاستمرارية بسبب فشل التسليم. |
| `DevelopmentOutboxEmailAdapter` | يستخدم في التطوير فقط؛ يحتفظ بالرسالة محليًا، ولا يسجل رمز الإجراء في API أو PostgreSQL. |
| `SmtpEmailAdapter` | محول تسليم الإنتاج؛ التكوين production fail-closed. |
| `PostgresAuthRateLimiter` | يزيد العداد الذري وينظف buckets المنتهية انتهازيًا. لا يحتفظ بالمفتاح المنطقي أو البريد أو IP الخام. |
| `HmacSha256RateLimitKeyDeriver` | يشتق المفاتيح من سر مركزي؛ يرفض الإنتاج سر التطوير أو سرًا أقصر من 32 محرفًا. |
| إعادة إرسال التحقق | يقفل صف `users` عند أخذ لقطة الرموز السابقة وإنشاء البديل، ثم يبطل اللقطة فقط بعد نجاح التسليم؛ لا يترك سباق resend بلا مسار تحقق قابل للاسترداد. |
| `main.ts` | Helmet، CORS allowlist بلا wildcard، و`trustProxy` مركزي صريح. |

يوثق القرار [ADR-019](adr/ADR-019-opaque-bearer-authentication-and-persistent-rate-limits.md)، كما حدثت [نظرة النظام](architecture/system-overview.md) و[README](../README.md) و`.env.example` وCI.

## الترحيلات والقيود

أضيف الترحيل `20260827060000_phase_2a2_auth_rate_limits`. ينشئ `auth_rate_limit_buckets` بمفتاح مركب `(scope, keyHash, windowStart)`، وفهرس lookup، وقيود على شكل SHA-256 والعداد والنافذة. أضيف نموذج Prisma المقابل.

تحقق التنفيذ من مسارين مستقلين:

| التحقق | النتيجة |
|---|---|
| Fresh database | طبقت Prisma جميع الترحيلات الثمانية، من `20260826000000_init` حتى ترحيل Phase 2A.2، بنجاح. |
| Upgrade database | طبقت Foundation + Phase 2A.1 يدويًا وسجلت baseline Prisma، ثم طبق `prisma migrate deploy` ترحيل `20260827060000_phase_2a2_auth_rate_limits` وحده بنجاح. |
| Prisma validation/drift | `prisma validate` و`prisma migrate diff --exit-code` نجحا على قواعد fresh وupgrade والعمل؛ لم يكتشف أي فرق. |

## الاختبارات المنفذة

| الطبقة | الدليل |
|---|---|
| حراسة الوحدة | 4 اختبارات: public-by-exception، missing/wrong/empty Bearer، ربط actor الصحيح، وثبات metadata key. |
| إعدادات الأمان | 3 اختبارات: رفض wildcard CORS، فشل production الناقص، وقبول SMTP/سر production المكتملين فقط. |
| AuthService + PostgreSQL | دورتا جلسات/تغيير/reset، عدم حفظ التوكنات الصريحة، forgot غير الكاشف، وسابق resend يترك رمز تحقق فعالًا واحدًا. |
| تكامل PostgreSQL | **32 اختبارًا في 9 ملفات**: تكامل Foundation، هوية Phase 2A.1، ملكية وعلاقات، إديمبوتنسية، وتزامن Rate Limit. |
| اختبار الجذر | **43 اختبار API** إضافة إلى حزم المجال/العقود/التطبيق والجوال؛ مرّ `pnpm test` مع تمرير `DATABASE_URL` صراحة عبر Turbo. |
| HTTP security probe | missing/malformed/wrong/random Bearer، CORS allowlist، Helmet، login/forgot enumeration، حقن owner/user/header، case/media/session isolation، headers الوسائط، وlogout. |
| Walking skeleton | register → outbox → verify → login → `/account/me` → Case → SOURCE upload → Project → generation → idempotency retry → output protected → forgot/reset → bearer قديم مرفوض. |
| HTTP concurrency | 8 طلبات متوازية: registration = `1×201 + 7×409`؛ verify = `1×204 + 7×401`؛ reset = `1×204 + 7×401`. |
| حد المعدل العادي | بعد الضغط الطبيعي: محاولة registration = `201` ثم `429` مع `Retry-After: 24`؛ PostgreSQL احتوى حدثًا واحدًا فقط `RateLimitExceeded:{"scope":"register-ip"}`. |

## أوامر التحقق الفعلية

```bash
# Fresh migration chain
DATABASE_URL='…/dentpilot_phase2a2_fresh?schema=public' \
  pnpm --filter @dentpilot/api exec prisma migrate deploy

# Upgrade from Phase 2A.1 baseline
DATABASE_URL='…/dentpilot_phase2a2_upgrade?schema=public' \
  pnpm --filter @dentpilot/api exec prisma migrate deploy

# Validation and drift, executed on fresh / upgrade / work databases
pnpm --filter @dentpilot/api exec prisma validate
(cd apps/api && pnpm exec prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code)

# Quality gates
DATABASE_URL='…/dentpilot_phase2a2_work?schema=public' pnpm lint
DATABASE_URL='…/dentpilot_phase2a2_work?schema=public' pnpm typecheck
DATABASE_URL='…/dentpilot_phase2a2_work?schema=public' pnpm test
DATABASE_URL='…/dentpilot_phase2a2_work?schema=public' pnpm test:integration
EXPO_PUBLIC_API_BASE_URL='http://127.0.0.1:3000/api/v1' \
DATABASE_URL='…/dentpilot_phase2a2_work?schema=public' pnpm build

# API acceptance, API started against real PostgreSQL
PHASE2A2_API_BASE='http://127.0.0.1:3009/api/v1' \
PHASE2A2_OUTBOX='/tmp/dentpilot-phase2a2-normal-outbox' \
node scripts/phase2a2-auth-walking-skeleton.mjs
node scripts/phase2a2-auth-concurrency.mjs
node scripts/phase2a2-http-security-probe.mjs
```

تمت إضافة هذه السيناريوهات إلى `.github/workflows/ci.yml`؛ تشغل CI PostgreSQL service، الترحيلات، الانجراف، الاختبارات، ثم API مؤقتًا مع outbox `/tmp` وتنفذ security probe وwalking skeleton وconcurrency script.

## مراجعة الأسرار والتنظيف

لا يكتب مصدر API `console.log` أو `console.error` للرموز أو كلمات المرور. لا يظهر `tokenHash` أو الرمز الخام في responses الخاصة بالحساب أو الجلسات. لم تكن بيانات Git metadata متاحة في sandbox عند آخر فحص، لذلك استُكمل المسح على شجرة المصدر بدل `git status`. أزيلت مخرجات outbox المحلية والسجلات المؤقتة ومخرجات البناء قبل التسليم.

## القيود المتبقية والمعلنة

يبقى outbox تطويريًا فقط، وSMTP يتطلب تشغيلًا وإدارة أسرار خارج المستودع. يبقى طابور التوليد الذاكري والتخزين المحلي حدودًا تشغيلية معروفة من Foundation. **لا توجد مصادقة جوال أو SecureStore أو UI login في هذا التسليم**؛ ذلك هو Phase 2B المحظور في هذه المهمة. كذلك لا توجد JWT أو refresh token أو OAuth أو 2FA أو passkeys أو تغيير بريد أو حذف حساب.
