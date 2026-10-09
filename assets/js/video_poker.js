// GanPlay Video Poker 牌型判定（Jacks or Better，A 可當 A-2-3-4-5 低端順子；判定與產線一致）
// 洗牌序列前 5 張是起手；換牌時依「被換掉的位置由小到大」依序取第 6 張起補上。
const GanVideoPoker = (() => {
  const { suitOf, rankOf } = GanCardShuffle;
  const HANDS = [
    ["royal_flush", "Royal Flush"], ["straight_flush", "Straight Flush"], ["four_of_a_kind", "Four of a Kind"],
    ["full_house", "Full House"], ["flush", "Flush"], ["straight", "Straight"],
    ["three_of_a_kind", "Three of a Kind"], ["two_pair", "Two Pair"], ["jacks_or_better", "Jacks or Better"],
    ["none", "No Win"],
  ];
  const LABELS = Object.fromEntries(HANDS);

  const evaluate = (hand) => {
    const ranks = hand.map(rankOf);
    const counts = {};
    ranks.forEach((r) => { counts[r] = (counts[r] || 0) + 1; });
    const groups = Object.values(counts).sort((a, b) => b - a);
    const flush = hand.every((c) => suitOf(c) === suitOf(hand[0]));
    const sorted = [...new Set(ranks)].sort((a, b) => a - b);
    let straight = false;
    let royal = false;
    if (sorted.length === 5) {
      if (sorted[4] - sorted[0] === 4) straight = true;
      if (sorted.join(",") === "1,10,11,12,13") { straight = true; royal = true; }
    }
    if (straight && flush) return royal ? "royal_flush" : "straight_flush";
    if (groups[0] === 4) return "four_of_a_kind";
    if (groups[0] === 3 && groups[1] === 2) return "full_house";
    if (flush) return "flush";
    if (straight) return "straight";
    if (groups[0] === 3) return "three_of_a_kind";
    if (groups[0] === 2 && groups[1] === 2) return "two_pair";
    if (groups[0] === 2) {
      const pairRank = Number(Object.keys(counts).find((r) => counts[r] === 2));
      if (pairRank === 1 || pairRank >= 11) return "jacks_or_better";
    }
    return "none";
  };

  // holds：保留的位置（0..4）。回傳最終 5 張。
  const finalHand = (deck, holds) => {
    const hand = deck.slice(0, 5);
    let next = 5;
    for (let i = 0; i < 5; i += 1) {
      if (!holds.includes(i)) { hand[i] = deck[next]; next += 1; }
    }
    return hand;
  };

  return { evaluate, finalHand, LABELS };
})();
