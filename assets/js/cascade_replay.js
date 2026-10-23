// Shared browser replay for six-reel cascade games.
const GanCascadeReplay = (() => {
  const textEncoder = new TextEncoder();
  const regular = ["L01", "L02", "L03", "L04", "L05", "L06", "H01", "H02", "H03", "H04"];

  const create = (config) => {
    const hmacBytes = async (keyText, message) => {
      const key = await crypto.subtle.importKey(
        "raw", textEncoder.encode(keyText), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
      );
      return new Uint8Array(await crypto.subtle.sign("HMAC", key, textEncoder.encode(message)));
    };

    const createDraw = (serverSeed, clientSeed, nonce) => {
      let cursor = 0;
      let bytes = [];
      let index = 0;
      const nextByte = async () => {
        if (index >= bytes.length) {
          bytes = await hmacBytes(serverSeed, `${clientSeed}:${nonce}:${cursor}`);
          index = 0;
          cursor += 1;
        }
        return bytes[index++];
      };
      const nextFloat = async () => {
        let value = 0;
        for (let i = 0; i < 4; i += 1) value += (await nextByte()) / (256 ** (i + 1));
        return value;
      };
      const multValue = async (table) => {
        let total = 0;
        for (const [, weight] of table) total += weight;
        const point = (await nextFloat()) * total;
        let cumulative = 0;
        for (const [multiplier, weight] of table) {
          cumulative += weight;
          if (point < cumulative) return multiplier;
        }
        return table[table.length - 1][0];
      };
      return { nextFloat, multValue };
    };

    const playSpin = async (serverSeed, clientSeed, nonce, free) => {
      const draw = createDraw(serverSeed, clientSeed, nonce);
      const strips = free ? config.strips.free : config.strips.base;
      const table = free ? config.multTables.free : config.multTables.base;
      const pointers = [];
      for (const strip of strips) pointers.push(Math.floor((await draw.nextFloat()) * strip.length));
      const cols = strips.map(() => []);
      const fill = async (reel, refilled) => {
        const col = cols[reel];
        const strip = strips[reel];
        while (col.length < 5) {
          const symbol = strip[pointers[reel] % strip.length];
          pointers[reel] += 1;
          const multBallValue = symbol === "M" ? await draw.multValue(table) : 0;
          col.push({ symbol, multBallValue });
          if (refilled) refilled.push({ reel, row: col.length - 1, symbol, multBallValue });
        }
      };
      for (let reel = 0; reel < 6; reel += 1) await fill(reel);
      const snapshot = () => cols.map((col) => col.map(({ symbol, multBallValue }) => ({ symbol, multBallValue })));
      const count = (symbol) => cols.reduce((sum, col) =>
        sum + col.filter((cell) => cell.symbol === symbol).length, 0);
      const initialBoard = snapshot();
      const cascadeSteps = [];
      const ladder = [...new Set(table.map(([value]) => value))].sort((a, b) => a - b);
      const probability = config.upgrade
        ? (free && config.upgrade.freeP !== null ? config.upgrade.freeP : config.upgrade.baseP)
        : 0;

      for (;;) {
        const wins = regular.map((symbol) => ({ symbol, count: count(symbol) }))
          .filter(({ count: amount }) => amount >= 8);
        if (wins.length === 0) break;
        const winSymbols = new Set(wins.map(({ symbol }) => symbol));
        const removed = [];
        const refilled = [];
        for (let reel = 0; reel < 6; reel += 1) {
          cols[reel].forEach(({ symbol }, row) => {
            if (winSymbols.has(symbol)) removed.push({ reel, row, symbol });
          });
          cols[reel] = cols[reel].filter(({ symbol }) => !winSymbols.has(symbol));
          await fill(reel, refilled);
        }
        const step = { stepIndex: cascadeSteps.length, wins, removed, refilled };
        if (config.upgrade) {
          const upgrades = [];
          if (probability > 0) {
            for (let reel = 0; reel < 6; reel += 1) {
              for (let row = 0; row < cols[reel].length; row += 1) {
                const ball = cols[reel][row];
                if (ball.symbol !== "M") continue;
                const roll = await draw.nextFloat();
                const next = ladder[ladder.indexOf(ball.multBallValue) + 1];
                if (roll < probability && next !== undefined) {
                  upgrades.push({ reel, row, fromValue: ball.multBallValue, toValue: next });
                  ball.multBallValue = next;
                }
              }
            }
          }
          step.upgrades = upgrades;
        }
        step.boardAfter = snapshot();
        cascadeSteps.push(step);
      }
      return {
        nonce, type: free ? "free" : "base", initialBoard, cascadeSteps,
        finalBoard: snapshot(), isWin: cascadeSteps.length > 0,
        multBallSum: cols.reduce((sum, col) => sum + col.reduce((part, cell) =>
          part + (cell.symbol === "M" ? cell.multBallValue : 0), 0), 0),
        scatterCount: count("S"), accumulatedMultiplier: 0, triggered: false,
        freeSpinsBefore: 0, freeSpinsAfter: 0, freeSpinsAdded: 0,
      };
    };

    const verify = async (serverSeed, clientSeed, nonce, mode) => {
      const spins = [];
      const buy = mode === "buy";
      let triggered = false;
      let pending = buy ? config.buyFreeSpins : 0;
      if (!buy) {
        const base = await playSpin(serverSeed, clientSeed, nonce, false);
        triggered = base.scatterCount >= config.freeSpin.trigger;
        base.triggered = triggered;
        base.freeSpinsAdded = triggered ? config.freeSpin.award : 0;
        base.freeSpinsAfter = base.freeSpinsAdded;
        spins.push(base);
        pending = base.freeSpinsAdded;
      }
      let freeCount = 0;
      let accumulated = 0;
      while (pending > 0) {
        const before = pending;
        pending -= 1;
        const spin = await playSpin(serverSeed, clientSeed, nonce + spins.length, true);
        spin.freeSpinsBefore = before;
        freeCount += 1;
        if (spin.isWin) accumulated += spin.multBallSum;
        spin.accumulatedMultiplier = accumulated;
        spin.triggered = spin.scatterCount >= config.freeSpin.retrigger;
        if (spin.triggered) {
          const prior = pending;
          pending = Math.min(pending + config.freeSpin.retriggerAward, config.freeSpin.cap - freeCount);
          spin.freeSpinsAdded = pending - prior;
        }
        spin.freeSpinsAfter = pending;
        spins.push(spin);
      }
      return { mode: buy ? "buy" : "spin", spins, triggered, freeSpinCount: freeCount,
        totalRounds: spins.length, isWin: spins.some((spin) => spin.isWin) };
    };
    return { verify, config };
  };
  return { create };
})();
