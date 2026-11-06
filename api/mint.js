// mint: the NFT that hedges against the stock market.
// Every mint is a Metaplex Core NFT with its own vault (the asset's signer PDA) holding tokenized gold (Gold xStock, GLDx)
// and dollars (USDC), plus an optional crash bet: a real "S&P 500 dips to X by end of December" YES position on Polymarket,
// bought through Jupiter's prediction API from the minter's wallet. Everything is built here and signed in the user's wallet.
const { Connection, PublicKey, Keypair, Transaction, SystemProgram, VersionedTransaction, ComputeBudgetProgram } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, createCloseAccountInstruction } = require('@solana/spl-token');
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { createNoopSigner, createSignerFromKeypair, signerIdentity, publicKey: upk } = require('@metaplex-foundation/umi');
const { mplCore, create, execute, burnV1, findAssetSignerPda } = require('@metaplex-foundation/mpl-core');
const { toWeb3JsInstruction, fromWeb3JsInstruction, fromWeb3JsKeypair } = require('@metaplex-foundation/umi-web3js-adapters');

const RPCS = [process.env.RPC_URL, 'https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'].filter(Boolean);
let conn = new Connection(RPCS[0], 'confirmed');
const JUP = 'https://lite-api.jup.ag';
const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const GOLD = 'Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re';      // Gold xStock (GLDx), Token-2022, 8 decimals
const SPY = 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W';       // SP500 xStock (SPYx), for the live market board
const CRASH_EVENT = 'POLY-148014';                              // "What will S&P 500 (SPX) hit by end of December?"
const TAG = new PublicKey('G5zjkWuBN2sN6PJCWdz2MXZyd7GxMgAPPcGkFKpWfGfZ'); // every mint carries a 0-lamport transfer here, so the gallery can find it
const CORE = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
const RESERVE = 12_000_000;   // lamports kept back for the asset account, two vault accounts and fees
const MIN_BET_USD = 5.4;      // Jupiter's minimum order is $5; a little over so slippage on SOL→USDC never drops it under

const umiBase = () => createUmi(RPCS[0]).use(mplCore());
const pk = (s, msg) => { try { return new PublicKey(String(s)); } catch { throw Object.assign(new Error(msg || 'bad address'), { code: 400 }); } };
const bad = msg => Object.assign(new Error(msg), { code: 400 });
const body = req => new Promise(ok => { if (req.body && typeof req.body === 'object') return ok(req.body); let d = ''; req.on('data', c => d += c); req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch { ok({}); } }); });
const getJ = async (url, opt, tries = 4) => { for (let i = 0; ; i++) { try { return await getJ1(url, opt); } catch (e) { if (i >= tries || !/too many|429|rate/i.test(e.message)) throw e; await new Promise(r => setTimeout(r, 600 * Math.pow(1.8, i) + Math.random() * 300)); } } };
const getJ1 = async (url, opt) => { const r = await fetch(url, { ...opt, headers: { accept: 'application/json', 'content-type': 'application/json', ...(opt && opt.headers) } }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { throw new Error(`${new URL(url).pathname} ${r.status}`); } if (!r.ok) throw Object.assign(new Error(j.error || j.message || `${new URL(url).pathname} ${r.status}`), { code: r.status >= 500 ? 502 : 400 }); return j; };
async function rpc(fn) { let err; for (let i = 0; i < RPCS.length; i++) { try { return await fn(conn); } catch (e) { err = e; conn = new Connection(RPCS[(RPCS.indexOf(conn.rpcEndpoint) + 1) % RPCS.length], 'confirmed'); } } throw err; }

const TOK = {};
async function token(mint) { if (TOK[mint]) return TOK[mint]; const a = await rpc(c => c.getAccountInfo(new PublicKey(mint))); if (!a) throw new Error('token not found'); return TOK[mint] = { program: a.owner, decimals: a.data[44] }; }
const signerOf = asset => new PublicKey(findAssetSignerPda(umiBase(), { asset: upk(asset.toBase58()) })[0]);
const vaultOf = async (asset, mint) => { const t = await token(mint); return { ata: getAssociatedTokenAddressSync(new PublicKey(mint), signerOf(asset), true, t.program), ...t }; };

// ---------------------------------------------------------------- market data (all real, all public)
async function prices() {
  const d = await getJ(`${JUP}/price/v3?ids=${[SOL, GOLD, SPY, USDC].join(',')}`);
  const p = id => d[id] ? { usd: d[id].usdPrice, ch24: d[id].priceChange24h ?? null, liquidity: d[id].liquidity ?? null } : null;
  return { sol: p(SOL), gold: p(GOLD), spy: p(SPY), usdc: p(USDC) };
}
async function crashMarkets() {
  const d = await getJ(`${JUP}/prediction/v1/events/${CRASH_EVENT}`); const ev = d.data || d;
  return { title: ev.metadata && ev.metadata.title, closes: ev.metadata && ev.metadata.closeTime,
    volume: +ev.volumeUsd / 1e6, image: ev.metadata && ev.metadata.imageUrl, slug: ev.metadata && ev.metadata.slug,
    rules: ((ev.markets || [])[0] || {}).rulesPrimary ? String(ev.markets[0].rulesPrimary).slice(0, 900) : null,
    markets: (ev.markets || []).filter(m => m.status === 'open' && /↓/.test(m.title || ''))
      .map(m => ({ id: m.marketId, level: +String(m.title).replace(/[^\d.]/g, ''), yes: m.pricing ? m.pricing.buyYesPriceUsd / 1e6 : null, bid: m.pricing ? m.pricing.sellYesPriceUsd / 1e6 : null, volume: m.pricing ? m.pricing.volume : 0 }))
      .filter(m => m.yes && m.yes > 0 && m.yes < 1).sort((a, b) => b.level - a.level) };
}
async function mintCount() { let n = 0, before; for (let i = 0; i < 5; i++) { const s = await rpc(c => c.getSignaturesForAddress(TAG, { limit: 1000, before })); n += s.length; if (s.length < 1000) break; before = s[s.length - 1].signature; } return n; }

// ---------------------------------------------------------------- jupiter swap into a token account (a mint's vault, or the wallet's own)
async function swapTx(wallet, outMint, lamports, dest) {
  const q = await getJ(`${JUP}/swap/v1/quote?inputMint=${SOL}&outputMint=${outMint}&amount=${lamports}&slippageBps=100&maxAccounts=40`);
  const s = await getJ(`${JUP}/swap/v1/swap`, { method: 'POST', body: JSON.stringify({ quoteResponse: q, userPublicKey: wallet.toBase58(), ...(dest ? { destinationTokenAccount: dest.toBase58() } : {}), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 400000, priorityLevel: 'high' } } }) });
  return { tx: s.swapTransaction, out: q.outAmount, impact: q.priceImpactPct };
}
const tagIx = (wallet, asset) => { const ix = SystemProgram.transfer({ fromPubkey: wallet, toPubkey: TAG, lamports: 0 }); ix.keys.push({ pubkey: asset, isSigner: false, isWritable: false }); return ix; };
const legacy = async (wallet, ixs, signers = []) => { const tx = new Transaction(); tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 60000 }), ...ixs); tx.feePayer = wallet; tx.recentBlockhash = (await rpc(c => c.getLatestBlockhash('confirmed'))).blockhash; if (signers.length) tx.partialSign(...signers); return tx; };
const b64 = tx => Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64');
const umiFor = wallet => { const u = umiBase(); u.use(signerIdentity(createNoopSigner(upk(wallet.toBase58())))); return u; };
const coreCreate = (wallet, assetKp, name, uri) => { const u = umiFor(wallet); return create(u, { asset: createSignerFromKeypair(u, fromWeb3JsKeypair(assetKp)), name, uri, owner: upk(wallet.toBase58()) }).getInstructions().map(toWeb3JsInstruction); };

// plan how a mint's SOL is split: the bet (≥ $5.4 of SOL, if any), the vault (gold % / dollars %), and the reserve
function split(sol, gold, betOn, solUsd) {
  const total = Math.floor(sol * 1e9), betL = betOn ? Math.ceil(MIN_BET_USD / solUsd * 1e9 * 1.015) : 0, vault = total - betL - RESERVE;
  if (vault < 8_000_000) throw bad(betOn ? `with the crash bet a mint needs at least ${((betL + RESERVE + 8e6) / 1e9).toFixed(3)} SOL` : `a mint needs at least ${((RESERVE + 8e6) / 1e9).toFixed(3)} SOL`);
  const goldL = Math.round(vault * gold / 100); return { total, betL, goldL, usdL: vault - goldL, reserve: RESERVE };
}

async function quote(q) {
  const sol = +q.sol || .25, gold = Math.max(0, Math.min(100, +q.gold || 0)), betOn = q.bet === '1';
  const p = await prices(); const s = split(sol, gold, betOn, p.sol.usd);
  const [g, u] = await Promise.all([s.goldL ? getJ(`${JUP}/swap/v1/quote?inputMint=${SOL}&outputMint=${GOLD}&amount=${s.goldL}&slippageBps=100&maxAccounts=40`) : null, s.usdL ? getJ(`${JUP}/swap/v1/quote?inputMint=${SOL}&outputMint=${USDC}&amount=${s.usdL}&slippageBps=50&maxAccounts=40`) : null]);
  return { split: s, goldOut: g ? +g.outAmount / 1e8 : 0, usdOut: u ? +u.outAmount / 1e6 : 0, betUsd: betOn ? MIN_BET_USD : 0, prices: p };
}

async function build(req) {
  const b = await body(req); const wallet = pk(b.wallet, 'connect a wallet first'); const sol = +b.sol, gold = Math.max(0, Math.min(100, Math.round(+b.gold)));
  if (!(sol > 0 && sol <= 50)) throw bad('pick an amount between 0.05 and 50 SOL');
  const betMarket = b.bet ? String(b.bet) : '';
  if (betMarket && !/^POLY-\d+$/.test(betMarket)) throw bad('unknown crash market');
  if (betMarket && /^(US|KR)$/.test(req.headers['x-vercel-ip-country'] || '')) throw bad('the crash bet runs on Jupiter, which is closed to the US and South Korea; mint without it');
  const p = await prices(); const s = split(sol, gold, !!betMarket, p.sol.usd);
  const asset = Keypair.generate(), host = req.headers['x-forwarded-host'] || req.headers.host, n = (await mintCount()) + 1;
  const vg = await vaultOf(asset.publicKey, GOLD), vu = await vaultOf(asset.publicKey, USDC), signer = signerOf(asset.publicKey);
  const ixs = [...coreCreate(wallet, asset, `mint #${n}`, `https://${host}/api/mint?a=meta&id=${asset.publicKey.toBase58()}&n=${n}`)];
  if (s.goldL) ixs.push(createAssociatedTokenAccountIdempotentInstruction(wallet, vg.ata, signer, new PublicKey(GOLD), vg.program));
  if (s.usdL) ixs.push(createAssociatedTokenAccountIdempotentInstruction(wallet, vu.ata, signer, new PublicKey(USDC), vu.program));
  ixs.push(tagIx(wallet, asset.publicKey));
  const tx1 = await legacy(wallet, ixs, [asset]);
  const out = { asset: asset.publicKey.toBase58(), vault: signer.toBase58(), n, split: s, txs: [{ kind: 'create', tx: b64(tx1) }] };
  if (b.simulate) { const r = await rpc(c => c.simulateTransaction(tx1)); out.sim = { err: r.value.err, units: r.value.unitsConsumed, logs: (r.value.logs || []).slice(-8) }; }
  // client mode: the browser fetches the Jupiter swaps itself (its own rate limit), straight into these vault accounts
  if (b.client) { out.vaults = { gold: vg.ata.toBase58(), dollars: vu.ata.toBase58() }; out.legs = { gold: s.goldL, dollars: s.usdL, bet: s.betL }; if (betMarket) out.bet = { market: betMarket }; return out; }
  if (s.goldL) { const w = await swapTx(wallet, GOLD, s.goldL, vg.ata); out.txs.push({ kind: 'gold', tx: w.tx, out: w.out }); }
  if (s.usdL) { const w = await swapTx(wallet, USDC, s.usdL, vu.ata); out.txs.push({ kind: 'dollars', tx: w.tx, out: w.out }); }
  if (betMarket) { const w = await swapTx(wallet, USDC, s.betL, null); out.txs.push({ kind: 'bet-usdc', tx: w.tx, out: w.out }); out.bet = { market: betMarket, usdc: Math.floor(Math.min(+w.out, MIN_BET_USD * 1e6) * .995) }; }
  return out;
}

// the crash bet: a YES order on an "S&P 500 dips to X" market, from the minter's own wallet (Jupiter builds it, the wallet signs)
async function order(req) {
  const b = await body(req); const wallet = pk(b.wallet, 'connect a wallet first'); const market = String(b.market || '');
  if (!/^POLY-\d+$/.test(market)) throw bad('unknown crash market');
  if (/^(US|KR)$/.test(req.headers['x-vercel-ip-country'] || '')) throw bad('the crash bet runs on Jupiter, which is closed to the US and South Korea');
  const usdc = Math.max(5_000_000, Math.floor(+b.usdc || 0));
  const d = await getJ(`${JUP}/prediction/v1/orders`, { method: 'POST', body: JSON.stringify({ ownerPubkey: wallet.toBase58(), marketId: market, isYes: true, isBuy: true, depositAmount: String(usdc), depositMint: USDC }) });
  return { tx: d.transaction, order: d.order && d.order.orderPubkey, position: d.order && d.order.positionPubkey, contracts: d.order && d.order.contractsMicro, cost: d.order && d.order.orderCostUsd, fee: d.order && d.order.estimatedTotalFeeUsd };
}
async function orderStatus(q) { return getJ(`${JUP}/prediction/v1/orders/status/${pk(q.id).toBase58()}`); }
async function claim(req) { const b = await body(req); const wallet = pk(b.wallet); const d = await getJ(`${JUP}/prediction/v1/positions/${pk(b.position).toBase58()}/claim`, { method: 'POST', body: JSON.stringify({ ownerPubkey: wallet.toBase58() }) }); return { tx: d.transaction }; }

// add more gold or dollars to any mint (anyone can top up anyone's vault)
async function topup(req) {
  const b = await body(req); const wallet = pk(b.wallet, 'connect a wallet first'); const asset = pk(b.asset, 'unknown mint'); const sol = +b.sol, what = b.what === 'dollars' ? USDC : GOLD;
  if (!(sol >= .01 && sol <= 50)) throw bad('pick an amount between 0.01 and 50 SOL');
  const a = await rpc(c => c.getAccountInfo(asset)); if (!a || !a.owner.equals(CORE)) throw bad('that is not a mint');
  const v = await vaultOf(asset, what); const pre = await legacy(wallet, [createAssociatedTokenAccountIdempotentInstruction(wallet, v.ata, signerOf(asset), new PublicKey(what), v.program)]);
  if (b.client) return { txs: [{ kind: 'vault', tx: b64(pre) }], vault: v.ata.toBase58(), mint: what, lamports: Math.floor(sol * 1e9) };
  const w = await swapTx(wallet, what, Math.floor(sol * 1e9), v.ata); return { txs: [{ kind: 'vault', tx: b64(pre) }, { kind: what === GOLD ? 'gold' : 'dollars', tx: w.tx }] };
}

// redeem: the vault pays out to the owner (via Core's execute, signed by the asset's own PDA), the vault accounts close, the NFT burns
async function redeemIxs(wallet, asset, keep) {
  const u = umiFor(wallet), signer = signerOf(asset), ixs = [], inner = [];
  for (const mint of [GOLD, USDC]) {
    const v = await vaultOf(asset, mint); const info = await rpc(c => c.getAccountInfo(v.ata)); if (!info) continue;
    const amount = info.data.readBigUInt64LE(64), mine = getAssociatedTokenAddressSync(new PublicKey(mint), wallet, false, v.program);
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(wallet, mine, wallet, new PublicKey(mint), v.program));
    if (amount > 0n) inner.push(createTransferCheckedInstruction(v.ata, new PublicKey(mint), mine, signer, amount, v.decimals, [], v.program));
    if (!keep) inner.push(createCloseAccountInstruction(v.ata, wallet, signer, [], v.program));
  }
  if (inner.length) ixs.push(...execute(u, { asset: { publicKey: upk(asset.toBase58()) }, instructions: inner.map(fromWeb3JsInstruction) }).getInstructions().map(toWeb3JsInstruction));
  if (!keep) ixs.push(...burnV1(u, { asset: upk(asset.toBase58()) }).getInstructions().map(toWeb3JsInstruction));
  return ixs;
}
async function redeem(req) {
  const b = await body(req); const wallet = pk(b.wallet, 'connect a wallet first'); const asset = pk(b.asset, 'unknown mint');
  const a = await rpc(c => c.getAccountInfo(asset)); if (!a || !a.owner.equals(CORE)) throw bad('that is not a mint');
  if (!new PublicKey(a.data.subarray(1, 33)).equals(wallet)) throw bad('only the owner of this mint can redeem it');
  const tx = await legacy(wallet, await redeemIxs(wallet, asset, !!b.keep));
  const out = { tx: b64(tx) }; if (b.simulate) { const r = await rpc(c => c.simulateTransaction(tx)); out.sim = { err: r.value.err, units: r.value.unitsConsumed, logs: (r.value.logs || []).slice(-10) }; }
  return out;
}

// a full round trip in ONE simulated transaction: create a mint, open its gold vault, pay the vault out through execute, burn
async function selftest(q) {
  const wallet = pk(q.wallet || '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9'); const asset = Keypair.generate(); const signer = signerOf(asset.publicKey); const u = umiFor(wallet);
  const vg = await vaultOf(asset.publicKey, GOLD), mine = getAssociatedTokenAddressSync(new PublicKey(GOLD), wallet, false, vg.program);
  const inner = [createTransferCheckedInstruction(vg.ata, new PublicKey(GOLD), mine, signer, 0n, vg.decimals, [], vg.program), createCloseAccountInstruction(vg.ata, wallet, signer, [], vg.program)].map(fromWeb3JsInstruction);
  const ixs = [...coreCreate(wallet, asset, 'mint #selftest', 'https://example.com/m.json'),
    createAssociatedTokenAccountIdempotentInstruction(wallet, vg.ata, signer, new PublicKey(GOLD), vg.program),
    createAssociatedTokenAccountIdempotentInstruction(wallet, mine, wallet, new PublicKey(GOLD), vg.program),
    ...execute(u, { asset: { publicKey: upk(asset.publicKey.toBase58()) }, instructions: inner }).getInstructions().map(toWeb3JsInstruction),
    ...burnV1(u, { asset: upk(asset.publicKey.toBase58()) }).getInstructions().map(toWeb3JsInstruction)];
  const tx = await legacy(wallet, ixs, [asset]); const r = await rpc(c => c.simulateTransaction(tx));
  return { err: r.value.err, units: r.value.unitsConsumed, size: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length, logs: (r.value.logs || []).filter(l => /invoke|success|failed|Error|error/i.test(l)).slice(-24) };
}

// ---------------------------------------------------------------- the gallery: every mint, its owner and what its vault holds
async function index(limit = 120) {
  const sigs = await rpc(c => c.getSignaturesForAddress(TAG, { limit })); const ok = sigs.filter(s => !s.err);
  const txs = []; for (let i = 0; i < ok.length; i += 40) txs.push(...await rpc(c => c.getTransactions(ok.slice(i, i + 40).map(s => s.signature), { maxSupportedTransactionVersion: 0 })));
  const items = [];
  txs.forEach((t, i) => { if (!t) return; const keys = t.transaction.message.accountKeys.map(k => (k.pubkey || k).toBase58 ? (k.pubkey || k).toBase58() : String(k));
    const ins = t.transaction.message.instructions; for (const ix of ins) { const acc = (ix.accounts || []).map(a => keys[a]); if (keys[ix.programIdIndex] === SystemProgram.programId.toBase58() && acc[1] === TAG.toBase58() && acc[2]) { items.push({ asset: acc[2], minter: acc[0], time: ok[i].blockTime }); break; } } });
  if (!items.length) return [];
  const assets = items.map(x => new PublicKey(x.asset)); const gV = await Promise.all(assets.map(a => vaultOf(a, GOLD))), uV = await Promise.all(assets.map(a => vaultOf(a, USDC)));
  const accs = []; const keysAll = [...assets, ...gV.map(v => v.ata), ...uV.map(v => v.ata)]; for (let i = 0; i < keysAll.length; i += 99) accs.push(...await rpc(c => c.getMultipleAccountsInfo(keysAll.slice(i, i + 99))));
  const N = assets.length; const bal = a => a && a.data.length >= 72 ? Number(a.data.readBigUInt64LE(64)) : 0;
  return items.map((x, i) => { const a = accs[i]; const name = a ? (() => { const len = a.data.readUInt32LE(66); return a.data.subarray(70, 70 + len).toString(); })() : null;
    return { ...x, alive: !!a, owner: a ? new PublicKey(a.data.subarray(1, 33)).toBase58() : null, name, gold: bal(accs[N + i]) / 1e8, usd: bal(accs[2 * N + i]) / 1e6 }; });
}
async function positions(wallet) { try { const d = await getJ(`${JUP}/prediction/v1/positions?ownerPubkey=${wallet}`); return (d.data || []).filter(p => /S&P|SPX/.test(JSON.stringify(p.marketMetadata || {}))).map(p => ({ pubkey: p.pubkey, market: p.marketId, title: p.marketMetadata && (p.marketMetadata.title || p.marketMetadata.question), contracts: +p.contracts / 1e6, claimable: !!p.claimable, claimed: !!p.claimed, payoutUsd: p.payoutUsd, pnlUsd: p.pnlUsd })); } catch (e) { return { error: e.message }; } }

// ---------------------------------------------------------------- metadata + a pixel image per mint (pngjs, no files)
const PALS = [['#3fe6a6', '#0c1512'], ['#f2b63f', '#0c1512'], ['#3d63dd', '#effff8'], ['#8a6cf0', '#effff8'], ['#f06b7e', '#0c1512'], ['#0c1512', '#3fe6a6']];
function leafCells() { const out = []; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const p = x - y, q = x + y - 15, t = (p + 9) / 22;
  if (p >= -9 && p <= 13) { const w = 5.3 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, .74))), .8); if (Math.abs(q) <= w) out.push([x, y, q === 0 && p < 11 ? 'r' : 'b']); } else if (q === 0 && (p === -11 || p === -13)) out.push([x, y, 'b']); } return out; }
const FONT = { '#': ['01010', '11111', '01010', '11111', '01010'], 0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'], 6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'] };
function png(id, n) {
  const { PNG } = require('pngjs'); const S = 64, SC = 8, img = new PNG({ width: S * SC, height: S * SC }); let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const [bg, fg] = PALS[h % PALS.length];
  const rgb = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; const grid = Array.from({ length: S }, () => Array(S).fill(rgb(bg)));
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < S && y < S) grid[y][x] = c; };
  const shadow = bg === '#0c1512' ? rgb('#0a4d38') : rgb(bg).map(v => Math.round(v * .72)), F = rgb(fg), rib = rgb(bg === '#0c1512' ? '#effff8' : bg);
  for (const [x, y] of leafCells()) for (let a = 0; a < 2; a++) for (let b2 = 0; b2 < 2; b2++) put(16 + x * 2 + a + 2, 13 + y * 2 + b2 + 2, shadow);
  for (const [x, y, k] of leafCells()) for (let a = 0; a < 2; a++) for (let b2 = 0; b2 < 2; b2++) put(16 + x * 2 + a, 13 + y * 2 + b2, k === 'r' ? rib : F);
  let cx = 5; for (const ch of '#' + String(n || '')) { const g = FONT[ch]; if (!g) continue; g.forEach((row, yy) => [...row].forEach((v, xx) => { if (v === '1') put(cx + xx, 4 + yy, F); })); cx += g[0].length + 1; }
  for (let x = 0; x < 9; x++) for (let y = 0; y < 3; y++) put(50 + x, 56 + y, rgb('#f2c94c')); put(50, 56, rgb(bg)); put(58, 56, rgb(bg));   // a little gold bar
  for (let y = 0; y < S * SC; y++) for (let x = 0; x < S * SC; x++) { const c = grid[Math.floor(y / SC)][Math.floor(x / SC)], i = (y * S * SC + x) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255; }
  return PNG.sync.write(img);
}

async function send(req) {
  const b = await body(req); const raw = Buffer.from(String(b.tx || ''), 'base64'); if (raw.length < 64) throw bad('nothing to send');
  const sig = await rpc(c => c.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 4 }));
  for (let i = 0; i < 40; i++) { const s = await rpc(c => c.getSignatureStatuses([sig])); const v = s.value[0]; if (v && v.err) return { sig, ok: false, err: JSON.stringify(v.err) }; if (v && (v.confirmationStatus === 'confirmed' || v.confirmationStatus === 'finalized')) return { sig, ok: true }; await new Promise(r => setTimeout(r, 1000)); }
  return { sig, ok: false, err: 'not confirmed yet, check the signature on Solscan' };
}

module.exports = async (req, res) => {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams); const a = q.a || 'status';
  try {
    if (a === 'img') { const buf = png(String(q.id || 'mint'), +q.n || 0); res.setHeader('content-type', 'image/png'); res.setHeader('cache-control', 'public, s-maxage=31536000, immutable'); return res.end(buf); }
    let out;
    if (a === 'status') { const [p, cm, n] = await Promise.allSettled([prices(), crashMarkets(), mintCount()]); out = { prices: p.value || null, crash: cm.value || null, mints: n.status === 'fulfilled' ? n.value : null, errors: [p, cm, n].filter(x => x.status === 'rejected').map(x => x.reason.message), mints_addr: { gold: GOLD, usdc: USDC, spy: SPY, core: CORE.toBase58(), tag: TAG.toBase58() } }; res.setHeader('cache-control', 's-maxage=20, stale-while-revalidate=60'); }
    else if (a === 'geo') { out = { country: req.headers['x-vercel-ip-country'] || null }; res.setHeader('cache-control', 'private, no-store'); }
    else if (a === 'quote') out = await quote(q);
    else if (a === 'build') out = await build(req);
    else if (a === 'order') out = await order(req);
    else if (a === 'orderstatus') out = await orderStatus(q);
    else if (a === 'claim') out = await claim(req);
    else if (a === 'topup') out = await topup(req);
    else if (a === 'redeem') out = await redeem(req);
    else if (a === 'send') out = await send(req);
    else if (a === 'selftest') { out = await selftest(q); res.setHeader('cache-control', 's-maxage=300, stale-while-revalidate=600'); }
    else if (a === 'gallery') { out = { items: await index(+q.limit || 120) }; res.setHeader('cache-control', 's-maxage=15, stale-while-revalidate=45'); }
    else if (a === 'mine') { const w = pk(q.wallet).toBase58(); const [items, pos] = await Promise.all([index(400), positions(w)]); out = { items: items.filter(x => x.owner === w), positions: pos }; }
    else if (a === 'meta') { const id = pk(q.id).toBase58(), n = +q.n || 0; const host = req.headers['x-forwarded-host'] || req.headers.host;
      out = { name: `mint #${n}`, symbol: 'MINT', description: 'A mint: the NFT that hedges against the stock market. Its vault holds tokenized gold and dollars; burn it to take them out.', image: `https://${host}/api/mint?a=img&id=${id}&n=${n}`, external_url: `https://${host}/?m=${id}`, attributes: [{ trait_type: 'vault', value: 'Gold xStock (GLDx) + USDC' }, { trait_type: 'number', value: n }] };
      res.setHeader('cache-control', 'public, s-maxage=86400'); }
    else throw bad('unknown action');
    res.setHeader('content-type', 'application/json'); res.statusCode = 200; res.end(JSON.stringify(out));
  } catch (e) { res.setHeader('content-type', 'application/json'); res.statusCode = e.code || 500; res.end(JSON.stringify({ error: e.message })); }
};
module.exports._t = { split, leafCells, png };
