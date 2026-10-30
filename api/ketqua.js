// API lưu kết quả cho "Trung tâm Chống lừa đảo" – chạy trên Vercel, lưu vào Upstash Redis.
// Cần: kết nối Upstash Redis (Storage) và biến môi trường MAT_KHAU.
const R_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const R_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const MAT_KHAU = process.env.MAT_KHAU || '';

async function redis(cmd) {
  const r = await fetch(R_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + R_TOKEN }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const khoa = (lop) => 'kq:' + (lop || '_');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
  if (!R_URL || !R_TOKEN) return json({ ok: false, error: 'Chưa kết nối Upstash Redis cho project (Storage > Upstash).' });
  try {
    if (req.method === 'POST') {
      let b = req.body;
      if (Buffer.isBuffer(b)) b = b.toString();
      if (typeof b === 'string') b = JSON.parse(b || '{}');
      b = b || {};
      const row = {
        t: Date.now(), lop: String(b.lop || '').slice(0, 30), nhom: String(b.nhom || '').slice(0, 5),
        ten: String(b.ten || '').slice(0, 60), hd: String(b.hd || '').slice(0, 20),
        diem: Number(b.diem) || 0, toida: Number(b.toida) || 0, ct: b.ct || {},
        may: String(b.may || '').slice(0, 20), id: String(b.id || '').slice(0, 40)
      };
      await redis(['RPUSH', khoa(row.lop), JSON.stringify(row)]);
      await redis(['SADD', 'kq:lops', row.lop || '_']);
      return json({ ok: true });
    }
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    if (q.action === 'ping') return json({ ok: true });
    if (MAT_KHAU && q.key !== MAT_KHAU) return json({ ok: false, error: 'sai-mat-khau' });
    const lop = String(q.lop || '').trim();
    const lops = lop ? [lop] : ((await redis(['SMEMBERS', 'kq:lops'])) || []);
    if (q.action === 'clear') {
      for (const l of lops) await redis(['DEL', khoa(l === '_' ? '' : l)]);
      if (!lop) await redis(['DEL', 'kq:lops']);
      return json({ ok: true });
    }
    const rows = [];
    for (const l of lops) {
      const a = (await redis(['LRANGE', khoa(l === '_' ? '' : l), '0', '-1'])) || [];
      a.forEach((s) => { try { rows.push(JSON.parse(s)); } catch (e) {} });
    }
    rows.sort((x, y) => x.t - y.t);
    return json({ ok: true, rows });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) });
  }
};
