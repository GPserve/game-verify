// GanPlay Hilo 公平性驗證（對齊 mini_api services/seed_service.py::generate_hilo_result 與 hilo_cards.HILO_STAKE_INDEX_TO_CARD）
//   ① HMAC_SHA256(key=server_seed, msg="{client_seed}:{nonce}:{cursor}") 的 32 個原始 bytes，cursor 從 0 遞增
//   ② 每 4 bytes 一個 0～1 的數：Σ byte[i] / 256^(i+1)
//   ③ index = floor(數 × 52)，每張獨立（有放回）
//   ④ index 順序（Stake）：點數 2,3,…,10,J,Q,K,A，每個點數內花色 ♦,♥,♠,♣；index 0 = ♦2、51 = ♣A
//   ⑤ 大小：A 最小、K 最大，花色不影響大小
const GanHilo = (() => {
  const encoder = new TextEncoder();
  const RANK_ORDER = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1];
  // 平台卡牌花色碼：黑桃 0、紅心 1、梅花 2、方塊 3；Stake 花色順序 ♦ ♥ ♠ ♣
  const SUIT_ORDER = [3, 1, 0, 2];
  const INDEX_TO_CARD = [];
  RANK_ORDER.forEach((rank) => SUIT_ORDER.forEach((suit) => INDEX_TO_CARD.push((suit + 10) * 16 + rank)));

  const hmacBytes = async (key, msg) => {
    const cryptoKey = await crypto.subtle.importKey(
      "raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(msg)));
  };

  const draw = async (serverSeed, clientSeed, nonce, count) => {
    const bytes = [];
    for (let cursor = 0; bytes.length < count * 4; cursor += 1) {
      bytes.push(...(await hmacBytes(serverSeed, `${clientSeed}:${nonce}:${cursor}`)));
    }
    const result = [];
    for (let i = 0; i < count; i += 1) {
      let f = 0;
      for (let j = 0; j < 4; j += 1) f += bytes[i * 4 + j] / 256 ** (j + 1);
      const index = Math.floor(f * 52);
      result.push({ index, card: INDEX_TO_CARD[index] });
    }
    return result;
  };

  return { draw, INDEX_TO_CARD };
})();
