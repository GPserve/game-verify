// GanPlay Bunny Gold 公平性驗證頁腳本
// 純瀏覽器端計算，演算法逐位元組對齊 mini_api services/seed_service.py::generate_slot_result
// 與 modules/client/game/slot/core/slot_engine.py 的判線規則。
//
// 開獎步驟（與 Fruit King 相同）：
//   1. byte 流：HMAC_SHA256(key=server_seed, msg="{client_seed}:{nonce}:{cursor}")，
//      cursor 自 0 遞增，每輪產出 32 bytes 依序消耗。
//   2. 每軸依序消耗 4 bytes 組成 float：f = Σ byte[i] / 256^(i+1)，值域 [0, 1)。
//   3. 該軸停止位置 stop = floor(f × 該軸環帶長度)。
//   4. 盤面第 row 列第 reel 軸的符號 = 環帶[(stop + row) % 環帶長度]。
//
// 🔴 本款與 Fruit King 的差異：**加成 WILD**
//   - 四種 WILD（WILD / WILD_x2 / WILD_x3 / WILD_x5）皆可替代除 SCATTER 外任一符號。
//   - WILD 系列**自身不成賠付組合**（不在賠付表內）。
//   - 一條中獎線的加成 = 該線**中獎段內**各 WILD 的加成值**相加**（總和 0 即無加成）。
//   - 加成**參與勝出比較**：帶高加成的短連可能勝過不帶加成的長連，
//     故必須在候選迴圈內對該候選自己的中獎段求和，不可整條線求和一次共用。
const GanBunnyGold = (() => {
  const textEncoder = new TextEncoder();

  const ROWS = 3;

  // 各軸環帶：對齊 bunny_gold_config.py::REEL_STRIPS（順序即規格，不可重排）
  const REEL_STRIPS = [
    // Reel 1 (30 stops)
    [
      "L01", "L02", "L03", "L04", "L05", "H01",
      "H02", "H03", "H04", "WILD", "L01", "L02",
      "L03", "L04", "L05", "H01", "H02", "H04",
      "L01", "L02", "L03", "L04", "SCATTER", "L01",
      "L02", "L03", "L01", "L02", "L01", "L01",
    ],
    // Reel 2 (30 stops)
    [
      "L01", "L02", "L03", "L04", "L05", "H01",
      "H02", "H03", "H04", "WILD", "L01", "L02",
      "L03", "L04", "L05", "H01", "H02", "H04",
      "L01", "L02", "L03", "L04", "SCATTER", "L01",
      "L02", "L03", "L01", "L02", "L01", "L01",
    ],
    // Reel 3 (60 stops)
    [
      "L01", "L02", "L03", "L04", "L05", "H01",
      "H02", "H03", "H04", "WILD_x2", "L01", "L02",
      "L03", "L04", "L05", "H01", "H02", "H03",
      "H04", "L01", "L02", "L03", "SCATTER", "L04",
      "L05", "H01", "H02", "H04", "L01", "L02",
      "L03", "L04", "L05", "H01", "H02", "H04",
      "L01", "L02", "L03", "L04", "L01", "L02",
      "L03", "L04", "L01", "L02", "L03", "L01",
      "L02", "L03", "L01", "L02", "SCATTER", "L01",
      "L02", "L01", "L01", "L01", "L01", "L01",
    ],
    // Reel 4 (120 stops)
    [
      "L01", "L02", "L03", "L04", "L05", "H01",
      "H02", "H03", "H04", "WILD_x3", "L01", "L02",
      "L03", "L04", "L05", "H01", "H02", "H03",
      "H04", "L01", "L02", "L03", "SCATTER", "L04",
      "L05", "H01", "H02", "H03", "H04", "L01",
      "L02", "L03", "L04", "L05", "H01", "H02",
      "H03", "H04", "L01", "L02", "L03", "L04",
      "L05", "H01", "H02", "H04", "L01", "L02",
      "L03", "L04", "L05", "H01", "SCATTER", "H02",
      "H04", "L01", "L02", "L03", "L04", "L05",
      "H01", "H02", "H04", "L01", "L02", "L03",
      "L04", "L05", "H01", "H02", "H04", "L01",
      "L02", "L03", "L04", "L01", "L02", "L03",
      "L04", "L01", "L02", "L03", "SCATTER", "L04",
      "L01", "L02", "L03", "L04", "L01", "L02",
      "L03", "L01", "L02", "L03", "L01", "L02",
      "L03", "L01", "L02", "L03", "L01", "L02",
      "L01", "L02", "L01", "L02", "L01", "L02",
      "L01", "L01", "L01", "L01", "SCATTER", "L01",
      "L01", "L01", "L01", "L01", "L01", "L01",
    ],
    // Reel 5 (200 stops)
    [
      "L01", "L02", "L03", "L04", "L05", "H01",
      "H02", "H03", "H04", "WILD_x5", "L01", "L02",
      "L03", "L04", "L05", "H01", "H02", "H03",
      "H04", "L01", "L02", "L03", "SCATTER", "L04",
      "L05", "H01", "H02", "H03", "H04", "L01",
      "L02", "L03", "L04", "L05", "H01", "H02",
      "H03", "H04", "L01", "L02", "L03", "L04",
      "L05", "H01", "H02", "H03", "H04", "L01",
      "L02", "L03", "L04", "L05", "H01", "H02",
      "H04", "L01", "L02", "L03", "L04", "L05",
      "H01", "H02", "SCATTER", "H04", "L01", "L02",
      "L03", "L04", "L05", "H01", "H02", "H04",
      "L01", "L02", "L03", "L04", "L05", "H01",
      "H02", "H04", "L01", "L02", "L03", "L04",
      "L05", "L01", "L02", "L03", "L04", "L05",
      "L01", "L02", "L03", "L04", "L05", "L01",
      "L02", "L03", "L04", "L05", "L01", "L02",
      "SCATTER", "L03", "L04", "L05", "L01", "L02",
      "L03", "L04", "L01", "L02", "L03", "L04",
      "L01", "L02", "L03", "L04", "L01", "L02",
      "L03", "L04", "L01", "L02", "L03", "L04",
      "L01", "L02", "L03", "L04", "L01", "L02",
      "L03", "L04", "L01", "L02", "L03", "L04",
      "L01", "L02", "L03", "L04", "SCATTER", "L01",
      "L02", "L03", "L01", "L02", "L03", "L01",
      "L02", "L03", "L01", "L02", "L03", "L01",
      "L02", "L03", "L01", "L02", "L03", "L01",
      "L02", "L03", "L01", "L02", "L03", "L01",
      "L02", "L03", "L01", "L02", "L03", "L01",
      "L02", "L01", "L02", "L01", "L02", "L01",
      "L02", "L01", "SCATTER", "L01", "L01", "L01",
      "L01", "L01", "L01", "L01", "L01", "L01",
      "L01", "L01", "L01", "L01", "L01", "L01",
      "L01", "L01",
    ],
  ];

  // 20 條固定賠付線：值 = 該軸取第幾列（0 = 最上）
  const PAYLINES = [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0],
    [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2],
    [2, 2, 1, 0, 0],
    [1, 0, 1, 2, 1],
    [1, 2, 1, 0, 1],
    [0, 1, 1, 1, 2],
    [2, 1, 1, 1, 0],
    [1, 0, 0, 1, 2],
    [1, 2, 2, 1, 0],
    [1, 1, 0, 1, 2],
    [1, 1, 2, 1, 0],
    [0, 0, 1, 2, 1],
    [2, 2, 1, 0, 1],
    [1, 0, 1, 2, 2],
    [1, 2, 1, 0, 0],
    [0, 0, 0, 1, 2],
  ];

  // 賠付表：對齊 bunny_gold_config.py::PAYTABLE。
  //
  // 🔴 **僅供內部判定「哪個解釋勝出」與「連幾個才算中獎」，不對外顯示。**
  // 玩家實際拿到的倍率是它乘上商戶設定的 RTP 縮放係數，兩者不同；本頁只驗開獎結果。
  // 注意 WILD 系列不在此表內 —— 那正是「自身連中不賠」的實作本體。
  const PAYTABLE = {
    H01: { 3: 0.50, 4: 2.50, 5: 6.25 },
    H02: { 3: 0.50, 4: 3.75, 5: 12.50 },
    H03: { 3: 0.75, 4: 5.00, 5: 20.00 },
    H04: { 2: 0.10, 3: 1.25, 4: 5.00, 5: 37.50 },
    L01: { 2: 0.10, 3: 0.25, 4: 1.25, 5: 5.00 },
    L02: { 3: 0.25, 4: 1.25, 5: 5.00 },
    L03: { 3: 0.25, 4: 1.25, 5: 5.00 },
    L04: { 3: 0.25, 4: 1.25, 5: 5.00 },
    L05: { 3: 0.25, 4: 2.50, 5: 5.00 },
    SCATTER: { 2: 2.00, 3: 6.00, 4: 50.00, 5: 300.00 },
  };

  // 各 WILD 代號帶的加成值（WILD 為 0 = 純替代）
  const WILD_BONUS = { WILD: 0, WILD_x2: 2, WILD_x3: 3, WILD_x5: 5 };

  const SCATTER = "SCATTER";
  const FREE_TRIGGER = 3;
  const FREE_AWARD = 10;
  const FREE_CAP = 120;

  const hmacSha256Bytes = async (keyStr, msgStr) => {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      textEncoder.encode(keyStr),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      textEncoder.encode(msgStr),
    );
    return Array.from(new Uint8Array(signature));
  };

  /** 產生各軸停止位置。逐位元組對齊 generate_slot_result。 */
  const generateStops = async (serverSeed, clientSeed, nonce) => {
    let cursor = 0;
    let buffer = [];
    let index = 0;

    const nextByte = async () => {
      if (index >= buffer.length) {
        buffer = await hmacSha256Bytes(serverSeed, `${clientSeed}:${nonce}:${cursor}`);
        index = 0;
        cursor += 1;
      }
      const value = buffer[index];
      index += 1;
      return value;
    };

    const stops = [];
    for (const strip of REEL_STRIPS) {
      let f = 0;
      for (let i = 0; i < 4; i += 1) {
        f += (await nextByte()) / Math.pow(256, i + 1);
      }
      stops.push(Math.floor(f * strip.length));
    }
    return stops;
  };

  /** 由停止位置組出盤面：board[row][reel]。 */
  const buildBoard = (stops) => {
    const board = [];
    for (let row = 0; row < ROWS; row += 1) {
      const line = [];
      for (let reel = 0; reel < REEL_STRIPS.length; reel += 1) {
        const strip = REEL_STRIPS[reel];
        line.push(strip[(stops[reel] + row) % strip.length]);
      }
      board.push(line);
    }
    return board;
  };

  /**
   * 單線判定：取所有解釋中**有效值**（賠付倍數 × 該解釋自己的加成）最高者。
   * 🔴 加成必須在候選迴圈內、對該候選的中獎段逐格求和 —— 這正是
   * 「WILD 落在中獎段之外不貢獻加成」與「加成參與勝出比較」兩條規則的實作本體。
   */
  const evaluateLine = (cells) => {
    const first = cells[0];
    if (first === SCATTER) return null;
    const candidates =
      first in WILD_BONUS
        ? Object.keys(PAYTABLE).filter((sym) => sym !== SCATTER)
        : [first];

    let best = null;
    for (const candidate of candidates) {
      let count = 0;
      let bonus = 0;
      for (const symbol of cells) {
        const isSame = symbol === candidate;
        const isWildSub = symbol in WILD_BONUS && !(candidate in WILD_BONUS);
        if (!isSame && !isWildSub) break;
        if (symbol in WILD_BONUS) bonus += WILD_BONUS[symbol];
        count += 1;
      }
      const multiplier = PAYTABLE[candidate]?.[count];
      if (multiplier === undefined) continue;
      // 加總為 0 ⇒ 沒有加成、不做乘法
      const effective = bonus === 0 ? multiplier : multiplier * bonus;
      if (best !== null && effective <= best.effective) continue;
      best = { symbol: candidate, matchCount: count, bonus, effective };
    }
    return best;
  };

  const countScatter = (board) => {
    let n = 0;
    for (const row of board) for (const sym of row) if (sym === SCATTER) n += 1;
    return n;
  };

  /** 單轉完整判定：中獎線清單（含該線加成）+ scatter 數 + 是否觸發免轉。 */
  const evaluateSpin = (board) => {
    const lines = [];
    PAYLINES.forEach((payline, lineIndex) => {
      const cells = payline.map((row, reel) => board[row][reel]);
      const win = evaluateLine(cells);
      if (win) {
        lines.push({
          lineIndex,
          symbol: win.symbol,
          matchCount: win.matchCount,
          bonus: win.bonus,
          paylineRows: payline,
        });
      }
    });
    const scatterCount = countScatter(board);
    return {
      lines,
      scatterCount,
      triggersFreeSpin: scatterCount >= FREE_TRIGGER,
    };
  };

  /** 完整一局：觸發轉 + 全部免費轉（免轉每轉 nonce 逐轉遞增）。 */
  const verify = async (serverSeed, clientSeed, nonce) => {
    const baseStops = await generateStops(serverSeed, clientSeed, nonce);
    const baseBoard = buildBoard(baseStops);
    const base = { stops: baseStops, board: baseBoard, ...evaluateSpin(baseBoard) };

    const freeSpins = [];
    if (base.triggersFreeSpin) {
      let granted = Math.min(FREE_AWARD, FREE_CAP);
      let spinNonce = nonce;
      while (freeSpins.length < granted) {
        spinNonce += 1;
        const stops = await generateStops(serverSeed, clientSeed, spinNonce);
        const board = buildBoard(stops);
        const spin = { nonce: spinNonce, stops, board, ...evaluateSpin(board) };
        freeSpins.push(spin);
        if (spin.triggersFreeSpin) granted = Math.min(granted + FREE_AWARD, FREE_CAP);
      }
    }
    return { base, freeSpins };
  };

  return { verify, generateStops, buildBoard, evaluateSpin, REEL_STRIPS, PAYLINES, WILD_BONUS, ROWS };
})();
