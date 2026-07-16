// GanPlay Chicken / Bao / Penguin 共用公平性驗證演算法模組
// 純瀏覽器端計算，逐位元組對齊 mini_api services/seed_service.py::generate_chicken_result（Stake Fisher-Yates）。
//
// chicken / bao / penguin 三款業務底層共用同一套 Fisher-Yates 洗牌演算法，僅 total_cells（洗牌池總格數）不同：
//   chicken = 20（generate_chicken_result 預設值）、bao = 20、penguin = 22。
// 本模組把 total_cells 作為參數，避免同一份演算法在三個頁面各自複製一份（可維護性優先）。
//
// 演算法步驟：
//   ① byte 流：cursor 從 0 遞增，每輪 digest = HMAC_SHA256(key=server_seed, msg="{client_seed}:{nonce}:{cursor}")，
//      取其 32 個 raw bytes（非 hex 字串）依序 yield；cursor 用完 32 bytes 就 +1 再算下一輪。
//   ② bytes→float：每消耗 4 個 byte 組一個 float，f = byte[0]/256^1 + byte[1]/256^2 + byte[2]/256^3 + byte[3]/256^4 ∈ [0, 1)
//   ③ Fisher-Yates pick-and-remove：pool = [1..total_cells]（1-indexed）；每輪取一個 float f，
//      idx = Math.floor(f * pool.length)，full_sequence.push(pool.splice(idx, 1)[0])，直到 pool 清空。
//   ④ bone_positions = full_sequence.slice(0, bone_count)（保持 pick 順序、不排序）
//   ⑤ death_point = Math.min(...bone_positions)
const GanChicken = (() => {
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
    // ArrayBuffer → raw bytes（禁止轉 hex 再 parse，對齊 Python digest() 的原始 bytes 語意）。
    return new Uint8Array(signature);
  };

  // 產生足量 byte 流：total_cells 個 float 各需 4 bytes，每輪 HMAC 產出 32 bytes，
  // 需要的 cursor 輪數 = ceil(total_cells * 4 / 32)。
  const buildByteStream = async (serverSeed, clientSeed, nonce, totalCells) => {
    const neededBytes = totalCells * 4;
    const roundsNeeded = Math.ceil(neededBytes / 32);
    const bytes = [];
    for (let cursor = 0; cursor < roundsNeeded; cursor += 1) {
      const msg = `${clientSeed}:${nonce}:${cursor}`;
      const digestBytes = await hmacSha256Bytes(serverSeed, msg);
      for (const b of digestBytes) {
        bytes.push(b);
      }
    }
    return bytes;
  };

  const computeChickenResult = async (
    serverSeed,
    clientSeed,
    nonce,
    boneCount,
    totalCells,
  ) => {
    const bytes = await buildByteStream(serverSeed, clientSeed, nonce, totalCells);

    const pool = [];
    for (let i = 1; i <= totalCells; i += 1) {
      pool.push(i);
    }

    const fullSequence = [];
    let byteCursor = 0;
    while (pool.length > 0) {
      // ② 每 4 bytes 組一個 float ∈ [0, 1)
      let f = 0;
      for (let i = 0; i < 4; i += 1) {
        f += bytes[byteCursor + i] / 256 ** (i + 1);
      }
      byteCursor += 4;

      // ③ pick-and-remove
      const idx = Math.floor(f * pool.length);
      fullSequence.push(pool.splice(idx, 1)[0]);
    }

    const bonePositions = fullSequence.slice(0, boneCount);
    const deathPoint = Math.min(...bonePositions);

    return { fullSequence, bonePositions, deathPoint };
  };

  return { computeChickenResult };
})();
