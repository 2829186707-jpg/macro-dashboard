// 宏观雷达 · 双源行情抓取
// 源1 腾讯 qt.gtimg.cn：美股三大指数(usDJI/usIXIC/usINX) + WTI(hf_CL) + COMEX黄金(hf_GC)，GBK
// 源2 东财 push2delay：美债 10Y/30Y/2Y/5Y + 美元指数(UDI)，JSON
// 任一源失败只影响该源品种，其余保持输出。
const TX = 'https://qt.gtimg.cn/q=';
const EM = 'https://push2delay.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=171.US10Y,171.US30Y,171.US2Y,171.US5Y,100.UDI&fields=f2,f3,f4,f12,f14';

async function txGet(symbols) {
  const r = await fetch(TX + symbols.join(','), { headers: { 'Referer': 'https://gu.qq.com/' } });
  const buf = Buffer.from(await r.arrayBuffer());
  return new TextDecoder('gbk').decode(buf);
}
function parseTxLine(line) {
  // v_usDJI="1~道琼斯~DJI~51511.59~..."
  const m = line.match(/v_\w+="([^"]+)"/);
  if (!m) return null;
  const a = m[1].split('~');
  return a;
}
function parseHf(line) {
  // v_hf_CL="~WTI原油~...~89.47~..."  逗号分隔
  const m = line.match(/v_\w+="([^"]+)"/);
  if (!m) return null;
  return m[1].split('~');
}

(async () => {
  const out = {};
  // 腾讯：美股三大指数
  try {
    const txt = await txGet(['usDJI', 'usIXIC', 'usINX']);
    for (const line of txt.split(';')) {
      const a = parseTxLine(line);
      if (!a || a.length < 33) continue;
      // a[1]=名称 a[3]=现价 a[31]=涨跌额 a[32]=涨跌幅
      const name = a[1];
      out[name] = { price: a[3], chg: a[31], pct: a[32] };
    }
  } catch (e) { out._tx_us = 'FAIL: ' + e.message; }
  // 腾讯：期货（逗号分隔：[0]最新价 [1]涨跌额 [7]昨结 [13]名称）
  try {
    const txt = await txGet(['hf_CL', 'hf_GC']);
    for (const line of txt.split(';')) {
      const m = line.match(/v_\w+="([^"]+)"/);
      if (!m) continue;
      const a = m[1].split(',');
      if (a.length < 14) continue;
      const price = parseFloat(a[0]);
      const chg = parseFloat(a[1]);
      const prev = parseFloat(a[7]);
      const pct = prev ? (chg / prev * 100).toFixed(2) : '0.00';
      out[a[13]] = { price: a[0], chg: a[1], pct, time: a[6], date: a[12] };
    }
  } catch (e) { out._tx_hf = 'FAIL: ' + e.message; }
  // 东财：美债+美元
  try {
    const r = await fetch(EM);
    const j = await r.json();
    out._em = (j.data && j.data.diff) ? j.data.diff.map(x => ({ name: x.f14, price: x.f2, pct: x.f3 })) : j;
  } catch (e) { out._em = 'FAIL: ' + e.message; }
  console.log(JSON.stringify(out, null, 2));
})();
