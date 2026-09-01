// GanPlay Fruit King 公平性驗證頁腳本
// 純瀏覽器端計算，演算法逐位元組對齊 mini_api services/seed_service.py::generate_slot_result。
//
// 演算法步驟：
//   1. byte 流：HMAC_SHA256(key=server_seed, msg="{client_seed}:{nonce}:{cursor}")，
//      cursor 自 0 遞增，每輪產出 32 bytes 依序消耗。
//   2. 每軸依序消耗 4 bytes 組成 float：f = Σ byte[i] / 256^(i+1)，值域 [0, 1)。
//   3. 該軸停止位置 stop = floor(f × 該軸環帶長度)。
//   4. 盤面第 row 列第 reel 軸的符號 = 環帶[(stop + row) % 環帶長度]。
//
// 環帶（REEL_STRIPS）為本局規格的一部分、由產線決定性展開後導出，順序不可變；
// 玩家可依上述步驟自行重建盤面，結果必與遊戲端一致。
const GanFruitKing = (() => {
  const textEncoder = new TextEncoder();

  const ROWS = 3;

  // 各軸環帶：對齊 fruit_king_config.py::REEL_STRIPS（順序即規格，不可重排）
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
    // Reel 3 (30 stops)
    [
      "L01", "L02", "L03", "L04", "L05", "H01",
      "H02", "H03", "H04", "WILD", "L01", "L02",
      "L03", "L04", "L05", "H01", "H02", "H04",
      "L01", "L02", "L03", "L04", "SCATTER", "L01",
      "L02", "L03", "L01", "L02", "L01", "L01",
    ],
    // Reel 4 (30 stops)
    [
      "L01", "L02", "L03", "L04", "L05", "H01",
      "H02", "H03", "H04", "WILD", "L01", "L02",
      "L03", "L04", "L05", "H01", "H02", "H04",
      "L01", "L02", "L03", "L04", "SCATTER", "L01",
      "L02", "L03", "L01", "L02", "L01", "L01",
    ],
    // Reel 5 (43 stops)
    [
      "L01", "L02", "L03", "L04", "L05", "H01",
      "H02", "H03", "H04", "WILD", "L01", "L02",
      "L03", "L04", "L05", "H01", "H02", "H04",
      "L01", "L02", "L03", "L04", "SCATTER", "L05",
      "L01", "L02", "L03", "L04", "L01", "L02",
      "L03", "L04", "L01", "L02", "L03", "L01",
      "L02", "L03", "L01", "L02", "L01", "L01",
      "L01",
    ],
  ];

  const bytesToHex = (buffer) =>
    Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

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

  /**
   * 產生各軸停止位置。逐位元組對齊 generate_slot_result。
   * @returns {Promise<number[]>} 長度 = 軸數
   */
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
   * 完整一局：觸發轉 + 全部免費轉（免轉每轉 nonce 逐轉遞增）。
   * 對齊 slot_engine.py::run_round 的免轉發放與重觸發規則。
   */

  // 20 條固定賠付線：值 = 該軸取第幾列（0 = 最上），對齊 fruit_king_config.py::PAYLINES
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

  // 賠付表：對齊 fruit_king_config.py::PAYTABLE。
  //
  // 🔴 **僅供內部判定「哪個解釋勝出」與「連幾個才算中獎」，不對外顯示。**
  // 表上的數字是賠付表原值；玩家實際拿到的倍率是它乘上商戶設定的 RTP 縮放係數，
  // 兩者不同。本頁的職責是驗證「開獎結果」，賠付金額不在此呈現（那屬 RTP 試算站）。
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
    SCATTER: { 2: 2.00, 3: 6.00, 4: 50.00, 5: 500.00 },
    WILD: { 2: 0.50, 3: 10.00, 4: 100.00, 5: 500.00 },
  };

  const WILD = "WILD";
  const SCATTER = "SCATTER";
  const FREE_TRIGGER = 3;
  const FREE_AWARD = 15;
  const FREE_CAP = 180;

  /**
   * 單線判定：取所有解釋中賠付最高者、不疊加。
   * 左起連續；WILD 可替代除 SCATTER 外任一符號、亦可自成連線。
   * 對齊 slot_engine.py::_line_candidates / _match_count / _evaluate_line。
   */
  const evaluateLine = (cells) => {
    const first = cells[0];
    if (first === SCATTER) return null;
    const candidates =
      first === WILD
        ? Object.keys(PAYTABLE).filter((sym) => sym !== SCATTER)
        : [first];

    let best = null;
    for (const candidate of candidates) {
      let count = 0;
      for (const symbol of cells) {
        const isSame = symbol === candidate;
        const isWildSub = symbol === WILD && candidate !== WILD;
        if (!isSame && !isWildSub) break;
        count += 1;
      }
      const multiplier = PAYTABLE[candidate]?.[count];
      if (multiplier === undefined) continue;
      if (best !== null && multiplier <= best.multiplier) continue;
      best = { symbol: candidate, matchCount: count, multiplier };
    }
    return best;
  };

  /** 盤面上的 SCATTER 格數（本款全為單格符號）。 */
  const countScatter = (board) => {
    let n = 0;
    for (const row of board) for (const sym of row) if (sym === SCATTER) n += 1;
    return n;
  };

  /** 單轉完整判定：中獎線清單 + scatter 數 + 是否觸發免轉。 */
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

  return { verify, generateStops, buildBoard, evaluateSpin, REEL_STRIPS, PAYLINES, ROWS };
})();
