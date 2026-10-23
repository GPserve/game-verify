// Shared form and board rendering for cascade verification pages.
const GanCascadePage = (() => {
  const mount = ({ game, symbolImages, imageDir, multTier, texts, legendUpgrade }) => {

    const serverSeedInput = document.getElementById("server-seed");
    const clientSeedInput = document.getElementById("client-seed");
    const nonceInput = document.getElementById("nonce");
    const modeInput = document.getElementById("mode");
    const summaryResultEl = document.getElementById("summary-result");
    const baseSpinSectionEl = document.getElementById("base-spin-section");
    const baseSpinResultEl = document.getElementById("base-spin-result");
    const freeSpinSectionEl = document.getElementById("free-spin-section");
    const freeSpinLabelEl = document.getElementById("free-spin-label");
    const freeSpinResultEl = document.getElementById("free-spin-result");
    const resultCardEl = document.getElementById("result-card");
    const serverSeedErrorEl = document.getElementById("server-seed-error");
    const clientSeedErrorEl = document.getElementById("client-seed-error");
    const nonceErrorEl = document.getElementById("nonce-error");
    const formEl = document.querySelector(".verify-form");
      const upgradeLegendEl = document.querySelector(".cascade-legend-upgrade");
      if (upgradeLegendEl) upgradeLegendEl.hidden = !legendUpgrade;

    // 每次觸發計算給予遞增 token，僅套用最新一次計算結果，
    // 避免快速連續送出時較舊的非同步計算覆蓋較新的結果。
    let latestToken = 0;

    const parseIntField = (rawValue, fallback) => {
      const parsed = Math.trunc(Number(rawValue));
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const hideResult = () => {
      resultCardEl.hidden = true;
      summaryResultEl.textContent = "--";
      baseSpinSectionEl.hidden = true;
      baseSpinResultEl.innerHTML = "";
      freeSpinSectionEl.hidden = true;
      freeSpinResultEl.innerHTML = "";
    };

    const validateRequired = (serverSeed, clientSeed, nonceRaw) => {
      const serverSeedMissing = serverSeed === "";
      const clientSeedMissing = clientSeed === "";
      const nonceMissing = nonceRaw === "";

      serverSeedErrorEl.hidden = !serverSeedMissing;
      clientSeedErrorEl.hidden = !clientSeedMissing;
      nonceErrorEl.hidden = !nonceMissing;

      serverSeedInput.classList.toggle("is-invalid", serverSeedMissing);
      clientSeedInput.classList.toggle("is-invalid", clientSeedMissing);
      nonceInput.classList.toggle("is-invalid", nonceMissing);

      return !serverSeedMissing && !clientSeedMissing && !nonceMissing;
    };

    const artHtml = (file, alt) =>
      `<img class="cell-art" src="${imageDir}/symbol-${file}.webp" alt="${alt}" loading="lazy">`;

    const cellHtml = (cell) => {
      if (cell.symbol === "M") {
        const file = multTier(cell.multBallValue);
        return `${artHtml(file, `x${cell.multBallValue}`)}<span class="cascade-mult">&times;${cell.multBallValue}</span>`;
      }
      const file = symbolImages[cell.symbol];
      return file ? artHtml(file, cell.symbol) : cell.symbol;
    };

    const positionSet = (cells) => new Set((cells || []).map((c) => `${c.reel}:${c.row}`));

    /**
     * 畫一張 6×5 盤面。資料 row 0 是最底下那格，畫面由上往下列，所以每軸反轉後再排。
     * cleared：下一步會被消掉的格子；dropped：上一步補進來的格子。
     */
    const boardHtml = (board, cleared, dropped, upgraded = new Set()) =>
      `<div class="board-reels board-reels--six">${board
        .map(
          (cells, reel) =>
            `<div class="board-reel">${cells
              .map((cell, row) => {
                const key = `${reel}:${row}`;
                const classes = ["board-cell", "cascade-cell"];
                if (cleared.has(key)) classes.push("cascade-cell--cleared");
                if (dropped.has(key)) classes.push("cascade-cell--dropped");
                if (upgraded.has(key)) classes.push("cascade-cell--upgraded");
                return `<div class="${classes.join(" ")}">${cellHtml(cell)}</div>`;
              })
              .reverse()
              .join("")}</div>`,
        )
        .join("")}</div>`;

    const winsHtml = (wins) =>
      wins
        .map(
          (win) =>
            `<span class="cascade-win">${cellHtml({ symbol: win.symbol, multBallValue: 0 })}<span class="cascade-win-count">&times;${win.count}</span></span>`,
        )
        .join("");

    const factHtml = (label, value) =>
      `<span class="cascade-fact"><span class="cascade-fact-label">${label}</span>${value}</span>`;

    const freeSpinChange = (spin) => {
      const added = spin.freeSpinsAdded > 0 ? ` (+${spin.freeSpinsAdded})` : "";
      return `${spin.freeSpinsBefore} &rarr; ${spin.freeSpinsAfter}${added}`;
    };

    /** 一轉的完整內容：開盤、每一步消除後的盤面、連鎖結束後的倍數球與 SCATTER。 */
    const renderSpin = (container, spin) => {
      const steps = spin.cascadeSteps;
      const parts = [];
      parts.push('<p class="free-spin-head">Initial board</p>');
      parts.push(boardHtml(spin.initialBoard, positionSet(steps[0] && steps[0].removed), new Set()));
      steps.forEach((step, index) => {
        parts.push(
          `<p class="free-spin-head cascade-step-head">Cascade ${index + 1}: cleared ${winsHtml(step.wins)}</p>`,
        );
        const next = steps[index + 1];
        if (step.upgrades && step.upgrades.length) {
          parts.push(`<p class="cascade-upgrades">Ball upgrades: ${step.upgrades.map((item) => `&times;${item.fromValue} &rarr; &times;${item.toValue}`).join(", ")}</p>`);
        }
        parts.push(boardHtml(step.boardAfter, positionSet(next && next.removed), positionSet(step.refilled), positionSet(step.upgrades)));
      });

      const facts = [
        factHtml("Result", spin.isWin ? `Win, ${steps.length} cascade${steps.length > 1 ? "s" : ""}` : "No win"),
        factHtml("Multiplier balls", spin.multBallSum > 0 ? `sum &times;${spin.multBallSum}` : "none"),
      ];
      if (spin.type === "free") {
        facts.push(factHtml("Accumulated multiplier", `&times;${spin.accumulatedMultiplier}`));
      }
      facts.push(factHtml("SCATTER", String(spin.scatterCount)));
      if (spin.type === "free") {
        facts.push(factHtml("Free spins left", freeSpinChange(spin)));
      } else if (spin.triggered) {
        facts.push(factHtml("Free spins", `triggered, ${spin.freeSpinsAdded} spins`));
      }
      parts.push(`<div class="cascade-facts">${facts.join("")}</div>`);
      container.innerHTML = parts.join("");
    };

    const freeSpinTitle = (spin, index) => {
      const bits = [`Free Spin ${index + 1}`, `Nonce ${spin.nonce}`];
      bits.push(spin.isWin ? `Win · multiplier ×${spin.accumulatedMultiplier}` : "No win");
      if (spin.freeSpinsAdded > 0) bits.push(`+${spin.freeSpinsAdded} spins`);
      return bits.join(" · ");
    };

    /** 免費轉預設摺疊，打開時才畫盤面，避免一局上百轉時一次塞滿整頁。 */
    const renderFreeSpin = (spin, index) => {
      const item = document.createElement("details");
      item.className = "free-spin-item cascade-spin";
      const title = document.createElement("summary");
      title.className = "cascade-spin-title";
      title.textContent = freeSpinTitle(spin, index);
      item.appendChild(title);
      const body = document.createElement("div");
      item.appendChild(body);
      item.addEventListener("toggle", () => {
        if (item.open && body.childElementCount === 0) renderSpin(body, spin);
      });
      return item;
    };

    const summaryText = (round) => {
      const free = round.freeSpinCount;
      if (round.mode === "buy") {
        return `${texts.bought} · ${free} free spins played`;
      }
      if (!round.triggered) {
        return round.isWin ? texts.baseWin : texts.baseNoWin;
      }
      return `${texts.base} + ${free} free spins`;
    };

    const recompute = async () => {
      const serverSeed = serverSeedInput.value;
      const clientSeed = clientSeedInput.value;
      const nonceRaw = nonceInput.value;

      // 空值必填驗證：任一欄位為空字串即擋下（不觸發 HMAC 計算），
      // 以字串層面判空，數值 0（nonce）為合法值不擋，確保結果區塊不殘留舊值。
      if (!validateRequired(serverSeed, clientSeed, nonceRaw)) {
        ++latestToken;
        hideResult();
        return;
      }

      const token = ++latestToken;
      const nonce = parseIntField(nonceRaw, 0);
      const round = await game.verify(serverSeed, clientSeed, nonce, modeInput.value);
      if (token !== latestToken) return;

      summaryResultEl.textContent = summaryText(round);

      const base = round.spins.find((spin) => spin.type === "base");
      baseSpinSectionEl.hidden = !base;
      baseSpinResultEl.innerHTML = "";
      if (base) {
        const head = document.createElement("p");
        head.className = "free-spin-head";
        head.textContent = `Nonce ${base.nonce}`;
        baseSpinResultEl.appendChild(head);
        const body = document.createElement("div");
        renderSpin(body, base);
        baseSpinResultEl.appendChild(body);
      }

      const freeSpins = round.spins.filter((spin) => spin.type === "free");
      freeSpinResultEl.innerHTML = "";
      freeSpinSectionEl.hidden = freeSpins.length === 0;
      if (freeSpins.length > 0) {
        freeSpinLabelEl.textContent = round.mode === "buy"
          ? `Free Spins (${freeSpins.length} spins, bought)`
          : `Free Spins (${freeSpins.length} spins, triggered by ${base.scatterCount} SCATTER)`;
        freeSpins.forEach((spin, index) => {
          freeSpinResultEl.appendChild(renderFreeSpin(spin, index));
        });
      }

      resultCardEl.hidden = false;
    };

    formEl.addEventListener("submit", (event) => {
      event.preventDefault();
      recompute();
    });
  };
  return { mount };
})();
