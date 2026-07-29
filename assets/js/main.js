// GanPlay game-verify 入口頁腳本：遊戲分類篩選（All / Original / Poker）
(() => {
  const buttons = Array.from(document.querySelectorAll('.game-filter-button'));
  const items = Array.from(document.querySelectorAll('.game-list-item'));
  if (!buttons.length || !items.length) return;

  const applyCategory = (category) => {
    items.forEach((item) => {
      item.hidden = category !== 'all' && item.dataset.category !== category;
    });
    buttons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.category === category);
    });
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => applyCategory(button.dataset.category));
  });
})();
