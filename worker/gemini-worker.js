/**
 * جدول المعلم — خادم القراءة الذكية (Cloudflare Worker)
 *
 * يستقبل صورة الجدول من التطبيق، يرسلها إلى Google Gemini لقراءتها، ويعيد
 * الحصص كبيانات منظمة. المفتاح يبقى هنا فقط (متغير سري GEMINI_API_KEY)
 * ولا يظهر أبدًا في كود الموقع. لا تُحفظ الصور ولا النتائج.
 *
 * المتغيرات:
 *   GEMINI_API_KEY  (سري)   مفتاح Google AI Studio
 *   GEMINI_MODEL    (اختياري) الافتراضي gemini-2.5-flash
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
- subject: اسم المادة أو الدرس إن وُجد، وإلا اتركه فارغًا. لا تضع أوقاتًا ولا كلمات مثل "محضرة" أو "طباعة وتنزيل".
- الخانات الفارغة لا تُذكر. لا تخترع حصصًا غير ظاهرة.
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
    if (request.method === 'GET') return json({ ok: true, service: 'jadwal-smart-reader', model: env.GEMINI_MODEL || 'gemini-2.5-flash', configured: !!env.GEMINI_API_KEY }, 200, cors);
    if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405, cors);
    if (allowed && origin && !allowed.includes(origin)) return json({ error: 'origin-not-allowed' }, 403, cors);
    if (!env.GEMINI_API_KEY) return json({ error: 'not-configured' }, 500, cors);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'bad-request' }, 400, cors);
    }
    const { image, mime } = body || {};
    if (typeof image !== 'string' || image.length < 100 || image.length > 8_000_000) return json({ error: 'bad-image' }, 400, cors);
    const mimeType = ['image/jpeg', 'image/png', 'image/webp'].includes(mime) ? mime : 'image/jpeg';
    const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const payload = {
      contents: [{ role: 'user', parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: image } }] }],
      generationConfig: { temperature: 0, response_mime_type: 'application/json', response_schema: SCHEMA },
    };

    let upstream;
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return json({ error: 'upstream-unreachable', detail: String(e) }, 502, cors);
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
    const lessons = Array.isArray(parsed.lessons) ? parsed.lessons.filter((l) => l && typeof l.day === 'string' && Number.isInteger(l.period)).slice(0, 120) : [];
    return json({ ok: true, model, periodsCount: parsed.periodsCount ?? null, lessons, notes: parsed.notes ?? '' }, 200, cors);
  },
};
