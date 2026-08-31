# تقرير الإغلاق الأمني النهائي — Phase 2

**الحالة:** مكتمل ومتحقق منه. لا يبدأ هذا التسليم Phase 3.

> **PHASE 2 SECURITY VERIFIED — READY FOR PHASE 3**

## 1. عيب تزامن حالة كلمة المرور وإصلاحه

كانت `login()` و`changePassword()` تتحققان من Argon2 خارج المعاملة ثم تنفذان انتقالًا لاحقًا لا يثبت أن hash الذي تحقق منه الطلب ما زال hash الحالي. كان يمكن لطلب قديم، نظريًا، أن يواصل بعد reset أو change متزامن فينشئ session من كلمة قديمة أو يستبدل كلمة أحدث.

أضاف الترحيل `20260827120000_phase_2_security_closure` العمود `password_credentials.credentialRevision INTEGER NOT NULL DEFAULT 1` وقيدًا موجبًا. تقرأ login/change snapshot يتضمن `passwordHash` و`credentialRevision`، وتنفذ Argon2 خارج المعاملة، ثم تنفذ compare-and-set ذريًا:

```text
UPDATE password_credentials
WHERE userId = snapshot.userId
  AND credentialRevision = snapshot.credentialRevision
  AND passwordHash = snapshot.passwordHash
```

لا تنشأ session إلا إذا نجح الشرط. تفشل login المتأخرة بـ`INVALID_CREDENTIALS`، وتفشل change-password المتأخرة بـ`CONFLICT`. لا تستخدم الآلية mutex JavaScript. يبقى reset سلطويًا: يقفل صف User، يعيد قراءة token بعد القفل، يستهلكه، يستبدل hash، يزيد revision، ويلغي sessions وreset tokens الأخرى في معاملة PostgreSQL واحدة. لا يوجد hash أو verify Argon2 داخل المعاملة الطويلة.

| سباق PostgreSQL الحقيقي | النتيجة |
|---|---:|
| login يتحقق من كلمة قديمة → reset يلتزم → resume login | نجح الاختبار: لا AuthSession جديدة، و`INVALID_CREDENTIALS`. |
| change-password يتحقق من كلمة قديمة → reset يلتزم → resume change | نجح الاختبار: reset يبقى سلطويًا، و`CONFLICT`، ولا overwrite. |
| login يتحقق → change-password يلتزم → resume login | نجح الاختبار: لا AuthSession جديدة، و`INVALID_CREDENTIALS`. |

استخدمت الاختبارات حواجز determinisitic بعد تحقق Argon2 داخل `AuthService` فقط، لكن العمليات نفسها وcompare-and-set وsession/token persistence نفذت على PostgreSQL حقيقي.

## 2. ملكية ممثل AuditEvent

يضيف الترحيل القيد `audit_events_human_actor_owns_event_check`:

```text
actorType <> 'human' OR actorUserId = ownerUserId
```

تحقق الترحيل من الصفوف التاريخية أولًا ويفشل بدل قبول attribution مخالف. يبقى `audit_events_actor_shape_check` الحالي مسؤولًا عن شكل الممثل، لذلك يظل الحدث النظامي صحيحًا بـ`actorUserId = NULL` و`systemActorKey` غير فارغ، من دون User اصطناعي. أثبت اختبار PostgreSQL أن حدث يملكه User A ويمثله human User B مرفوض، بينما human A وsystem `generation-worker` مقبولان.

## 3. دلالة الحساب المعطّل والجوال

يبقى فحص disabled في `authenticateBearer()` قبل إنشاء `HumanActorContext`. تغيّرت خريطة HTTP لـ`ACCOUNT_DISABLED` إلى **401**، وهي دلالة مصادقة موحدة لجلسة صادرة سابقًا لم تعد صالحة، بدل وصولها إلى ترخيص التطبيق أو رد 403. لا يكشف الرد تفاصيل إضافية غير code آمن.

يعد `api-transport` المحمول كل 401 محمي فشل جلسة. استعملت `createSessionInvalidator` نفسه لمسح SecureStore و`queryClient.clear()` وحالة `AuthProvider`. أضيف latch على `tokenReference.current === null` بعد الإبطال؛ لذلك لا تنشئ الردود المتزامنة أو المتأخرة إبطالات ومنافسات تنقل متكررة. دخول جديد يضع token جديدًا فيعيد السماح بإبطال لاحق مشروع.

| تحقق الحساب المعطّل | النتيجة |
|---|---:|
| AuthService: جلسة صالحة ثم `users.status = disabled` | رفض `ACCOUNT_DISABLED` على PostgreSQL. |
| HTTP حي: `/account/me` بعد التعطيل | `401 ACCOUNT_DISABLED`. |
| HTTP حي: `/cases` بعد التعطيل | `401 ACCOUNT_DISABLED` ولا بيانات محمية. |
| Mobile: خمس 401 متزامنة بـ`ACCOUNT_DISABLED` | مسح SecureStore وReact Query وحالة unauthenticated مرة واحدة. |

## 4. الترحيلات وPrisma

لا عُدلت أي ترحيلات تاريخية. أضيف فقط:

| الترحيل | المحتوى |
|---|---|
| `20260827120000_phase_2_security_closure` | `credentialRevision` وقيده الموجب، تحقق تاريخي ثم قيد ownership لـAuditEvent البشري. |

طُبقت سلسلة الترحيلات التسع على قاعدة fresh `dentpilot_security_closure_fresh`. كما نُسخت قاعدة Phase 2 قائمة ذات ثماني ترحيلات إلى `dentpilot_security_closure_upgrade` وطُبق الترحيل التاسع فقط. نجح `prisma validate` وأعاد فحص Prisma/PostgreSQL في القاعدتين: **No difference detected**.

## 5. الانحدار والقبول الحي

أعيد تشغيل `phase2a2-auth-walking-skeleton.mjs` بعد الإصلاح، ونفذ register والتحقق والجلسة وCase/Media/Project/Generation والإديمبوتنسية والوسائط المحمية وإعادة الضبط بنجاح. كما نجح `phase2b-mobile-api-walking-skeleton.mjs` في التحقق والجلسات والتوليد وتغيير كلمة المرور والإجبار على إعادة الدخول وlogout-all. أعاد probe HTTP الأمني إثبات default-deny، مخطط Bearer الخاطئ، مقاومة التعداد، حقن الملكية، عزل User A/B، حماية الوسائط، وheaders.

أعيد تشغيل concurrency HTTP السابق أيضًا: registration فائز واحد `201×1/409×7`، verification `204×1/401×7`، reset `204×1/401×7`.

## 6. أوامر التحقق المنفذة

```bash
DATABASE_URL=... pnpm --filter @dentpilot/api exec vitest run test/integration/phase2-security-password-races.integration.test.ts
DATABASE_URL=... pnpm --filter @dentpilot/api exec vitest run test/integration/phase2-security-disabled-account.integration.test.ts
DATABASE_URL=... pnpm --filter @dentpilot/api test:integration
pnpm --filter @dentpilot/mobile test
PHASE2_SECURITY_API_BASE=http://127.0.0.1:3012/api/v1 \
  PHASE2_SECURITY_OUTBOX=/tmp/dentpilot-phase2-security-outbox \
  node scripts/phase2-security-closure-disabled-account-http.mjs
PHASE2A2_API_BASE=http://127.0.0.1:3012/api/v1 \
  PHASE2A2_OUTBOX=/tmp/dentpilot-phase2-security-outbox \
  node scripts/phase2a2-auth-walking-skeleton.mjs
PHASE2B_API_BASE=http://127.0.0.1:3012/api/v1 \
  PHASE2B_OUTBOX=/tmp/dentpilot-phase2-security-outbox \
  node scripts/phase2b-mobile-api-walking-skeleton.mjs
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm db:migrate
pnpm --filter @dentpilot/api exec prisma validate
pnpm --dir apps/api exec prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

نجحت بوابات المستودع كاملة. ضمن `pnpm test` نجحت 14 ملفات API و47 اختبارًا، وضمن التكامل نجحت 11 ملفات و36 اختبار PostgreSQL. لا تشمل الأرقام أي اختبار حُذف؛ أضيفت اختبارات السباق والحساب المعطّل إلى المجموعة القائمة.

## 7. النتيجة والقيود

لا توجد **نواقص أمنية مثبتة** ضمن العيوب الثلاثة المحددة في مواصفة الإغلاق. تبقى حدود المنتج المتعمدة: لا OAuth/JWT/refresh token/2FA/passkeys/biometrics/فرق/اشتراكات/Phase 3. كما لم يختبر هذا Patch جهاز Android فعليًا؛ ذلك قيد تشغيل Phase 2B موثق سابقًا وليس عيبًا جديدًا أو جزءًا من الإغلاق المطلوب هنا.
