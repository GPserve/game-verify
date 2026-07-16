// GanPlay Blackjack 公平性驗證頁腳本
// 純瀏覽器端計算，演算法逐位元組對齊 mini_api services/seed_service.py::generate_blackjack_result
// 與 enums/card.py 之 build_card_pool / encode_card / decode_card_suit / decode_card_rank。
//
// 每局固定 52 張牌，逐張獨立生成（有放回、無實體副牌概念）。第 i 張（i = 0..51）：
//   1. message = "{client_seed}:{nonce}:{i}"
//   2. hash_hex = HMAC_SHA256(key=server_seed, msg=message) 的小寫 hex（key / msg 皆 UTF-8）
//   3. index = int(hash_hex[0:15], 16) % 47
//   4. target_hex = hash_hex[index : index+14]
//   5. num = int(target_hex, 16) >> 3
//   6. f = num * 2^-53                    ∈ [0, 1)
//   7. card_index = floor(f * 52)
//   8. card = CARD_POOL[card_index]        （原始整數編碼值，供對拍用）
//
// 步驟 3/4/5 的中間值皆超過 Number.MAX_SAFE_INTEGER（2^53），全程使用 BigInt，
// 直到步驟 5 完成後（num <= 2^53）才安全轉為 Number 做步驟 6/7 的浮點運算。
//
// 牌值編碼公式（對齊 enums/card.py）：
//   card = (花色碼 + 10) * 16 + 點數碼
// 解碼（逐位對齊 decode_card_suit / decode_card_rank）：
//   suitIndex = ((card & 240) >> 4) - 10   （0=♠ 1=♥ 2=♣ 3=♦）
//   rank = card % 16                        （1=A、2..10、11=J、12=Q、13=K）
const GanBlackjack = (() => {
  const textEncoder = new TextEncoder();

  const SUIT_SYMBOLS = ["♠", "♥", "♣", "♦"];
  const RANK_LABELS = [
    "", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K",
  ];

  // 牌池：以 encode 公式重建，不手抄整數字面。
  // 花色外層順序 SPADE→HEART→CLUB→DIAMOND（花色碼 0,1,2,3）、
  // 每花色內層點數 ACE→KING（點數碼 1..13），對齊 enums/card.py::build_card_pool。
  const CARD_POOL = [];
  for (let suitCode = 0; suitCode < 4; suitCode += 1) {
    for (let rankCode = 1; rankCode <= 13; rankCode += 1) {
      CARD_POOL.push((suitCode + 10) * 16 + rankCode);
    }
  }

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

  const decodeCard = (card) => {
    const suitIndex = ((card & 240) >> 4) - 10;
    const rank = card % 16;
    return `${SUIT_SYMBOLS[suitIndex]}${RANK_LABELS[rank]}`;
  };

  const drawCard = async (serverSeed, clientSeed, nonce, i) => {
    const message = `${clientSeed}:${nonce}:${i}`;
    const hashHex = await hmacSha256Hex(serverSeed, message);

    const index = Number(BigInt(`0x${hashHex.slice(0, 15)}`) % 47n);
    const targetHex = hashHex.slice(index, index + 14);
    const num = BigInt(`0x${targetHex}`) >> 3n;

    const f = Number(num) * Math.pow(2, -53);
    const cardIndex = Math.floor(f * 52);

    return CARD_POOL[cardIndex];
  };

  const computeBlackjackResult = async (serverSeed, clientSeed, nonce) => {
    const cards = [];
    for (let i = 0; i < 52; i += 1) {
      // 逐張依序 await，確保 message 內索引 i 與 mini_api for 迴圈順序完全一致。
      // eslint-disable-next-line no-await-in-loop
      const card = await drawCard(serverSeed, clientSeed, nonce, i);
      cards.push(card);
    }
    const readable = cards.map(decodeCard);
    return { cards, readable };
  };

  return { computeBlackjackResult, decodeCard };
})();
