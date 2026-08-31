# تقرير تنفيذ Phase 2B — Mobile Authentication

**الحالة:** مكتمل ومتحقق منه. توقفت الأعمال بعد Phase 2B؛ لم يبدأ Phase 3.

> **PHASE 2 COMPLETE — READY FOR FULL IDENTITY & MOBILE SECURITY REVIEW**

## نطاق التنفيذ

يربط هذا التسليم تطبيق Expo بنظام الهوية والتفويض الذي أُنجز في Phase 2A.2، من دون إضعاف Argon2id أو الجلسات opaque أو الحراسة default-deny أو اشتقاق `ownerUserId` الخادمي أو حدود المعدل أو أحداث الأمان أو سلامة التوليد. لم تُضف Google/Apple Sign-In أو JWT أو refresh token أو 2FA أو passkeys أو biometrics أو فرق أو اشتراكات أو حذف حساب أو تغيير البريد.

| المجال | التنفيذ |
|---|---|
| تخزين الجلسة | `expo-secure-store` فقط، بالمفتاح `dentpilot.session-token.v1`. لا يستخدم التطبيق AsyncStorage أو localStorage أو ملفًا لحفظ Bearer. |
| حالة الهوية | `AuthProvider` يحتفظ بالرمز الفعّال في مرجع ذاكرة ويعرض حالات `bootstrapping` و`authenticated` و`unauthenticated` و`retryable-network-failure` و`secure-storage-failure`. |
| Bootstrap | يقرأ SecureStore ثم `GET /account/me`. 401 أو جلسة ملغاة يمسح التخزين والكاش؛ عطل الشبكة يحافظ على الرمز ويتيح Retry. |
| النقل | `api-transport.ts` وحده يضيف `Authorization: Bearer` للطلبات المحمية. تستخدم صور الوسائط مصدرًا مصادقًا عليه من الطبقة نفسها. |
| إبطال 401 | مسار single-flight من `createSessionInvalidator` ينفذ مسح الرمز و`queryClient.clear()` وحالة هوية واحدة حتى مع 401 متزامنة. |
| التنقل | مجموعة `(auth)` عامة للتسجيل والدخول والتحقق والاستعادة وإعادة الضبط، مع بوابة جذرية تحمي المسارات المنتجة. |
| الروابط العميقة | `dentpilot://auth/action` مسجل في Expo وAndroid. رمز verify/reset يتحقق منه ويعيش في ذاكرة مؤقتة فقط؛ لا يدخل route params أو التخزين أو React Query. |
| الحساب | تعديل `displayName` فقط، عرض الجلسات الآمنة، إبطال جلسة أخرى، تغيير كلمة المرور، logout وlogout-all. لا تعرض الشاشة رمزًا أو hash أو fingerprint. |

## تدفقات الحساب والخصوصية

تستعمل شاشات التسجيل وتسجيل الدخول كلمات المرور في state محلي عابر فقط، وتفرغها بعد النجاح. لا تُسجّل الكلمات أو رموز Bearer أو رموز الإجراء. تخفي رسائل التسجيل والإرسال والاستعادة معلومات التعداد من خلال الاستجابات الآمنة للخلفية، وتحول طبقة الواجهة أخطاء مثل `INVALID_CREDENTIALS` و`ACCOUNT_NOT_VERIFIED` و`ACCOUNT_DISABLED` و`RATE_LIMITED` و`ACTION_TOKEN_EXPIRED` و`INVALID_ACTION_TOKEN` و`EMAIL_DELIVERY_UNAVAILABLE` وNETWORK_ERROR إلى حالات UX متعمدة بلا عرض HTTP status خام.

يحترم العميل `Retry-After` في الخطأ `RATE_LIMITED`، ويعطل الإرسال المتكرر في نماذج login/register/verify/resend/forgot/reset/change/logout/revoke. يزيل logout المحلي الجلسة والكاش والواجهة المحمية حتى عند تعذر revoke الخادمي بسبب الشبكة؛ لذلك قد تبقى الجلسة البعيدة صالحة حتى تنتهي أو تُلغى لاحقًا من موضع آخر، وهي **محدودية موثقة**.

تعطّل شاشات Cases وWorkspace وResults كل الاستعلامات إلى أن تكون الحالة `authenticated`. لا ترسل أي طلبات الجوال `ownerUserId` أو `userId` كمنتقي ملكية أو `clinicId`. أظهر فحص المصدر أن هذه الحقول غير موجودة في التطبيق، وأن رؤوس Bearer لا تنشأ إلا في طبقة النقل ولا توجد `console.log` أو `console.error` حساسة.

## الاختبارات المنفذة

| الاختبار | النتيجة |
|---|---:|
| Jest للجوال | نجحت 3 suites و10 اختبارات. |
| Bootstrap بلا رمز | غير مصادق بلا طلب `/account/me`. |
| Bootstrap برمز صالح | ينتقل إلى authenticated فقط بعد نجاح `/account/me`. |
| Bootstrap برمز ملغى | يمسح SecureStore ويصير unauthenticated. |
| Bootstrap مع عطل شبكة | يحافظ على الرمز ويصير retryable. |
| فشل كتابة SecureStore بعد login | لا يدخل التطبيق؛ يجرب logout خادمي أفضل جهدًا ويعرض `secure-storage-failure`. |
| 401 المتزامنة | فحص خمسة طلبات متوازية ومسار إبطال single-flight واحد لمسح التخزين والكاش. |
| تبديل A إلى B | يمسح كاش حالة A، ثم يؤكد أن كاش B لا يحتوي بيانات A. |
| الروابط العميقة | تحقق صحيح وreset صحيح؛ رابط ناقص أو purpose غير صالح مرفوضان. |
| انحدار Foundation mobile | بقيت اختبارات إنشاء الحالة وحالة التوليد ناجحة تحت الحراسة الجديدة. |

## Walking Skeleton الحي

شُغّل `scripts/phase2b-mobile-api-walking-skeleton.mjs` على API وPostgreSQL حقيقيين مع outbox تطويري مؤقت. نفذ: register، verify، login، bootstrap account، تعديل الاسم، إنشاء جلسة ثانية وعرضها وإبطالها، إنشاء Case، رفع SOURCE، إنشاء Project، mock generation وإعادة الإديمبوتنسية، قراءة الوسيط المولد المحمي، تغيير كلمة المرور وإجبار إعادة الدخول، ثم logout-all وإبطال الجهاز الحالي.

أعاد السيناريو `status: ok` و`generationStatus: succeeded` و`sessionIsolation: true` و`passwordChangeForcedRelogin: true` و`logoutAllInvalidatedCurrentDevice: true`. لم يطبع أي رمز جلسة أو رمز إجراء.

## Android وExpo

أضيف `expo-secure-store` و`expo-linking`، كما أضيف plugin SecureStore وscheme `dentpilot` وAndroid intent filter في `app.json`. نجح `expo config --type public` في إثبات scheme وplugin وintent filter، ونجح `expo export --platform web` ضمن بناء المستودع. لا يتوفر emulator أو جهاز Android في بيئة sandbox؛ لذلك **لم يُدّعَ تحقق تدفق على جهاز فعلي**. البنية مشتركة عبر المنصات ولا تتضمن ميزة iOS خاصة تمنع توافقه مستقبلًا.

## أوامر التحقق المنفذة

```bash
pnpm --filter @dentpilot/mobile lint
pnpm --filter @dentpilot/mobile typecheck
pnpm --filter @dentpilot/mobile test
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000/api/v1 pnpm --filter @dentpilot/mobile build
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000/api/v1 pnpm exec expo config --type public --json
PHASE2B_API_BASE=http://127.0.0.1:3010/api/v1 PHASE2B_OUTBOX=/tmp/dentpilot-phase2b-outbox node scripts/phase2b-mobile-api-walking-skeleton.mjs
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm db:migrate
pnpm --filter @dentpilot/api exec prisma validate
pnpm --dir apps/api exec prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

اجتازت بوابات المستودع الكاملة: `lint` و`typecheck` و`test` و`test:integration` و`build`. اجتازت قاعدة `dentpilot_phase2b_fresh` سلسلة الترحيلات الثماني كاملة، ونجح `prisma validate`، وأعاد فحص الانجراف PostgreSQL/Prisma: `No difference detected`.

## القيود المتبقية

الحد التشغيلي الملموس الوحيد هو عدم تنفيذ Android emulator/device فعلي في sandbox. يوجد تحقق Expo/Android config وتصدير Web واختبارات وحدة وتكامل وAPI حي، لكن يلزم تشغيل تدفق register→deep-link→login يدويًا على جهاز أو محاكي ضمن قناة إصدار لاحقة قبل إعلان اعتماد جهاز فعلي. لا توجد عيوب سلوكية مثبتة في البوابات المنفذة.
