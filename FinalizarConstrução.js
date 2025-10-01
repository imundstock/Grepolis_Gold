// ==UserScript==
// @name         Finalizar Construção Grátis
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Finaliza construções automaticamente quando grátis (menos de 5 minutos)
// @author       Você
// @match        *://*.grepolis.com/game/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function checkAndClickFreeFinishers() {
        // Seleciona todos os itens da fila de construção
        const queueItems = document.querySelectorAll('.js-queue-item');

        queueItems.forEach(item => {
            const countdownEl = item.querySelector('.countdown');
            const freeButton = item.querySelector('.btn_time_reduction.type_free');

            if (countdownEl && freeButton) {
                const timeText = countdownEl.textContent.trim();
                const [min, sec] = timeText.split(':').map(Number);
                const totalSeconds = (min * 60) + sec;

                // Se faltam menos de 5 minutos e o botão está visível
                if (totalSeconds <= 300 && freeButton.offsetParent !== null) {
                    console.log(`Finalizando construção grátis: ${timeText}`);
                    freeButton.click();
                }
            }
        });
    }

    // Verifica a cada 5 segundos
    setInterval(checkAndClickFreeFinishers, 5000);
})();
