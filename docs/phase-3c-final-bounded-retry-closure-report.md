# DentPilot — تقرير الإغلاق النهائي لـ Phase 3C: Bounded Retry

## النطاق المنفذ

هذا Patch إغلاق محدود لمرحلة **Phase 3C** فقط. لا يغير أي endpoint أو دلالة لجلسات رفع Phase 3B أو المصادقة أو الملكية أو التخزين أو Prisma أو التوليد. لم يبدأ عمل Phase 4.

## سبب الخلل

كان منسق الرفع المحمول يربط مسار الاسترداد بهذه السلسلة: فشل إرسال المحتوى ثم `GET upload status` ثم حالة `created` ثم إعادة إرسال المحتوى. لم يكن عدد مرات إعادة الإرسال مملوكًا أو محدودًا داخل المنسق؛ لذلك كان فشل شبكة دائم مع استمرار `created` قادرًا على توليد حلقة إعادة إرسال غير منتهية أثناء بقاء التطبيق في الواجهة.

## السياسة المنفذة

أضيفت سياسة مركزية وحيدة هي `mediaRecoveryPolicy.maxContentUploadAttempts` في `apps/mobile/src/media/media-upload-orchestrator.ts`. القيمة **3** محاولات إرسال محتوى تلقائية لكل رفع منطقي في foreground. تحتفظ كل محاولة بـ`uploadId` نفسه و`idempotencyKey` نفسه؛ ولا ينشئ المنسق جلسة جديدة بعد إنشاء الجلسة الأولى. عند استنفاد الثلاث محاولات والحالة الدائمة `created` يتحول المنسق إلى `failed` برمز `CONTENT_RETRY_BUDGET_EXHAUSTED` ورسالة تطلب من المستخدم بدء رفع جديد صراحةً. لا يدّعي أن الخادم أخفق أو أن الرفع التزم.

| السيناريو | النتيجة الفعلية |
|---|---|
| فشل محتوى دائم + `created` | اجتاز: 3 POST كحد أقصى، uploadId ثابت، جلسة واحدة، نهاية `CONTENT_RETRY_BUDGET_EXHAUSTED`، و`isActive=false`. |
| commit ثم فقد الاستجابة | اجتاز: GET أعاد `committed`/mediaId ولم ينفذ POST محتوى أو جلسة ثانية. |
| `created` ثم نجاح لاحق | اجتاز: أعيد إرسال المحتوى على uploadId نفسه ثم التزم من دون جلسة إضافية. |
| `UPLOAD_IN_PROGRESS` | اجتاز: تحول إلى `server-processing` وpolling قبل أي إرسال آخر؛ لا حلقة إرسال فورية. |
| `processing` | اجتاز: polling محدود زمنيًا ولا يعيد إرسال المحتوى عند processing. |

## Hotfix Phase 3B المصرح به

خلال إعادة بوابة HTTP ظهر 500 محدد في `POST /media-uploads/:uploadId/content`. السبب كان حقن `StreamingMediaIngestService` غير الصريح في `MediaController` أثناء تشغيل Nest. اقتصر الإصلاح على `@Inject(StreamingMediaIngestService)` في معامل وحدة التحكم، مع اختبار انحدار ثابت؛ لم تتغير semantics أو schema أو migrations أو API الخلفي. أعيدت بوابات HTTP وPostgreSQL وMinIO بعده بنجاح.

## البوابات المنفذة

نفذت ونجحت فعليًا: `pnpm install --frozen-lockfile`؛ و`pnpm --filter @dentpilot/mobile lint`؛ و`pnpm --filter @dentpilot/mobile typecheck`؛ و`pnpm --filter @dentpilot/mobile test` (**31 اختبارًا**)؛ و`pnpm db:migrate`؛ و`pnpm --filter @dentpilot/api exec prisma validate`؛ و`pnpm --dir apps/api exec prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code` مع النتيجة **No difference detected.**؛ و`pnpm lint`؛ و`pnpm typecheck`؛ و`pnpm test`؛ و`pnpm test:integration`؛ و`pnpm build`.

كما اجتازت بوابات Phase 3B: جلسات PostgreSQL، عقد S3 ضد MinIO، استرداد orphan حقيقي على PostgreSQL+MinIO، finalization faults، batch draining، scheduler، streaming static guard، spool cleanup، وHTTP happy path والعزل بين المستخدمين ومصفوفة الوسائط المشوهة. واجتاز `scripts/phase3c-real-media-workflow.mjs` المسار الكامل: register → verify → login → case → upload session → source commit → protected byte read → project → mock generation idempotency → protected result → logout، مع تحقق source SHA وعدم تكرار MediaAsset.

## قيد واقعي معروف

لا يتوافر Android emulator أو جهاز متصل في بيئة التنفيذ، ولذلك لا يُدّعى اختبار واجهة فعلية على جهاز. اجتاز Android export سابقًا ضمن Phase 3C، بينما يغطي هذا الإغلاق منطق المنسق ووحدة الاختبار والحزمة وharness الخلفي الواقعي.

> النتيجة: إعادة إرسال المحتوى التلقائية صارت محدودة وحتمية وقابلة للاختبار، مع الحفاظ على الاسترداد الإديمبوتنت والملكية وخصوصية الوسائط وبدون بدء Phase 4.
