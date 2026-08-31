# ADR-021 — Phase 2 Security Closure: Password Revision, Audit Ownership, and Disabled Sessions

**الحالة:** مقبول في الإغلاق الأمني لمرحلة 2.

## السياق

كانت عمليات login وchange password تتحقق من Argon2 خارج المعاملة ثم تنفذ انتقالًا حساسًا لاحقًا من دون إثبات أن الاعتماد الذي تحقق منه الطلب لا يزال الاعتماد الحالي. لذلك كان من الممكن نظريًا أن يتحقق طلب قديم ثم يتفوق عليه reset أو change آخر، وبعدها ينشئ الطلب القديم جلسة أو يكتب كلمة مرور فوق كلمة أحدث. كما كان شكل ممثل AuditEvent البشري صحيحًا منفردًا لكنه لا يفرض بنيويًا أن يكون هذا الإنسان مالك الحدث الشخصي، وكانت جلسة مستخدم صار حسابه معطلًا تعيد 403 بدل إشارة مصادقة تجعل العميل المحمول يمسح حد الجلسة.

## القرار

تضيف `password_credentials.credentialRevision` بقيمة ابتدائية حتمية `1` وقيد موجب. تقرأ login وchange-password snapshot للاعتماد، وتنفذ Argon2 خارج المعاملة، ثم تستعمل `UPDATE … WHERE userId AND credentialRevision AND passwordHash` كـcompare-and-set قبل إنشاء الجلسة أو استبدال كلمة المرور. إذا لم يعد الـsnapshot حاليًا، تفشل login بـ`INVALID_CREDENTIALS` وchange-password بـ`CONFLICT`، ولا تنشأ جلسة ولا يكتب hash قديم. عند password reset أو change ناجح يزاد revision. يبقى reset تسلسلًا ذريًا: يقفل صف المستخدم، يعيد قراءة الرمز بعد القفل، يستهلكه، يستبدل الاعتماد، يرفع revision، يلغي الجلسات، ويلغي رموز reset الأخرى داخل معاملة PostgreSQL واحدة.

يفرض الترحيل `audit_events_human_actor_owns_event_check` أن `actorType = human` يتطلب `actorUserId = ownerUserId`. يبقى قيد شكل الممثل السابق هو المسؤول عن اشتراط مستخدم بشري غير فارغ أو مفتاح نظامي غير فارغ؛ لذلك يستمر ممثل النظام بـ`actorUserId = NULL` و`systemActorKey` صحيح من دون مستخدم اصطناعي.

تظل `authenticateBearer` تكتشف `UserStatus.disabled` قبل بناء `HumanActorContext`. ترسل طبقة HTTP `ACCOUNT_DISABLED` كـ`401`، لا `403`، كي يعده `api-transport` المحمول فشل مصادقة محميًا. يستخدم `createSessionInvalidator` نفس مسار single-flight لمسح SecureStore وReact Query وحالة الهوية. يحمل الحافظ أيضًا latch على token المرجعي الفارغ كي لا يؤدي رد 401 متزامن أو متقارب بعد اكتمال Promise إلى مسح متكرر؛ دخول جديد يضع رمزًا جديدًا ويتيح دورة إبطال لاحقة صحيحة.

## النتائج والقيود

تخزن PostgreSQL session/action hashes فقط، ويبقى Argon2id وopaque Bearer وdefault-deny واشتقاق الملكية وrate limiting وكامل قيود الرسم دون تغيير. لا يوجد mutex JavaScript لتقرير صحة انتقال كلمة المرور؛ PostgreSQL هو مصدر الحقيقة. لا تضيف هذه الإغلاقة أي ميزة منتج أو JWT أو OAuth أو refresh tokens أو 2FA أو passkeys أو biometrics أو Phase 3.
