# خادم القراءة الذكية (Cloudflare Worker + Gemini)

الملف `gemini-worker.js` هو كود خادم مجاني صغير يحمل مفتاح Gemini بعيدًا عن كود الموقع.

## خطوات الإعداد من الجوال

1. **مفتاح Gemini**: افتح https://aistudio.google.com/apikey بحساب Google ← **Create API key** ← انسخ المفتاح.
2. **إنشاء الخادم**: افتح https://dash.cloudflare.com (سجّل حسابًا مجانيًا إن لزم) ← **Workers & Pages** ← **Create** ← **Create Worker** ← سمّه مثلًا `jadwal-reader` ← **Deploy**.
3. **لصق الكود**: اضغط **Edit code** ← امسح الكود الموجود والصق محتوى `gemini-worker.js` كاملًا ← **Deploy**.
4. **المفتاح السري**: ارجع لصفحة الـ Worker ← **Settings** ← **Variables and Secrets** ← **Add** ← النوع **Secret** ← الاسم `GEMINI_API_KEY` ← القيمة المفتاح ← **Deploy**.
   (اختياري) أضف متغيرًا `ALLOWED_ORIGIN` بقيمة `https://alazm1.github.io` حتى لا يستخدم الخادم أحد غير موقعك.
5. **الرابط**: من صفحة الـ Worker انسخ الرابط بصيغة `https://jadwal-reader.<اسمك>.workers.dev`.
6. **ربطه بالتطبيق**: افتح الملف `public/smart-reader.json` في المستودع على GitHub ← عدّله ← ضع الرابط في الحقل `url` ← احفظ. سيُنشر التطبيق تلقائيًا خلال دقيقة.

للتحقق: افتح رابط الـ Worker في المتصفح؛ يجب أن يظهر `{"ok":true,...,"configured":true}`.

## الخصوصية

تُرسل الصورة إلى Gemini للقراءة فقط ولا يحتفظ الخادم بها ولا بالنتيجة. في الفئة المجانية قد تستخدم Google المحتوى لتحسين خدماتها؛ التطبيق يعرض هذا للمعلم ويتيح له إيقاف القراءة الذكية والاكتفاء بالقراءة المحلية.
