// ==UserScript==
// @name         Grepolis - Alterna Visões + HUD (cronômetro + jump + auto F5 41min)
// @namespace    https://grepolis-helper.local
// @version      1.2
// @description  Alterna island_view/city_overview (1–3min aleatório), clica em "pular para a cidade" antes, HUD com contagem e auto F5 a cada 41min (recarrega até achar botões).
// @match        *://*.grepolis.com/*
// @match        *://*.grepolis.*/*
// @match        *://grepolis.com/*
// @include      *grepolis*/game*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ===== Config =====
  const INITIAL_WAIT_MS    = 15000;           // 15s após carregar
  const SWITCH_MIN_MS      = 60 * 1000;       // 1 min
  const SWITCH_MAX_MS      = 180 * 1000;      // 3 min
  const SEARCH_TIMEOUT_MS  = 15000;           // até 15s procurando elementos
  const SEARCH_POLL_MS     = 250;             // intervalo entre tentativas
  const REFRESH_INTERVAL_MS = 41 * 60 * 1000; // 41min para auto F5

  // ===== Seletores =====
  const ISLAND_SELECTORS = [
    'div.option.island_view.circle_button.js-option.checked',
    'div.option.island_view.circle_button.js-option',
    'div.option.island_view.js-option',
    '[name="island_view"].js-option'
  ];
  const CITY_SELECTORS = [
    'div.option.city_overview.circle_button.js-option.checked',
    'div.option.city_overview.circle_button.js-option',
    'div.option.city_overview.js-option',
    '[name="city_overview"].js-option'
  ];
  const JUMP_SELECTOR = [
    'div.btn_jump_to_town.circle_button.jump_to_town',
    '.btn_jump_to_town.circle_button.jump_to_town'
  ];

  // ===== HUD =====
  let hud, hudNextSwitch, hudStatus, hudNextRefresh;
  function ensureHUD() {
    if (document.getElementById('gp-auto-hud')) return;
    hud = document.createElement('div');
    hud.id = 'gp-auto-hud';
    Object.assign(hud.style, {
      position: 'fixed',
      right: '1645px',
      bottom: '10px',
      padding: '10px 12px',
      background: 'rgba(0,0,0,0.75)',
      color: '#fff',
      font: '12px/1.35 system-ui, Arial, sans-serif',
      borderRadius: '10px',
      zIndex: 2147483647,
      pointerEvents: 'none',
      boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
      minWidth: '240px'
    });
    const title = document.createElement('div');
    title.textContent = 'Grepolis Auto';
    title.style.fontWeight = '700';
    title.style.marginBottom = '6px';

    hudNextSwitch  = document.createElement('div'); // Próxima troca Ilha/Cidade
    hudNextRefresh = document.createElement('div'); // Próximo F5
    hudStatus      = document.createElement('div'); // Status atual

    hud.appendChild(title);
    hud.appendChild(hudNextSwitch);
    hud.appendChild(hudNextRefresh);
    hud.appendChild(hudStatus);
    document.documentElement.appendChild(hud);
  }
  const mmss = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const r = String(s % 60).padStart(2, '0');
    return `${m}:${r}`;
  };
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  // ===== Util =====
  function simulateClick(el) {
    if (!el) return false;
    try {
      const rect = el.getBoundingClientRect();
      const x = rect.left + Math.max(1, Math.min(rect.width - 1, rect.width * 0.5));
      const y = rect.top  + Math.max(1, Math.min(rect.height - 1, rect.height * 0.5));
      const base = { bubbles: true, cancelable: true, view: el.ownerDocument.defaultView, clientX: x, clientY: y };
      el.dispatchEvent(new PointerEvent('pointerdown', base));
      el.dispatchEvent(new MouseEvent('mousedown', base));
      el.dispatchEvent(new MouseEvent('mouseup', base));
      el.dispatchEvent(new MouseEvent('click', base));
      if (typeof el.click === 'function') el.click();
      return true;
    } catch (e) {
      console.warn('[Grepolis Auto] Erro no clique:', e);
      return false;
    }
  }

  function getAllDocuments() {
    const docs = [document];
    document.querySelectorAll('iframe').forEach((ifr) => {
      try { if (ifr.contentDocument) docs.push(ifr.contentDocument); } catch (_) {}
    });
    return docs;
  }

  function queryAny(selectors) {
    for (const doc of getAllDocuments()) {
      for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el) return el;
      }
    }
    return null;
  }

  function waitForAny(selectors, timeout = SEARCH_TIMEOUT_MS, poll = SEARCH_POLL_MS) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tryFind = () => {
        const el = queryAny(selectors);
        if (el) return resolve(el);
        if (performance.now() - t0 >= timeout) return resolve(null);
        setTimeout(tryFind, poll);
      };
      tryFind();
    });
  }

  // Estado atual pela classe .checked
  function getCurrentMode() {
    if (queryAny(['.option.island_view.js-option.checked', '[name="island_view"].js-option.checked'])) return 'island';
    if (queryAny(['.option.city_overview.js-option.checked', '[name="city_overview"].js-option.checked'])) return 'city';
    return null;
  }

  // Clicar no "pular para a cidade" antes de qualquer alternância
  async function clickJumpToTown() {
    let btn = queryAny(JUMP_SELECTOR);
    if (!btn) btn = await waitForAny(JUMP_SELECTOR);
    if (!btn) {
      hudStatus.textContent = '⚠️ Botão "pular para a cidade" não encontrado.';
      return false;
    }
    const ok = simulateClick(btn);
    if (ok) hudStatus.textContent = '↪️ Pulou para a cidade.';
    return ok;
  }

  async function clickMode(target) {
    // 1) Clica no botão de pular para a cidade
    await clickJumpToTown();
    // 2) Clica no botão de visão
    const selectors = target === 'island' ? ISLAND_SELECTORS : CITY_SELECTORS;
    let btn = queryAny(selectors);
    if (!btn) btn = await waitForAny(selectors);
    if (!btn) {
      hudStatus.textContent = `⚠️ Botão "${target}" não encontrado.`;
      return false;
    }
    const ok = simulateClick(btn);
    if (ok) hudStatus.textContent = `✅ Visão atual: ${target === 'island' ? 'Ilha' : 'Cidade'}`;
    return ok;
  }

  // ===== Alternância com cronômetro =====
  let switchTimer, switchTicker, nextSwitchAt = 0, nextLabel = '';

  function scheduleNextSwitch() {
    const delay = rand(SWITCH_MIN_MS, SWITCH_MAX_MS);
    nextSwitchAt = Date.now() + delay;

    clearInterval(switchTicker);
    switchTicker = setInterval(() => {
      const left = nextSwitchAt - Date.now();
      hudNextSwitch.textContent = `Próxima troca (${nextLabel}) em: ${mmss(left)}`;
      if (left <= 0) clearInterval(switchTicker);
    }, 1000);

    clearTimeout(switchTimer);
    switchTimer = setTimeout(async () => {
      const current = getCurrentMode();
      const target = current === 'island' ? 'city' : 'island';
      nextLabel = target === 'island' ? 'Ilha' : 'Cidade';
      await clickMode(target);
      nextLabel = (target === 'island') ? 'Cidade' : 'Ilha';
      scheduleNextSwitch();
    }, delay);
  }

  // ===== Auto F5 de 41 min =====
  let refreshTimer, refreshTicker, nextRefreshAt = 0;

  function scheduleNextRefresh(ms = REFRESH_INTERVAL_MS) {
    nextRefreshAt = Date.now() + ms;

    clearInterval(refreshTicker);
    refreshTicker = setInterval(() => {
      const left = nextRefreshAt - Date.now();
      hudNextRefresh.textContent = `Próximo F5 em: ${mmss(left)}`;
      if (left <= 0) clearInterval(refreshTicker);
    }, 1000);

    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      hudStatus.textContent = '🔄 Recarregando página...';
      // Marcador de tentativa (opcional – útil se quiser depurar loops)
      try {
        const tries = (parseInt(localStorage.getItem('gp_auto_last_reload_try') || '0', 10) || 0) + 1;
        localStorage.setItem('gp_auto_last_reload_try', String(tries));
      } catch (_) {}
      location.reload();
    }, ms);
  }

  // Garante que os botões foram carregados; se não, recarrega até achar
  async function ensureButtonsOrReloadLoop() {
    const anyBtn = await waitForAny([...ISLAND_SELECTORS, ...CITY_SELECTORS], SEARCH_TIMEOUT_MS);
    if (anyBtn) {
      hudStatus.textContent = '✅ Botões encontrados.';
      return true;
    }
    hudStatus.textContent = '⚠️ Botões não apareceram. Novo F5 em 3s...';
    setTimeout(() => location.reload(), 3000);
    return false;
  }

  async function main() {
    ensureHUD();

    // 1) Após carregar, checa se os botões aparecem; se não, força novo F5 até aparecer.
    const ready = await ensureButtonsOrReloadLoop();
    if (!ready) return; // A página vai recarregar; não continua este ciclo.

    // 2) Inicia contagem do F5 recorrente
    scheduleNextRefresh();

    // 3) Contagem inicial no HUD (até o primeiro toggle aos 15s)
    const t0 = Date.now();
    const pre = setInterval(() => {
      const left = INITIAL_WAIT_MS - (Date.now() - t0);
      hudNextSwitch.textContent = `Inicia em: ${mmss(left)}`;
      if (left <= 0) clearInterval(pre);
    }, 250);
    hudStatus.textContent = 'Preparando…';

    // 4) Espera 15s e faz a primeira troca imediata (como no original)
    await new Promise(r => setTimeout(r, INITIAL_WAIT_MS));

    const current = getCurrentMode();
    const firstTarget = current === 'island' ? 'city' : 'island';
    nextLabel = firstTarget === 'island' ? 'Ilha' : 'Cidade';
    await clickMode(firstTarget);

    // 5) Programa alternâncias subsequentes
    nextLabel = (firstTarget === 'island') ? 'Cidade' : 'Ilha';
    scheduleNextSwitch();
  }

  // Proteção contra múltiplas execuções
  if (!window.__gp_auto_hud_toggle__) {
    window.__gp_auto_hud_toggle__ = true;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', main, { once: true });
    } else {
      main();
    }
  }
})();
