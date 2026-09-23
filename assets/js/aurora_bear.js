// GanPlay Aurora Bear 公平性驗證頁腳本
// 純瀏覽器端計算，演算法逐位元組對齊 mini_api services/seed_service.py::generate_slot_result_with_reveal
// 與 modules/client/game/slot/aurora_bear/aurora_bear_engine.py 的整局流程。
//
// 開獎步驟：
//   1. byte 流：HMAC_SHA256(key=server_seed, msg="{client_seed}:{nonce}:{cursor}")，
//      cursor 自 0 遞增，每輪產出 32 bytes 依序消耗。
//   2. 每次依序消耗 4 bytes 組成 float：f = Σ byte[i] / 256^(i+1)，值域 [0, 1)。
//   3. 五軸依序取停止位置 stop = floor(f × 該軸環帶長度)。
//   4. 緊接著同一條 byte 流再取一次 float，揭曉索引 = floor(f × 9)，
//      盤面上所有 MYSTERY 同時揭曉為 REVEAL_ORDER[揭曉索引]。
//   5. 盤面為不等高 3-4-4-4-3：第 reel 軸第 row 列 = 環帶[(stop + row) % 環帶長度]。
//
// 🔴 本款與前兩款的差異
//   - 候選符號只取該線**實際出現過**的一般符號：整條線全是 WILD 時不賠。
//   - 免費轉：觸發轉盤面上的 WILD 全部黏住；之後每轉新出的 WILD 也黏住。
//     每顆黏著 WILD 第一次被中獎線通過只「點亮」，之後每再被通過一次 combo +1（上限 10），
//     combo 查表得倍率；一條中獎線取中獎段內最大的倍率。賠付線依序號逐條判定、即時累計。
//   - 免費轉先給 10 轉，免轉中再出 3 顆 SCATTER 加 10 轉，最多 30 轉；第 i 轉 nonce = 起始 nonce + 1 + i。
const GanAuroraBear = (() => {
  const textEncoder = new TextEncoder();

  const ROWS_BY_REEL = [3, 4, 4, 4, 3];

  // 首尾兩軸（軸 1、軸 5）共用：118 格
  const EDGE_STRIP = [
    "SCATTER", "H01", "MYSTERY", "H02", "H03", "MYSTERY",
    "L01", "L02", "L03", "MYSTERY", "L04", "L05",
    "L06", "H01", "MYSTERY", "H02", "H03", "L01",
    "MYSTERY", "L02", "L03", "L04", "L05", "MYSTERY",
    "L06", "H01", "H02", "MYSTERY", "H03", "L01",
    "L02", "L03", "MYSTERY", "L04", "L05", "L06",
    "MYSTERY", "H01", "H02", "H03", "L01", "MYSTERY",
    "L02", "L03", "L04", "MYSTERY", "L05", "L06",
    "H01", "H02", "MYSTERY", "H03", "L01", "L02",
    "MYSTERY", "L03", "L04", "L05", "L06", "SCATTER",
    "H01", "MYSTERY", "H02", "H03", "MYSTERY", "L01",
    "L02", "L03", "MYSTERY", "L04", "L05", "L06",
    "H01", "MYSTERY", "H02", "H03", "L01", "MYSTERY",
    "L02", "L03", "L04", "L05", "MYSTERY", "L06",
    "H01", "H02", "MYSTERY", "H03", "L01", "L02",
    "L03", "MYSTERY", "L04", "L05", "L06", "MYSTERY",
    "H01", "H02", "H03", "L01", "MYSTERY", "L02",
    "L03", "L04", "MYSTERY", "L05", "L06", "H01",
    "H02", "MYSTERY", "H03", "L01", "L02", "MYSTERY",
    "L03", "L04", "L05", "L06",
  ];
  // 中間三軸（軸 2、3、4）共用：126 格
  const MIDDLE_STRIP = [
    "SCATTER", "H01", "MYSTERY", "H02", "H03", "MYSTERY",
    "L01", "L02", "L03", "L04", "MYSTERY", "L05",
    "L06", "SCATTER", "WILD", "MYSTERY", "H01", "H02",
    "H03", "L01", "MYSTERY", "L02", "L03", "L04",
    "L05", "SCATTER", "L06", "MYSTERY", "H01", "H02",
    "MYSTERY", "H03", "L01", "L02", "L03", "MYSTERY",
    "L04", "L05", "L06", "MYSTERY", "H01", "H02",
    "H03", "L01", "MYSTERY", "L02", "L03", "L04",
    "L05", "MYSTERY", "L06", "SCATTER", "WILD", "H01",
    "MYSTERY", "H02", "H03", "L01", "L02", "MYSTERY",
    "L03", "L04", "L05", "L06", "MYSTERY", "H01",
    "H02", "H03", "MYSTERY", "L01", "L02", "L03",
    "L04", "MYSTERY", "L05", "L06", "SCATTER", "WILD",
    "MYSTERY", "H01", "H02", "H03", "L01", "MYSTERY",
    "L02", "L03", "L04", "L05", "MYSTERY", "L06",
    "H01", "H02", "MYSTERY", "H03", "L01", "L02",
    "L03", "MYSTERY", "L04", "L05", "L06", "MYSTERY",
    "H01", "H02", "H03", "L01", "MYSTERY", "L02",
    "L03", "L04", "L05", "MYSTERY", "L06", "SCATTER",
    "WILD", "H01", "MYSTERY", "H02", "H03", "L01",
    "L02", "MYSTERY", "L03", "L04", "L05", "L06",
  ];
  const PAYLINES = [
    [1, 2, 1, 0, 0],
    [0, 0, 0, 1, 1],
    [2, 1, 2, 2, 2],
    [2, 3, 3, 3, 2],
    [0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1],
    [2, 3, 2, 2, 1],
    [1, 2, 3, 3, 2],
    [0, 0, 0, 1, 0],
    [0, 1, 1, 0, 0],
    [1, 2, 2, 2, 1],
    [2, 3, 3, 2, 2],
    [0, 1, 2, 3, 2],
    [1, 0, 0, 0, 0],
    [2, 2, 1, 1, 1],
  ];

  // 基礎轉與免費轉用同一份環帶（對齊 aurora_bear_config.py::REEL_STRIPS）
  const REEL_STRIPS = [EDGE_STRIP, MIDDLE_STRIP, MIDDLE_STRIP, MIDDLE_STRIP, EDGE_STRIP];

  // 揭曉對照：索引 0~8 對應的一般符號（順序即規格，不可重排）
  const REVEAL_ORDER = ["L01", "L02", "L03", "L04", "L05", "L06", "H01", "H02", "H03"];

  // 賠付表：對齊 aurora_bear_config.py::PAYTABLE（宣告順序即決勝順序）。
  //
  // 🔴 **僅供內部判定「哪個解釋勝出」與「連幾個才算中獎」，不對外顯示。**
  // 玩家實際拿到的倍率是它乘上商戶設定的 RTP 縮放係數，兩者不同；本頁只驗開獎結果。
  const PAYTABLE = {
    L01: { 4: 1.3, 5: 2.8 },
    L02: { 4: 1.3, 5: 2.8 },
    L03: { 4: 1.3, 5: 2.8 },
    L04: { 4: 1.3, 5: 2.8 },
    L05: { 4: 1.3, 5: 2.8 },
    L06: { 4: 1.3, 5: 3.3 },
    H01: { 4: 2.2, 5: 4.4 },
    H02: { 4: 2.2, 5: 5.0 },
    H03: { 4: 2.8, 5: 5.5 },
  };

  const WILD = "WILD";
  const SCATTER = "SCATTER";
  const MYSTERY = "MYSTERY";
  const FREE_TRIGGER = 3;
  const FREE_AWARD = 10;
  const FREE_CAP = 30;
  const COMBO_CAP = 10;

  // combo 上界（含）→ 倍率；0 = 無加成（顯示為 1）
  const TIER_TABLE = [
    [3, 0],
    [6, 1.5],
    [8, 2],
    [9, 2.5],
    [10, 3],
  ];

  const tierMultiplier = (combo) => {
    for (const [ceiling, multiplier] of TIER_TABLE) {
      if (combo <= ceiling) return multiplier;
    }
    return TIER_TABLE[TIER_TABLE.length - 1][1];
  };

  const displayMultiplier = (multiplier) => (multiplier === 0 ? "1" : String(multiplier));

  const posKey = (reel, row) => `${reel}:${row}`;

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

  /** 產生各軸停止位置與揭曉索引。逐位元組對齊 generate_slot_result_with_reveal。 */
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

    const nextFloat = async () => {
      let f = 0;
      for (let i = 0; i < 4; i += 1) {
        f += (await nextByte()) / Math.pow(256, i + 1);
      }
      return f;
    };

    const stops = [];
    for (const strip of REEL_STRIPS) {
      stops.push(Math.floor((await nextFloat()) * strip.length));
    }
    // 揭曉索引：緊接在最後一軸之後、同一條 byte 流
    const revealIndex = Math.floor((await nextFloat()) * REVEAL_ORDER.length);
    return { stops, revealIndex };
  };

  /** 由停止位置組出盤面：board[reel][row]（不等高）。 */
  const buildBoard = (stops) =>
    REEL_STRIPS.map((strip, reel) => {
      const cells = [];
      for (let row = 0; row < ROWS_BY_REEL[reel]; row += 1) {
        cells.push(strip[(stops[reel] + row) % strip.length]);
      }
      return cells;
    });

  const wildPositions = (board) => {
    const found = [];
    board.forEach((cells, reel) =>
      cells.forEach((symbol, row) => {
        if (symbol === WILD) found.push(posKey(reel, row));
      }),
    );
    return found;
  };

  const countScatter = (board) =>
    board.reduce((n, cells) => n + cells.filter((s) => s === SCATTER).length, 0);

  /**
   * 單線判定：候選 = 該線實際出現過的一般符號（依賠付表宣告順序），
   * 取賠付倍數最高者；同值取先出現者。黏著倍率不參與決勝。
   */
  const evaluateLine = (cells) => {
    const present = new Set(cells);
    let best = null;
    for (const candidate of Object.keys(PAYTABLE)) {
      if (!present.has(candidate)) continue;
      let count = 0;
      for (const symbol of cells) {
        if (symbol !== candidate && symbol !== WILD) break;
        count += 1;
      }
      const multiplier = PAYTABLE[candidate][count];
      if (multiplier === undefined) continue;
      if (best !== null && multiplier <= best.effective) continue;
      best = { symbol: candidate, matchCount: count, effective: multiplier };
    }
    return best;
  };

  /**
   * 單轉判定。sticky 為 null 時是一般判定（基礎轉）；
   * 免費轉傳入黏著狀態，依賠付線序號逐條判定並即時更新 opened / combo。
   */
  const evaluateSpin = (board, sticky) => {
    const lines = [];
    PAYLINES.forEach((payline, lineIndex) => {
      const cells = payline.map((row, reel) => board[reel][row]);
      const win = evaluateLine(cells);
      if (!win) return;
      let multiplier = 0;
      if (sticky) {
        for (let reel = 0; reel < win.matchCount; reel += 1) {
          const key = posKey(reel, payline[reel]);
          if (!sticky.positions.has(key)) continue;
          if (!sticky.opened.has(key)) {
            sticky.opened.add(key);
          } else {
            sticky.combo.set(key, Math.min(sticky.combo.get(key) + 1, COMBO_CAP));
          }
          multiplier = Math.max(multiplier, tierMultiplier(sticky.combo.get(key)));
        }
      }
      lines.push({
        lineIndex,
        symbol: win.symbol,
        matchCount: win.matchCount,
        bonus: displayMultiplier(multiplier),
        paylineRows: payline,
      });
    });
    const scatterCount = countScatter(board);
    return { lines, scatterCount, triggersFreeSpin: scatterCount >= FREE_TRIGGER };
  };

  /** 黏著 WILD 的 combo 與當下倍率（依座標排序）。 */
  const stickySnapshot = (combo) =>
    [...combo.entries()]
      .map(([key, count]) => {
        const [reel, row] = key.split(":").map(Number);
        return { reel, row, combo: count, multiplier: displayMultiplier(tierMultiplier(count)) };
      })
      .sort((a, b) => a.reel - b.reel || a.row - b.row);

  /** 揭曉：把盤面上所有 MYSTERY 換成同一個一般符號，回傳新盤面與揭曉格。 */
  const reveal = (board, symbol) => {
    const cells = [];
    const revealed = board.map((reelCells, reel) =>
      reelCells.map((s, row) => {
        if (s !== MYSTERY) return s;
        cells.push(posKey(reel, row));
        return symbol;
      }),
    );
    return { board: revealed, cells };
  };

  /** 完整一局：基礎轉 + 觸發時的全部免費轉。 */
  const verify = async (serverSeed, clientSeed, nonce) => {
    const baseDraw = await generateStops(serverSeed, clientSeed, nonce);
    const baseRevealSymbol = REVEAL_ORDER[baseDraw.revealIndex];
    const baseRevealed = reveal(buildBoard(baseDraw.stops), baseRevealSymbol);
    const base = {
      nonce,
      stops: baseDraw.stops,
      revealIndex: baseDraw.revealIndex,
      revealSymbol: baseRevealSymbol,
      mysteryCells: baseRevealed.cells,
      board: baseRevealed.board,
      stickyCells: [],
      ...evaluateSpin(baseRevealed.board, null),
      stickyWilds: [],
    };

    const freeSpins = [];
    if (!base.triggersFreeSpin) return { base, freeSpins };

    // 觸發轉盤面上的 WILD 全部黏住，combo 皆從 0 起算
    const sticky = {
      positions: new Set(wildPositions(base.board)),
      opened: new Set(),
      combo: new Map(),
    };
    sticky.positions.forEach((key) => sticky.combo.set(key, 0));
    base.stickyWilds = stickySnapshot(sticky.combo);

    let awarded = FREE_AWARD;
    while (freeSpins.length < awarded) {
      const spinNonce = nonce + 1 + freeSpins.length;
      const draw = await generateStops(serverSeed, clientSeed, spinNonce);
      const rawBoard = buildBoard(draw.stops);
      const rawWild = wildPositions(rawBoard);
      // 先蓋上已黏住的 WILD，再揭曉剩下的 MYSTERY
      const covered = rawBoard.map((cells, reel) =>
        cells.map((s, row) => (sticky.positions.has(posKey(reel, row)) ? WILD : s)),
      );
      const revealSymbol = REVEAL_ORDER[draw.revealIndex];
      const revealed = reveal(covered, revealSymbol);
      // 本轉新出的 WILD 也黏住（combo 從 0 起算），並參與本轉判定
      rawWild.forEach((key) => {
        if (!sticky.positions.has(key)) {
          sticky.positions.add(key);
          sticky.combo.set(key, 0);
        }
      });
      const outcome = evaluateSpin(revealed.board, sticky);
      freeSpins.push({
        nonce: spinNonce,
        stops: draw.stops,
        revealIndex: draw.revealIndex,
        revealSymbol,
        mysteryCells: revealed.cells,
        board: revealed.board,
        stickyCells: [...sticky.positions],
        ...outcome,
        stickyWilds: stickySnapshot(sticky.combo),
      });
      if (outcome.triggersFreeSpin && awarded < FREE_CAP) {
        awarded = Math.min(awarded + FREE_AWARD, FREE_CAP);
      }
    }
    return { base, freeSpins };
  };

  return { verify, generateStops, buildBoard, REEL_STRIPS, PAYLINES, ROWS_BY_REEL, REVEAL_ORDER };
})();
