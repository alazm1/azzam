/**
 * جدول المعلم — خادم القراءة الذكية (Cloudflare Worker)
 *
 * يستقبل صورة الجدول من التطبيق، يرسلها إلى Google Gemini لقراءتها، ويعيد
 * الحصص كبيانات منظمة. المفتاح يبقى هنا فقط (متغير سري GEMINI_API_KEY)
 * ولا يظهر أبدًا في كود الموقع. لا تُحفظ الصور ولا النتائج.
 *
 * الطلب: { image, mime, mode? } — mode = "university" لجداول طلاب الجامعة
 * (محاضرات بأوقات) بدل جدول حصص المعلم.
 *
 * المتغيرات:
 *   GEMINI_API_KEY  (سري)   مفتاح Google AI Studio
 *   GEMINI_MODEL    (اختياري) الافتراضي gemini-3.6-flash
 *   ALLOWED_ORIGIN  (اختياري) مثال https://alazm1.github.io — يقيّد الاستخدام على موقعك
 */

const SCHEMA = {
  type: 'object',
  properties: {
    periodsCount: { type: 'integer', description: 'عدد الحصص في اليوم كما يظهر في الجدول' },
    lessons: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'string', enum: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] },
          period: { type: 'integer' },
          className: { type: 'string' },
          subject: { type: 'string' },
        },
        required: ['day', 'period', 'className'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['lessons'],
};

const PROMPT = `هذه صورة جدول حصص لمعلم في مدرسة سعودية. استخرج كل الحصص بدقة.
- حدد محور الأيام (الأحد=sun، الاثنين=mon، الثلاثاء=tue، الأربعاء=wed، الخميس=thu) ومحور الحصص (الأولى=1 … الثامنة=8) من عناوين الجدول، سواء كانت الأيام في الصفوف أو في الأعمدة. إن غابت أرقام الحصص فاستنتجها من ترتيب الأعمدة أو الأوقات (الأبكر = الحصة 1).
- className: الفصل/الشعبة كما هو مكتوب بالضبط مع توحيد الشكل مثل "٢/ب" أو "ثاني/١" أو "ثالث ابتدائي/٢" أو "أول متوسط أ". حصص الانتظار تُكتب "منتظر ١".
- subject: اسم المادة الدراسية القصير فقط (مثل "رياضيات"، "لغتي"، "علوم"، "إنجليزي"، "قرآن"، "تربية بدنية") إن ظهر في الصورة. إذا ظهر عنوان درس بدل اسم المادة (مثل "حل أنظمة المتباينات") فاستنتج اسم المادة منه إن كان واضحًا (رياضيات)، وإلا اتركه فارغًا. لا تضع عناوين دروس طويلة، ولا أوقاتًا، ولا كلمات مثل "محضرة" أو "طباعة وتنزيل".
- الخانات الفارغة لا تُذكر. لا تخترع حصصًا غير ظاهرة.
أعد JSON فقط.`;

const UNIVERSITY_SCHEMA = {
  type: 'object',
  properties: {
    lectures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'string', enum: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] },
          start: { type: 'string', description: 'وقت البداية بصيغة 24 ساعة HH:MM' },
          end: { type: 'string', description: 'وقت النهاية بصيغة 24 ساعة HH:MM' },
          course: { type: 'string' },
          room: { type: 'string' },
          uncertain: { type: 'boolean' },
        },
        required: ['day', 'start', 'end', 'course'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['lectures'],
};

const UNIVERSITY_PROMPT = `هذه صورة جدول محاضرات لطالب جامعي في السعودية (مثل أنظمة البانر أو بوابة الجامعة). استخرج كل المحاضرات بدقة.
- day: يوم المحاضرة من عناوين الأعمدة أو الصفوف (الأحد=sun، الاثنين=mon، الثلاثاء=tue، الأربعاء=wed، الخميس=thu، الجمعة=fri، السبت=sat).
- start و end: وقت البداية والنهاية بصيغة 24 ساعة "HH:MM". حوّل الصيغ المختلفة: "8.0-9.50" تعني 08:00 إلى 09:50، "1:00 م-2:40 م" تعني 13:00 إلى 14:40، "10:15 AM-11:05 AM" تعني 10:15 إلى 11:05، وكل وقت بعد الظهر مسبوق بـ "م" أو "PM" أو "مساءً" يُضاف إليه 12. إذا لم يُكتب وقت داخل الخلية فاستنتجه من صف الساعة الذي تبدأ فيه الخلية وعدد الصفوف التي تمتد عليها.
- course: رمز المقرر واسمه المختصر كما هو مكتوب (مثل "101 تقن"، "طفل 3K4-220"، "قصد 414-3"، "حسب 5-431"). لا تضف أرقام الشعب الطويلة مثل "Class 11059" ولا كلمة "محاضرة".
- room: القاعة أو المبنى إن ظهر (مثل "0.229 1.1.2" أو "322 عن بعد")، وإلا اتركه فارغًا.
- uncertain: true فقط إذا كان النص غير واضح.
- المحاضرة الواحدة التي تمتد على عدة صفوف ساعات تُذكر مرة واحدة فقط. لا تخترع محاضرات غير ظاهرة، وتجاهل الخلايا الفارغة.
أعد JSON فقط.`;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN ? env.ALLOWED_ORIGIN.split(',').map((s) => s.trim()) : null;
    const cors = {
      'Access-Control-Allow-Origin': allowed ? (allowed.includes(origin) ? origin : allowed[0]) : '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'GET') return json({ ok: true, service: 'jadwal-smart-reader', model: env.GEMINI_MODEL || 'gemini-3.6-flash', configured: !!env.GEMINI_API_KEY }, 200, cors);
    if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405, cors);
    if (allowed && origin && !allowed.includes(origin)) return json({ error: 'origin-not-allowed' }, 403, cors);
    if (!env.GEMINI_API_KEY) return json({ error: 'not-configured' }, 500, cors);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'bad-request' }, 400, cors);
    }
    const { image, mime, mode } = body || {};
    const university = mode === 'university';
    if (typeof image !== 'string' || image.length < 100 || image.length > 8_000_000) return json({ error: 'bad-image' }, 400, cors);
    const mimeType = ['image/jpeg', 'image/png', 'image/webp'].includes(mime) ? mime : 'image/jpeg';
    const model = env.GEMINI_MODEL || 'gemini-3.6-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const payload = {
      contents: [{ role: 'user', parts: [{ text: university ? UNIVERSITY_PROMPT : PROMPT }, { inline_data: { mime_type: mimeType, data: image } }] }],
      generationConfig: { temperature: 0, response_mime_type: 'application/json', response_schema: university ? UNIVERSITY_SCHEMA : SCHEMA },
    };

    // إعادة المحاولة عند ضغط النموذج (503/429) قبل الاستسلام
    let upstream;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt));
      try {
        upstream = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        if (attempt === 2) return json({ error: 'upstream-unreachable', detail: String(e) }, 502, cors);
        continue;
      }
      if (upstream.status !== 503 && upstream.status !== 429) break;
    }
    if (upstream.status === 429) return json({ error: 'quota' }, 429, cors);
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return json({ error: 'upstream-error', status: upstream.status, detail: detail.slice(0, 500) }, 502, cors);
    }
    const data = await upstream.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    let parsed;
    try {
      parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch {
      return json({ error: 'unparseable', text: text.slice(0, 500) }, 502, cors);
    }
    if (university) {
      const lectures = Array.isArray(parsed.lectures) ? parsed.lectures.filter((l) => l && typeof l.day === 'string' && typeof l.start === 'string').slice(0, 120) : [];
      return json({ ok: true, model, lectures, notes: parsed.notes ?? '' }, 200, cors);
    }
    const lessons = Array.isArray(parsed.lessons) ? parsed.lessons.filter((l) => l && typeof l.day === 'string' && Number.isInteger(l.period)).slice(0, 120) : [];
    return json({ ok: true, model, periodsCount: parsed.periodsCount ?? null, lessons, notes: parsed.notes ?? '' }, 200, cors);
  },
};
