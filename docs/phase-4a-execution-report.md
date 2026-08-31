# DentPilot — تقرير إغلاق اتساق Aggregate في Phase 4A

**الحالة:** تم إغلاق تصحيح الاتساق المحدد في مواصفة *Final Aggregate Consistency Closure Patch* بعد تنفيذ جميع البوابات الفعلية المسجلة في هذا التقرير. اقتصر العمل على **Phase 4A**؛ لم يبدأ Template Catalog أو composition أو rendering أو export أو محرر مرئي أو AI أو video generation، ولم تتغير بنية Phase 3 للوسائط أو المصادقة أو التوليد.

## سبب الخلل

كان `CreationAssetBinding` قابلاً للتبديل خارج optimistic-concurrency boundary لمسودة `CreationDraft`. لذلك كان تغيير binding لا يطلب `expectedRevision` ولا يزيد `CreationDraft.revision`، وهو ما يسمح لجهازين بتجاوز token التحرير الواحد وقد يترك وثيقة المستند تشير إلى binding أزيل في طلب لاحق.

## تصميم الاتساق بعد التصحيح

أصبح `CreationDraft.document` و**مجموعة** `CreationAssetBinding` و`CreationDraft.revision` حالة تحرير واحدة. لا يستحدث التصحيح عدادًا ثانيًا أو قفلًا موزعًا أو aggregate root جديدًا. تستبدل عملية binding مجموعة النتائج كاملة بعد تمرير `expectedRevision`، ثم تستخدم PostgreSQL CAS على `creation_drafts` داخل المعاملة نفسها. لا يتم تنفيذ delete/create للـbindings إلا بعد نجاح claim للـrevision، وأي فشل لاحق يعيد transaction كاملًا بما فيه زيادة revision.

| جانب الاتساق | التنفيذ النهائي |
|---|---|
| token التحرير | `CreationDraft.revision` هو token الوحيد للـdraft والـbindings. |
| عقد bindings | الطلب `{ expectedRevision, bindings }`؛ والاستجابة `{ data: { bindings, draft } }` حيث تحتوي `draft.revision` الجديدة. |
| نجاح binding | يزيد revision من `N` إلى `N + 1` حتى عند عدم تغيير document JSON. |
| CAS | `UPDATE creation_drafts ... WHERE ownerUserId, caseId, projectId, revision = expectedRevision`؛ نتيجة صفر تعني `CREATION_REVISION_CONFLICT` وHTTP 409. |
| صلاحية الحالة النهائية | يتحقق التطبيق داخل transaction من أن كل مفتاح في `document.slotState` موجود في **مجموعة bindings المطلوبة الناتجة** قبل CAS/commit. |
| إزالة binding مطلوب | ترفض ذريًا بالخطأ typed `CREATION_BINDING_REQUIRED` وHTTP 400، من دون تغيير draft أو bindings أو audit. |
| Rebind صحيح | يبقى المفتاح المنطقي نفسه موجودًا ويمكن تغيير `mediaId` إلى وسائط صالحة من owner/case نفسيهما؛ يزيد revision. |
| تحديث draft | يعمل في transaction ويتحقق من bindings الحالية قبل CAS، فلا يمكن للمستند إدخال slot بلا binding. |
| Revision غير قابل للتعديل | يعيد التحقق من document + bindings داخل transaction قبل الحفظ، ويأخذ snapshot لمفاتيح bindings المشار إليها بالمستند فقط؛ canonical SHA-256 وimmutability triggers محفوظة. |

أضيف `CreationBindingRequiredError` إلى المجال والعقد المشترك وتحويل HTTP، وأُبقيت الأخطاء وواجهات Phase 3 بلا تغيير. لا توجد migration جديدة: كان `CreationDraft.revision` الموجود كافيًا، وبقيت migration Phase 4A الأصلية `20260827224832_phase_4a_creation_documents` دون تعديل.

## الأدلة الاختبارية

جرى توسيع `apps/api/test/integration/creation-domain.integration.test.ts` إلى **10 اختبارات PostgreSQL حقيقية**. تستخدم الاختبارات `PrismaUnitOfWork` وPostgreSQL الفعلي، لا mocks، وتثبت إنشاء aggregate، ownership/case graph، CAS، provenance، hashes، والـimmutability.

| المتطلب | النتيجة الفعلية |
|---|---|
| Binding مقابل Binding عند revision نفسه | نجح: فائز واحد فقط، خاسر واحد `CREATION_REVISION_CONFLICT`، زيادة واحدة للـrevision، وحدث audit ناجح واحد فقط. |
| Draft مقابل Binding | نجح: فائز واحد فقط، والخاسر conflict، ولا توجد lost update. |
| عكس ترتيب الإرسال Binding ثم Draft | نجح: invariant مستقل عن الفائز الأول. |
| حذف `after` المطلوب من مستند يشير إليه | نجح: `CREATION_BINDING_REQUIRED`، rollback، revision وbindings بلا تغير. |
| إعادة ربط `after` إلى وسائط أخرى من الحالة نفسها | نجح: key ثابت، mediaId يتغير، revision يزيد، والمستند يبقى صالحًا. |
| Cross-user/Cross-case | نجح: service وقيود PostgreSQL يرفضان الرسم البياني غير المملوك أو غير المتوافق مع الحالة. |
| Revision consistency | نجح: لا تُنشأ revision من aggregate متعمد غير متسق؛ snapshot الصحيح يضم مفاتيح الوثيقة المطلوبة فقط. |
| Immutable provenance | نجح: تحديث revision أو حذف revision asset يُرفض في PostgreSQL. |

جرى تحديث `scripts/phase4a-creations-http.mjs` وتشغيله ضد API فعلي. أنشأ الاختبار مستخدمين verified وحالات ووسائط عبر مسار upload-session/ingest الفعلي في Phase 3، ثم أثبت binding revision 2 وdraft revision 3 وsame-key rebind revision 4، و409 للـdraft والـbinding القديمين، و`CREATION_BINDING_REQUIRED` عند إزالة `after`، و404 بلا تسريب عندما يحاول User B القراءة أو الكتابة أو commit برؤوس ملكية مزورة. لا يقبل العقد `ownerUserId` من العميل.

## الأوامر المنفذة فعليًا

| البوابة أو الأمر | النتيجة |
|---|---|
| `pnpm install --frozen-lockfile` | نجح. |
| `pnpm lint` | نجح. |
| `pnpm typecheck` | نجح. |
| `pnpm test` | نجح. |
| `pnpm test:integration` | نجح، بما في ذلك Creation PostgreSQL. |
| `pnpm db:migrate` | نجح؛ لا توجد migration معلقة. |
| `pnpm --filter @dentpilot/api exec prisma validate` | نجح. |
| `pnpm --dir apps/api exec prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code` | نجح بنتيجة `No difference detected`. |
| `pnpm build` | نجح لكل الحزم. |
| Creation PostgreSQL المحدد | نجح: 10/10. |
| Creation HTTP المحدد | نجح: upload حقيقي، CAS/409، rebind، required-binding 4xx، و404 cross-user. |
| Phase 3 local + MinIO | نجحت عقود storage المحلية وS3/MinIO وrecovery حقيقي لـPostgreSQL/MinIO. |
| Phase 3B | نجحت faults/reconciler/scheduler/streaming، وقبول HTTP happy-path وcross-user وmalformed-media. |
| Phase 3C | نجحت اختبارات الهاتف وAndroid export وتدفق MinIO الحقيقي مع response-loss recovery وSmile Simulation. |

لا يوجد **عيب ملموس متبقٍ** ضمن نطاق مواصفة إغلاق اتساق Phase 4A. تبقى أعمال Phase 4B، بما فيها templates وcomposition/rendering، خارج هذا التسليم عمدًا.

> **PHASE 4A VERIFIED — READY FOR PHASE 4B**
