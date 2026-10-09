// GanPlay Niu Niu 判定（與產線判定規則一致）
// 洗牌序列前 5 張是玩家、第 6～10 張是莊家。點數 A=1、2～10 照面值、J/Q/K=10。
// 任 3 張和為 10 的倍數即有牛；牛幾 = 5 張總和的個位數（0 為牛牛，記 10）；湊不出為無牛（記 0）。
// 比大小：牛級 → 單張最大牌的點數（K 最大、A 最小）→ 該張花色（黑桃 > 紅心 > 梅花 > 方塊）。
const GanNiuNiu = (() => {
  const { suitOf, rankOf } = GanCardShuffle;
  const point = (card) => Math.min(rankOf(card), 10);

  const grouping = (hand) => {
    const total = hand.reduce((s, c) => s + point(c), 0);
    for (let a = 0; a < 5; a += 1) for (let b = a + 1; b < 5; b += 1) for (let c = b + 1; c < 5; c += 1) {
      if ((point(hand[a]) + point(hand[b]) + point(hand[c])) % 10 === 0) {
        return { level: total % 10 || 10, used: [a, b, c] };
      }
    }
    return { level: 0, used: [] };
  };

  // 同點數時花色碼小者較大（黑桃 0 最大）。
  const cardKey = (card) => rankOf(card) * 4 + (3 - suitOf(card));
  const topCard = (hand) => hand.reduce((best, c) => (cardKey(c) > cardKey(best) ? c : best));

  const compare = (player, banker) => {
    const p = grouping(player).level;
    const b = grouping(banker).level;
    if (p !== b) return { winner: p > b ? "player" : "banker", basis: "niu_level" };
    const pt = topCard(player);
    const bt = topCard(banker);
    const basis = rankOf(pt) !== rankOf(bt) ? "top_card" : "suit";
    return { winner: cardKey(pt) > cardKey(bt) ? "player" : "banker", basis };
  };

  const levelLabel = (level) => (level === 0 ? "No Bull" : level === 10 ? "Bull Bull" : `Bull ${level}`);

  return { grouping, topCard, compare, levelLabel };
})();
