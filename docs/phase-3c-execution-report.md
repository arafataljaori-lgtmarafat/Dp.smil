# DentPilot — تقرير تنفيذ Phase 3C

**النطاق المنفذ:** ربط تطبيق Expo ببروتوكول جلسات رفع الوسائط Phase 3B والتحقق منه. لم يبدأ أي عمل من Phase 4، ولم تُغيّر معمارية المصادقة أو التخزين أو حالة جلسات الرفع في الخلفية، ولم تضاف أي migrations.

## البنية وتكامل العقد

تمت إضافة حد وسائط مستقل داخل `apps/mobile/src/media/`. تفصل الوحدة اختيار الأصل (`media-picker.ts`) عن نقل العقد (`media-api.ts`) وحالة الرفع الصريحة (`media-upload-state.ts`) ومنسق البروتوكول (`media-upload-orchestrator.ts`) ورسائل الخطأ الآمنة (`media-errors.ts`). تظل الشاشة مسؤولة عن تجربة المستخدم فقط، فيما يبقى المنسق in-memory ولا يحفظ URI أو uploadId أو FormData أو بايتات المرضى خارج جلسة العمل الجارية.

يتكامل العميل حصراً مع نقاط Phase 3B التالية: `POST /cases/:caseId/media-uploads` بمفتاح `Idempotency-Key`، و`POST /media-uploads/:uploadId/content` بحقل multipart واحد اسمه `file`، و`GET /media-uploads/:uploadId`. أزيل مسار الرفع القديم المباشر نهائياً من مصدر الهاتف وتوجد له حماية اختبار ثابتة. لا يرسل العميل أي حقل ملكية أو مفتاح تخزين أو token معالجة أو target media.

## النقل والإديمبوتنسية والاختيار

يعتمد النقل الحديث على `expo-file-system` `File`، أو على `ImagePickerAsset.file` في الويب عند توفره، ويضيفه إلى `FormData` كـBlob. لا يوجد تحويل base64 ولا قراءة كاملة لبايتات الصورة إلى ذاكرة JavaScript ولا تمثيل URI القديم `{ uri, name, type } as never`. أضيفت حزمة `expo-crypto` المتوافقة مع SDK 54 لتوليد UUID عشوائي قوي لمفتاح الإديمبوتنسية؛ ويحتفظ المنسق بالمفتاح نفسه خلال retry لإنشاء الجلسة، ولا ينشئ مفتاحاً جديداً إلا عند retry صريح لرفع منطقي جديد.

يدعم التطبيق اختيار الصورة من المكتبة والتقاطها عبر `expo-image-picker` باستخدام `mediaTypes: ['images']` وبدون تعديل أو ضغط أو base64 أو EXIF. يُرفض HEIC/HEIF/AVIF عندما يمكن تمييزه من metadata، ولا يُعاد تسمية MIME غير المعروف إلى JPEG. تعالج صلاحية الكاميرا الحالات granted وdenied وcannot-ask-again ولا تكرر الطلب عند تعذر السؤال. يتضمن إعداد Expo أوصاف الصور والكاميرا ويعطل `microphonePermission` صراحةً.

## الحالة والاسترداد والمعاينة

حالة الرفع صريحة: `idle` و`selecting` و`creating-session` و`uploading` و`recovering-status` و`server-processing` و`committed` و`failed`. تمنع عناصر اختيار المصدر والتقاطه أثناء سير عملية متعارضة. الإلغاء يعيد الحالة إلى idle، والفشل الطرفي يعرض retry صريحاً بجلسة ومفتاح جديدين.

يعامل المنسق فقد نتيجة المحتوى كحالة غير مؤكدة: يستعلم عن upload status، ويقبل `committed` مع mediaId من دون رفع أو جلسة ثانية، ويستعمل polling محدوداً ذا backoff لحالة processing، ويعيد المحاولة على uploadId نفسه فقط إذا كانت الحالة created، ويعود إلى status recovery عند `UPLOAD_IN_PROGRESS`. إذا انتهت نافذة الاسترداد لا يدّعي فشلاً من الخادم؛ يعرض حالة recheck صادقة. تبقى استجابة 401 داخل طبقة النقل المركزية، التي تستدعي مسار إبطال الجلسة القائم ومسح React Query، فلا تبقى شاشة الرفع عند انتقال الهوية.

اختيار المصدر في مساحة الحالة حتمي: يجري اختيار أحدث source ملتزم بمقارنة `createdAt` صراحةً. تعرض المنصة الأصلية معاينة خاصة عبر endpoint المحمي مع Bearer authorization. في الويب لا تُنشأ URL عامة أو presigned URL أو blob دائم؛ تعرض الشاشة حالة خصوصية آمنة، وتبقى معاينة الويب الثابتة سليمة.

## الاختبارات ونتائج القبول

| البوابة | النتيجة |
|---|---|
| Jest للهاتف | اجتازت 29 حالة؛ تشمل إلغاء المكتبة، صلاحية الكاميرا، HEIC/HEIF/AVIF، MIME غير المعروف، استرداد Android pending مرة واحدة، الإديمبوتنسية، polling، حالات created/processing/failed/expired، و401. |
| منع التكرار الحرج | اجتاز اختبار المحتوى الذي التزم على الحدود ثم فقدت استجابته: status أعاد committed/mediaId، ولم ينشأ upload session أو content upload أو MediaAsset ثانٍ، واستُدعي refetch. |
| Real API + PostgreSQL + MinIO | اجتاز `phase3c-real-media-workflow.mjs`: register → verify → login → case → session → upload → فقد الاستجابة بعد commit حقيقي → GET committed → تنزيل بايتات متطابقة → project → generation idempotency → result محمي → logout. |
| حقن فقد الاستجابة | موضع الحقن موثق داخل harness مباشرة بعد response ناجحة من POST content وقبل قراءة payload؛ كان commit الخلفي قد حدث فعلياً. |
| Expo config | اجتاز مدقق config: scheme `dentpilot`، secure-store، image-picker، أوصاف الكاميرا/الصور، وmicrophone=false. |
| Android export | اجتاز `expo export --platform android`؛ هذا تحقق JS/assets فقط وليس APK أو اختبار جهاز. |
| Web preview | اجتاز بناء الويب مع API، كما اجتاز اختبار عدم ضبط API الحالي بأمان. |
| انحدار Phase 3B | اجتازت اختبارات Local/S3 MinIO وجلسات الرفع ومصفوفة finalization والدفعات وscheduler وتنظيف spool. |
| Prisma | `prisma validate` ناجح و`prisma migrate diff` أعاد `No difference detected.` |

## أوامر التحقق المنفذة

نفذت بنجاح الأوامر التالية: `pnpm install --frozen-lockfile`، و`pnpm --filter @dentpilot/mobile lint`، و`pnpm --filter @dentpilot/mobile typecheck`، و`pnpm --filter @dentpilot/mobile test`، و`pnpm --filter @dentpilot/mobile exec expo config --type public --json`، و`pnpm --filter @dentpilot/mobile exec expo export --platform android`، و`pnpm --filter @dentpilot/mobile build`، و`pnpm db:migrate`، و`pnpm --filter @dentpilot/api exec prisma validate`، و`pnpm --dir apps/api exec prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code`، و`pnpm --filter @dentpilot/api test:storage:local`، و`S3_TEST_REQUIRED=true pnpm --filter @dentpilot/api test:storage:s3`، و`pnpm --filter @dentpilot/api test:upload-sessions`، و`pnpm lint`، و`pnpm typecheck`، و`pnpm test`، و`pnpm test:integration`، و`pnpm build`.

## Hotfix Phase 3B المحدود أثناء التنفيذ

أثناء إعادة بوابة HTTP لمرحلة 3B ظهر رمز 500 في `POST /media-uploads/:uploadId/content` قبل المطالبة بالجلسة. أظهر التشخيص أن `StreamingMediaIngestService` لم يكن محقونًا في `MediaController` في تشغيل Nest الفعلي، رغم وجود provider مسجل؛ ولذلك أضيف `@Inject(StreamingMediaIngestService)` صراحةً إلى معامل وحدة التحكم فقط. لم يتغير API أو state machine أو storage أو schema أو migration. أضيف تأكيد انحدار ثابت للحقن، ثم اجتازت HTTP happy path والعزل وmalformed-media، وجلسات PostgreSQL، وMinIO contract/recovery، وfinalization faults، وbatch draining وscheduler. بعد ذلك اجتاز harness Phase 3C على MinIO مرة ثانية.

## القيد الواقعي المتبقي

لم يتوفر Android emulator أو جهاز متصل في بيئة التنفيذ، ولذلك **لا يُدّعى** تحقق UI فعلي على جهاز. يبقى ذلك gate تجريبي/إطلاق لاحق وليس خللاً في كود Phase 3C أو بديلاً عن Android export واختبارات الوحدة وharness الواقعي.

> لم تُضف uploads مباشرة إلى S3 أو presigned URLs أو رفع قابل للاستئناف أو background upload مضمون أو معالجة صور محلية أو features للذكاء الاصطناعي أو الفيديو أو الدفع أو teams أو إعادة تصميم شاملة.
