// GanPlay Plinko 公平性驗證頁腳本
// 純瀏覽器端計算，演算法逐位元組對齊 mini_api services/seed_service.py::generate_plinko_result。
//
// 演算法步驟：
//   1. msg = "{client_seed}:{nonce}"
//   2. hash_bytes = HMAC_SHA512(key=server_seed, msg) 的 64 個 raw bytes（SHA-512 digest = 64 bytes）
//   3. for i in range(rows)：
//        取 hash_bytes[i*4 : i*4+4]（4 bytes）
//        f = b[0]/256 + b[1]/65536 + b[2]/16777216 + b[3]/4294967296  ∈ [0, 1)
//        direction = 1 if f > 0.5 else 0（1=右，0=左）
//   4. slot_index = directions 中 1 的個數，∈ [0, rows]
const GanPlinko = (() => {
  const textEncoder = new TextEncoder();

  const hmacSha512Bytes = async (keyStr, msgStr) => {
    const keyBytes = textEncoder.encode(keyStr);
    const msgBytes = textEncoder.encode(msgStr);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgBytes);
    // ArrayBuffer → raw bytes（禁止轉 hex 再 parse，對齊 Python digest 的原始 bytes 語意）。
    return new Uint8Array(signature);
  };

  const computePlinkoResult = async (serverSeed, clientSeed, nonce, rows) => {
    const hashBytes = await hmacSha512Bytes(serverSeed, `${clientSeed}:${nonce}`);

    const directions = [];
    for (let i = 0; i < rows; i += 1) {
      const b0 = hashBytes[i * 4];
      const b1 = hashBytes[i * 4 + 1];
      const b2 = hashBytes[i * 4 + 2];
      const b3 = hashBytes[i * 4 + 3];
      const f = b0 / 256 + b1 / 65536 + b2 / 16777216 + b3 / 4294967296;
      directions.push(f > 0.5 ? 1 : 0);
    }

    const slotIndex = directions.reduce((sum, d) => sum + d, 0);

    return { directions, slotIndex };
  };

  return { computePlinkoResult };
})();
