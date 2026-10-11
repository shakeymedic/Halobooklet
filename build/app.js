// HALO QRH website and app behaviour: search, Prepare/Action tabs, tick-boxes and offline support.
(function () {
  'use strict';
  var inApp = /HaloQrhApp\//.test(navigator.userAgent);
  if (inApp) document.documentElement.classList.add('in-app');

  // Search on the home page (matches procedure names and the full text of both cards)
  var q = document.getElementById('q');
  if (q) {
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-search]'));
    var none = document.getElementById('no-results');
    q.addEventListener('input', function () {
      var terms = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      var shown = 0;
      items.forEach(function (li) {
        var hay = li.getAttribute('data-search');
        var ok = terms.every(function (t) { return hay.indexOf(t) !== -1; });
        li.hidden = !ok;
        if (ok) shown++;
      });
      document.querySelectorAll('.group').forEach(function (g) {
        if (g.classList.contains('extras')) { g.hidden = terms.length > 0; return; }
        g.hidden = !g.querySelector('[data-search]:not([hidden])');
      });
      none.hidden = shown > 0;
    });
  }

  // Prepare / Action tabs; #action in the address opens the action card directly
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-tab]'));
  function show(name, push) {
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-tab') === name;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      document.getElementById(t.getAttribute('data-tab')).hidden = !on;
    });
    if (push) history.replaceState(null, '', name === 'action' ? '#action' : location.pathname + location.search);
  }
  if (tabs.length) {
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        show(t.getAttribute('data-tab'), true);
        var top = document.querySelector('.tabs').getBoundingClientRect().top + window.scrollY - 60;
        if (window.scrollY > top) window.scrollTo(0, top);
      });
    });
    show(location.hash === '#action' ? 'action' : 'prepare', false);
  }

  // Tick-boxes, as in the booklet
  document.querySelectorAll('.checklist-item').forEach(function (item) {
    var box = item.querySelector('.checkbox');
    if (!box) return;
    item.setAttribute('role', 'checkbox');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-checked', box.classList.contains('checked') ? 'true' : 'false');
    function toggle() {
      box.classList.toggle('checked');
      item.setAttribute('aria-checked', box.classList.contains('checked') ? 'true' : 'false');
    }
    item.style.cursor = 'pointer';
    item.addEventListener('click', toggle);
    item.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
    });
  });

  // Offline: the website installs as an app and works with no signal (the Android app bundles everything instead)
  if (!inApp && 'serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js'); });
  }
})();
