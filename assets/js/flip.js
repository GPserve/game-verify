// GanPlay Flip 公平性驗證頁腳本
// 純瀏覽器端計算，演算法逐位元組對齊 mini_api services/seed_service.py::generate_flip_result。
//
// 演算法步驟：
//   1. message = "{client_seed}:{nonce}:{round}"
//   2. hash_hex = HMAC_SHA256(key=server_seed, msg=message) 的小寫 hex（key / msg 皆 UTF-8）
//   3. index = int(hash_hex[0:15], 16) % 47
//   4. new_hash = hash_hex[index : index+14]
//   5. num = int(new_hash, 16) >> 3
//   6. raw = num * 2^-53 * 2  → 範圍 [0, 2)
//   7. result = floor(raw)  → 0（Heads）或 1（Tails）
//
// 步驟 3/4/5 的中間值皆超過 Number.MAX_SAFE_INTEGER（2^53），全程使用 BigInt，
// 直到步驟 5 完成後（num <= 2^53）才安全轉為 Number 做步驟 6 的浮點運算。
const GanFlip = (() => {
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

  const computeFlipResult = async (serverSeed, clientSeed, nonce, round) => {
    const message = `${clientSeed}:${nonce}:${round}`;
    const hashHex = await hmacSha256Hex(serverSeed, message);

    const index = Number(BigInt(`0x${hashHex.slice(0, 15)}`) % 47n);
    const newHash = hashHex.slice(index, index + 14);
    const num = BigInt(`0x${newHash}`) >> 3n;

    const raw = Number(num) * Math.pow(2, -53) * 2;

    return Math.floor(raw);
  };

  return { computeFlipResult };
})();
