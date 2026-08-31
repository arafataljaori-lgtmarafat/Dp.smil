# DentPilot — تقرير إغلاق Phase 4 Closure، Stage 1

**النطاق المنفذ:** صحة الرسم وحالة المحرر والتزامن والخصوصية والذاكرة فقط. لم يبدأ Stage 2 أو Phase 5، ولم تُضف خصائص AI أو الفيديو أو الفريق/العيادة، ولم تُغيّر معمارية Phase 3 الخاصة بالوسائط أو ضمانات Phase 4A الخاصة بالملكية وCAS والـrevisions غير القابلة للتغيير.

> **حالة الإغلاق:** اجتازت جميع بوابات Stage 1 المنفذة أدناه. لا يشمل ذلك اختبار جهاز Android/iOS أو Gradle أو Xcode؛ فقد تم التحقق من Expo configuration وJavaScript exports فقط.

## 1. خريطة الأسباب الجذرية والإصلاحات

بدأ العمل بإنشاء خريطة العيوب الإلزامية في `docs/phase-4-closure-stage-1-checklist.md`. بقي مصدر هندسة التصميم هو `@dentpilot/application`، وبقيت الوسائط الأصلية خلف مسار Phase 3 المحمي، وبقيت كتابة الـdraft والـbindings والـrevision من اختصاص API/قاعدة البيانات.

| المعرف | السبب الجذري | الإصلاح الجذري المنفذ | الإثبات الحقيقي |
|---|---|---|---|
| S1-01 | كان `Save Version` يزيد revision على الخادم، لكن autosave يحتفظ بـrevision قديم. | تعيد شاشة المحرر جلب الـCreation authoritative ثم تستدعي `editor.reload(document, revision)` بعد نجاح revision. | `phase4c-editor-autosave.test.ts` يثبت N→N+1 ثم draft CAS ناجح؛ ويبقى التعارض الحقيقي `conflict`. |
| S1-02 | كان export يلتقط Canvas المعروض بحجم الشاشة. | استُبدل بالـSkia offscreen surface الذي يتلقى `RenderPlan` عند preset ويُرمّز JPEG. | `phase4-closure-offscreen-export.test.ts` يفك أبعاد JPEG فعلية لـ1:1 و4:5 و9:16 و16:9. |
| S1-03 | أمكن لمسار export إعادة استخدام preview derivative. | أضيف `protected-export-source.ts` و`authoritative-composition-export.*` لتحميل الأصل المحمي مؤقتًا وإطلاقه في `finally`. | `phase4-closure-authoritative-export.test.ts` يثبت عدم استدعاء preview loader ومرور URIs الأصلية فقط. |
| S1-04/S1-05 | كانت UI أضعف من عقد الوثيقة وقد يحتفظ switchTemplate بثيم غير مدعوم. | `editor-operations.ts` ينظف النص، يحده بـ80، ويرفض/يطبع style غير متوافق؛ UI تعرض فقط `allowedStyleTokens`. | اختبار forbidden markup/length، وثيم `clinical-warm` غير المسموح، واختبار pairwise للكتالوج. |
| S1-06 | كان Skia preview يستخدم خطًا ثابتًا بدل `RenderCommand.fontSize`. | صار الخط يُحل لكل حجم أمر ضمن renderer. | `phase4b-native-composition-preview.test.tsx` يتحقق من حجمي 14 و22. |
| S1-07 | كان export cache عالميًا ولا يمسح عند تغير الهوية. | صار namespace مبنيًا على hash الهوية، ومسح AuthProvider يشمل preview وexport وauthoritative temp sources. | اختبار User A→logout→User B واختبار invalidator للهوية. |
| S1-08 | كانت عملية LRU تمسح عناصر حتى عندما العدد لا يتجاوز الحد. | تحسب `excessCount` أولًا وتمسح أقدم excess فقط مع tie-break حتمي. | مصفوفة 0 و1 و11 و12 و13 و20 في `phase4-closure-preview-cache.test.ts`. |
| S1-09/S1-10 | كان preview يرفض المصدر الصحيح بسبب حد bytes خام ويفرض عرض 1440. | أزيل حد المصدر الخام؛ resize يعتمد أبعاد native، ويحفظ النسبة وmax-edge بلا upscale؛ يبقى حد 8 MiB للـderivative فقط. | حالات landscape/portrait والصور الصغيرة، ومصدر 9 MiB صحيح يُمرر للـnative resize. |
| S1-11/S1-12 | كانت دورة coordinator قابلة للتخلص غير المقصود، وbind/swap قد يعيدان تحميل draft فوق dirty edits. | ثُبت lifecycle على creation/identity، وأضيف `runWithDurableEditorCheckpoint` قبل binding mutation. | mount/unmount وlate response، مع dirty text قبل binding وفشل network/CAS يمنع mutation. |
| S1-13/S1-14 | لم تكن عمليات media المتأخرة تحرس تغير الهوية، وقد يخرج خطأ composition إلى route. | أضيف generation guards، وrelease صريح للـSkia/source، و`CompositionErrorBoundary` مع recovery وسجل metadata آمن فقط. | اختبارات cache lifecycle وerror boundary. |

## 2. الملفات المتغيرة والحدود المعمارية

التغيير محصور في تطبيق الهاتف، tests، وCI والتوثيق. لم تُنشأ migration؛ ما زالت السلسلة **13 migration**، ونتيجة Prisma drift هي `No difference detected.`

| المجال | الملفات الأساسية |
|---|---|
| CAS وdirty-edit serialization | `app/creations/[creationId].tsx`، `src/creation/use-creation-editor.ts`، `editor-autosave.ts`، `editor-binding-checkpoint.ts` |
| الرسم والتصدير | `native-composition-preview.native.tsx`، `native-composition-preview.types.ts`، `composition-offscreen-export.*`، `authoritative-composition-export.*`، `encoded-jpeg-dimensions.ts`، `app/creations/[creationId]/export.tsx` |
| privacy/cache/memory | `protected-preview-cache.ts`، `protected-export-source.ts`، `composition-export.ts`، `auth-provider.tsx` |
| صحة UI والتعافي | `editor-operations.ts`، `app/creations/[creationId].tsx`، `composition-error-boundary.tsx` |
| CI والاختبارات | `.github/workflows/ci.yml`، اختبارات `phase4-closure-*`، واختبارات 4B/4C الموسعة وfixtures JPEG |

## 3. تفصيل CAS والتصدير والمصادر

بعد حفظ immutable revision، لا يفترض العميل أن الزيادة تساوي رقمًا محليًا؛ بل يقرأ aggregate من الخادم ويعيد تحميل document وrevision معًا. كما أن bind/swap لا ينفذان إلا بعد checkpoint `clean` أو `saved`. وهكذا يفشل checkpoint في حالة شبكة أو 409 حقيقي من دون إجراء mutation قد يستبدل نصًا محليًا متسخًا.

التصدير native لا يقرأ Canvas المعروض ولا selection overlay. يُنشأ `RenderPlan` من المحرك المشترك عند أبعاد preset، ثم يجلب orchestrator المصادر الأصلية المحمية في ملفات مؤقتة identity-scoped، ويرسم الأوامر compositional فقط إلى `Skia.Surface.MakeOffscreen`، ويرمز JPEG quality 95، ويفك SOF bytes للتحقق من مساواة الأبعاد للهدف قبل الحفظ. يحرر `surface` و`image` و`data` و`paint` و`font` ومصادر الوسائط في `finally`.

| preset | الأبعاد المثبتة من JPEG bytes |
|---|---:|
| 1:1 | 1080 × 1080 |
| 4:5 | 1080 × 1350 |
| 9:16 | 1080 × 1920 |
| 16:9 | 1920 × 1080 |

## 4. العزل والذاكرة ودورة الحياة

تظل صور المعاينة JPEG derivatives متاحة محليًا فقط، بحد edge مقداره 1440 وحد حجم derivative مقداره 8 MiB و12 صورة لكل حساب. لم يعد حجم الأصل سبب رفض خفي للوسيط الصحيح. تصديرات JPEG لها حد 6 ملفات و16 MiB للحساب، ومسارها يتضمن hash للهوية لا معرّفات مريض أو case. عند logout أو account switch تمسح طبقة المصادقة Query cache وSecure Store وpreview cache وexport cache وauthoritative-source temp namespace، وتزيد generation بحيث لا تعيد عملية media متأخرة إنشاء ملف بعد الانتقال.

| invariant | النتيجة |
|---|---|
| User A لا يترك ملف export قابلًا للاكتشاف بعد logout ثم User B | مثبت باختبار account-scope cleanup |
| preview لا يرفع دقة صورة أصغر ولا يشوه النسبة | مثبت بـ5 حالات dimensions |
| ≤12 preview لا يحدث له count eviction | مثبت للحالات 0/1/11/12 |
| >12 preview يحذف excess الأقدم فقط | مثبت للحالتين 13 و20 |
| unmount أو identity change لا يقبل late autosave/media state | مثبت في coordinator وhook/cache tests |

## 5. البوابات والأوامر المنفذة

نفذت الأوامر التالية فعلًا في بيئة العمل. أول تشغيل لـ`pnpm test` بدون `DATABASE_URL` فشل بسبب المتغير المطلوب في اختبارات API، ثم أعيد نفس الاختبار مع `DATABASE_URL` المحلي ونجح؛ لا يُحتسب التشغيل الناقص كبوابة نجاح.

| البوابة المنفذة | النتيجة الفعلية |
|---|---|
| `pnpm install --frozen-lockfile` | نجحت؛ lockfile محدث ومقفول. |
| mobile `lint` و`typecheck` و`test` | نجحت؛ **18 suite، 74 test**. |
| Stage 1 targeted CI gate | نجحت؛ **11 suite، 43 test**. |
| `pnpm lint` و`pnpm typecheck` | نجحتا. |
| `DATABASE_URL=… pnpm test` | نجحت؛ API **93 passed, 4 skipped** وmobile **74 passed**. |
| `DATABASE_URL=… pnpm test:integration` | نجحت؛ **15 files/63 tests passed، 1 skipped**. |
| `EXPO_PUBLIC_API_BASE_URL=… pnpm build` | نجحت؛ شمل web static export. |
| `pnpm db:migrate` | نجحت؛ **13 migrations**، ولا migrations معلقة. |
| Prisma validate وmigrate diff | نجحتا؛ **`No difference detected.`** |
| Phase 3 local storage وS3/MinIO contract/recovery | نجحت؛ local 3/3، MinIO S3 3/3، recovery 1/1. |
| Phase 3 upload persistence/fault/batch/streaming | نجحت؛ 12 upload-session + 14 اختبارًا متخصصًا. |
| Phase 3B HTTP | نجحت: smoke، cross-user isolation، malformed-media. |
| Phase 3C MinIO HTTP workflow | نجحت؛ workflow حقيقي مع response-loss/source SHA integrity. |
| Phase 4A PostgreSQL وHTTP | نجحت؛ 11 integration tests وقبول HTTP owner-scoped/CAS. |
| Phase 4B application/template renderer | نجحت؛ 19 application tests وrenderer مشمول في mobile gate. |
| Expo config وexports | نجحت exports JavaScript لـAndroid وiOS والويب؛ route Creation موجود. |

## 6. القيود المتبقية الدقيقة

لا يوجد blocker وظيفي متبقٍ ضمن Stage 1. لكن البيئة لا تحتوي Android SDK أو Gradle أو ADB أو NDK، ولا macOS/Xcode أو iOS simulator/device؛ لذلك لم يتم الادعاء بتشغيل build native أو محاكٍ أو جهاز فعلي. تم التحقق من Android/iOS بــExpo JavaScript export وtypecheck واختبارات renderer المعزولة فقط. كما أن Docker CLI غير متاح، لكن خدمة MinIO محلية كانت تعمل بالفعل واستُخدمت بنجاح في اختبارات S3/recovery وPhase 3C.

## 7. قرار الإغلاق

PHASE 4 CLOSURE STAGE 1 VERIFIED — READY FOR NATIVE RUNTIME & PERFORMANCE VALIDATION

تتوقف الأعمال عند هذا الحد طبقًا للمواصفة؛ لم يبدأ Stage 2 تلقائيًا.
