// GanPlay Wheel 公平性驗證頁腳本
// 純瀏覽器端計算，演算法逐位元組對齊 mini_api services/seed_service.py::generate_wheel_result，
// 並復現呼叫端 game_wheel.py 的 index = int(float × segments) 這一步。
//
// 演算法步驟：
//   1. msg = "{client_seed}:{nonce}"
//   2. hash_bytes = HMAC_SHA256(key=server_seed, msg) 的前 4 個 raw bytes
//   3. floatValue = b[0]/256 + b[1]/65536 + b[2]/16777216 + b[3]/4294967296  ∈ [0, 1)
//   4. index = floor(floatValue × segments)  ∈ [0, segments-1]（呼叫端計算）
const GanWheel = (() => {
  const textEncoder = new TextEncoder();

  const hmacSha256Bytes = async (keyStr, msgStr) => {
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
    // ArrayBuffer → raw bytes（禁止轉 hex 再 parse，對齊 Python digest 的原始 bytes 語意）。
    return new Uint8Array(signature);
  };

  const computeWheelResult = async (serverSeed, clientSeed, nonce, segments) => {
    const hashBytes = await hmacSha256Bytes(serverSeed, `${clientSeed}:${nonce}`);

    const floatValue =
      hashBytes[0] / 256 +
      hashBytes[1] / 65536 +
      hashBytes[2] / 16777216 +
      hashBytes[3] / 4294967296;

    // 對齊 Python int() 對正數的 floor 語意。
    const index = Math.floor(floatValue * segments);

    return { floatValue, index };
  };

  return { computeWheelResult };
})();
