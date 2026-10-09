// GanPlay 單副 52 張洗牌（Stake Fisher-Yates pick-and-remove）共用模組
// 洗牌結果與產線逐位元組一致，供視訊撲克與妞妞共同使用
// 牌池建立與抽牌步驟：
//   ① byte 流：HMAC_SHA256(key=server_seed, msg="{client_seed}:{nonce}:{cursor}") 的 32 個原始 bytes，cursor 從 0 遞增
//   ② 每 4 bytes 組一個 float：Σ byte[i] / 256^(i+1)（i = 0..3）
//   ③ 牌池依序：花色 黑桃→紅心→梅花→方塊，點數 A→K；card = (花色碼 + 10) * 16 + 點數碼
//   ④ idx = floor(float × 牌池剩餘張數)，抽出並從牌池移除
const GanCardShuffle = (() => {
  const encoder = new TextEncoder();
  const RANK_LABELS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const SUIT_SYMBOLS = ["♠", "♥", "♣", "♦"];

  const hmacBytes = async (key, msg) => {
    const cryptoKey = await crypto.subtle.importKey(
      "raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(msg)));
  };

  const buildCardPool = () => {
    const pool = [];
    for (let suit = 0; suit < 4; suit += 1) {
      for (let rank = 1; rank <= 13; rank += 1) pool.push((suit + 10) * 16 + rank);
    }
    return pool;
  };

  // 抽 count 張（視訊撲克抽滿 52、妞妞抽 10），回傳抽出順序。
  const draw = async (serverSeed, clientSeed, nonce, count) => {
    const bytes = [];
    for (let cursor = 0; bytes.length < count * 4; cursor += 1) {
      bytes.push(...(await hmacBytes(serverSeed, `${clientSeed}:${nonce}:${cursor}`)));
    }
    const pool = buildCardPool();
    const cards = [];
    for (let i = 0; i < count; i += 1) {
      let f = 0;
      for (let j = 0; j < 4; j += 1) f += bytes[i * 4 + j] / 256 ** (j + 1);
      cards.push(pool.splice(Math.floor(f * pool.length), 1)[0]);
    }
    return cards;
  };

  const suitOf = (card) => ((card & 240) >> 4) - 10;
  const rankOf = (card) => card % 16;
  const decodeCardParts = (card) => ({
    rank: RANK_LABELS[rankOf(card)],
    suit: SUIT_SYMBOLS[suitOf(card)],
    isRed: suitOf(card) === 1 || suitOf(card) === 3,
  });

  const renderCard = (card, label, highlight) => {
    const parts = decodeCardParts(card);
    const face = document.createElement("div");
    face.className = `playing-card-face${parts.isRed ? " is-red" : ""}`;
    const rankEl = document.createElement("span");
    rankEl.className = "playing-card-rank";
    rankEl.textContent = parts.rank;
    const suitEl = document.createElement("span");
    suitEl.className = "playing-card-suit";
    suitEl.textContent = parts.suit;
    face.append(rankEl, suitEl);
    const tile = document.createElement("div");
    tile.className = "playing-card";
    if (highlight) tile.style.outline = "2px solid #f5c542";
    tile.append(face);
    if (label !== undefined) {
      const indexEl = document.createElement("span");
      indexEl.className = "playing-card-index";
      indexEl.textContent = String(label);
      tile.append(indexEl);
    }
    return tile;
  };

  return { draw, suitOf, rankOf, decodeCardParts, renderCard };
})();
