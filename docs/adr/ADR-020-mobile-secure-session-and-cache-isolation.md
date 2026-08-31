# ADR-020 — Secure Mobile Session Persistence and Identity-Scoped Cache Isolation

**الحالة:** مقبول في Phase 2B.

## السياق

وفرت Phase 2A.2 جلسات Bearer opaque وحراسة API default-deny، لكن تطبيق Expo كان بلا تسجيل دخول حقيقي، وكان عميل Foundation لا يرسل Bearer ولا يملك حدًا موحدًا لانتهاء الجلسة أو تبديل المستخدمين. كان يلزم ربط العميل بالعقد الخلفي من دون نسخ الرموز إلى التخزين العادي أو React Query أو معاملات المسار.

## القرار

يحفظ تطبيق Expo **نص session token المبهم فقط** تحت مفتاح `dentpilot.session-token.v1` من خلال `expo-secure-store`. يبقى الرمز الفعّال في الذاكرة داخل `AuthProvider`، وتقرأه طبقة `api-transport` المركزية فقط لإضافة `Authorization: Bearer …` إلى الطلبات المحمية ومصدر الوسيط المحمي. لا تستخدم المرحلة `AsyncStorage` أو `localStorage` أو ملفًا أو Zustand/Redux لتخزين الرمز أو كلمة المرور.

يجري bootstrap بقراءة SecureStore ثم `GET /account/me`. يمحو 401 أو جلسة ملغاة التخزين والكاش وحالة الهوية؛ لكن خطأ الشبكة لا يحذف رمزًا مخزنًا، ويعرض حالة retryable صريحة. بعد تسجيل الدخول لا يدخل المستخدم إلى الواجهة المحمية حتى تنجح كتابة SecureStore ثم bootstrap الحساب. إذا فشلت الكتابة، يحاول العميل `POST /auth/logout` أفضل جهدًا ولا ينشئ حالة authenticated.

تعالج طبقة النقل كل 401 من طلب محمي بواسطة مسار إبطال موحد single-flight. ينفذ المسار `queryClient.clear()` ومسح SecureStore وإزالة الحالة مرة واحدة حتى عند تزامن عدة 401. تنفذ logout وlogout-all وإعادة الضبط وتغيير كلمة المرور المسار نفسه؛ لذا لا يعرض تطبيق الجوال واجهة محمية بعد إبطال الخادم للجلسة.

توجد Routes عامة منفصلة للتسجيل وتسجيل الدخول والتحقق وإعادة الإرسال والاستعادة وإعادة الضبط. يستقبل `dentpilot://auth/action` رمز الإجراء في الذاكرة فقط، ويتحقق من شكله ثم يوجهه إلى الشاشة المناسبة دون وضعه في route params أو التخزين أو الكاش. يعلن `app.json` مخطط `dentpilot` وintent filter Android وplugin SecureStore.

## النتائج والقيود

لا يختار العميل ملكية الموارد: لا ترسل طلبات Foundation `ownerUserId` أو `userId` أو `clinicId`. جميع بيانات Case/Media/Project/Generation لا تعمل إلا بعد `authenticated`، وتعزل `queryClient.clear()` كاش المستخدم A قبل دخول المستخدم B.

لا تنفذ Phase 2B مزودات اجتماعية أو 2FA أو passkeys أو biometrics أو refresh tokens أو اشتراكات أو نظام فريق أو حذف حساب أو production universal links. تستخدم الروابط العميقة مخطط التطبيق في التطوير؛ يحتاج النشر الإنتاجي لاحقًا إلى رابط HTTPS مُثبت المجال إذا تطلبت منصة البريد ذلك.
