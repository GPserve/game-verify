// GanPlay Mines 公平性驗證頁腳本
// 純瀏覽器端計算，演算法逐位元組對齊 mini_api services/seed_service.py::generate_mines_result（共用 create_nums）。
//
// 演算法步驟：
//   1. hash_hex = HMAC_SHA256(key=server_seed, msg="{client_seed}:{nonce}")
//   2. 第一輪 create_nums(all_nums, hash_hex)  — all_nums 為固定號碼池（順序不可變）
//   3. seed2 = SHA256(hash_hex)
//   4. 第二輪 create_nums(第一輪結果, seed2)
//   5. result = 第二輪每個元素的 num.num（⚠ 巢狀：第二輪元素為 { num: {num, hash}, hash }）
//   6. minePositions = result 前 mine_count 個
//
// create_nums（雙輪洗牌共用核心，對齊 Python）：
//   給定 items 與 hash_str，先算 h = SHA256(hash_str)，依序把每個 item 配上當前 h，
//   每配一個後 h 左旋一位（h = h.slice(1) + h[0]），最後依 h 字典序做「穩定排序」。
const GanMines = (() => {
  const textEncoder = new TextEncoder();

  // 真相源固定號碼池（順序不可變，對齊 seed_service.py::generate_mines_result::all_nums）。
  const ALL_NUMS = [
    7, 2, 19, 25, 1, 13, 5, 24, 14, 6, 15, 9, 22, 16, 3, 17, 18, 20, 8, 21, 4,
    12, 10, 23, 11,
  ];

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

  const sha256Hex = async (str) => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      textEncoder.encode(str),
    );
    return bytesToHex(digest);
  };

  // createNums：純字串操作、無 BigInt，逐位元組對齊 Python create_nums。
  // items 可以是整數陣列（第一輪）或第一輪結果物件陣列（第二輪，形成巢狀結構）。
  const createNums = async (items, hashStr) => {
    let h = await sha256Hex(hashStr);
    const nums = [];
    for (const c of items) {
      nums.push({ num: c, hash: h });
      h = h.slice(1) + h[0];
    }
    // hex 字典序、字串比較天然對齊；Array.sort 自 ES2019 起保證穩定排序，
    // 對齊 Python list.sort 的穩定排序語意。
    nums.sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));
    return nums;
  };

  const computeMinesResult = async (serverSeed, clientSeed, nonce, mineCount) => {
    const hashHex = await hmacSha256Hex(serverSeed, `${clientSeed}:${nonce}`);

    const firstRound = await createNums(ALL_NUMS, hashHex);
    const seed2 = await sha256Hex(hashHex);
    const secondRound = await createNums(firstRound, seed2);

    // ⚠ 巢狀陷阱：secondRound 的 items 是 firstRound 的物件陣列，
    // 因此 secondRound 元素為 { num: { num, hash }, hash }，
    // 取整數必須 m.num.num（對齊 Python m["num"]["num"]），禁止壓平。
    const result = secondRound.map((m) => m.num.num);
    const minePositions = result.slice(0, mineCount);

    return { result, minePositions };
  };

  return { computeMinesResult };
})();
