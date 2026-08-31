# Phase 2 — Final Security Closure Checklist

| متطلب الإغلاق | الحالة | الدليل التنفيذي |
|---|---:|---|
| منع login قديم بعد reset | مكتمل | compare-and-set على `credentialRevision` و`passwordHash`؛ اختبار PostgreSQL حاجز `login vs reset`. |
| منع change-password قديم بعد reset | مكتمل | compare-and-set ذري؛ اختبار PostgreSQL حاجز `change-password vs reset`. |
| منع login قديم بعد change-password | مكتمل | compare-and-set ذري؛ اختبار PostgreSQL حاجز `login vs change-password`. |
| Atomic reset | مكتمل | قفل صف User وإعادة فحص token ثم consume/hash/revision/session/token revocation في transaction واحدة. |
| لا Argon2 داخل transaction طويل | مكتمل | verify وhash الجديد يحدثان قبل المعاملة؛ transaction ينفذ compare-and-set والانتقال فقط. |
| ملكية ممثل AuditEvent البشري | مكتمل | migration 9 وقيد `audit_events_human_actor_owns_event_check`. |
| ممثل النظام | مكتمل | اختبار قبول `actorUserId = NULL` و`systemActorKey = generation-worker`. |
| دلالة الجلسة لحساب disabled | مكتمل | `authenticateBearer` يرفض قبل HumanActorContext وHTTP يخرج `401 ACCOUNT_DISABLED`. |
| إبطال الجوال للحساب disabled | مكتمل | transport المحمي والحافظ single-flight يمسح SecureStore/React Query/state؛ اختبار خمس استجابات متزامنة. |
| backend disabled HTTP | مكتمل | probe حي يسجل/يتحقق/يدخل/يعطّل في PostgreSQL ثم يثبت 401 على `/account/me` و`/cases`. |
| عدم تراجع العزل والتوليد والإديمبوتنسية | مكتمل | `phase2a2-http-security-probe` وwalking skeleton الخلفي/المحمول واختبارات integration. |
| Fresh migration | مكتمل | `dentpilot_security_closure_fresh` طبقت 9 ترحيلات. |
| Upgrade migration | مكتمل | clone من قاعدة Phase 2 ذات 8 ترحيلات إلى `dentpilot_security_closure_upgrade` ثم تطبيق migration 9. |
| Prisma validate/drift | مكتمل | نجح `prisma validate` و`No difference detected` في fresh وupgrade. |
| بوابات الجودة | مكتمل | نجحت `pnpm lint`, `typecheck`, `test`, `test:integration`, `build`. |

> لا توجد نواقص أمنية مثبتة ضمن النطاق المحدد. لا يبدأ هذا التسليم Phase 3.
