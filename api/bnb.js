// Mint on BNB Chain: live prices, the gallery, your mints, NFT metadata and images. Read-only; every transaction is built
// in the browser and signed in the visitor's own wallet. The vault of each Mint is a Tokenbound (ERC-6551) account.
const { ethers } = require('ethers');
const C = require('./bnb-contract.json');

const RPCS = [process.env.BSC_RPC, 'https://bsc-dataseed.bnbchain.org', 'https://bsc-dataseed1.defibit.io', 'https://bsc-rpc.publicnode.com'].filter(Boolean);
const TOK = {
  gold: { address: '0x21cAef8A43163Eea865baeE23b9C2E327696A3bf', symbol: 'XAUt', name: 'Tether Gold', decimals: 6 },
  usd: { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', name: 'Tether USD', decimals: 18 },
  short: { address: '0x17515B68378d86C38F394c666e79907dA05dcBA9', symbol: 'SQQQon', name: 'ProShares UltraPro Short QQQ (Ondo)', decimals: 18 },
  bnb: { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'BNB', name: 'BNB', decimals: 18 },
};
const MULTICALL = '0xcA11bde05977b3631167028862bE2a173976CA11';
const NFT = new ethers.Interface(C.abi), ERC20 = new ethers.Interface(['function balanceOf(address) view returns (uint256)']);
const MC = new ethers.Interface(['function aggregate3((address target,bool allowFailure,bytes callData)[] calls) view returns ((bool success,bytes returnData)[])']);

let rpcI = 0;
async function rpc(method, params) {
  let err;
  for (let k = 0; k < RPCS.length; k++) {
    const url = RPCS[(rpcI + k) % RPCS.length];
    try { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (j.error) throw new Error(j.error.message); rpcI = (rpcI + k) % RPCS.length; return j.result; }
    catch (e) { err = e; }
  }
  throw err;
}
const call = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
async function multicall(calls) { // [{to, data}] -> [hex | null]
  const out = [];
  for (let i = 0; i < calls.length; i += 150) {
    const chunk = calls.slice(i, i + 150);
    const res = MC.decodeFunctionResult('aggregate3', await call(MULTICALL, MC.encodeFunctionData('aggregate3', [chunk.map(c => ({ target: c.to, allowFailure: true, callData: c.data }))])))[0];
    res.forEach(r => out.push(r.success ? r.returnData : null));
  }
  return out;
}
const deployed = async () => (await rpc('eth_getCode', [C.address, 'latest'])).length > 2;

async function prices() {
  const ids = Object.values(TOK).map(t => t.address).join(',');
  const r = await fetch(`https://api.dexscreener.com/tokens/v1/bsc/${ids}`); const pairs = await r.json();
  const out = {};
  for (const [k, t] of Object.entries(TOK)) {
    const ps = (Array.isArray(pairs) ? pairs : []).filter(p => p.baseToken && p.baseToken.address.toLowerCase() === t.address.toLowerCase()).sort((a, b) => ((b.liquidity || {}).usd || 0) - ((a.liquidity || {}).usd || 0));
    const p = ps[0]; out[k] = p ? { usd: +p.priceUsd, ch24: p.priceChange ? p.priceChange.h24 : null, liquidity: ps.reduce((a, x) => a + ((x.liquidity || {}).usd || 0), 0), pool: p.pairAddress, dex: p.dexId, vol24: ps.reduce((a, x) => a + ((x.volume || {}).h24 || 0), 0) } : null;
  }
  if (out.usd) out.usd.usd = out.usd.usd || 1;
  return out;
}

async function index(owner) {
  if (!(await deployed())) return { deployed: false, items: [] };
  const n = Number(NFT.decodeFunctionResult(owner ? 'balanceOf' : 'totalSupply', await call(C.address, owner ? NFT.encodeFunctionData('balanceOf', [owner]) : NFT.encodeFunctionData('totalSupply', [])))[0]);
  const count = Math.min(n, 400);
  const idCalls = Array.from({ length: count }, (_, i) => ({ to: C.address, data: owner ? NFT.encodeFunctionData('tokenOfOwnerByIndex', [owner, i]) : NFT.encodeFunctionData('tokenByIndex', [n - 1 - i]) }));
  const ids = (await multicall(idCalls)).map(r => r && NFT.decodeFunctionResult(owner ? 'tokenOfOwnerByIndex' : 'tokenByIndex', r)[0]).filter(x => x != null);
  const meta = await multicall(ids.flatMap(id => [{ to: C.address, data: NFT.encodeFunctionData('ownerOf', [id]) }, { to: C.address, data: NFT.encodeFunctionData('numberOf', [id]) }, { to: C.address, data: NFT.encodeFunctionData('vaultOf', [id]) }]));
  const vaults = ids.map((_, i) => meta[i * 3 + 2] && NFT.decodeFunctionResult('vaultOf', meta[i * 3 + 2])[0]);
  const bals = await multicall(vaults.flatMap(v => ['gold', 'usd', 'short'].map(k => ({ to: TOK[k].address, data: ERC20.encodeFunctionData('balanceOf', [v]) }))));
  const items = ids.map((id, i) => {
    const b = k => { const r = bals[i * 3 + ['gold', 'usd', 'short'].indexOf(k)]; return r ? Number(ethers.formatUnits(ERC20.decodeFunctionResult('balanceOf', r)[0], TOK[k].decimals)) : 0; };
    return { id: '0x' + id.toString(16), owner: meta[i * 3] && NFT.decodeFunctionResult('ownerOf', meta[i * 3])[0], number: meta[i * 3 + 1] ? Number(NFT.decodeFunctionResult('numberOf', meta[i * 3 + 1])[0]) : 0, vault: vaults[i], gold: b('gold'), usd: b('usd'), short: b('short') };
  });
  items.sort((a, b) => b.number - a.number);
  return { deployed: true, total: n, items };
}

// a 64x64 pixel image per Mint (the same leaf as the site), BNB-yellow corner chip
function leafCells() { const out = []; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const p = x - y, q = x + y - 15, t = (p + 9) / 22;
  if (p >= -9 && p <= 13) { const w = 5.3 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, .74))), .8); if (Math.abs(q) <= w) out.push([x, y, q === 0 && p < 11 ? 'r' : 'b']); } else if (q === 0 && (p === -11 || p === -13)) out.push([x, y, 'b']); } return out; }
const PALS = [['#3fe6a6', '#0c1512'], ['#f2b63f', '#0c1512'], ['#3d63dd', '#effff8'], ['#8a6cf0', '#effff8'], ['#f06b7e', '#0c1512'], ['#0c1512', '#3fe6a6']];
const FONT = { '#': ['01010', '11111', '01010', '11111', '01010'], 0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'], 6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'] };
function png(id, n) {
  const { PNG } = require('pngjs'); const S = 64, SC = 8, img = new PNG({ width: S * SC, height: S * SC }); let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const [bg, fg] = PALS[h % PALS.length];
  const rgb = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; const grid = Array.from({ length: S }, () => Array(S).fill(rgb(bg)));
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < S && y < S) grid[y][x] = c; };
  const shadow = bg === '#0c1512' ? rgb('#0a4d38') : rgb(bg).map(v => Math.round(v * .72)), F = rgb(fg), rib = rgb(bg === '#0c1512' ? '#effff8' : bg);
  const cells = leafCells(); for (const [x, y] of cells) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) put(16 + x * 2 + a + 2, 13 + y * 2 + b + 2, shadow);
  for (const [x, y, k] of cells) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) put(16 + x * 2 + a, 13 + y * 2 + b, k === 'r' ? rib : F);
  let cx = 5; for (const ch of '#' + String(n || '')) { const g = FONT[ch]; if (!g) continue; g.forEach((row, yy) => [...row].forEach((v, xx) => { if (v === '1') put(cx + xx, 4 + yy, F); })); cx += g[0].length + 1; }
  const Y = rgb('#f0b90b'); for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) if (Math.abs(x - 3) + Math.abs(y - 3) <= 3) put(52 + x, 52 + y, Y); // a small BNB-yellow diamond
  for (let y = 0; y < S * SC; y++) for (let x = 0; x < S * SC; x++) { const c = grid[Math.floor(y / SC)][Math.floor(x / SC)], i = (y * S * SC + x) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255; }
  return PNG.sync.write(img);
}

module.exports = async (req, res) => {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams); const a = q.a || 'status';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try {
    if (a === 'img') { let n = +q.n || 0; if (!n && q.id) { try { n = Number(NFT.decodeFunctionResult('numberOf', await call(C.address, NFT.encodeFunctionData('numberOf', [BigInt(q.id)])))[0]); } catch (e) {} }
      res.setHeader('content-type', 'image/png'); res.setHeader('cache-control', 'public, s-maxage=31536000, immutable'); return res.end(png(String(q.id || 'mint'), n)); }
    let out;
    if (a === 'status') { const [p, d] = await Promise.allSettled([prices(), deployed()]); out = { prices: p.value || null, deployed: d.value || false, contract: C.address, tokens: TOK, errors: [p, d].filter(x => x.status === 'rejected').map(x => x.reason.message) }; if (out.deployed) { try { out.minted = Number(NFT.decodeFunctionResult('minted', await call(C.address, NFT.encodeFunctionData('minted', [])))[0]); } catch (e) {} } res.setHeader('cache-control', 's-maxage=20, stale-while-revalidate=60'); }
    else if (a === 'gallery') { out = await index(null); res.setHeader('cache-control', 's-maxage=15, stale-while-revalidate=45'); }
    else if (a === 'mine') { out = await index(ethers.getAddress(String(q.wallet))); }
    else if (a === 'meta') { const id = BigInt(q.id); let n = 0; try { n = Number(NFT.decodeFunctionResult('numberOf', await call(C.address, NFT.encodeFunctionData('numberOf', [id])))[0]); } catch (e) {}
      out = { name: `Mint #${n}`, symbol: 'MINT', description: 'Mint: the NFT that hedges against the stock market, on BNB Chain. Its vault is a Tokenbound (ERC-6551) account holding tokenized gold (XAUt), dollars (USDT) and an inverse Nasdaq-100 token (SQQQon). Whoever owns the NFT owns the vault.', image: `https://${host}/api/bnb?a=img&id=0x${id.toString(16)}&n=${n}`, external_url: `https://${host}/bnb`, attributes: [{ trait_type: 'number', value: n }, { trait_type: 'chain', value: 'BNB Chain' }] };
      res.setHeader('cache-control', 'public, s-maxage=3600'); }
    else if (a === 'contract') { out = { address: C.address, factory: C.factory, salt: C.salt, deployData: C.deployData, baseURI: C.baseURI }; res.setHeader('cache-control', 'public, s-maxage=86400'); }
    else throw Object.assign(new Error('unknown action'), { code: 400 });
    res.setHeader('content-type', 'application/json'); res.statusCode = 200; res.end(JSON.stringify(out));
  } catch (e) { res.setHeader('content-type', 'application/json'); res.statusCode = e.code || 500; res.end(JSON.stringify({ error: e.message })); }
};
module.exports._t = { png, index, prices };
