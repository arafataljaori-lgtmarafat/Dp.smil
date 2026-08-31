# Phase 2B — Mobile Authentication Checklist

| بند القبول | الحالة | دليل التنفيذ أو التحقق |
|---|---:|---|
| SecureStore للرمز المبهم فقط | مكتمل | `src/auth/secure-session-store.ts` وplugin `expo-secure-store`. |
| Bootstrap وعدم حذف الرمز عند عطل الشبكة | مكتمل | `auth-bootstrap.ts` واختبارات bootstrap. |
| تسجيل/تحقق/إعادة إرسال/دخول/استعادة/إعادة ضبط | مكتمل | مسارات `(auth)` و`auth-api.ts` وروابط `dentpilot://auth/action`. |
| توجيه محمي وحالات loading/retry | مكتمل | `app/_layout.tsx` و`AuthProvider`. |
| Bearer مركزي ووسيط محمي | مكتمل | `api-transport.ts` ومصدر Image المصادق عليه. |
| إبطال 401 موحد ومتزامن | مكتمل | `createSessionInvalidator` واختبار خمس محاولات متزامنة. |
| عزل React Query عند تبديل الحساب | مكتمل | `queryClient.clear()` واختبار A/B صريح. |
| الحساب والجلسات وتعديل الاسم وتغيير كلمة المرور والخروج | مكتمل | `app/account.tsx` وwalking skeleton الحي. |
| منع اختيار الملكية أو تسجيل أسرار العميل | مكتمل | فحص مصدر كامل؛ لا توجد حقول ownership أو console logging حساس. |
| اختبارات الجوال | مكتمل | 10 اختبارات Jest تمر. |
| Expo/Android configuration | مكتمل | `expo config --type public` يثبت scheme وSecureStore وintent filter. |
| Android emulator أو جهاز فعلي | غير منفذ | لا يتوفر emulator/device في بيئة sandbox؛ لا يوجد ادعاء تحقق فيزيائي. |
| PostgreSQL migrations/Prisma drift | مكتمل | قاعدة `dentpilot_phase2b_fresh`: 8 ترحيلات، `prisma validate`، و`No difference detected`. |
| بوابات المستودع | مكتمل | `pnpm lint`, `typecheck`, `test`, `test:integration`, `build` جميعها نجحت. |

> لا يبدأ هذا التسليم Phase 3، ولا يضيف OAuth أو 2FA أو passkeys أو biometrics أو اشتراكات أو فريق أو حذف حساب.
