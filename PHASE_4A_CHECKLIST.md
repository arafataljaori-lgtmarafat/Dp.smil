# Phase 4A — Implementation Checklist

## Baseline findings

- `CreationProject` هو aggregate root الحالي ومقيد بـ`ownerUserId` و`caseId` و`sourceMediaId` عبر علاقات PostgreSQL المركبة. نوعه الحالي يتضمن `smile_simulation` و`before_after_image` و`before_after_video`، لكن إنشاء المشروع الحالي يستخدم فقط `smile_simulation`.
- مسار Smile Simulation المثبت يعتمد على `CreationProject.sourceMediaId` و`type === smile_simulation` في `GenerationService`، ويجب إبقاؤهما بلا تغيير دلالي.
- API المشروع الحالي هو `POST /api/v1/cases/:caseId/projects` ويقبل `sourceMediaId` فقط. تطبيق الهاتف يستهلكه لإنشاء mock Smile Simulation؛ لذلك سيبقى هذا المسار متوافقًا.
- لا توجد حتى الآن مسودات Creation أو bindings علائقية أو revisions غير قابلة للتعديل.

## Phase 4A implementation sequence

- [ ] إضافة عقد `CreationDocument v1` صارم ومشترك، مع تحقق الحجم والربط المنطقي والألوان والتحويلات المعيارية والهاش القانوني.
- [ ] إضافة migration Phase 4A جديدة فقط، تحافظ على مشاريع Phase 3 الموجودة وتضيف drafts وbindings وrevisions وrevision assets والقيود اللازمة.
- [ ] توسيع منافذ التطبيق ووحدة Prisma وخدمة إنشاء مستقلة، مع CAS للمسودة ونسخ revision/provenance غير قابلة للتعديل.
- [ ] إبقاء `ProjectService.createMockSmileSimulation` ومسار التوليد وحقول المصدر الحالية متوافقة، وإضافة API creations منفصل للـ`before_after_image`.
- [ ] إضافة تعاقدات محمولة دنيا فقط من دون محرر أو حزم gesture/Skia.
- [ ] إضافة اختبارات contract وhash وPostgreSQL races وHTTP owner isolation ومصفوفة Phase 3 regression، ثم إدراجها كـgates إلزامية.
- [ ] تشغيل migrations وPrisma drift وlint وtypecheck وtests وintegration وbuild، ثم كتابة التقرير والتغليف فقط عند النجاح.

## Boundaries

Phase 4B و4C، كتالوج القوالب، composition/render/export، Smile AI، الفيديو، وتحميلات التخزين المباشر ليست ضمن Phase 4A.
