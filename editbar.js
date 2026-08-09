/* 編集画面の上部に「保存」「発表」ボタンを固定表示（スクロールしても常に見える）。
   既存の #saveBtn / #doneBtn を鏡のように上部へ複製してクリックを転送するだけ。
   使い方：編集画面を持つページの末尾に <script src="editbar.js"></script> を置く。 */
(function () {
  function init() {
    var saveBtn = document.getElementById('saveBtn');
    var presentBtn = document.getElementById('doneBtn');
    if (!saveBtn && !presentBtn) return;
    var editSec = (saveBtn || presentBtn).closest('section') || document.getElementById('edit');
    if (!editSec || editSec.querySelector('.edit-topbar')) return;

    var css = document.createElement('style');
    css.textContent =
      '.edit-topbar{position:sticky;top:8px;z-index:40;display:flex;justify-content:flex-end;margin:0 0 14px;pointer-events:none}' +
      '.edit-topbar .etb-wrap{display:inline-flex;gap:8px;padding:7px;border-radius:16px;pointer-events:auto;' +
      'background:rgba(22,15,52,.5);-webkit-backdrop-filter:blur(14px) saturate(1.3);backdrop-filter:blur(14px) saturate(1.3);' +
      'border:1px solid rgba(255,255,255,.12);box-shadow:0 10px 28px rgba(0,0,0,.4)}' +
      '.edit-topbar button{border:0;border-radius:11px;padding:10px 18px;font-weight:800;font-size:14.5px;cursor:pointer;transition:transform .1s}' +
      '.edit-topbar button:active{transform:scale(.96)}' +
      '.edit-topbar .etb-save{background:linear-gradient(135deg,#7af0c4,#2bbf8e);color:#063b2c}' +
      '.edit-topbar .etb-present{background:linear-gradient(135deg,#ec6f9e,#2563eb);color:#fff}' +
      '@media print{.edit-topbar{display:none}}';
    document.head.appendChild(css);

    var bar = document.createElement('div');
    bar.className = 'edit-topbar';
    var wrap = document.createElement('div');
    wrap.className = 'etb-wrap';
    bar.appendChild(wrap);
    function mk(src, cls, fallback) {
      if (!src) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = (src.textContent || fallback).trim();
      b.addEventListener('click', function () { src.click(); });
      wrap.appendChild(b);
    }
    mk(saveBtn, 'etb-save', '💾 保存');
    mk(presentBtn, 'etb-present', '▶ 発表する');

    var anchor = editSec.querySelector('p.sub') || editSec.querySelector('h1');
    if (anchor && anchor.parentElement === editSec) anchor.insertAdjacentElement('afterend', bar);
    else editSec.insertBefore(bar, editSec.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
