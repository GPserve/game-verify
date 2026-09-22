// GanPlay Frog Cross 公平性驗證演算法模組
// 純瀏覽器端計算，逐位元組對齊 mini_api services/seed_service.py::generate_frog_cross_result
//（Stake Dragon Tower 官方演算法，與 chicken 共用同一套 HMAC byte 流與 Fisher-Yates，只差映射）。
//
// 演算法步驟：
//   ① byte 流：cursor 從 0 遞增，每輪 digest = HMAC_SHA256(key=server_seed, msg="{client_seed}:{nonce}:{cursor}")，
//      取其 32 個 raw bytes 依序 yield；用完 32 bytes 就 cursor+1 再算下一輪。九排共用同一條連續串流。
//   ② bytes→float：每消耗 4 個 byte 組一個 float，f = byte[0]/256^1 + byte[1]/256^2 + byte[2]/256^3 + byte[3]/256^4 ∈ [0, 1)
//   ③ 逐排 Fisher-Yates pick-and-remove：每排 pool = [1..pad_count]（1-indexed）；
//      每排只消耗 frog_count 個 float：idx = Math.floor(f * pool.length)，frogs.push(pool.splice(idx, 1)[0])；
//      取滿 frog_count 顆後 pool 剩下的即為枯葉。
//   ④ 九排共消耗 9 × frog_count 個 float（Easy 27 / Medium 18 / Hard・Expert・Master 9）。
const GanFrogCross = (() => {
  const ROWS = 9;

  // 難度 → 每排青蛙數 / 每排荷葉數（對齊 mini_api FROG_CROSS_DIFFICULTY_MAP）
  const DIFFICULTY_MAP = {
    Easy: { frogCount: 3, padCount: 4 },
    Medium: { frogCount: 2, padCount: 3 },
    Hard: { frogCount: 1, padCount: 2 },
    Expert: { frogCount: 1, padCount: 3 },
    Master: { frogCount: 1, padCount: 4 },
  };

  const textEncoder = new TextEncoder();

  const hmacSha256Bytes = async (keyStr, msgStr) => {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      textEncoder.encode(keyStr),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, textEncoder.encode(msgStr));
    return new Uint8Array(signature);
  };

  // 產生足量 byte 流：需要 floatsNeeded 個 float、各 4 bytes，每輪 HMAC 產 32 bytes。
  const buildByteStream = async (serverSeed, clientSeed, nonce, floatsNeeded) => {
    const roundsNeeded = Math.ceil((floatsNeeded * 4) / 32);
    const bytes = [];
    for (let cursor = 0; cursor < roundsNeeded; cursor += 1) {
      const digestBytes = await hmacSha256Bytes(serverSeed, `${clientSeed}:${nonce}:${cursor}`);
      for (const b of digestBytes) bytes.push(b);
    }
    return bytes;
  };

  const computeFrogCrossResult = async (serverSeed, clientSeed, nonce, difficulty) => {
    const config = DIFFICULTY_MAP[difficulty];
    if (!config) throw new Error(`unknown difficulty: ${difficulty}`);
    const { frogCount, padCount } = config;

    const bytes = await buildByteStream(serverSeed, clientSeed, nonce, ROWS * frogCount);
    let byteCursor = 0;
    const rows = [];

    for (let row = 0; row < ROWS; row += 1) {
      const pool = [];
      for (let i = 1; i <= padCount; i += 1) pool.push(i);

      const frogs = [];
      for (let k = 0; k < frogCount; k += 1) {
        let f = 0;
        for (let i = 0; i < 4; i += 1) f += bytes[byteCursor + i] / 256 ** (i + 1);
        byteCursor += 4;
        const idx = Math.floor(f * pool.length);
        frogs.push(pool.splice(idx, 1)[0]);
      }
      // 剩下的 pool 就是枯葉；fullOrder = 青蛙 pick 順序接枯葉剩餘順序（對齊 BettingRecord.full_result）
      rows.push({ frogs, sunk: pool.slice(), fullOrder: frogs.concat(pool) });
    }

    return { rows, frogCount, padCount };
  };

  return { ROWS, DIFFICULTY_MAP, computeFrogCrossResult };
})();
