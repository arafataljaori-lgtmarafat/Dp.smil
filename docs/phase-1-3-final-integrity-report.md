# تقرير Phase 1.3 — بوابة سلامة الملكية الشخصية النهائية

**الحالة:** مكتملة قبل Phase 2. لا يتضمن هذا التسليم ميزات منتج جديدة أو مصادقة أو أي عمل من Phase 2.

> تعالج Phase 1.3 عيبًا حقيقيًا في هوية التطوير وفجوة في علاقات الكيانات داخل المستخدم نفسه. لا تعتبر هذه خطوة تحسين تجميلية؛ إنها بوابة صحة قاعدة بيانات قبل بناء تسجيل الدخول.

## ما تم تصحيحه

| المجال | التنفيذ |
|---|---|
| هوية التطوير | أصبح `developmentIdentity.actorId` مساويًا لـ`ownerUserId`، وكلاهما يشيران إلى مستخدم التطوير الوحيد الذي تنشئه البذور. |
| رسم المشروع | مصدر `CreationProject` مقيد بكونه مصدرًا للحالة نفسها والمالك نفسه. |
| رسم الوظيفة | ترتبط `GenerationJob` بالمشروع والحالة والمصدر عبر مفتاح مركب واحد يمنع خلط أي إحداثي داخل المستخدم. |
| رسم الإصدار | يحفظ `GenerationVersion` الآن `caseId` و`projectId` كإحداثيات إثبات غير قابلة للفراغ؛ يرتبط مصدره ووظيفته وخرجُه بنفس case/project/source graph. |
| الوقت | حولت كل timestamps التشغيلية إلى `TIMESTAMPTZ(3)` مع تفسير قيم التطوير التاريخية كـUTC في الترحيل. |
| invariants الدائمة | أضيفت قيود CHECK للأبعاد والحجم والتجزئات والـlineage ورقم الإصدار وبصمة الطلب وحالة وظيفة التوليد وتوابع timestamps/errorCode. |

## الترحيل

أضيف الترحيل الإضافي `20260826220000_phase_1_3_personal_integrity_gate`، ولم يعدل أي ترحيل تاريخي. يضيف حقلي `caseId` و`projectId` للإصدار، ثم يعمل backfill من الوظيفة، ويتحقق من عدم وجود رسم قديم متعارض قبل فرض قيود المفاتيح المركبة. يعامل تحويل `TIMESTAMP(3)` التاريخي صراحة كوقت UTC:

```sql
ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3)
USING "createdAt" AT TIME ZONE 'UTC'
```

لا توجد triggers في هذا الترحيل.

## اختبارات Phase 1.3

تغطي `phase13-personal-integrity.test.ts` الهجمات التالية باستخدام PostgreSQL فعلي:

| الاختبار | النتيجة المتوقعة |
|---|---|
| مشروع مستخدم واحد بمصدر من حالة أخرى | رفض قاعدة البيانات. |
| وظيفة مستخدم واحد بمشروع أو مصدر أو حالة غير متطابقة | رفض قاعدة البيانات. |
| إصدار بمصدر/مخرج/وظيفة/مشروع/حالة غير متطابقة | رفض قاعدة البيانات. |
| حجم أو عرض أو ارتفاع غير موجب، SHA غير صالح، lineage غير صحيح | رفض CHECK. |
| `requestFingerprint` غير صالح أو حالة وظيفة وتوابعها غير متسقة | رفض CHECK. |
| `versionNumber = 0` | رفض CHECK. |
| وقت تحت جلسة `America/New_York` | يحتفظ بـISO instant نفسه كما أُدخل في UTC. |

استمرت اختبارات عزل المستخدم، والإديمبوتنسية، والتزامن، وسلامة SHA، والإثبات، والتنظيف التعويضي في النجاح.

## التحقق التشغيلي

شغّل المسار العمودي كاملًا على قاعدة PostgreSQL جديدة بعد الترحيلات والبذور:

```text
seed user → create case → upload source → create project
→ request generation → mock worker succeeds
→ immutable result/version → retrieve content and workspace history
```

انتهى المسار بنجاح، وأظهر التاريخ: `CaseCreated` و`MediaUploaded` و`CreationProjectCreated` و`GenerationRequested` و`GenerationStarted` و`GenerationSucceeded`.

## بوابات الجودة

| البوابة | النتيجة |
|---|---|
| `pnpm lint` | ناجح. |
| `pnpm typecheck` | ناجح؛ 8 مهام. |
| `pnpm test` | ناجح؛ تبقى اختبارات PostgreSQL ضمن هذه المهمة متخطاة عمدًا إن لم يصل `DATABASE_URL` إلى المهمة الفرعية. |
| PostgreSQL integration مع `DATABASE_URL` حقيقي | ناجح؛ 16 اختبارًا في 4 ملفات. |
| `pnpm build` | ناجح؛ أعيد بعد مزامنة علاقات Prisma المركبة، وشمل API والحزم وتصدير Expo. |
| `prisma validate` | ناجح. |
| سلسلة ترحيلات جديدة | ناجحة؛ طبقت خمس ترحيلات. |
| Prisma/PostgreSQL drift | **No difference detected.** |

## قرار الإغلاق

تعد Foundation **مغلقة** بعد اجتياز Phase 1.3. لا ينبغي إنشاء hardening phase إضافية قبل Phase 2 إلا عند اكتشاف عيب ملموس جديد. لا تزال المصادقة الإنتاجية وطابور دائم ومزود AI حقيقي ضمن Phase 2 أو مراحل لاحقة، وليس هذا التصحيح.
