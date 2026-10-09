// GanPlay game-verify 伺服器種子承諾比對（各遊戲驗證頁共用）
// 種子承諾比對規則：
//   server_seed_hash = SHA256(server_seed 的 UTF-8 bytes) 的小寫 hex
// 玩家下注前看到的是 hash，開獎後才拿到 server_seed；兩者比對一致，
// 才能證明本局用的 server_seed 就是下注前承諾的那一顆。
// Server Seed Hash 為選填：有填才比對，留空則不顯示比對結果。
(() => {
  const serverSeedInput = document.getElementById("server-seed");
  const hashInput = document.getElementById("server-seed-hash");
  const statusEl = document.getElementById("server-seed-hash-status");
  const formEl = document.querySelector(".verify-form");
  if (!serverSeedInput || !hashInput || !statusEl || !formEl) return;

  // 同驗證頁主流程：僅套用最新一次計算結果，避免舊的非同步結果覆蓋新的。
  let latestToken = 0;

  const sha256Hex = async (text) => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text),
    );
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  };

  const clearStatus = () => {
    statusEl.hidden = true;
    statusEl.textContent = "";
    statusEl.classList.remove("is-match", "is-mismatch");
    hashInput.classList.remove("is-invalid");
  };

  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = ++latestToken;
    const serverSeed = serverSeedInput.value;
    const expectedHash = hashInput.value.trim().toLowerCase();

    // server_seed 空值由頁面主流程顯示必填提示；hash 留空表示玩家不比對。
    if (serverSeed === "" || expectedHash === "") {
      clearStatus();
      return;
    }

    const actualHash = await sha256Hex(serverSeed);
    if (token !== latestToken) return;

    const matched = actualHash === expectedHash;
    statusEl.textContent = matched
      ? "✓ Matches: this Server Seed is the one committed before the round."
      : `✗ Does not match. SHA-256 of the Server Seed is ${actualHash}`;
    statusEl.classList.toggle("is-match", matched);
    statusEl.classList.toggle("is-mismatch", !matched);
    hashInput.classList.toggle("is-invalid", !matched);
    statusEl.hidden = false;
  });
})();
