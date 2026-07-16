// GanPlay Limbo 公平性驗證頁腳本
// 純瀏覽器端計算，演算法逐位元組對齊 mini_api services/seed_service.py::generate_limbo_result。
//
// 演算法步驟：
//   1. msg = "{client_seed}:{nonce}"
//   2. hash_hex = HMAC_SHA256(key=server_seed, msg) 的小寫 hex（key / msg 皆 UTF-8）
//   3. r = int(hash_hex[0:13], 16)  — 13 hex = 52 bit，≤ 2^52 < 2^53，Number 精度安全
//   4. X = r / 2^52  → [0, 1) 均勻分布
//   5. raw = (100 - house_edge) / (1 - X)
//   6. result_int = floor(raw)
//   7. crash_point = max(1.00, result_int / 100)，輸出 quantize 至小數點後 2 位
//
// house_edge = 100 - effective_rtp（該局實際生效的 RTP 設定），非固定值，
// 玩家對某一局核對時需以該局注單記錄的實際 effective_rtp 換算填入。
const GanLimbo = (() => {
  const textEncoder = new TextEncoder();

  const bytesToHex = (buffer) =>
    Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

  const hmacSha256Hex = async (keyStr, msgStr) => {
    const keyBytes = textEncoder.encode(keyStr);
    const msgBytes = textEncoder.encode(msgStr);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgBytes);
    return bytesToHex(signature);
  };

  const computeLimboResult = async (serverSeed, clientSeed, nonce, houseEdge) => {
    const msg = `${clientSeed}:${nonce}`;
    const hashHex = await hmacSha256Hex(serverSeed, msg);

    const r = Number(BigInt(`0x${hashHex.slice(0, 13)}`));
    const X = r / Math.pow(2, 52);
    const raw = (100 - Number(houseEdge)) / (1 - X);
    const resultInt = Math.floor(raw);
    const crashPoint = Math.max(1.0, resultInt / 100);

    return crashPoint.toFixed(2);
  };

  return { computeLimboResult };
})();
