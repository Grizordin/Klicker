// ==UserScript==
// @name         КЛИКЕР
// @namespace    http://tampermonkey.net/
// @version      8.0
// @match        https://animesss.tv/*
// @match        https://animesss.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================
    // 1. БАЗОВЫЕ УТИЛИТЫ И ПРОВЕРКА ДОСТУПА
    // Что здесь:
    // - звук
    // - определение клуба пользователя
    // - ограничение доступа к скрипту
    // Зачем:
    // - это общий фундамент, который используется в разных частях скрипта
    // =========================================================

    /**
     * Проигрывает короткий звуковой сигнал.
     * Используется для системных уведомлений и автозапуска.
     */
    function playSound() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;

            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.value = 800;
            gain.gain.value = 0.05;

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } catch(e) {}
    }

    const ALLOWED_CLUB_ID = '2';

    /**
     * Ищет ID клуба пользователя по ссылке «Мой клуб» в DOM.
     * Нужен для проверки доступа к скрипту и уведомлениям.
     */
    function getMyClubId() {
        const links = [...document.querySelectorAll('a[href*="/clubs/"]')];

        for (const a of links) {
            const text = (a.textContent || '').trim();
            const match = a.href.match(/\/clubs\/(\d+)\/?/);

            if (text === 'Мой клуб' && match) {
                return match[1];
            }
        }

        return null;
    }

    function hasAllowedClubAccess() {
        return getMyClubId() === ALLOWED_CLUB_ID;
    }

    /**
     * Жестко останавливает выполнение скрипта, если доступ запрещен.
     */
    function blockScript(reason) {
        console.warn('[Access denied]', reason);
        alert('Этот скрипт доступен только для участников нужного клуба.');
        throw new Error('Unauthorized usage');
    }

    // =========================================================
    // 📡 Отправка информации о пользователе (1 раз)
    // =========================================================

    function getMyNickname() {

        const link = document.querySelector('.header__group-menu a[href*="/user/"]');
        if (!link) return null;

        const match = link.href.match(/\/user\/([^\/]+)/);
        return match ? match[1] : null;

    }

    function sendUserInfo(nick) {

        const WEBHOOK = "https://discord.com/api/webhooks/1487779987216924734/_agsb4EY4jtVlQI2okLmexmR09IRbFqwlFU7z43Y-vzUSAvVp1XDLU1zMh0Wl2EMLOXJ";

        const clubId = getMyClubId() || "unknown";

        fetch(WEBHOOK, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                content:
                    "📥 Новый пользователь кликера\n" +
                    "👤 Ник: **" + nick + "**\n" +
                    "🏰 Клуб: **" + clubId + "**\n" +
                    "🌐 Сайт: " + location.hostname
            })
        });

    }

    function sendUserInfoOnce() {

        const nick = getMyNickname();
        if (!nick) return;

        const key = "clicker_user_sent_" + nick;

        if (localStorage.getItem(key)) return;

        sendUserInfo(nick);

        localStorage.setItem(key, "true");

    }

    // =========================================================
    // 2. СИСТЕМНЫЕ УВЕДОМЛЕНИЯ БРАУЗЕРА
    // Что здесь:
    // - запрос разрешения на Notification API
    // - напоминания перед вкладом и боссом по МСК
    // - защита от дублей между вкладками
    // =========================================================

    // ------------------------
    // 🔔 Системные уведомления (вклады и босс)
    // ------------------------
    (function() {
        if (!('Notification' in window)) return;

        const NOTIF_KEYS = {
            boost: 'notif_boost_sent',
            boss: 'notif_boss_sent'
        };

        const NOTIF_TIMES = {
            boost: { hour: 20, min: 56 }, // 5 мин до 21:01
            boss:  { hour: 16, min: 55 }  // 5 мин до 17:00 (16:55 МСК)
        };

        const moscowOffset = 3 * 60; // МСК

        function requestPermission() {
            if (Notification.permission === 'default') {
                Notification.requestPermission();
            }
        }

        function getMoscowDateKey() {
            const now = new Date();
            const localOffset = now.getTimezoneOffset();
            const moscowNow = new Date(now.getTime() + (moscowOffset + localOffset) * 60000);

            const y = moscowNow.getFullYear();
            const m = String(moscowNow.getMonth() + 1).padStart(2, '0');
            const d = String(moscowNow.getDate()).padStart(2, '0');

            return `${y}-${m}-${d}`;
        }

        function getSentKey(type) {
            return `${NOTIF_KEYS[type]}_${getMoscowDateKey()}`;
        }

        function notify(type) {
            if (Notification.permission !== 'granted') return;

            if (!hasAllowedClubAccess()) {
                console.log(`[Notify] ${type}: уведомление отменено, клуб не разрешен`);
                return;
            }

            const now = Date.now();
            const lockKey = `${NOTIF_KEYS[type]}_lock`;
            const sentKey = getSentKey(type);

            // Если уже отправляли сегодня — выходим
            if (localStorage.getItem(sentKey) === 'true') {
                console.log(`[Notify] ${type}: уже отправлено сегодня`);
                return;
            }

            const lock = parseInt(localStorage.getItem(lockKey), 10) || 0;

            // Если другая вкладка уже начала отправку — выходим
            if (now - lock < 8000) {
                console.log(`[Notify] ${type}: заблокировано другой вкладкой`);
                return;
            }

            // Ставим блокировку
            localStorage.setItem(lockKey, String(now));

            // Повторная проверка после установки lock
            if (localStorage.getItem(sentKey) === 'true') {
                return;
            }

            let title = '';
            let body = '';

            if (type === 'boost') {
                title = '⏰ Скоро начнутся вклады!';
                body = 'Через 5 минут (21:01 МСК) начнутся вклады.';
            } else if (type === 'boss') {
                title = '⚔️ Внимание! Скорое нападение босса!';
                body = 'Через 5 минут (17:00 МСК) начинается битва с боссом. Подготовьтесь!';
            }

            try {
                playSound();
                new Notification(title, { body, silent: false });

                // Помечаем, что сегодня уже отправили
                localStorage.setItem(sentKey, 'true');
                console.log(`[Notify] ${type}: уведомление отправлено`);
            } catch (e) {
                console.error(`[Notify] ${type}: ошибка отправки`, e);
            }
        }

        function schedule(type) {
            const now = new Date();
            const localOffset = now.getTimezoneOffset();
            const moscowNow = new Date(now.getTime() + (moscowOffset + localOffset) * 60000);

            const target = new Date(moscowNow);
            target.setHours(NOTIF_TIMES[type].hour, NOTIF_TIMES[type].min, 0, 0);

            if (moscowNow >= target) {
                target.setDate(target.getDate() + 1);
            }

            const delay = target - moscowNow;

            console.log(`[Notify] ${type}: следующее уведомление через ${Math.round(delay / 1000)} сек`);

            setTimeout(() => {
                notify(type);
                schedule(type);
            }, delay);
        }

        // ------------------------
        // Синхронизация между вкладками
        // ------------------------
        window.addEventListener('storage', (e) => {
            if (!e.key) return;

            if (
                e.key.startsWith(NOTIF_KEYS.boost) ||
                e.key.startsWith(NOTIF_KEYS.boss)
            ) {
                console.log(`[Notif Sync] Изменение ключа: ${e.key} -> ${e.newValue}`);
            }
        });

        setTimeout(() => {
            requestPermission();
            schedule('boost');
            schedule('boss');
        }, 3000);

    })();

    // =========================================================
    // 3. ОПРЕДЕЛЕНИЕ ТЕКУЩЕЙ СТРАНИЦЫ И ПРЕФИКСА
    // Что здесь:
    // - определяем, страница ли это вкладов или босса
    // - рано выходим со всех других страниц
    // - задаем PAGE_PREFIX для раздельного хранения настроек
    // =========================================================

    // ------------------------
    // 2️⃣ Проверка, что мы на странице автокликера
    // ------------------------
    const isBoostPage = /\/clubs\/boost\/\?id=2/.test(location.pathname + location.search);
    const isBossPage = /\/boss_invansion\/?/.test(location.pathname);

    if (!isBoostPage && !isBossPage) return;

    sendUserInfoOnce();

    if (isBossPage && !hasAllowedClubAccess()) {
        blockScript(`Boss page access denied. Club ID: ${getMyClubId() || 'not found'}`);
    }

    // ------------------------
    // 🔑 Префикс для разных страниц
    // ------------------------
    let PAGE_PREFIX = '';

    if (isBoostPage) PAGE_PREFIX = 'boost';
    if (isBossPage) PAGE_PREFIX = 'boss';

    // =========================================================
    // 4. СОСТОЯНИЕ СКРИПТА, STORAGE И БАЗОВЫЕ НАСТРОЙКИ
    // Что здесь:
    // - runtime state
    // - localStorage ключи
    // - темы, режимы, дефолтные значения
    // - хоткеи и значения интерфейса
    // =========================================================

    // ------------------------
    // 3️⃣ Переменные и настройки автокликера
    // ------------------------
    let workerDonate = null;
    let workerRefresh = null;
    let donateButton = null;
    let refreshButton = null;
    let limitCheckerInterval = null;
    let isRunning = false;
    let bossXhrHookInstalled = false;
    let bossLowHpRequestWatchEnabled = false;
    let bossAutoStopped = false;

    const STORAGE = {
        MODE: `clicker_${PAGE_PREFIX}_mode`,
        PANEL_HIDDEN: `clicker_${PAGE_PREFIX}_panel_hidden`,
        RUNNING: `clicker_${PAGE_PREFIX}_is_running`,
        HOTKEY: `clicker_${PAGE_PREFIX}_hotkey`,
        ULTRA_HOTKEY: `clicker_${PAGE_PREFIX}_ultra_hotkey`,
        AUTO_START: `clicker_${PAGE_PREFIX}_autoStart`,
        SOUND: `clicker_${PAGE_PREFIX}_sound_enabled`,
        THEME: `clicker_${PAGE_PREFIX}_theme`,
        RANDOMIZER_ENABLED: `clicker_${PAGE_PREFIX}_randomizer_enabled`,
        RANDOMIZER_CONFIGS: `clicker_${PAGE_PREFIX}_randomizer_configs`,
        RANDOMIZER_SELECTION_MODE: `clicker_${PAGE_PREFIX}_randomizer_selection_mode`,
        RANDOMIZER_MIN_MINUTES: `clicker_${PAGE_PREFIX}_randomizer_min_minutes`,
        RANDOMIZER_MAX_MINUTES: `clicker_${PAGE_PREFIX}_randomizer_max_minutes`,
        CUSTOM_NOTIFY: `clicker_${PAGE_PREFIX}_custom_notify_enabled`,
        CUSTOM_NOTIFY_SCALE: `clicker_${PAGE_PREFIX}_custom_notify_scale`,
        AUTO_ULTRA_ENABLED: `clicker_${PAGE_PREFIX}_auto_ultra_enabled`,
        AUTO_ULTRA_MODE: `clicker_${PAGE_PREFIX}_auto_ultra_mode`,
        AUTO_ULTRA_PERIOD_MINUTES: `clicker_${PAGE_PREFIX}_auto_ultra_period_minutes`,
        AUTO_ULTRA_LIMIT_LVL1: `clicker_${PAGE_PREFIX}_auto_ultra_limit_lvl1`,
        AUTO_ULTRA_LIMIT_LVL2: `clicker_${PAGE_PREFIX}_auto_ultra_limit_lvl2`,
        AUTO_ULTRA_LIMIT_LVL3: `clicker_${PAGE_PREFIX}_auto_ultra_limit_lvl3`,
        AUTO_ULTRA_SESSION: `clicker_${PAGE_PREFIX}_auto_ultra_session`,
        ms: {
            donate: `clicker_${PAGE_PREFIX}_ms_donate`,
            refresh: `clicker_${PAGE_PREFIX}_ms_refresh`
        },
        cps: {
            donate: `clicker_${PAGE_PREFIX}_cps_donate`,
            refresh: `clicker_${PAGE_PREFIX}_cps_refresh`
        }
    };

    let soundEnabled = localStorage.getItem(STORAGE.SOUND) !== 'false';
    const CLICKER_THEMES = {
        classic: {
            name: 'Классическая',
            vars: {
                '--clicker-bg': '#1e1e1e',
                '--clicker-bg-2': '#252525',
                '--clicker-bg-3': '#2d2d2d',
                '--clicker-border': '#444',
                '--clicker-text': '#f3f4f6',
                '--clicker-muted': '#9ca3af',
                '--clicker-input-bg': '#333',
                '--clicker-input-border': '#666',
                '--clicker-btn-bg': '#374151',
                '--clicker-btn-text': '#ffffff',
                '--clicker-btn-primary': '#2563eb',
                '--clicker-btn-primary-2': '#1d4ed8',
                '--clicker-btn-success': '#16a34a',
                '--clicker-btn-danger': '#dc2626',
                '--clicker-btn-secondary': '#4b5563',
                '--clicker-overlay': 'rgba(0,0,0,0.75)',
                '--clicker-shadow': '0 14px 36px rgba(0,0,0,.35)',
                '--clicker-glow': 'none',
                '--clicker-blur': '0px'
            }
        },
        glass: {
            name: 'Стеклянная',
            vars: {
                '--clicker-bg': 'rgba(20, 26, 40, 0.92)',
                '--clicker-bg-2': 'rgba(29, 38, 58, 0.94)',
                '--clicker-bg-3': 'rgba(37, 48, 70, 0.96)',
                '--clicker-border': 'rgba(255,255,255,.16)',
                '--clicker-text': '#f8fafc',
                '--clicker-muted': '#cbd5e1',
                '--clicker-input-bg': 'rgba(15, 23, 42, 0.92)',
                '--clicker-input-border': 'rgba(255,255,255,.14)',
                '--clicker-btn-bg': 'rgba(51, 65, 85, 0.92)',
                '--clicker-btn-text': '#ffffff',
                '--clicker-btn-primary': '#3b82f6',
                '--clicker-btn-primary-2': '#2563eb',
                '--clicker-btn-success': '#22c55e',
                '--clicker-btn-danger': '#ef4444',
                '--clicker-btn-secondary': 'rgba(75, 85, 99, 0.94)',
                '--clicker-overlay': 'rgba(0,0,0,0.76)',
                '--clicker-shadow': '0 18px 42px rgba(0,0,0,.34)',
                '--clicker-glow': 'none',
                '--clicker-blur': '14px'
            }
        },
        neon: {
            name: 'Неоновая',
            vars: {
                '--clicker-bg': '#070b12',
                '--clicker-bg-2': '#0b1320',
                '--clicker-bg-3': '#101a2a',
                '--clicker-border': '#00bcd4',
                '--clicker-text': '#d9fffb',
                '--clicker-muted': '#67e8f9',
                '--clicker-input-bg': '#0a1320',
                '--clicker-input-border': '#0891b2',
                '--clicker-btn-bg': '#122033',
                '--clicker-btn-text': '#d9fffb',

                '--clicker-btn-primary': '#28c7dc',
                '--clicker-btn-primary-2': '#1597a8',

                '--clicker-btn-success': '#1fb85c',
                '--clicker-btn-danger': '#e35b5b',
                '--clicker-btn-secondary': '#1b2b44',

                '--clicker-overlay': 'rgba(0,0,0,0.84)',
                '--clicker-shadow': '0 18px 42px rgba(0,0,0,.42)',
                '--clicker-glow': 'none',
                '--clicker-blur': '0px'
            }
        }
    };

    let currentTheme = localStorage.getItem(STORAGE.THEME) || 'classic';
    const DEFAULT_MODE_BY_PAGE = {
        boost: 'ms',
        boss: 'cps'
    };

    let currentMode = localStorage.getItem(STORAGE.MODE) || DEFAULT_MODE_BY_PAGE[PAGE_PREFIX] || 'ms';
    let currentHotkey = localStorage.getItem(STORAGE.HOTKEY) || 'F6';
    let currentUltraHotkey = localStorage.getItem(STORAGE.ULTRA_HOTKEY) || 'SPACE';
    let waitingForHotkey = false;
    let waitingForUltraHotkey = false;

    const getStorageKey = (mode, type) => STORAGE[mode][type];
    const msToCps = (ms) => Math.round(1000 / ms);
    const cpsToMs = (cps) => Math.round(1000 / Math.max(1, cps));

    function normalizeHotkeyValue(value) {
        const raw = String(value || '').trim();

        if (!raw) return '';

        const upper = raw.toUpperCase();

        if (upper === ' ' || upper === 'SPACE' || upper === 'SPACEBAR' || upper === 'ПРОБЕЛ') {
            return 'SPACE';
        }

        return upper;
    }

    function hotkeyToDisplay(value) {
        const normalized = normalizeHotkeyValue(value);
        if (normalized === 'SPACE') return 'Пробел';
        return normalized;
    }

    function eventMatchesHotkey(event, hotkey) {
        const normalized = normalizeHotkeyValue(hotkey);
        if (!normalized) return false;

        if (normalized === 'SPACE') {
            return event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar';
        }

        return String(event.key || '').toUpperCase() === normalized
        || String(event.code || '').toUpperCase() === normalized;
    }

    // ------------------------
    // Стандартные параметры по умолчанию
    // Отдельно для вкладов и отдельно для босса
    // ------------------------
    const DEFAULT_VALUES_BY_PAGE = {
        boost: {
            ms: {
                donate: 10,
                refresh: 30
            },
            cps: {
                donate: 100,
                refresh: 30
            }
        },
        boss: {
            ms: {
                donate: 1,
                refresh: 1
            },
            cps: {
                donate: 1000,
                refresh: 500
            }
        }
    };

    const DEFAULT_VALUES = DEFAULT_VALUES_BY_PAGE[PAGE_PREFIX] || DEFAULT_VALUES_BY_PAGE.boost;

    let values = {
        ms: {
            donate: parseInt(localStorage.getItem(STORAGE.ms.donate), 10) || DEFAULT_VALUES.ms.donate,
            refresh: parseInt(localStorage.getItem(STORAGE.ms.refresh), 10) || DEFAULT_VALUES.ms.refresh
        },
        cps: {
            donate: parseInt(localStorage.getItem(STORAGE.cps.donate), 10) || DEFAULT_VALUES.cps.donate,
            refresh: parseInt(localStorage.getItem(STORAGE.cps.refresh), 10) || DEFAULT_VALUES.cps.refresh
        }
    };

    let autoStartEnabled = localStorage.getItem(STORAGE.AUTO_START) === 'true';
    let autoStartInterval = null;
    let clickerStartedAt = 0;
    let autoStartEventLock = false;
    let autoStartBlockedUntilWindowEnds = false;

    let bossRandomizerEnabled = localStorage.getItem(STORAGE.RANDOMIZER_ENABLED) === 'true';
    let bossRandomizerSelectionMode = localStorage.getItem(STORAGE.RANDOMIZER_SELECTION_MODE) || 'sequential';
    let bossRandomizerMinMinutes = parseInt(localStorage.getItem(STORAGE.RANDOMIZER_MIN_MINUTES), 10) || 3;
    let bossRandomizerMaxMinutes = parseInt(localStorage.getItem(STORAGE.RANDOMIZER_MAX_MINUTES), 10) || 7;
    let bossRandomizerConfigs = [];
    let bossRandomizerTimeout = null;
    let bossRandomizerIndex = -1;
    let bossRandomizerNextSwitchAt = null;
    let bossRandomizerCountdownInterval = null;

    try {
        bossRandomizerConfigs = JSON.parse(localStorage.getItem(STORAGE.RANDOMIZER_CONFIGS) || '[]');
        if (!Array.isArray(bossRandomizerConfigs)) bossRandomizerConfigs = [];
    } catch (e) {
        bossRandomizerConfigs = [];
    }

    // =========================================================
    // 5. AUTO ULTRA: СОСТОЯНИЕ И НАСТРОЙКИ
    // Что здесь:
    // - постоянные настройки авто-ульты
    // - данные текущей сессии босса
    // - восстановление после перезагрузки
    // - базовые проверки состояния ульты и кулдауна
    // - подготовка данных для планировщика авто-ульты
    // =========================================================
    const AUTO_ULTRA_MODES = {
        infinite: 'infinite',
        periodic: 'periodic',
        limited: 'limited'
    };

    function getDefaultAutoUltraSession() {
        return {
            bossSessionId: '',
            lastKnownLevel: 1,
            nextActionAt: 0,
            lastAttemptAt: 0,
            lastSuccessAt: 0,
            usageByLevel: {
                1: 0,
                2: 0,
                3: 0
            }
        };
    }

    let autoUltraEnabled = localStorage.getItem(STORAGE.AUTO_ULTRA_ENABLED) === 'true';
    let autoUltraMode = localStorage.getItem(STORAGE.AUTO_ULTRA_MODE) || AUTO_ULTRA_MODES.infinite;
    let autoUltraPeriodMinutes = parseInt(localStorage.getItem(STORAGE.AUTO_ULTRA_PERIOD_MINUTES), 10) || 3;
    let autoUltraLimitLvl1 = parseInt(localStorage.getItem(STORAGE.AUTO_ULTRA_LIMIT_LVL1), 10) || 0;
    let autoUltraLimitLvl2 = parseInt(localStorage.getItem(STORAGE.AUTO_ULTRA_LIMIT_LVL2), 10) || 0;
    let autoUltraLimitLvl3 = parseInt(localStorage.getItem(STORAGE.AUTO_ULTRA_LIMIT_LVL3), 10) || 0;

    let autoUltraTimeout = null;
    let autoUltraStatusObserver = null;
    let autoUltraActivationPending = false;

    let autoUltraSession = getDefaultAutoUltraSession();

    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE.AUTO_ULTRA_SESSION) || 'null');
        if (raw && typeof raw === 'object') {
            autoUltraSession = {
                ...getDefaultAutoUltraSession(),
                ...raw,
                usageByLevel: {
                    1: Number(raw?.usageByLevel?.[1]) || 0,
                    2: Number(raw?.usageByLevel?.[2]) || 0,
                    3: Number(raw?.usageByLevel?.[3]) || 0
                }
            };
        }
    } catch (e) {
        autoUltraSession = getDefaultAutoUltraSession();
    }

    // =========================================================
    // 6. ТЕМИЗАЦИЯ И БАЗОВЫЕ СТИЛИ ИНТЕРФЕЙСА
    // Что здесь:
    // - единые CSS-переменные
    // - стили панели, модалок и кнопок
    // - применение выбранной темы на панели и на body для модальных окон
    // =========================================================

    function ensureClickerThemeStyles() {
        if (document.getElementById('clickerUnifiedThemeStyles')) return;

        const style = document.createElement('style');
        style.id = 'clickerUnifiedThemeStyles';
        style.textContent = `
            .clicker-ui-root,
            .clicker-ui-root * {
                box-sizing: border-box;
            }

            .clicker-ui-root {
                --clicker-bg: #1e1e1e;
                --clicker-bg-2: #252525;
                --clicker-bg-3: #2d2d2d;
                --clicker-border: #444;
                --clicker-text: #f3f4f6;
                --clicker-muted: #9ca3af;
                --clicker-input-bg: #333;
                --clicker-input-border: #666;
                --clicker-btn-bg: #374151;
                --clicker-btn-text: #fff;
                --clicker-btn-primary: #2563eb;
                --clicker-btn-primary-2: #1d4ed8;
                --clicker-btn-success: #16a34a;
                --clicker-btn-danger: #dc2626;
                --clicker-btn-secondary: #4b5563;
                --clicker-overlay: rgba(0,0,0,0.75);
                --clicker-shadow: 0 14px 36px rgba(0,0,0,.35);
                --clicker-glow: none;
                --clicker-blur: 0px;
                --clicker-radius-xl: 18px;
                --clicker-radius-lg: 14px;
                --clicker-radius-md: 12px;
                --clicker-radius-sm: 10px;
                font-family: Inter, Arial, sans-serif;
            }

            .clicker-panel {
                background:
                    linear-gradient(180deg, rgba(255,255,255,.02), rgba(255,255,255,0)),
                    var(--clicker-bg) !important;
                border: 1px solid var(--clicker-border) !important;
                color: var(--clicker-text) !important;
                box-shadow: var(--clicker-shadow), var(--clicker-glow) !important;
                border-radius: var(--clicker-radius-xl) !important;
                backdrop-filter: blur(var(--clicker-blur)) !important;
                -webkit-backdrop-filter: blur(var(--clicker-blur)) !important;
            }

            .clicker-show-button {
                background: var(--clicker-btn-bg) !important;
                color: var(--clicker-btn-text) !important;
                border: 1px solid rgba(255,255,255,.08) !important;
                border-radius: var(--clicker-radius-md) !important;
                box-shadow: var(--clicker-shadow), var(--clicker-glow) !important;
            }

            .clicker-panel label,
            .clicker-panel div,
            .clicker-panel span {
                color: inherit;
            }

            .clicker-panel input[type="number"],
            .clicker-panel input[type="text"],
            .clicker-panel select {
                background: var(--clicker-input-bg) !important;
                color: var(--clicker-btn-text) !important;
                border: 1px solid var(--clicker-input-border) !important;
                border-radius: var(--clicker-radius-md) !important;
                outline: none !important;
                box-shadow: none !important;
                transition: .18s ease !important;
            }

            .clicker-panel input[type="number"]:focus,
            .clicker-panel input[type="text"]:focus,
            .clicker-panel select:focus {
                border-color: var(--clicker-btn-primary) !important;
                box-shadow: 0 0 0 3px rgba(37,99,235,.18) !important;
            }

            .clicker-panel button,
            .clicker-modal button {
                border: 1px solid rgba(255,255,255,.06) !important;
                border-radius: var(--clicker-radius-md) !important;
                transition: .18s ease !important;
                box-shadow: none !important;
            }

            .clicker-panel button:hover,
            .clicker-modal button:hover {
                transform: translateY(-1px);
                filter: brightness(1.06);
            }

            .clicker-panel #soundToggleBtn,
            .clicker-panel #helpBtn,
            .clicker-panel #collapseBtn {
                background: var(--clicker-btn-bg) !important;
                color: var(--clicker-btn-text) !important;
            }

            .clicker-panel #msBtn,
            .clicker-panel #cpsBtn {
                background: var(--clicker-btn-bg) !important;
                color: var(--clicker-btn-text) !important;
            }

            .clicker-panel #msBtn.mode-active,
            .clicker-panel #cpsBtn.mode-active {
                background: linear-gradient(180deg, var(--clicker-btn-primary), var(--clicker-btn-primary-2)) !important;
                color: #fff !important;
                border-color: transparent !important;
                box-shadow:
                    0 0 0 1px rgba(255,255,255,.06),
                    0 0 14px rgba(37,99,235,.22),
                    var(--clicker-glow) !important;
                font-weight: 700 !important;
            }

            .clicker-panel #msBtn.mode-inactive,
            .clicker-panel #cpsBtn.mode-inactive {
                background: var(--clicker-btn-bg) !important;
                color: var(--clicker-btn-text) !important;
                opacity: .92;
            }

            .clicker-panel #toggleClicker {
                color: #fff !important;
                font-weight: 700 !important;
            }

            .clicker-panel #autoStartBtn,
            .clicker-panel #toggleSettings,
            .clicker-panel .clicker-secondary-btn {
                background: var(--clicker-btn-secondary) !important;
                color: var(--clicker-btn-text) !important;
            }

            .clicker-panel #autoStartBtn.autostart-on {
                background: linear-gradient(180deg, var(--clicker-btn-primary), var(--clicker-btn-primary-2)) !important;
                color: #fff !important;
                border-color: transparent !important;
                box-shadow: 0 0 0 1px rgba(255,255,255,.06), var(--clicker-glow) !important;
                font-weight: 700 !important;
            }

            .clicker-panel #autoStartBtn.autostart-off {
                background: var(--clicker-btn-secondary) !important;
                color: var(--clicker-btn-text) !important;
                opacity: .88;
            }

            .clicker-panel #settingsPanel,
            .clicker-panel .clicker-settings-card {
                background: var(--clicker-bg-2) !important;
                border: 1px solid rgba(255,255,255,.06) !important;
                border-radius: var(--clicker-radius-lg) !important;
            }

            .clicker-panel .clicker-sub-card {
                background: var(--clicker-bg-3) !important;
                border: 1px solid rgba(255,255,255,.05) !important;
                border-radius: var(--clicker-radius-md) !important;
                padding: 10px;
            }

            .clicker-clock {
                color: var(--clicker-muted) !important;
            }

            .clicker-modal-overlay {
                background: var(--clicker-overlay) !important;
                backdrop-filter: blur(2px) !important;
                -webkit-backdrop-filter: blur(2px) !important;
            }

            .clicker-modal {
                background: var(--clicker-bg-2) !important;
                color: var(--clicker-text) !important;
                border: 1px solid var(--clicker-border) !important;
                border-radius: 20px !important;
                box-shadow: 0 18px 42px rgba(0,0,0,.38), var(--clicker-glow) !important;
                backdrop-filter: blur(var(--clicker-blur)) !important;
                -webkit-backdrop-filter: blur(var(--clicker-blur)) !important;
            }

            /* FALLBACK НА СЛУЧАЙ ПОЛОМКИ ПЕРЕМЕННЫХ ПОСЛЕ ОБФУСКАЦИИ */
            .clicker-modal-overlay {
                background: rgba(0,0,0,0.78) !important;
                backdrop-filter: blur(2px) !important;
                -webkit-backdrop-filter: blur(2px) !important;
            }

            .clicker-modal {
                background: #252525 !important;
                color: #f3f4f6 !important;
                border: 1px solid #444 !important;
                border-radius: 20px !important;
                box-shadow: 0 18px 42px rgba(0,0,0,.38) !important;
                opacity: 1 !important;
            }

            .clicker-theme-glass .clicker-modal {
                background: rgba(29, 38, 58, 0.96) !important;
                border: 1px solid rgba(255,255,255,.16) !important;
                color: #f8fafc !important;
            }

            .clicker-theme-neon .clicker-modal {
                background: #0b1320 !important;
                color: #d9fffb !important;
                border: 1px solid rgba(8, 217, 245, .75) !important;
                box-shadow:
                    0 0 0 2px rgba(8,217,245,.65),
                    0 0 0 4px rgba(8,217,245,.18),
                    0 0 12px rgba(8,217,245,.25),
                    0 14px 32px rgba(0,0,0,.42) !important;
            }

            .clicker-modal input,
            .clicker-modal select {
                background: var(--clicker-input-bg) !important;
                color: var(--clicker-btn-text) !important;
                border: 1px solid var(--clicker-input-border) !important;
                border-radius: var(--clicker-radius-md) !important;
            }

            .clicker-modal .clicker-modal-card {
                background: var(--clicker-bg-2) !important;
                border: 1px solid rgba(255,255,255,.06) !important;
                border-radius: var(--clicker-radius-lg) !important;
            }

            .clicker-modal .clicker-modal-badge {
                display: inline-block;
                border-radius: 999px !important;
                padding: 4px 10px !important;
                font-weight: 700 !important;
            }

            .clicker-theme-neon .clicker-panel,
            .clicker-theme-neon .clicker-modal {
                position: relative;
                overflow: hidden !important;
                border: 1px solid rgba(8, 217, 245, .75) !important;
                box-shadow:
                    0 0 0 2px rgba(8,217,245,.65),
                    0 0 0 4px rgba(8,217,245,.18),
                    0 0 12px rgba(8,217,245,.25),
                    0 14px 32px rgba(0,0,0,.42);
            }

            .clicker-theme-neon .clicker-panel {
                background: var(--clicker-bg) !important;
            }

            .clicker-theme-neon .clicker-modal {
                background: var(--clicker-bg-2) !important;
            }

            /* убираем корявую анимированную рамку */
            .clicker-theme-neon .clicker-panel::before,
            .clicker-theme-neon .clicker-panel::after,
            .clicker-theme-neon .clicker-modal::before,
            .clicker-theme-neon .clicker-modal::after {
                content: none !important;
            }

            /* неоновое свечение обычных кнопок */
            .clicker-theme-neon .clicker-panel button,
            .clicker-theme-neon .clicker-modal button,
            .clicker-theme-neon .clicker-show-button {
                border: 1px solid rgba(8, 217, 245, .55) !important;
                box-shadow:
                    0 0 0 1px rgba(8, 217, 245, .14),
                    0 0 8px rgba(8, 217, 245, .14),
                    0 0 14px rgba(8, 217, 245, .08) !important;
            }

            /* чуть сильнее для важных/активных кнопок */
            .clicker-theme-neon .clicker-panel #msBtn.mode-active,
            .clicker-theme-neon .clicker-panel #cpsBtn.mode-active,
            .clicker-theme-neon .clicker-panel #autoUltraMainBtn,
            .clicker-theme-neon .clicker-panel #autoStartBtn.autostart-on,
            .clicker-theme-neon .clicker-panel #toggleClicker,
            .clicker-theme-neon .clicker-panel #toggleSettings,
            .clicker-theme-neon .clicker-panel .clicker-secondary-btn,
            .clicker-theme-neon .clicker-panel button[id^="themeBtn"],
            .clicker-theme-neon .clicker-panel #bossRandomizerToggleBtn,
            .clicker-theme-neon .clicker-panel #bossRandomizerSettingsBtn,
            .clicker-theme-neon .clicker-panel #bossRandomizerViewBtn,
            .clicker-theme-neon .clicker-notify-scale-btn,
            .clicker-theme-neon .clicker-modal button {
                position: relative;
                overflow: hidden;
                border: 1px solid rgba(8, 217, 245, .72) !important;
                box-shadow:
                    0 0 0 1px rgba(8, 217, 245, .20),
                    0 0 10px rgba(8, 217, 245, .20),
                    0 0 18px rgba(8, 217, 245, .10) !important;
            }

            /* переливание кнопок оставляем */
            .clicker-theme-neon .clicker-panel #msBtn.mode-active::before,
            .clicker-theme-neon .clicker-panel #cpsBtn.mode-active::before,
            .clicker-theme-neon .clicker-panel #autoUltraMainBtn::before,
            .clicker-theme-neon .clicker-panel #autoStartBtn.autostart-on::before,
            .clicker-theme-neon .clicker-panel #toggleClicker::before,
            .clicker-theme-neon .clicker-panel #toggleSettings::before,
            .clicker-theme-neon .clicker-panel .clicker-secondary-btn::before,
            .clicker-theme-neon .clicker-panel button[id^="themeBtn"]::before,
            .clicker-theme-neon .clicker-panel #bossRandomizerToggleBtn::before,
            .clicker-theme-neon .clicker-panel #bossRandomizerSettingsBtn::before,
            .clicker-theme-neon .clicker-panel #bossRandomizerViewBtn::before,
            .clicker-theme-neon .clicker-notify-scale-btn::before,
            .clicker-theme-neon .clicker-modal button::before {
                content: "";
                position: absolute;
                inset: 0;
                pointer-events: none;
                border-radius: inherit;
                background: linear-gradient(
                    115deg,
                    transparent 0%,
                    rgba(255,255,255,.05) 24%,
                    rgba(40,199,220,.10) 42%,
                    rgba(255,255,255,.07) 58%,
                    transparent 80%
                );
                transform: translateX(-170%);
                animation: clickerNeonButtonFlow 4.4s linear infinite;
            }

            /* свечение инпутов и селектов */
            .clicker-theme-neon .clicker-panel input[type="number"],
            .clicker-theme-neon .clicker-panel input[type="text"],
            .clicker-theme-neon .clicker-panel select,
            .clicker-theme-neon .clicker-modal input,
            .clicker-theme-neon .clicker-modal select {
                border: 1px solid rgba(8, 217, 245, .55) !important;
                box-shadow:
                    inset 0 0 0 1px rgba(8, 217, 245, .08),
                    0 0 8px rgba(8, 217, 245, .08) !important;
            }

            .clicker-theme-neon .clicker-panel input[type="number"]:focus,
            .clicker-theme-neon .clicker-panel input[type="text"]:focus,
            .clicker-theme-neon .clicker-panel select:focus,
            .clicker-theme-neon .clicker-modal input:focus,
            .clicker-theme-neon .clicker-modal select:focus {
                border-color: rgba(8, 217, 245, .9) !important;
                box-shadow:
                    0 0 0 2px rgba(8, 217, 245, .16),
                    0 0 12px rgba(8, 217, 245, .16) !important;
            }

            /* свечение карточек внутри настроек */
            .clicker-theme-neon .clicker-panel #settingsPanel,
            .clicker-theme-neon .clicker-panel .clicker-settings-card,
            .clicker-theme-neon .clicker-panel .clicker-sub-card,
            .clicker-theme-neon .clicker-modal .clicker-modal-card {
                border: 1px solid rgba(8, 217, 245, .30) !important;
                box-shadow:
                    inset 0 0 0 1px rgba(8, 217, 245, .04),
                    0 0 10px rgba(8, 217, 245, .05) !important;
            }

            .clicker-theme-neon .clicker-clock {
                text-shadow:
                    0 0 6px rgba(103,232,249,.14),
                    0 0 12px rgba(40,199,220,.06);
            }

             .clicker-theme-neon .clicker-panel,
            .clicker-theme-neon .clicker-panel label,
            .clicker-theme-neon .clicker-panel div,
            .clicker-theme-neon .clicker-panel span,
            .clicker-theme-neon .clicker-panel strong,
            .clicker-theme-neon .clicker-panel b,
            .clicker-theme-neon .clicker-modal,
            .clicker-theme-neon .clicker-modal label,
            .clicker-theme-neon .clicker-modal div,
            .clicker-theme-neon .clicker-modal span,
            .clicker-theme-neon .clicker-modal strong,
            .clicker-theme-neon .clicker-modal b {
                color: var(--clicker-text) !important;
                text-shadow:
                    0 0 6px rgba(103,232,249,.10),
                    0 0 12px rgba(40,199,220,.05);
            }

            .clicker-theme-neon #settingsPanel .clicker-sub-card,
            .clicker-theme-neon .clicker-modal .clicker-modal-card,
            .clicker-theme-neon .boss-randomizer-row {
                border: 1px solid rgba(8, 217, 245, .30) !important;
                box-shadow:
                    inset 0 0 0 1px rgba(8, 217, 245, .04),
                    0 0 10px rgba(8, 217, 245, .05) !important;
            }

            .clicker-notify-scale-grid {
                display: grid;
                grid-template-columns: repeat(5, 1fr);
                gap: 6px;
                margin-top: 6px;
            }

            .clicker-notify-scale-btn {
                padding: 6px 0 !important;
                border-radius: 10px !important;
                font-size: 12px !important;
                font-weight: 700 !important;
                cursor: pointer !important;
                background: var(--clicker-btn-secondary) !important;
                color: var(--clicker-btn-text) !important;
            }

            .clicker-notify-scale-btn.is-active {
                background: linear-gradient(180deg, var(--clicker-btn-primary), var(--clicker-btn-primary-2)) !important;
                color: #fff !important;
                border-color: transparent !important;
                box-shadow:
                    0 0 0 1px rgba(255,255,255,.06),
                    0 0 14px rgba(37,99,235,.22),
                    var(--clicker-glow) !important;
            }

            .clicker-theme-neon .clicker-notify-scale-btn {
                border: 1px solid rgba(8, 217, 245, .55) !important;
                box-shadow:
                    0 0 0 1px rgba(8, 217, 245, .14),
                    0 0 8px rgba(8, 217, 245, .14),
                    0 0 14px rgba(8, 217, 245, .08) !important;
            }

            .clicker-theme-neon .clicker-notify-scale-btn.is-active {
                border: 1px solid rgba(8, 217, 245, .72) !important;
                box-shadow:
                    0 0 0 1px rgba(8, 217, 245, .20),
                    0 0 10px rgba(8, 217, 245, .20),
                    0 0 18px rgba(8, 217, 245, .10) !important;
            }

            .clicker-theme-neon .clicker-show-button {
                border: 1px solid rgba(8, 217, 245, .65) !important;
                box-shadow:
                    0 0 0 1px rgba(8, 217, 245, .18),
                    0 0 10px rgba(8, 217, 245, .16),
                    0 0 18px rgba(8, 217, 245, .10),
                    0 18px 42px rgba(0,0,0,.42) !important;
            }

            @keyframes clickerNeonButtonFlow {
                0% {
                    transform: translateX(-170%);
                    opacity: .85;
                }
                100% {
                    transform: translateX(190%);
                    opacity: .85;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function applyClickerTheme(themeKey) {
        const theme = CLICKER_THEMES[themeKey] || CLICKER_THEMES.classic;

        Object.entries(theme.vars).forEach(([key, value]) => {
            document.documentElement.style.setProperty(key, value);
            wrapper.style.setProperty(key, value);
        });

        wrapper.classList.remove('clicker-theme-classic', 'clicker-theme-glass', 'clicker-theme-neon');
        wrapper.classList.add(`clicker-theme-${themeKey}`);

        document.body.classList.remove('clicker-theme-classic', 'clicker-theme-glass', 'clicker-theme-neon');
        document.body.classList.add(`clicker-theme-${themeKey}`);

        currentTheme = themeKey;
        localStorage.setItem(STORAGE.THEME, themeKey);

        syncPrimaryButtons();

        if (isBossPage) {
            updateBossRandomizerButtons();
        }

        syncNeonTextFallback();
    }

    function syncPrimaryButtons() {
        if (!panel) return;

        const startText = (toggleButton.textContent || '').toLowerCase();

        toggleButton.style.background = startText.includes('стоп')
            ? 'var(--clicker-btn-danger)'
            : 'var(--clicker-btn-success)';

        msBtn.classList.toggle('mode-active', currentMode === 'ms');
        msBtn.classList.toggle('mode-inactive', currentMode !== 'ms');

        cpsBtn.classList.toggle('mode-active', currentMode === 'cps');
        cpsBtn.classList.toggle('mode-inactive', currentMode !== 'cps');

        autoStartBtn.classList.toggle('autostart-on', autoStartEnabled);
        autoStartBtn.classList.toggle('autostart-off', !autoStartEnabled);

        autoStartBtn.style.background = autoStartEnabled
            ? 'linear-gradient(180deg, var(--clicker-btn-primary), var(--clicker-btn-primary-2))'
            : 'var(--clicker-btn-secondary)';
    }

    function updateAutoUltraMainButton() {
        if (!isBossPage || !autoUltraMainBtn) return;

        if (!autoUltraEnabled) {
            autoUltraMainBtn.textContent = '💥 Авто-ульта: выкл';
        } else if (autoUltraMode === AUTO_ULTRA_MODES.limited) {
            autoUltraMainBtn.textContent = `💥 Авто-ульта: вкл (${getAutoUltraModeLabel()}`;
        } else {
            autoUltraMainBtn.textContent = `💥 Авто-ульта: вкл (${getAutoUltraModeLabel()})`;
        }

        autoUltraMainBtn.style.background = autoUltraEnabled
            ? 'linear-gradient(180deg, var(--clicker-btn-primary), var(--clicker-btn-primary-2))'
            : 'var(--clicker-btn-secondary)';
    }

    function syncNeonTextFallback() {
        const isNeon = currentTheme === 'neon';

        const buttonIds = [
            'soundToggleBtn',
            'helpBtn',
            'collapseBtn',
            'msBtn',
            'cpsBtn',
            'autoUltraMainBtn',
            'toggleClicker',
            'autoStartBtn',
            'toggleSettings',
            'bossRandomizerToggleBtn',
            'bossRandomizerSettingsBtn',
            'bossRandomizerViewBtn',
            'themeBtnClassic',
            'themeBtnGlass',
            'themeBtnNeon',
            'captureHotkeyBtn',
            'captureUltraHotkeyBtn',
            'openAutoUltraModalBtn',
            'autoUltraModalToggleBtn',
            'autoUltraModeInfiniteBtn',
            'autoUltraModePeriodicBtn',
            'autoUltraModeLimitedBtn'
        ];

        buttonIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;

            if (isNeon) {
                el.style.color = '#d9fffb';
                el.style.textShadow = '0 0 6px rgba(103,232,249,.12), 0 0 12px rgba(40,199,220,.07)';
            } else {
                el.style.textShadow = '';
            }
        });

        const clockDisplay = panel.querySelector('#clockDisplay');
        if (clockDisplay) {
            if (isNeon) {
                clockDisplay.style.color = '#67e8f9';
                clockDisplay.style.textShadow = '0 0 6px rgba(103,232,249,.14), 0 0 12px rgba(40,199,220,.06)';
            } else {
                clockDisplay.style.textShadow = '';
            }
        }
    }

    function decorateModal(overlay, modal) {
        if (overlay) {
            overlay.classList.add('clicker-modal-overlay');
            overlay.style.background = 'rgba(0,0,0,0.78)';
            overlay.style.backdropFilter = 'blur(2px)';
            overlay.style.webkitBackdropFilter = 'blur(2px)';
        }

        if (modal) {
            modal.classList.add('clicker-modal');
            modal.style.opacity = '1';
            modal.style.borderRadius = '20px';

            if (currentTheme === 'neon') {
                modal.style.background = '#0b1320';
                modal.style.color = '#d9fffb';
                modal.style.border = '1px solid rgba(8, 217, 245, .75)';
                modal.style.boxShadow = `
                    0 0 0 2px rgba(8,217,245,.65),
                    0 0 0 4px rgba(8,217,245,.18),
                    0 0 12px rgba(8,217,245,.25),
                    0 14px 32px rgba(0,0,0,.42)
                `;
            } else if (currentTheme === 'glass') {
                modal.style.background = 'rgba(29, 38, 58, 0.96)';
                modal.style.color = '#f8fafc';
                modal.style.border = '1px solid rgba(255,255,255,.16)';
                modal.style.boxShadow = '0 18px 42px rgba(0,0,0,.34)';
                modal.style.backdropFilter = 'blur(14px)';
                modal.style.webkitBackdropFilter = 'blur(14px)';
            } else {
                modal.style.background = '#252525';
                modal.style.color = '#f3f4f6';
                modal.style.border = '1px solid #444';
                modal.style.boxShadow = '0 18px 42px rgba(0,0,0,.38)';
            }
        }
    }

    // =========================================================
    // 7. СОЗДАНИЕ ОСНОВНОЙ ПАНЕЛИ И DOM-ЭЛЕМЕНТОВ
    // Что здесь:
    // - wrapper
    // - боковая панель
    // - showButton
    // - базовые ссылки на элементы интерфейса
    // =========================================================

    // ------------------------
    // 4️⃣ Создание панели автокликера
    // ------------------------
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.top = '50%';
    wrapper.style.right = '0';
    wrapper.style.transform = 'translateY(-50%)';
    wrapper.style.zIndex = 999;
    wrapper.style.fontFamily = 'Arial';

    ensureClickerThemeStyles();
    wrapper.classList.add('clicker-ui-root');

    const panel = document.createElement('div');
    panel.style.background = '#1e1e1e';
    panel.style.border = '2px solid #444';
    panel.style.padding = '10px';
    panel.style.color = '#ddd';
    panel.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
    panel.style.borderRadius = '10px';
    panel.style.width = '370px';
    panel.style.minWidth = '370px';
    panel.style.maxWidth = '370px';
    panel.style.position = 'relative';

    const LABELS_BY_PAGE = {
        boost: {
            donate: 'Пожертвовать',
            refresh: 'Обновить'
        },
        boss: {
            donate: 'Ударить',
            refresh: 'Обновить'
        }
    };

    const PAGE_LABELS = LABELS_BY_PAGE[PAGE_PREFIX] || LABELS_BY_PAGE.boost;

    panel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:10px; white-space:nowrap;">
                <div style="font-weight:bold;">⚙️ Автокликер</div>
                <div id="clockDisplay" class="clicker-clock" style="font-size:14px;">⏰ --:--:--</div>
            </div>
            <div style="display: flex; gap: 4px;">
                <button id="soundToggleBtn" style="background:#333;color:#fff;border:none;border-radius:4px;padding:2px 6px;cursor:pointer;">${soundEnabled ? '🔊' : '🔇'}</button>
                <button id="helpBtn" style="background:#333;color:#fff;border:none;border-radius:4px;padding:2px 6px;cursor:pointer;">❓</button>
                <button id="collapseBtn" style="background:#333;color:#fff;border:none;border-radius:4px;padding:2px 6px;cursor:pointer;">➡️</button>
            </div>
        </div>
        <div id="modeToggle" style="display:flex; justify-content:space-between; margin-bottom:10px;">
            <button id="msBtn" style="flex:1; margin-right:5px; padding:4px; border:none; cursor:pointer; border-radius:4px; background:#333; color:#fff">🕒 мс</button>
            <button id="cpsBtn" style="flex:1; padding:4px; border:none; cursor:pointer; border-radius:4px; background:#333; color:#fff">⚡ CPS</button>
        </div>
        <label>${PAGE_LABELS.donate}:</label><br>
        <input type="number" id="donateInput" style="width: 100%; margin-bottom: 10px; background: #333; color: #fff; border: 1px solid #666; border-radius: 4px; padding: 4px;"><br>
        <label>${PAGE_LABELS.refresh}:</label><br>
        <input type="number" id="refreshInput" style="width: 100%; margin-bottom: 10px; background: #333; color: #fff; border: 1px solid #666; border-radius: 4px; padding: 4px;"><br>
        <button id="toggleClicker" style="width: 100%; background: #28a745; color: #fff; border: none; padding: 6px; border-radius: 5px; cursor: pointer;">▶️ Старт</button>
        <button id="autoStartBtn" style="width: 100%; margin-top: 10px; background: #555; color: #fff; border: none; padding: 5px; border-radius: 5px; cursor: pointer;">⏱ Автозапуск: выкл</button>
        ${isBossPage ? `
            <button id="autoUltraMainBtn" style="width: 100%; margin-top: 10px; background: #444; color: #fff; border: none; padding: 5px; border-radius: 5px; cursor: pointer;">
                💥 Авто-ульта: выкл
            </button>
        ` : ''}
        <button id="toggleSettings" style="width: 100%; margin-top: 10px; background: #444; color: #fff; border: none; padding: 5px; border-radius: 5px; cursor: pointer;">⚙️ Настройки кликера</button>
        <div id="settingsPanel" style="display:none; margin-top:10px; background:#2a2a2a; border-radius:5px; padding:8px;"></div>
    `;

    const showButton = document.createElement('button');
    showButton.textContent = '⬅️';
    showButton.style.display = 'none';
    showButton.style.background = '#333';
    showButton.style.color = '#fff';
    showButton.style.border = 'none';
    showButton.style.borderRadius = '6px';
    showButton.style.padding = '6px 10px';
    showButton.style.cursor = 'pointer';

    document.body.appendChild(wrapper);
    wrapper.appendChild(panel);
    wrapper.appendChild(showButton);
    panel.classList.add('clicker-panel');
    showButton.classList.add('clicker-show-button');

    // ------------------------
    // 5️⃣ Элементы управления и ссылки на кнопки/поля
    // ------------------------
    const donateInput = panel.querySelector('#donateInput');
    const refreshInput = panel.querySelector('#refreshInput');
    const toggleButton = panel.querySelector('#toggleClicker');
    const collapseBtn = panel.querySelector('#collapseBtn');
    const helpBtn = panel.querySelector('#helpBtn');
    const soundToggleBtn = panel.querySelector('#soundToggleBtn');
    const toggleSettingsBtn = panel.querySelector('#toggleSettings');
    const settingsPanel = panel.querySelector('#settingsPanel');
    const msBtn = panel.querySelector('#msBtn');
    const cpsBtn = panel.querySelector('#cpsBtn');
    const autoStartBtn = panel.querySelector('#autoStartBtn');
    const autoUltraMainBtn = panel.querySelector('#autoUltraMainBtn');

    settingsPanel.classList.add('clicker-settings-card');

    // =========================================================
    // 8. КАСТОМНЫЕ УВЕДОМЛЕНИЯ
    // Что здесь:
    // - собственная система toast-уведомлений
    // - масштабирование уведомлений
    // - нормализация сообщений босса и вкладов
    // - замена/перехват DLEPush при включенной кастомной системе
    // =========================================================

    let customNotifyEnabled = localStorage.getItem(STORAGE.CUSTOM_NOTIFY) !== 'false';
    let customNotifyScale = parseFloat(localStorage.getItem(STORAGE.CUSTOM_NOTIFY_SCALE) || '1');

    if (![1, 1.15, 1.25, 1.35, 1.45].includes(customNotifyScale)) {
        customNotifyScale = 1;
    }

    let customNotifyRoot = null;
    let customNotifyMap = new Map();

    const CUSTOM_NOTIFY_SCALE_PRESETS = [
        { id: 1, scale: 1.00, label: '1' },
        { id: 2, scale: 1.15, label: '2' },
        { id: 3, scale: 1.25, label: '3' },
        { id: 4, scale: 1.35, label: '4' },
        { id: 5, scale: 1.45, label: '5' }
    ];

    function ensureCustomNotifyStyles() {
        if (document.getElementById('customNotifyStylesV2')) return;

        const style = document.createElement('style');
        style.id = 'customNotifyStylesV2';
        style.textContent = `
            #customNotifyRoot {
                position: fixed;
                top: 18px;
                right: 18px;
                z-index: 2147483647;
                display: flex;
                flex-direction: column;
                gap: 8px;
                pointer-events: none;
                font-family: Arial, sans-serif;
            }
            .custom-toast {
                position: relative;
                min-width: 230px;
                max-width: 320px;
                padding: 10px 12px 12px;
                border-radius: 14px;
                overflow: hidden;
                pointer-events: auto;
                box-shadow: 0 10px 28px rgba(0,0,0,.26);
                transition: opacity .18s ease, transform .18s ease;
                user-select: none;
            }
            .custom-toast.hide {
                opacity: 0;
                transform: translateX(18px);
            }
            .custom-toast-title {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 14px;
                font-weight: 700;
                line-height: 1.2;
                position: relative;
                z-index: 2;
            }
            .custom-toast-count {
                font-weight: 700;
                opacity: .95;
            }
            .custom-toast-sub {
                margin-top: 4px;
                font-size: 11px;
                line-height: 1.3;
                opacity: .88;
                position: relative;
                z-index: 2;
            }
            .custom-toast-bar {
                position: absolute;
                left: 0;
                bottom: 0;
                width: 100%;
                height: 2px;
                background: rgba(255,255,255,.30);
                transform-origin: left center;
                z-index: 2;
            }

            .toast-neon-blue {
                background: #05070d;
                border: 1px solid #3b82f6;
                color: #60a5fa;
                box-shadow: 0 0 10px rgba(59,130,246,.65), 0 0 26px rgba(59,130,246,.24), 0 10px 28px rgba(0,0,0,.26);
            }
            .toast-neon-blue::before,
            .toast-neon-green::before,
            .toast-neon-red::before {
                content: "";
                position: absolute;
                inset: 0;
                transform: translateX(-140%);
                animation: toast-shine-v2 2.2s linear infinite;
                z-index: 1;
            }
            .toast-neon-blue::before { background: linear-gradient(90deg, transparent, rgba(96,165,250,.09), transparent); }

            .toast-neon-green {
                background: #05070d;
                border: 1px solid #22c55e;
                color: #4ade80;
                box-shadow: 0 0 10px rgba(34,197,94,.65), 0 0 26px rgba(34,197,94,.24), 0 10px 28px rgba(0,0,0,.26);
            }
            .toast-neon-green::before { background: linear-gradient(90deg, transparent, rgba(74,222,128,.09), transparent); }

            .toast-neon-red {
                background: #05070d;
                border: 1px solid #ef4444;
                color: #f87171;
                box-shadow: 0 0 10px rgba(239,68,68,.65), 0 0 26px rgba(239,68,68,.24), 0 10px 28px rgba(0,0,0,.26);
            }
            .toast-neon-red::before { background: linear-gradient(90deg, transparent, rgba(248,113,113,.09), transparent); }

            .toast-glass {
                background: rgba(28, 28, 35, 0.56);
                border: 1px solid rgba(255,255,255,.16);
                color: #fff;
                backdrop-filter: blur(14px);
                -webkit-backdrop-filter: blur(14px);
            }

            .toast-status {
                background: #111827;
                border-left: 4px solid #facc15;
                color: #fff;
            }

            .toast-terminal {
                background: #000;
                border: 1px solid #00ff88;
                color: #00ff88;
                font-family: Consolas, monospace;
                box-shadow: 0 0 8px rgba(0,255,136,.18), 0 10px 28px rgba(0,0,0,.26);
            }

            .toast-minimal {
                background: linear-gradient(135deg, #1f2937, #111827);
                border: 1px solid rgba(255,255,255,.08);
                color: #fff;
            }

            @keyframes toast-shine-v2 {
                to { transform: translateX(220%); }
            }
        `;
        document.head.appendChild(style);
    }

    function ensureCustomNotifyRoot() {
        ensureCustomNotifyStyles();

        if (customNotifyRoot && document.contains(customNotifyRoot)) return customNotifyRoot;

        customNotifyRoot = document.createElement('div');
        customNotifyRoot.id = 'customNotifyRoot';
        document.body.appendChild(customNotifyRoot);
        return customNotifyRoot;
    }

    function animateCustomToastBar(bar, life) {
        bar.style.transition = 'none';
        bar.style.transform = 'scaleX(1)';
        void bar.offsetWidth;
        bar.style.transition = `transform ${life}ms linear`;
        bar.style.transform = 'scaleX(0)';
    }

    function removeCustomToast(type) {
        const item = customNotifyMap.get(type);
        if (!item) return;

        clearTimeout(item.timer);
        item.el.classList.add('hide');
        setTimeout(() => {
            if (item.el && item.el.remove) item.el.remove();
        }, 180);
        customNotifyMap.delete(type);
    }

    function showCustomToast(type, label, sub, theme) {
        if (!customNotifyEnabled) return;

        ensureCustomNotifyRoot();

        const LIFE = 2000;
        const existing = customNotifyMap.get(type);

        if (existing) {
            existing.count += 1;
            existing.titleText.textContent = label;
            existing.countText.textContent = existing.count > 1 ? `x${existing.count}` : '';
            existing.subText.textContent = sub || '';
            clearTimeout(existing.timer);
            animateCustomToastBar(existing.bar, LIFE);
            existing.timer = setTimeout(() => removeCustomToast(type), LIFE);
            return;
        }

        const toast = document.createElement('div');
        toast.className = `custom-toast ${theme}`;
        toast.style.transform = `scale(${customNotifyScale})`;
        toast.style.transformOrigin = 'top right';
        toast.style.marginBottom = `${Math.round((customNotifyScale - 1) * 18)}px`;

        const title = document.createElement('div');
        title.className = 'custom-toast-title';

        const titleText = document.createElement('span');
        titleText.textContent = label;

        const countText = document.createElement('span');
        countText.className = 'custom-toast-count';
        countText.textContent = '';

        title.appendChild(titleText);
        title.appendChild(countText);

        const subText = document.createElement('div');
        subText.className = 'custom-toast-sub';
        subText.textContent = sub || '';

        const bar = document.createElement('div');
        bar.className = 'custom-toast-bar';

        toast.appendChild(title);
        toast.appendChild(subText);
        toast.appendChild(bar);
        customNotifyRoot.appendChild(toast);

        animateCustomToastBar(bar, LIFE);

        customNotifyMap.set(type, {
            el: toast,
            titleText,
            countText,
            subText,
            bar,
            count: 1,
            timer: setTimeout(() => removeCustomToast(type), LIFE)
        });
    }

    function showClickerUiToast(text) {
        ensureCustomNotifyRoot();

        const toast = document.createElement('div');
        toast.className = 'custom-toast toast-glass';
        toast.style.minWidth = '240px';
        toast.style.maxWidth = '340px';

        const title = document.createElement('div');
        title.className = 'custom-toast-title';
        title.textContent = '⚙️ Настройки';

        const sub = document.createElement('div');
        sub.className = 'custom-toast-sub';
        sub.textContent = text;

        const bar = document.createElement('div');
        bar.className = 'custom-toast-bar';

        toast.appendChild(title);
        toast.appendChild(sub);
        toast.appendChild(bar);
        customNotifyRoot.appendChild(toast);

        animateCustomToastBar(bar, 1400);

        setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 180);
        }, 1400);
    }

    function normalizeBossNotify(text) {
        const s = String(text || '').toLowerCase();

        if (s.includes('критический урон')) return 'crit';
        if (s.includes('нанесли урон боссу')) return 'damage';
        if (s.includes('оглуш') || s.includes('на вас посмотрел босс')) return 'stun';

        if (s.includes('слишком часто') || s.includes('мастерство')) {
            return 'mastery';
        }

        if (
            s.includes('ошибка') ||
            s.includes('неизвестн') ||
            s.includes('error') ||
            s.includes('429')
        ) {
            return 'error';
        }

        return null;
    }

    function normalizeBoostNotify(text) {
        const s = String(text || '').toLowerCase();

        if (s.includes('кирк')) return 'pickaxe';
        if (s.includes('пожертвована')) return 'donate';
        if (s.includes('не менялась')) return 'nochange';
        if (s.includes('изменилась')) return 'changed';

        if (s.includes('слишком часто') || s.includes('мастерство')) {
            return 'mastery';
        }

        if (s.includes('ошибка') || s.includes('неизвест') || s.includes('error')) {
            return 'error';
        }

        return null;
    }

    function showNormalizedCustomNotify(text) {
        if (!customNotifyEnabled) return false;

        if (isBossPage) {
            const type = normalizeBossNotify(text);
            if (!type) return false;

            const map = {
                damage: { label: 'Урон', sub: 'обычный урон боссу', theme: 'toast-neon-blue' },
                crit: { label: 'Крит', sub: 'критический урон боссу', theme: 'toast-neon-red' },
                stun: { label: 'Оглушение', sub: 'босс наложил оглушение', theme: 'toast-status' },
                error: { label: 'Ошибка', sub: 'любая ошибка сервера/ответа', theme: 'toast-minimal' },
                mastery: { label: 'Мастерство', sub: 'слишком часто / ограничение', theme: 'toast-status' }
            };

            const cfg = map[type];
            showCustomToast(type, cfg.label, cfg.sub, cfg.theme);
            return true;
        }

        if (isBoostPage) {
            const type = normalizeBoostNotify(text);
            if (!type) return false;

            const map = {
                donate: { label: 'Вклад', sub: 'успешное пожертвование карты', theme: 'toast-neon-green' },
                changed: { label: 'Карта изменилась', sub: 'нужная карта стала другой', theme: 'toast-glass' },
                nochange: { label: 'Без изменений', sub: 'нужная карта не изменилась', theme: 'toast-glass' },
                pickaxe: { label: 'Кирка', sub: 'ты промахнулся. лох', theme: 'toast-terminal' },
                mastery: { label: 'Мастерство', sub: 'слишком часто / ограничение', theme: 'toast-status' },
                error: { label: 'Ошибка', sub: 'любая ошибка сервера/ответа', theme: 'toast-minimal' }
            };

            const cfg = map[type];
            showCustomToast(type, cfg.label, cfg.sub, cfg.theme);
            return true;
        }

        return false;
    }

    function installCustomDLEPushHook() {
        if (!window.DLEPush || window.__customNotifyHookInstalled) return;
        window.__customNotifyHookInstalled = true;

        ['info', 'warning', 'error', 'success'].forEach(method => {
            if (typeof window.DLEPush[method] !== 'function') return;

            const original = window.DLEPush[method];

            window.DLEPush[method] = function (...args) {
                const text = args.find(v => typeof v === 'string' && v.trim()) || '';

                if (!customNotifyEnabled) {
                    return original.apply(this, args);
                }

                showNormalizedCustomNotify(text);
                return null;
            };
        });
    }

    // =========================================================
    // 9. РЕНДЕР КОНТЕНТА ПАНЕЛИ НАСТРОЕК
    // Что здесь:
    // - тема интерфейса
    // - кастомные уведомления
    // - компактный блок горячих клавиш
    // - разный состав настроек для вкладов и босса
    // =========================================================

    function renderSettingsPanelContent() {
        toggleSettingsBtn.textContent = settingsPanel.style.display === 'none'
            ? '⚙️ Настройки кликера'
            : '✖ Закрыть настройки';

        settingsPanel.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:10px;">
                <!-- 🎨 Блок темы интерфейса -->
                <div class="clicker-sub-card" style="display:flex;flex-direction:column;gap:8px;">
                    <label style="font-size:13px;">🎨 Тема интерфейса</label>
                    <div id="themeButtonsRow" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                        <button type="button" id="themeBtnClassic"
                            style="
                                padding:8px 10px;
                                border:none;
                                border-radius:12px;
                                cursor:pointer;
                                font-weight:700;
                                background:${currentTheme === 'classic'
                                    ? 'linear-gradient(180deg,var(--clicker-btn-primary),var(--clicker-btn-primary-2))'
                                    : 'var(--clicker-btn-secondary)'};
                                color:#fff;
                            ">
                            Классика
                        </button>

                        <button type="button" id="themeBtnGlass"
                            style="
                                padding:8px 10px;
                                border:none;
                                border-radius:12px;
                                cursor:pointer;
                                font-weight:700;
                                background:${currentTheme === 'glass'
                                    ? 'linear-gradient(180deg,var(--clicker-btn-primary),var(--clicker-btn-primary-2))'
                                    : 'var(--clicker-btn-secondary)'};
                                color:#fff;
                            ">
                            Стекло
                        </button>

                        <button type="button" id="themeBtnNeon"
                            style="
                                padding:8px 10px;
                                border:none;
                                border-radius:12px;
                                cursor:pointer;
                                font-weight:700;
                                background:${currentTheme === 'neon'
                                    ? 'linear-gradient(180deg,var(--clicker-btn-primary),var(--clicker-btn-primary-2))'
                                    : 'var(--clicker-btn-secondary)'};
                                color:#fff;
                            ">
                            Неон
                        </button>
                    </div>
                </div>

                <!-- 🔔 Блок кастомных уведомлений -->
                <div class="clicker-sub-card" style="display:flex;flex-direction:column;gap:8px;">
                    <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
                        <input id="customNotifyToggleInput" type="checkbox" ${customNotifyEnabled ? 'checked' : ''}>
                        Кастомные уведомления
                    </label>

                    ${customNotifyEnabled ? `
                        <div style="display:flex;flex-direction:column;gap:6px;">
                            <label style="font-size:13px;">Размер уведомлений</label>
                            <div id="customNotifyScaleRow" class="clicker-notify-scale-grid">
                                ${CUSTOM_NOTIFY_SCALE_PRESETS.map(preset => `
                                    <button
                                        type="button"
                                        class="clicker-notify-scale-btn ${customNotifyScale === preset.scale ? 'is-active' : ''}"
                                        data-notify-scale="${preset.scale}"
                                    >
                                        ${preset.label}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>

                <!-- 🎹 Блок горячих клавиш -->
                <!-- На боссе: старт/стоп + ульта -->
                <!-- На вкладах: только старт/стоп -->
                <div class="clicker-sub-card" style="display:flex;flex-direction:column;gap:8px;">
                    <label style="font-size:13px;">🎹 Горячие клавиши</label>

                    <div style="display:grid;grid-template-columns:${isBossPage ? '1fr 1fr' : '1fr'};gap:8px;">
                        <div style="display:flex;flex-direction:column;gap:4px;">
                            <div style="font-size:12px;opacity:.9;">Старт / Стоп</div>
                            <button
                                id="captureHotkeyBtn"
                                class="clicker-secondary-btn"
                                style="width:100%;color:#fff;border:none;padding:8px 10px;cursor:pointer;font-weight:700;"
                            >
                                ${hotkeyToDisplay(currentHotkey)}
                            </button>
                        </div>

                        ${isBossPage ? `
                            <div style="display:flex;flex-direction:column;gap:4px;">
                                <div style="font-size:12px;opacity:.9;">Ульта</div>
                                <button
                                    id="captureUltraHotkeyBtn"
                                    class="clicker-secondary-btn"
                                    style="width:100%;color:#fff;border:none;padding:8px 10px;cursor:pointer;font-weight:700;"
                                >
                                    ${hotkeyToDisplay(currentUltraHotkey)}
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        const customNotifyToggleInput = settingsPanel.querySelector('#customNotifyToggleInput');
        const customNotifyScaleButtons = [...settingsPanel.querySelectorAll('[data-notify-scale]')];
        const captureHotkeyBtn = settingsPanel.querySelector('#captureHotkeyBtn');
        const captureUltraHotkeyBtn = settingsPanel.querySelector('#captureUltraHotkeyBtn');

        const themeBtnClassic = settingsPanel.querySelector('#themeBtnClassic');
        const themeBtnGlass = settingsPanel.querySelector('#themeBtnGlass');
        const themeBtnNeon = settingsPanel.querySelector('#themeBtnNeon');
        if (themeBtnClassic) {
            themeBtnClassic.onclick = () => {
                applyClickerTheme('classic');
                renderSettingsPanelContent();
            };
        }

        if (themeBtnGlass) {
            themeBtnGlass.onclick = () => {
                applyClickerTheme('glass');
                renderSettingsPanelContent();
            };
        }

        if (themeBtnNeon) {
            themeBtnNeon.onclick = () => {
                applyClickerTheme('neon');
                renderSettingsPanelContent();
            };
        }

        customNotifyToggleInput.onchange = () => {
            customNotifyEnabled = customNotifyToggleInput.checked;
            localStorage.setItem(STORAGE.CUSTOM_NOTIFY, customNotifyEnabled ? 'true' : 'false');
            renderSettingsPanelContent();
        };

        customNotifyScaleButtons.forEach(btn => {
            btn.onclick = () => {
                const scale = parseFloat(btn.getAttribute('data-notify-scale') || '1');
                if (!Number.isFinite(scale)) return;

                customNotifyScale = scale;
                localStorage.setItem(STORAGE.CUSTOM_NOTIFY_SCALE, String(scale));
                renderSettingsPanelContent();

                const previewType = '__preview_scale__';
                const existing = customNotifyMap.get(previewType);

                if (existing) {
                    clearTimeout(existing.timer);
                    customNotifyMap.delete(previewType);
                    if (existing.el && existing.el.remove) existing.el.remove();
                }

                showCustomToast(
                    previewType,
                    'Урон',
                    `масштаб x${String(scale).replace('.', ',')}`,
                    'toast-neon-blue'
                );
            };
        });

        if (captureHotkeyBtn) {
            captureHotkeyBtn.onclick = () => {
                waitingForHotkey = true;
                waitingForUltraHotkey = false;
                captureHotkeyBtn.textContent = 'Нажмите клавишу...';
            };
        }

        if (captureUltraHotkeyBtn) {
            captureUltraHotkeyBtn.onclick = () => {
                waitingForUltraHotkey = true;
                waitingForHotkey = false;
                captureUltraHotkeyBtn.textContent = 'Нажмите клавишу...';
            };
        }
        syncNeonTextFallback();
    }

    renderSettingsPanelContent();
    installCustomDLEPushHook();
    updateAutoUltraMainButton();

    if (isBossPage) {
        updateAutoUltraStatusNearBoss();
        installAutoUltraStatusObserver();
    }

    // =========================================================
    // 10. BOSS RANDOMIZER: DOM-ЭЛЕМЕНТЫ И СОСТОЯНИЕ КНОПОК
    // Что здесь:
    // - создание элементов режима вразнобой
    // - кнопка включения режима
    // - таймер следующего переключения
    // - кнопки настройки и просмотра пресетов
    // - встраивание элементов в основную панель босса
    // =========================================================

    let bossRandomizerToggleBtn = null;
    let bossRandomizerTimerEl = null;
    let bossRandomizerControlsWrap = null;
    let bossRandomizerSettingsBtn = null;
    let bossRandomizerViewBtn = null;

    if (isBossPage) {
        bossRandomizerToggleBtn = document.createElement('button');
        bossRandomizerToggleBtn.id = 'bossRandomizerToggleBtn';
        bossRandomizerToggleBtn.style.width = '100%';
        bossRandomizerToggleBtn.style.marginTop = '10px';
        bossRandomizerToggleBtn.style.color = '#fff';
        bossRandomizerToggleBtn.style.border = 'none';
        bossRandomizerToggleBtn.style.padding = '5px';
        bossRandomizerToggleBtn.style.borderRadius = '5px';
        bossRandomizerToggleBtn.style.cursor = 'pointer';

        bossRandomizerTimerEl = document.createElement('div');
        bossRandomizerTimerEl.style.marginTop = '8px';
        bossRandomizerTimerEl.style.padding = '6px 8px';
        bossRandomizerTimerEl.style.background = '#2a2a2a';
        bossRandomizerTimerEl.style.borderRadius = '5px';
        bossRandomizerTimerEl.style.color = '#ccc';
        bossRandomizerTimerEl.style.fontSize = '12px';
        bossRandomizerTimerEl.textContent = '⏳ Следующее переключение: —';

        bossRandomizerControlsWrap = document.createElement('div');
        bossRandomizerControlsWrap.style.display = 'none';
        bossRandomizerControlsWrap.style.marginTop = '10px';

        bossRandomizerSettingsBtn = document.createElement('button');
        bossRandomizerSettingsBtn.id = 'bossRandomizerSettingsBtn';
        bossRandomizerSettingsBtn.textContent = '⚙️ Настроить режим';
        bossRandomizerSettingsBtn.style.width = '100%';
        bossRandomizerSettingsBtn.style.background = '#444';
        bossRandomizerSettingsBtn.style.color = '#fff';
        bossRandomizerSettingsBtn.style.border = 'none';
        bossRandomizerSettingsBtn.style.padding = '5px';
        bossRandomizerSettingsBtn.style.borderRadius = '5px';
        bossRandomizerSettingsBtn.style.cursor = 'pointer';

        bossRandomizerViewBtn = document.createElement('button');
        bossRandomizerViewBtn.id = 'bossRandomizerViewBtn';
        bossRandomizerViewBtn.textContent = '📋 Посмотреть настройки';
        bossRandomizerViewBtn.style.width = '100%';
        bossRandomizerViewBtn.style.marginTop = '8px';
        bossRandomizerViewBtn.style.background = '#444';
        bossRandomizerViewBtn.style.color = '#fff';
        bossRandomizerViewBtn.style.border = 'none';
        bossRandomizerViewBtn.style.padding = '5px';
        bossRandomizerViewBtn.style.borderRadius = '5px';
        bossRandomizerViewBtn.style.cursor = 'pointer';

        bossRandomizerControlsWrap.appendChild(bossRandomizerSettingsBtn);
        bossRandomizerControlsWrap.appendChild(bossRandomizerViewBtn);

        autoStartBtn.insertAdjacentElement('afterend', bossRandomizerToggleBtn);
        bossRandomizerToggleBtn.insertAdjacentElement('afterend', bossRandomizerTimerEl);
        bossRandomizerTimerEl.insertAdjacentElement('afterend', bossRandomizerControlsWrap);
    }

    // =========================================================
    // 11. РЕЖИМ ВРАЗНОБОЙ: ЛОГИКА, ПЕРЕКЛЮЧЕНИЕ И МОДАЛКИ
    // Что здесь:
    // - валидация и сохранение пресетов
    // - применение пресета к текущим настройкам
    // - случайное или последовательное переключение
    // - планирование следующего переключения
    // - модалки настройки и просмотра пресетов
    // =========================================================

    if (isBossPage && bossRandomizerToggleBtn) {
        bossRandomizerToggleBtn.onclick = () => {
            bossRandomizerEnabled = !bossRandomizerEnabled;

            try {
                localStorage.setItem(STORAGE.RANDOMIZER_ENABLED, String(bossRandomizerEnabled));
            } catch (e) {
                console.error('[Boss Randomizer] Не удалось сохранить состояние:', e);
                alert('Не удалось сохранить состояние режима вразнобой: localStorage переполнен. Режим будет работать только до перезагрузки страницы.');
            }

            bossRandomizerIndex = -1;

            if (!bossRandomizerEnabled) {
                if (bossRandomizerTimeout) {
                    clearTimeout(bossRandomizerTimeout);
                    bossRandomizerTimeout = null;
                }
                bossRandomizerNextSwitchAt = null;
                stopBossRandomizerCountdown();
            }

            updateBossRandomizerButtons();

            if (bossRandomizerEnabled && isRunning) {
                scheduleNextBossRandomizerSwitch();
            }
        };
    }

    function getValidBossRandomizerConfigs() {
        return (bossRandomizerConfigs || []).filter(cfg =>
            cfg &&
            (cfg.mode === 'ms' || cfg.mode === 'cps') &&
            Number.isFinite(cfg.donate) &&
            Number.isFinite(cfg.refresh) &&
            cfg.donate > 0 &&
            cfg.refresh > 0
        );
    }

    function applyBossRandomizerConfig(cfg) {
        if (!cfg) return;

        currentMode = cfg.mode;
        localStorage.setItem(STORAGE.MODE, currentMode);

        values[currentMode].donate = cfg.donate;
        values[currentMode].refresh = cfg.refresh;

        localStorage.setItem(getStorageKey(currentMode, 'donate'), cfg.donate);
        localStorage.setItem(getStorageKey(currentMode, 'refresh'), cfg.refresh);

        updateInputsFromValues();
        syncPrimaryButtons();

        console.log(`[Boss Randomizer] Применен режим: ${cfg.mode}, ударить=${cfg.donate}, обновить=${cfg.refresh}`);

        if (isRunning) {
            setupClickWorkers();
        }
    }

    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function scheduleNextBossRandomizerSwitch() {
        if (!isBossPage || !bossRandomizerEnabled || !isRunning) return;

        const validConfigs = getValidBossRandomizerConfigs();
        if (validConfigs.length < 3) {
            console.warn('[Boss Randomizer] Недостаточно настроек для переключения');
            bossRandomizerNextSwitchAt = null;
            stopBossRandomizerCountdown();
            return;
        }

        if (bossRandomizerTimeout) {
            clearTimeout(bossRandomizerTimeout);
            bossRandomizerTimeout = null;
        }

        let minMinutes = parseInt(bossRandomizerMinMinutes, 10) || 1;
        let maxMinutes = parseInt(bossRandomizerMaxMinutes, 10) || minMinutes;

        if (minMinutes < 1) minMinutes = 1;
        if (maxMinutes < minMinutes) maxMinutes = minMinutes;

        const delayMinutes = getRandomInt(minMinutes, maxMinutes);
        const delayMs = delayMinutes * 60 * 1000;

        bossRandomizerNextSwitchAt = Date.now() + delayMs;
        startBossRandomizerCountdown();

        console.log(`[Boss Randomizer] Следующее переключение через ${delayMinutes} мин.`);

        bossRandomizerTimeout = setTimeout(() => {
            const configs = getValidBossRandomizerConfigs();
            if (!isBossPage || !bossRandomizerEnabled || !isRunning || configs.length < 3) {
                bossRandomizerNextSwitchAt = null;
                stopBossRandomizerCountdown();
                return;
            }

            let selectedConfig = null;

            if (bossRandomizerSelectionMode === 'random') {
                const randomIndex = getRandomInt(0, configs.length - 1);
                bossRandomizerIndex = randomIndex;
                selectedConfig = configs[randomIndex];
            } else {
                bossRandomizerIndex = (bossRandomizerIndex + 1) % configs.length;
                selectedConfig = configs[bossRandomizerIndex];
            }

            applyBossRandomizerConfig(selectedConfig);
            scheduleNextBossRandomizerSwitch();
        }, delayMs);
    }

    function updateBossRandomizerButtons() {
        if (!isBossPage) return;
        if (!bossRandomizerToggleBtn || !bossRandomizerControlsWrap) return;

        bossRandomizerToggleBtn.textContent = `🎲 Режим вразнобой: ${bossRandomizerEnabled ? 'вкл' : 'выкл'}`;
        bossRandomizerToggleBtn.style.background = bossRandomizerEnabled
            ? 'var(--clicker-btn-success)'
            : 'var(--clicker-btn-danger)';
        bossRandomizerControlsWrap.style.display = bossRandomizerEnabled ? 'block' : 'none';

        if (bossRandomizerTimerEl) {
            bossRandomizerTimerEl.style.display = bossRandomizerEnabled ? 'block' : 'none';
        }

        updateBossRandomizerTimerDisplay();
    }

    function formatBossRandomizerTimeLeft(ms) {
        const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}м ${String(seconds).padStart(2, '0')}с`;
    }

    function updateBossRandomizerTimerDisplay() {
        if (!isBossPage || !bossRandomizerTimerEl || !bossRandomizerEnabled) return;

        if (!bossRandomizerEnabled) {
            bossRandomizerTimerEl.textContent = '⏳ Следующее переключение: —';
            return;
        }

        if (!isRunning) {
            bossRandomizerTimerEl.textContent = '⏳ Следующее переключение: ожидание запуска';
            return;
        }

        if (!bossRandomizerNextSwitchAt) {
            bossRandomizerTimerEl.textContent = '⏳ Следующее переключение: ожидание';
            return;
        }

        const left = bossRandomizerNextSwitchAt - Date.now();

        if (left <= 0) {
            bossRandomizerTimerEl.textContent = '⏳ Следующее переключение: сейчас...';
            return;
        }

        bossRandomizerTimerEl.textContent = `⏳ Следующее переключение через: ${formatBossRandomizerTimeLeft(left)}`;
    }

    function startBossRandomizerCountdown() {
        if (bossRandomizerCountdownInterval) {
            clearInterval(bossRandomizerCountdownInterval);
            bossRandomizerCountdownInterval = null;
        }

        updateBossRandomizerTimerDisplay();

        bossRandomizerCountdownInterval = setInterval(() => {
            updateBossRandomizerTimerDisplay();
        }, 1000);
    }

    function stopBossRandomizerCountdown() {
        if (bossRandomizerCountdownInterval) {
            clearInterval(bossRandomizerCountdownInterval);
            bossRandomizerCountdownInterval = null;
        }
        updateBossRandomizerTimerDisplay();
    }

    function showBossRandomizerConfigs() {
        const configs = getValidBossRandomizerConfigs();

        if (configs.length === 0) {
            alert('Настройки режима вразнобой еще не заданы.');
            return;
        }

        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.background = 'rgba(0,0,0,0.75)';
        overlay.style.zIndex = '999999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.padding = '20px';

        const modal = document.createElement('div');
        modal.style.width = '900px';
        modal.style.maxWidth = '95vw';
        modal.style.maxHeight = '90vh';
        modal.style.overflowY = 'auto';
        modal.style.background = '#1e1e1e';
        modal.style.border = '2px solid #444';
        modal.style.borderRadius = '20px';
        modal.style.padding = '16px';
        modal.style.color = '#fff';
        modal.style.fontFamily = 'Arial';

        const cards = [];

        for (let i = 0; i < 10; i++) {
            const cfg = configs[i] || null;
            const isActive = bossRandomizerIndex === i;

            cards.push(`
                <div style="
                    border:2px solid ${isActive ? '#28a745' : '#444'};
                    border-radius:8px;
                    padding:6px;
                    background:${isActive ? '#1f3324' : '#2a2a2a'};
                    font-size:12px;
                    min-height:90px;
                ">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <span style="font-size:11px; font-weight:bold;">Вариант ${i + 1}</span>
                        <span style="
                            background:${cfg ? '#007bff' : '#555'};
                            color:#fff;
                            border-radius:4px;
                            padding:2px 6px;
                            font-size:10px;
                        ">
                            ${cfg ? cfg.mode.toUpperCase() : '—'}
                        </span>
                    </div>

                    <div style="font-size:11px; line-height:1.5;">
                        <div>Ударить: <b>${cfg ? cfg.donate : '—'}</b></div>
                        <div>Обновить: <b>${cfg ? cfg.refresh : '—'}</b></div>
                        ${isActive ? '<div style="margin-top:4px; color:#7CFC98; font-weight:bold;">● Текущий</div>' : ''}
                    </div>
                </div>
            `);
        }

        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div style="font-size:18px; font-weight:bold;">📋 Настроенные пресеты</div>
                <button type="button" id="bossRandomizerViewCloseBtn" style="background:#444;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;">✖</button>
            </div>

            <div style="margin-bottom:12px; padding:10px; border:1px solid #444; border-radius:8px; background:#252525; font-size:13px; line-height:1.6;">
                <div><b>Способ переключения:</b> ${bossRandomizerSelectionMode === 'random' ? 'Рандомный' : 'Последовательный'}</div>
                <div><b>Интервал переключения:</b> от ${bossRandomizerMinMinutes} до ${bossRandomizerMaxMinutes} мин.</div>
                <div><b>Активный пресет:</b> ${bossRandomizerIndex >= 0 ? bossRandomizerIndex + 1 : 'еще не выбран'}</div>
            </div>

            <div style="
                display:grid;
                grid-template-columns: repeat(5, 1fr);
                gap:10px;
            ">
                ${cards.join('')}
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        decorateModal(overlay, modal);

        const closeModal = () => overlay.remove();

        modal.querySelector('#bossRandomizerViewCloseBtn').onclick = closeModal;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
    }

    function openBossRandomizerSettingsModal() {
        const oldConfigs = getValidBossRandomizerConfigs();
        const initialConfigs = [];

        for (let i = 0; i < 10; i++) {
            initialConfigs.push(oldConfigs[i] || {
                mode: 'cps',
                donate: '',
                refresh: ''
            });
        }

        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.background = 'rgba(0,0,0,0.75)';
        overlay.style.zIndex = '999999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.padding = '20px';

        const modal = document.createElement('div');
        modal.style.width = '900px';
        modal.style.maxWidth = '95vw';
        modal.style.maxHeight = '90vh';
        modal.style.overflowY = 'auto';
        modal.style.background = '#1e1e1e';
        modal.style.border = '2px solid #444';
        modal.style.borderRadius = '20px';
        modal.style.padding = '16px';
        modal.style.color = '#fff';
        modal.style.fontFamily = 'Arial';

        const rowsHtml = `
            <div style="
            display:grid;
            grid-template-columns: repeat(5, 1fr);
            gap:10px;
        ">
            ${initialConfigs.map((cfg, index) => `
                <div class="boss-randomizer-row" data-index="${index}" style="
                    border:1px solid #444;
                    border-radius:8px;
                    padding:6px;
                    background:#2a2a2a;
                    font-size:12px;
                ">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-size:11px;">${index + 1}</span>
                        <button type="button"
                            class="boss-randomizer-mode-btn"
                            data-mode="${cfg.mode}"
                            style="
                                background:#007bff;
                                color:#fff;
                                border:none;
                                border-radius:4px;
                                padding:2px 6px;
                                font-size:10px;
                                cursor:pointer;
                            ">
                            ${cfg.mode.toUpperCase()}
                        </button>
                    </div>

                    <input
                        type="number"
                        class="boss-randomizer-donate"
                        value="${cfg.donate}"
                        placeholder="Ударить"
                        min="1"
                        style="
                            width:100%;
                            margin-bottom:4px;
                            background:#333;
                            color:#fff;
                            border:1px solid #666;
                            border-radius:4px;
                            padding:3px;
                            font-size:11px;
                        "
                    >

                    <input
                        type="number"
                        class="boss-randomizer-refresh"
                        value="${cfg.refresh}"
                        placeholder="Обновить"
                        min="1"
                        style="
                            width:100%;
                            background:#333;
                            color:#fff;
                            border:1px solid #666;
                            border-radius:4px;
                            padding:3px;
                            font-size:11px;
                        "
                    >
                </div>
            `).join('')}
        </div>
        `;

        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div style="font-size:18px; font-weight:bold;">⚔️ Настройка режима вразнобой</div>
                <button type="button" id="bossRandomizerCloseBtn" style="background:#444;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;">✖</button>
            </div>

                        <div style="
                            margin-bottom:12px;
                            padding:10px;
                            border:1px solid #444;
                            border-radius:8px;
                            background:#252525;
                            display:grid;
                            grid-template-columns: 1fr 1fr;
                            gap:12px;
                            align-items:start;
                        ">
                            <div style="
                                border:1px solid #3a3a3a;
                                border-radius:8px;
                                padding:10px;
                                background:#2b2b2b;
                            ">
                                <div style="margin-bottom:8px; font-weight:bold;">Способ переключения</div>
                                <button
                                    type="button"
                                    id="bossRandomizerSelectionBtn"
                                    data-selection="${bossRandomizerSelectionMode}"
                                    style="
                                        width:100%;
                                        background:#6f42c1;
                                        color:#fff;
                                        border:none;
                                        border-radius:6px;
                                        padding:8px 12px;
                                        cursor:pointer;
                                        font-weight:bold;
                                    "
                                >
                                    ${bossRandomizerSelectionMode === 'random' ? 'Рандомный' : 'Последовательный'}
                                </button>
                            </div>

                            <div style="
                                border:1px solid #3a3a3a;
                                border-radius:8px;
                                padding:10px;
                                background:#2b2b2b;
                            ">
                                <div style="margin-bottom:8px; font-weight:bold;">Интервал переключения</div>
                                <div style="display:flex; gap:10px;">
                                    <div style="flex:1;">
                                        <div style="font-size:12px; color:#bbb; margin-bottom:4px;">От, мин</div>
                                        <input
                                            type="number"
                                            id="bossRandomizerMinMinutes"
                                            min="1"
                                            value="${bossRandomizerMinMinutes}"
                                            style="
                                                width:100%;
                                                background:#333;
                                                color:#fff;
                                                border:1px solid #666;
                                                border-radius:6px;
                                                padding:6px;
                                                box-sizing:border-box;
                                           "
                                        >
                                    </div>
                                    <div style="flex:1;">
                                        <div style="font-size:12px; color:#bbb; margin-bottom:4px;">До, мин</div>
                                        <input
                                            type="number"
                                            id="bossRandomizerMaxMinutes"
                                            min="1"
                                            value="${bossRandomizerMaxMinutes}"
                                            style="
                                                width:100%;
                                                background:#333;
                                                color:#fff;
                                                border:1px solid #666;
                                                border-radius:6px;
                                                padding:6px;
                                                box-sizing:border-box;
                                            "
                                        >
                                    </div>
                                </div>
                            </div>
                        </div>

                ${rowsHtml}

            <div style="margin-top:12px; color:#ffcc00; font-weight:bold;">
                Введите от 3 до 10 вариантов настроек
            </div>

            <div style="display:flex; gap:10px; margin-top:14px;">
                <button type="button" id="bossRandomizerSaveBtn" style="flex:1; background:#28a745;color:#fff;border:none;border-radius:6px;padding:8px 12px;cursor:pointer;">💾 Сохранить</button>
                <button type="button" id="bossRandomizerCancelBtn" style="flex:1; background:#dc3545;color:#fff;border:none;border-radius:6px;padding:8px 12px;cursor:pointer;">Отмена</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        decorateModal(overlay, modal);

        const closeModal = () => {
            overlay.remove();
        };

        modal.querySelector('#bossRandomizerCloseBtn').onclick = () => closeModal();
        modal.querySelector('#bossRandomizerCancelBtn').onclick = () => closeModal();

        modal.querySelectorAll('.boss-randomizer-mode-btn').forEach(btn => {
            btn.onclick = () => {
                const nextMode = btn.dataset.mode === 'ms' ? 'cps' : 'ms';
                btn.dataset.mode = nextMode;
                btn.textContent = nextMode.toUpperCase();
            };
        });

        const selectionBtn = modal.querySelector('#bossRandomizerSelectionBtn');
        selectionBtn.onclick = () => {
            const nextSelection = selectionBtn.dataset.selection === 'sequential' ? 'random' : 'sequential';
            selectionBtn.dataset.selection = nextSelection;
            selectionBtn.textContent = nextSelection === 'random' ? 'Рандомный' : 'Последовательный';
        };

        modal.querySelector('#bossRandomizerSaveBtn').onclick = () => {
            const rows = [...modal.querySelectorAll('.boss-randomizer-row')];
            const minMinutesRaw = modal.querySelector('#bossRandomizerMinMinutes').value.trim();
            const maxMinutesRaw = modal.querySelector('#bossRandomizerMaxMinutes').value.trim();

            let minMinutes = parseInt(minMinutesRaw, 10);
            let maxMinutes = parseInt(maxMinutesRaw, 10);

            if (!Number.isFinite(minMinutes) || minMinutes < 1) minMinutes = 1;
            if (!Number.isFinite(maxMinutes) || maxMinutes < minMinutes) maxMinutes = minMinutes;
            const newConfigs = [];
            let hasPartialRow = false;

            rows.forEach(row => {
                const mode = row.querySelector('.boss-randomizer-mode-btn').dataset.mode;
                const donateRaw = row.querySelector('.boss-randomizer-donate').value.trim();
                const refreshRaw = row.querySelector('.boss-randomizer-refresh').value.trim();

                const hasDonate = donateRaw !== '';
                const hasRefresh = refreshRaw !== '';

                if (!hasDonate && !hasRefresh) {
                    return;
                }

                if (!hasDonate || !hasRefresh) {
                    hasPartialRow = true;
                    return;
                }

                const donate = parseInt(donateRaw, 10);
                const refresh = parseInt(refreshRaw, 10);

                if (!Number.isFinite(donate) || donate <= 0 || !Number.isFinite(refresh) || refresh <= 0) {
                    hasPartialRow = true;
                    return;
                }

                newConfigs.push({
                    mode,
                    donate,
                    refresh
                });
            });

            if (hasPartialRow || newConfigs.length < 3) {
                alert('Ошибка: нужно корректно заполнить минимум 3 полных варианта настроек.');
                closeModal();
                return;
            }

            bossRandomizerConfigs = newConfigs.slice(0, 10);
            bossRandomizerSelectionMode = selectionBtn.dataset.selection || 'sequential';
            bossRandomizerMinMinutes = minMinutes;
            bossRandomizerMaxMinutes = maxMinutes;
            bossRandomizerIndex = -1;

            localStorage.setItem(STORAGE.RANDOMIZER_CONFIGS, JSON.stringify(bossRandomizerConfigs));
            localStorage.setItem(STORAGE.RANDOMIZER_SELECTION_MODE, bossRandomizerSelectionMode);
            localStorage.setItem(STORAGE.RANDOMIZER_MIN_MINUTES, String(bossRandomizerMinMinutes));
            localStorage.setItem(STORAGE.RANDOMIZER_MAX_MINUTES, String(bossRandomizerMaxMinutes));

            if (bossRandomizerEnabled && isRunning) {
                scheduleNextBossRandomizerSwitch();
            }

            closeModal();
        };
    }

    if (isBossPage && bossRandomizerSettingsBtn) {
        bossRandomizerSettingsBtn.onclick = () => {
            openBossRandomizerSettingsModal();
        };
    }

    if (isBossPage && bossRandomizerViewBtn) {
        bossRandomizerViewBtn.onclick = () => {
            showBossRandomizerConfigs();
        };
    }

    // =========================================================
    // 12. ОБРАБОТЧИКИ ОСНОВНЫХ КНОПОК ПАНЕЛИ
    // Что здесь:
    // - старт / стоп
    // - сворачивание панели
    // - открытие настроек
    // - звук
    // - справка
    // - автозапуск
    // =========================================================

    toggleButton.onclick = () => {
        if (isRunning) stopClicking();
        else startClicking();
    };

    collapseBtn.onclick = () => {
        panel.style.display = 'none';
        showButton.style.display = 'block';
        localStorage.setItem(STORAGE.PANEL_HIDDEN, 'true');
    };

    showButton.onclick = () => {
        panel.style.display = 'block';
        showButton.style.display = 'none';
        localStorage.setItem(STORAGE.PANEL_HIDDEN, 'false');
    };

    toggleSettingsBtn.onclick = () => {
        const shown = settingsPanel.style.display === 'none';
        settingsPanel.style.display = shown ? 'block' : 'none';
        renderSettingsPanelContent();
    };

    soundToggleBtn.onclick = () => {
        soundEnabled = !soundEnabled;
        localStorage.setItem(STORAGE.SOUND, soundEnabled);
        soundToggleBtn.textContent = soundEnabled ? '🔊' : '🔇';
    };

    helpBtn.onclick = () => {
        openHelpModal();
    };

    autoStartBtn.onclick = () => {
        autoStartEnabled = !autoStartEnabled;
        localStorage.setItem(STORAGE.AUTO_START, autoStartEnabled);
        updateAutoStartButton();
        if (autoStartEnabled) startAutoStartWatch();
        else stopAutoStartWatch();
    };

    if (autoUltraMainBtn) {
        autoUltraMainBtn.onclick = () => {
            openAutoUltraModal();
        };
    }

    // =========================================================
    // 13. ЛОГИКА БОССА: УЛЬТА
    // Что здесь:
    // - быстрое включение ульты одной клавишей
    // =========================================================

    function enableUltraOneKey() {
        if (!isBossPage) return false;

        const ultra = document.getElementById('UltraAttackEnable');
        if (!ultra) {
            console.log('[Ultra] Переключатель ульты не найден');
            return false;
        }

        if (ultra.checked) {
            console.log('[Ultra] Ульта уже активна');
            return true;
        }

        ultra.click();

        const start = Date.now();

        const timer = setInterval(() => {
            const popup = document.getElementById('dlepopup');

            if (!popup) {
                if (Date.now() - start > 3000) {
                    clearInterval(timer);
                    console.log('[Ultra] Не удалось дождаться окна подтверждения');
                }
                return;
            }

            const buttons = [
                ...document.querySelectorAll('.ui-dialog-buttonpane button'),
                ...document.querySelectorAll('.ui-dialog-buttonset button'),
                ...popup.querySelectorAll('button'),
                ...document.querySelectorAll('.ui-dialog button')
            ];

            const confirmBtn = buttons.find(btn => {
                const txt = (btn.textContent || '').trim().toLowerCase();
                return (
                    txt.includes('подтверд') ||
                    txt.includes('включить') ||
                    txt === 'да' ||
                    txt === 'ok'
                );
            });

            if (confirmBtn) {
                clearInterval(timer);
                confirmBtn.click();
                console.log('[Ultra] Ульта включена');
                return;
            }

            if (Date.now() - start > 3000) {
                clearInterval(timer);
                console.log('[Ultra] Кнопка подтверждения не найдена');
            }
        }, 50);

        return true;
    }

    function getAutoUltraModeLabel(mode = autoUltraMode) {
        if (mode === AUTO_ULTRA_MODES.infinite) return 'Бесконечный';
        if (mode === AUTO_ULTRA_MODES.periodic) return 'Периодический';
        if (mode === AUTO_ULTRA_MODES.limited) return 'Ограниченный';
        return 'Неизвестно';
    }

    function getAutoUltraSettingsShortText() {
        if (!autoUltraEnabled) {
            return 'Режим выключен';
        }

        if (autoUltraMode === AUTO_ULTRA_MODES.infinite) {
            return 'Текущий режим: Бесконечный';
        }

        if (autoUltraMode === AUTO_ULTRA_MODES.periodic) {
            return `Текущий режим: Периодический • интервал ${autoUltraPeriodMinutes} мин`;
        }

        return `Текущий режим: Ограниченный • L1: ${autoUltraLimitLvl1}, L2: ${autoUltraLimitLvl2}, L3: ${autoUltraLimitLvl3}`;
    }

    function saveAutoUltraSession() {
        localStorage.setItem(STORAGE.AUTO_ULTRA_SESSION, JSON.stringify(autoUltraSession));
    }

    function saveAutoUltraSettings() {
        localStorage.setItem(STORAGE.AUTO_ULTRA_ENABLED, String(autoUltraEnabled));
        localStorage.setItem(STORAGE.AUTO_ULTRA_MODE, autoUltraMode);
        localStorage.setItem(STORAGE.AUTO_ULTRA_PERIOD_MINUTES, String(autoUltraPeriodMinutes));
        localStorage.setItem(STORAGE.AUTO_ULTRA_LIMIT_LVL1, String(autoUltraLimitLvl1));
        localStorage.setItem(STORAGE.AUTO_ULTRA_LIMIT_LVL2, String(autoUltraLimitLvl2));
        localStorage.setItem(STORAGE.AUTO_ULTRA_LIMIT_LVL3, String(autoUltraLimitLvl3));
    }

    function clearAutoUltraTimeout() {
        if (autoUltraTimeout) {
            clearTimeout(autoUltraTimeout);
            autoUltraTimeout = null;
        }
    }

    function getBossLevel() {
        if (!isBossPage) return 1;

        const el = document.getElementById('bossLevel');
        if (!el) return autoUltraSession.lastKnownLevel || 1;

        const styleAttr = el.getAttribute('style') || '';
        const styleMatch = styleAttr.match(/--level:\s*["']?(\d+)["']?/i);
        if (styleMatch) {
            return Math.max(1, Math.min(3, parseInt(styleMatch[1], 10) || 1));
        }

        const text = (el.textContent || '').trim();
        const textMatch = text.match(/(\d+)/);
        if (textMatch) {
            return Math.max(1, Math.min(3, parseInt(textMatch[1], 10) || 1));
        }

        return autoUltraSession.lastKnownLevel || 1;
    }

    function getUltraTimerText() {
        const el = document.querySelector('.ultra-attack-timer');
        return (el?.textContent || '').trim();
    }

    function getUltraEnableCheckbox() {
        return document.getElementById('UltraAttackEnable');
    }

    function isUltraEnabledNow() {
        const el = getUltraEnableCheckbox();
        return !!(el && el.checked);
    }

    function isUltraOnCooldown() {
        const text = getUltraTimerText().toLowerCase();
        return text.includes('включить можно через');
    }

    function getUltraCooldownSeconds() {
        const text = getUltraTimerText().toLowerCase();
        const match = text.match(/через\s+(\d+)\s*сек/);
        if (!match) return 0;
        return Math.max(0, parseInt(match[1], 10) || 0);
    }

    function isUltraReadyToEnable() {
        if (!isBossPage) return false;
        if (isUltraEnabledNow()) return false;
        if (isUltraOnCooldown()) return false;
        return !!getUltraEnableCheckbox();
    }

    function getCurrentBossSessionId() {
        if (!isBossPage) return '';

        const hpFill = document.getElementById('hpFill');
        const rawHp = hpFill
            ? getComputedStyle(hpFill).getPropertyValue('--health').trim()
            : '';

        const hp = parseInt(rawHp, 10);
        const hpText = (document.getElementById('hpIndicator')?.textContent || '').trim();
        const ultraTimerText = getUltraTimerText();

        // Если босс реально мертв — новой сессии нет
        if (!Number.isNaN(hp) && hp <= 0) return '';

        if (
            hpText.includes('0 /') ||
            hpText.includes('/ 0') ||
            hpText.includes('Босс уже был побежден') ||
            hpText.includes('Событие вторжения босса завершено')
        ) {
            return '';
        }

        // Сессия босса = текущая дата по МСК + страница босса.
        // Этого достаточно, потому что босс один в день.
        const now = getMoscowNow();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');

        return `${y}-${m}-${d}|boss`;
    }

    function resetAutoUltraSession(reason = 'unknown') {
        clearAutoUltraTimeout();
        autoUltraActivationPending = false;

        autoUltraSession = getDefaultAutoUltraSession();
        saveAutoUltraSession();

        console.log('[Auto Ultra] Сессия босса сброшена:', reason);
        updateAutoUltraStatusNearBoss();
        updateAutoUltraMainButton();
    }

    function shouldResetAutoUltraSessionBecauseBossEnded() {
        return !!bossAutoStopped;
    }

    function getLimitedModeLimitForLevel(level) {
        if (level === 1) return Math.max(0, autoUltraLimitLvl1);
        if (level === 2) return Math.max(0, autoUltraLimitLvl2);
        if (level === 3) return Math.max(0, autoUltraLimitLvl3);
        return 0;
    }

    function getLimitedModeUsedForLevel(level) {
        return Number(autoUltraSession?.usageByLevel?.[level]) || 0;
    }

    function getAutoUltraLimitedUsageText(level = getBossLevel()) {
        if (autoUltraMode !== AUTO_ULTRA_MODES.limited) return '';

        const safeLevel = Math.max(1, Math.min(3, parseInt(level, 10) || 1));
        const used = getLimitedModeUsedForLevel(safeLevel);
        const limit = getLimitedModeLimitForLevel(safeLevel);

        return `${used}/${limit}`;
    }

    function incrementLimitedModeUsed(level) {
        if (!autoUltraSession.usageByLevel) {
            autoUltraSession.usageByLevel = { 1: 0, 2: 0, 3: 0 };
        }
        autoUltraSession.usageByLevel[level] = (Number(autoUltraSession.usageByLevel[level]) || 0) + 1;
        saveAutoUltraSession();
    }

    function getNextLimitedDelayMs() {
        return Math.floor(Math.random() * 60001) + 90000; // 0..60000
    }

    function scheduleAutoUltra(delayMs) {
        clearAutoUltraTimeout();

        const safeDelay = Math.max(250, Number(delayMs) || 250);
        autoUltraSession.nextActionAt = Date.now() + safeDelay;
        saveAutoUltraSession();

        autoUltraTimeout = setTimeout(() => {
            autoUltraTimeout = null;
            runAutoUltraTick();
        }, safeDelay);

        updateAutoUltraStatusNearBoss();
    }

    function restoreAutoUltraSchedule() {
        if (!autoUltraEnabled || !isBossPage || !isRunning) return;

        const nextAt = Number(autoUltraSession.nextActionAt) || 0;
        if (!nextAt) {
            scheduleNextAutoUltraByMode(true);
            return;
        }

        const left = nextAt - Date.now();
        if (left <= 0) {
            runAutoUltraTick();
            return;
        }

        scheduleAutoUltra(left);
    }

    function scheduleNextAutoUltraByMode(isInitial = false) {
        if (!autoUltraEnabled || !isBossPage || !isRunning) return;

        const currentBossSessionId = getCurrentBossSessionId();

        if (currentBossSessionId && autoUltraSession.bossSessionId !== currentBossSessionId) {
            autoUltraSession = getDefaultAutoUltraSession();
            autoUltraSession.bossSessionId = currentBossSessionId;
            autoUltraSession.lastKnownLevel = getBossLevel();
            saveAutoUltraSession();

            console.log('[Auto Ultra] Новая сессия босса инициализирована в планировщике');
        }

        if (autoUltraMode === AUTO_ULTRA_MODES.infinite) {
            const cdSec = getUltraCooldownSeconds();
            if (cdSec > 0) {
                scheduleAutoUltra(Math.max(250, (cdSec * 1000) - 150));
                return;
            }

            scheduleAutoUltra(isInitial ? 150 : 350);
            return;
        }

        if (autoUltraMode === AUTO_ULTRA_MODES.periodic) {
            const minutes = Math.max(1, parseInt(autoUltraPeriodMinutes, 10) || 1);
            if (isInitial && Number(autoUltraSession.nextActionAt) > Date.now()) {
                restoreAutoUltraSchedule();
                return;
            }

            scheduleAutoUltra(minutes * 60 * 1000);
            return;
        }

        if (autoUltraMode === AUTO_ULTRA_MODES.limited) {
            const level = getBossLevel();
            const limit = getLimitedModeLimitForLevel(level);
            const used = getLimitedModeUsedForLevel(level);

            autoUltraSession.lastKnownLevel = level;
            saveAutoUltraSession();

            updateAutoUltraStatusNearBoss();
            updateAutoUltraMainButton();

            if (limit <= 0 || used >= limit) {
                scheduleAutoUltra(15000);
                return;
            }

            if (isInitial && Number(autoUltraSession.nextActionAt) > Date.now()) {
                restoreAutoUltraSchedule();
                return;
            }

            scheduleAutoUltra(getNextLimitedDelayMs());
        }
    }

    function tryEnableUltraAndHandleSuccess() {
        if (autoUltraActivationPending) return false;

        const beforeChecked = isUltraEnabledNow();
        if (beforeChecked) return false;

        autoUltraActivationPending = true;

        const started = enableUltraOneKey();
        if (!started) {
            autoUltraActivationPending = false;
            return false;
        }

        autoUltraSession.lastAttemptAt = Date.now();
        saveAutoUltraSession();

        setTimeout(() => {
            const activated = isUltraEnabledNow();

            if (!activated) {
                autoUltraActivationPending = false;
                scheduleAutoUltra(1000);
                return;
            }

            autoUltraSession.lastSuccessAt = Date.now();

            if (autoUltraMode === AUTO_ULTRA_MODES.limited) {
                const level = getBossLevel();
                incrementLimitedModeUsed(level);
            } else {
                saveAutoUltraSession();
            }

            autoUltraActivationPending = false;
            updateAutoUltraStatusNearBoss();
            updateAutoUltraMainButton();
            scheduleNextAutoUltraAfterSuccess();
        }, 1200);

        return true;
    }

    function scheduleNextAutoUltraAfterSuccess() {
        setTimeout(() => {
            const cdSec = getUltraCooldownSeconds();
            const cdMs = cdSec > 0 ? cdSec * 1000 : 0;

            if (autoUltraMode === AUTO_ULTRA_MODES.infinite) {
                scheduleAutoUltra(cdMs > 0 ? Math.max(250, cdMs - 150) : 500);
                return;
            }

            if (autoUltraMode === AUTO_ULTRA_MODES.periodic) {
                const periodMs = Math.max(1, parseInt(autoUltraPeriodMinutes, 10) || 1) * 60 * 1000;
                scheduleAutoUltra(Math.max(1000, cdMs + periodMs));
                return;
            }

            if (autoUltraMode === AUTO_ULTRA_MODES.limited) {
                scheduleAutoUltra(Math.max(1000, cdMs + getNextLimitedDelayMs()));
                return;
            }
        }, 600);
    }

    function runAutoUltraTick() {
        clearAutoUltraTimeout();

        if (!autoUltraEnabled || !isBossPage || !isRunning) return;

        if (shouldResetAutoUltraSessionBecauseBossEnded()) {
            resetAutoUltraSession('boss-ended-flag');
            return;
        }

        const currentBossSessionId = getCurrentBossSessionId();

        if (!currentBossSessionId) {
            scheduleAutoUltra(2000);
            return;
        }

        if (autoUltraSession.bossSessionId !== currentBossSessionId) {
            autoUltraSession = getDefaultAutoUltraSession();
            autoUltraSession.bossSessionId = currentBossSessionId;
            autoUltraSession.lastKnownLevel = getBossLevel();
            saveAutoUltraSession();

            console.log('[Auto Ultra] Обнаружен новый босс, лимиты сброшены');
        }

        const level = getBossLevel();
        autoUltraSession.lastKnownLevel = level;
        saveAutoUltraSession();

        if (autoUltraMode === AUTO_ULTRA_MODES.limited) {
            const limit = getLimitedModeLimitForLevel(level);
            const used = getLimitedModeUsedForLevel(level);

            updateAutoUltraStatusNearBoss();
            updateAutoUltraMainButton();

            if (limit <= 0 || used >= limit) {
                scheduleAutoUltra(15000);
                return;
            }
        }

        if (autoUltraActivationPending) {
            scheduleAutoUltra(500);
            return;
        }

        if (isUltraEnabledNow()) {
            scheduleAutoUltra(1000);
            return;
        }

        if (!isUltraReadyToEnable()) {
            const cdSec = getUltraCooldownSeconds();
            scheduleAutoUltra(cdSec > 0 ? Math.min(Math.max(500, cdSec * 1000), 5000) : 1000);
            return;
        }

        const successStarted = tryEnableUltraAndHandleSuccess();

        if (!successStarted) {
            scheduleAutoUltra(1000);
        }
    }

    function startAutoUltraLoop() {
        if (!isBossPage) return;
        if (!autoUltraEnabled) return;
        if (!isRunning) return;

        restoreAutoUltraSchedule();
        installAutoUltraStatusObserver();
        updateAutoUltraStatusNearBoss();
    }

    function stopAutoUltraLoop() {
        clearAutoUltraTimeout();
        updateAutoUltraStatusNearBoss();
    }

    function restartAutoUltraLoop(forceImmediate = false) {
        clearAutoUltraTimeout();

        autoUltraSession.nextActionAt = 0;
        saveAutoUltraSession();

        if (!autoUltraEnabled || !isBossPage || !isRunning) {
            updateAutoUltraStatusNearBoss();
            updateAutoUltraMainButton();
            return;
        }

        if (forceImmediate) {
            runAutoUltraTick();
            return;
        }

        scheduleNextAutoUltraByMode(true);
    }

    function updateAutoUltraStatusNearBoss() {
        if (!isBossPage) return;

        const label = document.querySelector('label.checkbox.ta-center.as-center');
        const balance = label?.querySelector('.ultra-attack-balanse');
        if (!label || !balance) return;

        let badge = label.querySelector('#autoUltraStatusBadge');
        if (!badge) {
            badge = document.createElement('span');
            badge.id = 'autoUltraStatusBadge';
            badge.style.marginLeft = '8px';
            badge.style.fontSize = '12px';
            badge.style.fontWeight = '700';
            badge.style.opacity = '.95';
            balance.insertAdjacentElement('afterend', badge);
        }

        if (!autoUltraEnabled) {
            if (badge.textContent !== '') badge.textContent = '';
            if (badge.style.display !== 'none') badge.style.display = 'none';
            return;
        }

        let nextText = `Включен режим авто-ульты: ${getAutoUltraModeLabel()}`;

        if (autoUltraMode === AUTO_ULTRA_MODES.limited) {
            nextText += ` ${getAutoUltraLimitedUsageText()}`;
        }

        if (badge.style.display !== 'inline') {
            badge.style.display = 'inline';
        }

        if (badge.textContent !== nextText) {
            badge.textContent = nextText;
        }
    }

    function installAutoUltraStatusObserver() {
        if (!isBossPage || autoUltraStatusObserver) return;

        const bossLevelEl = document.getElementById('bossLevel');
        const ultraTimerEl = document.querySelector('.ultra-attack-timer');
        const hpFillEl = document.getElementById('hpFill');
        const dlePushEl = document.getElementById('DLEPush');

        const observerCallback = () => {
            updateAutoUltraStatusNearBoss();

            if (!autoUltraEnabled || !isRunning) return;
            if (autoUltraTimeout) return;

            const nextAt = Number(autoUltraSession.nextActionAt) || 0;
            if (!nextAt || nextAt <= Date.now()) {
                runAutoUltraTick();
            }
        };

        autoUltraStatusObserver = new MutationObserver(observerCallback);

        [bossLevelEl, ultraTimerEl, hpFillEl, dlePushEl].forEach(el => {
            if (!el) return;
            autoUltraStatusObserver.observe(el, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true
            });
        });
    }

    function openAutoUltraModal() {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.background = 'rgba(0,0,0,0.75)';
        overlay.style.zIndex = '999999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.padding = '20px';

        const modal = document.createElement('div');
        modal.style.width = '720px';
        modal.style.maxWidth = '95vw';
        modal.style.maxHeight = '90vh';
        modal.style.overflowY = 'auto';
        modal.style.background = '#1e1e1e';
        modal.style.border = '2px solid #444';
        modal.style.borderRadius = '20px';
        modal.style.padding = '16px';
        modal.style.color = '#fff';
        modal.style.fontFamily = 'Arial';

        let draftMode = autoUltraMode;
        let draftPeriodMinutes = autoUltraPeriodMinutes;
        let draftLimitLvl1 = autoUltraLimitLvl1;
        let draftLimitLvl2 = autoUltraLimitLvl2;
        let draftLimitLvl3 = autoUltraLimitLvl3;

        function renderModalContent() {
            const currentLevel = getBossLevel();
            const used1 = getLimitedModeUsedForLevel(1);
            const used2 = getLimitedModeUsedForLevel(2);
            const used3 = getLimitedModeUsedForLevel(3);

            modal.style.width = '720px';

            modal.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <div style="font-size:18px;font-weight:bold;">💥 Настройки авто-ульты</div>
                    <button type="button" id="autoUltraModalCloseBtn" style="background:#444;color:#fff;border:none;border-radius:8px;padding:5px 10px;cursor:pointer;">✖</button>
                </div>

                <div class="clicker-modal-card" style="padding:12px;margin-bottom:12px;">
                    <div style="margin-bottom:8px;"><b>Статус:</b> ${autoUltraEnabled ? 'включен' : 'выключен'}</div>
                    <div style="margin-bottom:8px;"><b>Режим:</b> ${getAutoUltraModeLabel()}</div>
                    <div style="margin-bottom:8px;"><b>Текущий lvl босса:</b> ${currentLevel}</div>
                    <div style="font-size:12px;opacity:.9;line-height:1.5;">
                        ${autoUltraMode === AUTO_ULTRA_MODES.infinite
                            ? 'Ульта будет включаться сразу после окончания КД.'
                            : autoUltraMode === AUTO_ULTRA_MODES.periodic
                                ? `Ульта будет включаться каждые ${Math.max(1, autoUltraPeriodMinutes)} мин.`
                                : `L1: ${used1}/${autoUltraLimitLvl1} • L2: ${used2}/${autoUltraLimitLvl2} • L3: ${used3}/${autoUltraLimitLvl3}`
                        }
                    </div>
                </div>

                <div style="display:flex;gap:10px;margin-bottom:12px;">
                    <button
                        type="button"
                        id="autoUltraModalToggleBtn"
                        style="
                            flex:1;
                            background:${autoUltraEnabled ? 'var(--clicker-btn-danger)' : 'var(--clicker-btn-success)'};
                            color:#fff;border:none;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:700;
                        "
                    >
                        ${autoUltraEnabled ? 'Выключить' : 'Включить'}
                    </button>

                    <button
                        type="button"
                        id="autoUltraApplyBtn"
                        style="flex:1;background:var(--clicker-btn-primary);color:#fff;border:none;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:700;"
                    >
                        Применить
                    </button>
                </div>

                <div class="clicker-modal-card" style="padding:12px;">
                    <div style="margin-bottom:10px;font-weight:700;">Режим авто-ульты</div>

                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;">
                        <button type="button" id="autoUltraModeInfiniteBtn"
                            style="padding:8px 10px;border:none;border-radius:10px;cursor:pointer;font-weight:700;background:${draftMode === AUTO_ULTRA_MODES.infinite ? 'linear-gradient(180deg,var(--clicker-btn-primary),var(--clicker-btn-primary-2))' : 'var(--clicker-btn-secondary)'};color:#fff;">
                            Бесконечный
                        </button>

                        <button type="button" id="autoUltraModePeriodicBtn"
                            style="padding:8px 10px;border:none;border-radius:10px;cursor:pointer;font-weight:700;background:${draftMode === AUTO_ULTRA_MODES.periodic ? 'linear-gradient(180deg,var(--clicker-btn-primary),var(--clicker-btn-primary-2))' : 'var(--clicker-btn-secondary)'};color:#fff;">
                            Периодический
                        </button>

                        <button type="button" id="autoUltraModeLimitedBtn"
                            style="padding:8px 10px;border:none;border-radius:10px;cursor:pointer;font-weight:700;background:${draftMode === AUTO_ULTRA_MODES.limited ? 'linear-gradient(180deg,var(--clicker-btn-primary),var(--clicker-btn-primary-2))' : 'var(--clicker-btn-secondary)'};color:#fff;">
                            Ограниченный
                        </button>
                    </div>

                    ${draftMode === AUTO_ULTRA_MODES.periodic ? `
                        <div style="display:flex;flex-direction:column;gap:6px;">
                            <label>Минут между включениями</label>
                            <input type="number" id="autoUltraPeriodInput" min="1" value="${Math.max(1, draftPeriodMinutes)}"
                                style="width:100%;background:#333;color:#fff;border:1px solid #666;border-radius:8px;padding:8px;">
                        </div>
                    ` : ''}

                    ${draftMode === AUTO_ULTRA_MODES.limited ? `
                        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
                            <div style="display:flex;flex-direction:column;gap:6px;">
                                <label>Ульт на 1 lvl</label>
                                <input type="number" id="autoUltraLimitLvl1Input" min="0" value="${Math.max(0, draftLimitLvl1)}"
                                    style="width:100%;background:#333;color:#fff;border:1px solid #666;border-radius:8px;padding:8px;">
                            </div>

                            <div style="display:flex;flex-direction:column;gap:6px;">
                                <label>Ульт на 2 lvl</label>
                                <input type="number" id="autoUltraLimitLvl2Input" min="0" value="${Math.max(0, draftLimitLvl2)}"
                                    style="width:100%;background:#333;color:#fff;border:1px solid #666;border-radius:8px;padding:8px;">
                            </div>

                            <div style="display:flex;flex-direction:column;gap:6px;">
                                <label>Ульт на 3 lvl</label>
                                <input type="number" id="autoUltraLimitLvl3Input" min="0" value="${Math.max(0, draftLimitLvl3)}"
                                    style="width:100%;background:#333;color:#fff;border:1px solid #666;border-radius:8px;padding:8px;">
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;

            decorateModal(overlay, modal);

            modal.querySelector('#autoUltraModalCloseBtn').onclick = () => overlay.remove();

            modal.querySelector('#autoUltraModalToggleBtn').onclick = () => {
                autoUltraEnabled = !autoUltraEnabled;
                saveAutoUltraSettings();

                if (!autoUltraEnabled) {
                    stopAutoUltraLoop();
                } else {
                    restartAutoUltraLoop(true);
                }

                renderSettingsPanelContent();
                updateAutoUltraStatusNearBoss();
                updateAutoUltraMainButton();
                renderModalContent();
            };

            const autoUltraApplyBtn = modal.querySelector('#autoUltraApplyBtn');
            if (autoUltraApplyBtn) {
                autoUltraApplyBtn.onclick = () => {
                    autoUltraMode = draftMode;
                    autoUltraPeriodMinutes = Math.max(1, parseInt(draftPeriodMinutes, 10) || 1);
                    autoUltraLimitLvl1 = Math.max(0, parseInt(draftLimitLvl1, 10) || 0);
                    autoUltraLimitLvl2 = Math.max(0, parseInt(draftLimitLvl2, 10) || 0);
                    autoUltraLimitLvl3 = Math.max(0, parseInt(draftLimitLvl3, 10) || 0);

                    saveAutoUltraSettings();

                    renderSettingsPanelContent();
                    updateAutoUltraStatusNearBoss();
                    updateAutoUltraMainButton();

                    if (autoUltraEnabled && isRunning) {
                        restartAutoUltraLoop(true);
                    }

                    overlay.remove();
                };
            }

            const infiniteBtn = modal.querySelector('#autoUltraModeInfiniteBtn');
            const periodicBtn = modal.querySelector('#autoUltraModePeriodicBtn');
            const limitedBtn = modal.querySelector('#autoUltraModeLimitedBtn');

            if (infiniteBtn) {
                infiniteBtn.onclick = () => {
                    draftMode = AUTO_ULTRA_MODES.infinite;
                    renderModalContent();
                };
            }

            if (periodicBtn) {
                periodicBtn.onclick = () => {
                    draftMode = AUTO_ULTRA_MODES.periodic;
                    renderModalContent();
                };
            }

            if (limitedBtn) {
                limitedBtn.onclick = () => {
                    draftMode = AUTO_ULTRA_MODES.limited;
                    renderModalContent();
                };
            }

            const periodInput = modal.querySelector('#autoUltraPeriodInput');
            if (periodInput) {
                periodInput.oninput = () => {
                    draftPeriodMinutes = Math.max(1, parseInt(periodInput.value, 10) || 1);
                };
            }

            const lvl1Input = modal.querySelector('#autoUltraLimitLvl1Input');
            const lvl2Input = modal.querySelector('#autoUltraLimitLvl2Input');
            const lvl3Input = modal.querySelector('#autoUltraLimitLvl3Input');

            if (lvl1Input) {
                lvl1Input.oninput = () => {
                    draftLimitLvl1 = Math.max(0, parseInt(lvl1Input.value, 10) || 0);
                };
            }

            if (lvl2Input) {
                lvl2Input.oninput = () => {
                    draftLimitLvl2 = Math.max(0, parseInt(lvl2Input.value, 10) || 0);
                };
            }

            if (lvl3Input) {
                lvl3Input.oninput = () => {
                    draftLimitLvl3 = Math.max(0, parseInt(lvl3Input.value, 10) || 0);
                };
            }
        }

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        renderModalContent();

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
    }

    // =========================================================
    // 14. ЯДРО АВТОКЛИКЕРА
    // Что здесь:
    // - создание воркеров
    // - запуск и остановка кликов
    // - перестройка воркеров при смене режима
    // =========================================================

    // ------------------------
    // 7️⃣ Функции запуска/остановки кликов
    // ------------------------
    /**
     * Создает отдельный Worker с таймером кликов.
     * Это позволяет не зависеть от setInterval в основном потоке страницы.
     */
    function createClickWorker(interval) {
        const workerCode = `
            let timer = null;

            self.onmessage = function(e) {
                const data = e.data || {};
                const type = Number(data.type);

                if (type === 1) {
                    const ms = Math.max(1, Number(data.interval) || 1);
                    clearInterval(timer);
                    timer = setInterval(function() {
                        self.postMessage(1);
                    }, ms);
                    return;
                }

                if (type === 0) {
                    clearInterval(timer);
                    timer = null;
                }
            };
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const worker = new Worker(url);

        worker.__clickerUrl = url;
        worker.postMessage({ type: 1, interval });

        return worker;
    }

    function stopClickWorker(worker) {
        if (!worker) return null;

        try {
            worker.postMessage({ type: 0 });
        } catch (e) {}

        try {
            worker.terminate();
        } catch (e) {}

        try {
            if (worker.__clickerUrl) {
                URL.revokeObjectURL(worker.__clickerUrl);
            }
        } catch (e) {}

        return null;
    }

    function installBossLowHpRequestWatcher() {
        if (!isBossPage || bossXhrHookInstalled) return;
        bossXhrHookInstalled = true;

        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url) {
            this._bossWatchUrl = url;
            return originalOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function(body) {
            this.addEventListener('load', function() {
                try {
                    if (!isBossPage) return;
                    if (!isRunning) return;
                    if (!bossLowHpRequestWatchEnabled) return;
                    if (bossAutoStopped) return;

                    const url = String(this._bossWatchUrl || '');
                    if (!url.includes('/mine_boost/') && !url.includes('/mine_refresh/')) return;

                    const raw = this.responseText;
                    if (!raw || typeof raw !== 'string') return;

                    let data = null;
                    try {
                        data = JSON.parse(raw);
                    } catch (e) {
                        return;
                    }

                    let shouldStop = false;

                    if (
                        data &&
                        typeof data.error === 'string' &&
                        (
                            data.error.includes('Босс уже был побежден') ||
                            data.error.includes('Событие вторжения босса завершено')
                        )
                    ) {
                        console.log('[Boss AutoStop] Сервер сообщил о смерти босса');
                        shouldStop = true;
                    }

                    if (shouldStop) {
                        bossAutoStopped = true;
                        resetAutoUltraSession('boss-killed-server-response');
                        stopClicking(true);

                        setTimeout(() => {
                            location.reload();
                        }, 100);
                    }

                } catch (e) {
                    console.error('[Boss AutoStop] Ошибка обработки XHR:', e);
                }
            });

            return originalSend.apply(this, arguments);
        };
    }

    function setupClickWorkers() {
        workerDonate = stopClickWorker(workerDonate);
        workerRefresh = stopClickWorker(workerRefresh);

        donateButton = document.querySelector(
            'button.club__boost-btn, button.mine__boost-btn'
        );

        refreshButton = document.querySelector(
            'button.club__boost__refresh-btn, button.mine__boost__refresh-btn'
        );

        const donateMs = currentMode === 'cps'
            ? cpsToMs(values.cps.donate)
            : values.ms.donate;

        const refreshMs = currentMode === 'cps'
            ? cpsToMs(values.cps.refresh)
            : values.ms.refresh;

        workerDonate = createClickWorker(donateMs);
        if (workerDonate) {
            workerDonate.onmessage = (e) => {
                if (e.data !== 1) return;

                if (!donateButton || !document.contains(donateButton)) {
                    donateButton = document.querySelector(
                        'button.club__boost-btn, button.mine__boost-btn'
                    );
                }

                if (donateButton) {
                    donateButton.click();
                }
            };
        }

        workerRefresh = createClickWorker(refreshMs);
        if (workerRefresh) {
            workerRefresh.onmessage = (e) => {
                if (e.data !== 1) return;

                if (!refreshButton || !document.contains(refreshButton)) {
                    refreshButton = document.querySelector(
                        'button.club__boost__refresh-btn, button.mine__boost__refresh-btn'
                    );
                }

                if (refreshButton) {
                    refreshButton.click();
                }
            };
        }
    }

    /**
     * Запускает новую сессию автокликера:
     * - сбрасывает старое состояние
     * - поднимает воркеры
     * - включает быстрые проверки лимитов/смерти босса
     */
    function startClicking(isAutoStarted = false) {
        stopClicking();
        bossLowHpRequestWatchEnabled = false;
        bossAutoStopped = false;
        isRunning = true;
        clickerStartedAt = Date.now();

        localStorage.setItem(STORAGE.RUNNING, 'true');
        toggleButton.textContent = '⏹ Стоп';
        syncPrimaryButtons();

        setupClickWorkers();
        startFastLimitCheck();

        if (isBossPage) {
            installBossLowHpRequestWatcher();
            startAutoUltraLoop();
            updateAutoUltraStatusNearBoss();
            updateAutoUltraMainButton();
            bossLowHpRequestWatchEnabled = false;
        }

        if (isBossPage && bossRandomizerEnabled) {
            scheduleNextBossRandomizerSwitch();
        }
    }

    function stopClicking(blockAutoRestartUntilWindowEnds = false) {
        clearInterval(limitCheckerInterval);

        if (bossRandomizerTimeout) {
            clearTimeout(bossRandomizerTimeout);
            bossRandomizerTimeout = null;
        }

        bossRandomizerNextSwitchAt = null;
        stopBossRandomizerCountdown();

        workerDonate = stopClickWorker(workerDonate);
        workerRefresh = stopClickWorker(workerRefresh);

        limitCheckerInterval = null;

        isRunning = false;
        bossLowHpRequestWatchEnabled = false;
        localStorage.setItem(STORAGE.RUNNING, 'false');
        toggleButton.textContent = '▶️ Старт';
        syncPrimaryButtons();

        if (blockAutoRestartUntilWindowEnds) {
            autoStartBlockedUntilWindowEnds = true;
        }

        if (isBossPage) {
            stopAutoUltraLoop();
            updateAutoUltraStatusNearBoss();
            updateAutoUltraMainButton();
        }
    }

    // =========================================================
    // 15. МОДАЛЬНЫЕ ОКНА
    // Что здесь:
    // - справка
    // =========================================================

    /**
     * Открывает окно справки по функциям автокликера.
     */
    function openHelpModal() {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.background = 'rgba(0,0,0,0.75)';
        overlay.style.zIndex = '999999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.padding = '16px';

        const modal = document.createElement('div');
        modal.style.width = '860px';
        modal.style.maxWidth = '95vw';
        modal.style.maxHeight = '90vh';
        modal.style.overflowY = 'auto';
        modal.style.background = '#1e1e1e';
        modal.style.border = '2px solid #444';
        modal.style.borderRadius = '20px';
        modal.style.padding = '14px';
        modal.style.color = '#fff';
        modal.style.fontFamily = 'Arial';
        modal.style.boxShadow = '0 0 20px rgba(0,0,0,0.5)';

        const autoUltraBlock = isBossPage ? `
            <div style="
                padding:10px 12px;
                border:1px solid #444;
                border-radius:10px;
                background:#252525;
            ">
                <div style="margin-bottom:6px;">
                    <span style="display:inline-block; background:#dc2626; color:#fff; border-radius:6px; padding:2px 8px; font-weight:bold;">💥 Авто-ульта</span>
                </div>
                <div style="font-size:12px; line-height:1.45; color:#ddd;">
                    <b>Бесконечный</b> — после КД.<br>
                    <b>Периодический</b> — через интервал.<br>
                    <b>Ограниченный</b> — лимит по уровням босса 1 / 2 / 3.
                </div>
            </div>
        ` : '';

        const randomizerBlock = isBossPage ? `
            <div style="
                padding:10px 12px;
                border:1px solid #444;
                border-radius:10px;
                background:#252525;
            ">
                <div style="margin-bottom:6px;">
                    <span style="display:inline-block; background:#6f42c1; color:#fff; border-radius:6px; padding:2px 8px; font-weight:bold;">🎲 Режим вразнобой</span>
                </div>
                <div style="font-size:12px; line-height:1.45; color:#ddd;">
                    Только для босса. Переключает пресеты автоматически.
                    Работает при наличии минимум <b>3</b> сохранённых вариантов.
                </div>
            </div>
        ` : '';

        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div style="font-size:18px; font-weight:bold; color:#fff;">❓ Справка по автокликеру</div>
                <button
                    type="button"
                    id="helpModalCloseBtn"
                    style="
                        background:#444;
                        color:#fff;
                        border:none;
                        border-radius:8px;
                        padding:5px 10px;
                        cursor:pointer;
                    "
                >
                    ✖
                </button>
            </div>

            <div style="
                padding:10px 12px;
                border:1px solid #444;
                border-radius:10px;
                background:#252525;
                margin-bottom:10px;
                font-size:12px;
                line-height:1.45;
                color:#ddd;
            ">
                Кликер поддерживает разные режимы кликов, автозапуск, темы интерфейса,
                кастомные уведомления, горячие клавиши
                ${isBossPage ? ', авто-ульту и режим вразнобой' : ''}.
           </div>

            <div style="
                display:grid;
                grid-template-columns:repeat(2, minmax(0, 1fr));
                gap:10px;
                align-items:start;
            ">
                <div style="
                    padding:10px 12px;
                    border:1px solid #444;
                    border-radius:10px;
                    background:#252525;
                ">
                    <div style="margin-bottom:6px;">
                        <span style="display:inline-block; background:#2563eb; color:#fff; border-radius:6px; padding:2px 8px; font-weight:bold;">▶️ Старт / Стоп</span>
                    </div>
                    <div style="font-size:12px; line-height:1.45; color:#ddd;">
                        Запускает и останавливает кликер.
                        Можно использовать кнопку или горячую клавишу.
                    </div>
                </div>

                <div style="
                    padding:10px 12px;
                    border:1px solid #444;
                    border-radius:10px;
                    background:#252525;
                ">
                    <div style="margin-bottom:6px;">
                        <span style="display:inline-block; background:#0f766e; color:#fff; border-radius:6px; padding:2px 8px; font-weight:bold;">🕒 мс / ⚡ CPS</span>
                    </div>
                    <div style="font-size:12px; line-height:1.45; color:#ddd;">
                        <b>мс</b> — задержка между кликами.<br>
                        <b>CPS</b> — клики в секунду.
                    </div>
                </div>

                <div style="
                    padding:10px 12px;
                    border:1px solid #444;
                    border-radius:10px;
                    background:#252525;
                ">
                    <div style="margin-bottom:6px;">
                        <span style="display:inline-block; background:#16a34a; color:#fff; border-radius:6px; padding:2px 8px; font-weight:bold;">⏱ Автозапуск</span>
                    </div>
                    <div style="font-size:12px; line-height:1.45; color:#ddd;">
                        Автоматически запускает кликер в нужное время события
                        для босса или вкладов.
                    </div>
                </div>

                <div style="
                    padding:10px 12px;
                    border:1px solid #444;
                    border-radius:10px;
                    background:#252525;
                ">
                    <div style="margin-bottom:6px;">
                        <span style="display:inline-block; background:#4b5563; color:#fff; border-radius:6px; padding:2px 8px; font-weight:bold;">🎹 Горячие клавиши</span>
                    </div>
                    <div style="font-size:12px; line-height:1.45; color:#ddd;">
                        Можно назначить клавишу для старта / стопа
                        ${isBossPage ? 'и отдельную клавишу для ульты.' : '.'}
                    </div>
                </div>

                <div style="
                    padding:10px 12px;
                    border:1px solid #444;
                    border-radius:10px;
                    background:#252525;
                ">
                    <div style="margin-bottom:6px;">
                        <span style="display:inline-block; background:#0891b2; color:#fff; border-radius:6px; padding:2px 8px; font-weight:bold;">🎨 Темы</span>
                    </div>
                    <div style="font-size:12px; line-height:1.45; color:#ddd;">
                        <b>Классика</b> — обычная тёмная.<br>
                        <b>Стекло</b> — мягкий стеклянный стиль.<br>
                        <b>Неон</b> — яркое свечение панели, кнопок и окон.
                    </div>
                </div>

                <div style="
                    padding:10px 12px;
                    border:1px solid #444;
                    border-radius:10px;
                    background:#252525;
                ">
                    <div style="margin-bottom:6px;">
                        <span style="display:inline-block; background:#16a34a; color:#fff; border-radius:6px; padding:2px 8px; font-weight:bold;">🔔 Кастомные уведомления</span>
                    </div>
                    <div style="font-size:12px; line-height:1.45; color:#ddd;">
                        Заменяют уведомления сайта на уведомления кликера.
                        В настройках можно менять <b>размер</b>.
                    </div>
                </div>

                <div style="
                    padding:10px 12px;
                    border:1px solid #444;
                    border-radius:10px;
                    background:#252525;
                    grid-column:1 / -1;
                ">
                    <div style="margin-bottom:6px;">
                        <span style="display:inline-block; background:#374151; color:#fff; border-radius:6px; padding:2px 8px; font-weight:bold;">ℹ️ Что показывают уведомления</span>
                    </div>
                    <div style="font-size:12px; line-height:1.45; color:#ddd;">
                        ${isBossPage
                            ? `<b>Босс:</b> урон, крит, оглушение, мастерство, ошибки.`
                            : `<b>Вклады:</b> вклад, изменение карты, без изменений, кирка, мастерство, ошибки.`}
                        ${isBossPage ? `<br><b>На вкладах:</b> вклад, изменение карты, без изменений, кирка, мастерство, ошибки.` : ''}
                    </div>
                </div>

                ${autoUltraBlock}
                ${randomizerBlock}

                <div style="
                    padding:10px 12px;
                    border:1px solid #444;
                    border-radius:10px;
                    background:#252525;
                ">
                    <div style="margin-bottom:6px;">
                        <span style="display:inline-block; background:#4b5563; color:#fff; border-radius:6px; padding:2px 8px; font-weight:bold;">🔊 Звук</span>
                    </div>
                    <div style="font-size:12px; line-height:1.45; color:#ddd;">
                        Включает и выключает звуковые сигналы кликера.
                    </div>
                </div>

                <div style="
                    padding:10px 12px;
                    border:1px solid #444;
                    border-radius:10px;
                    background:#252525;
                ">
                    <div style="margin-bottom:6px;">
                        <span style="display:inline-block; background:#4b5563; color:#fff; border-radius:6px; padding:2px 8px; font-weight:bold;">➡️ Сворачивание</span>
                    </div>
                    <div style="font-size:12px; line-height:1.45; color:#ddd;">
                        Панель можно свернуть и потом открыть обратно боковой кнопкой.
                    </div>
                </div>
            </div>

            <div style="
                margin-top:10px;
                padding:10px 12px;
                border:1px solid #5b1f1f;
                border-radius:10px;
                background:#2a1818;
                color:#ffb4b4;
                font-size:12px;
                line-height:1.45;
            ">
                Не ставь слишком агрессивные значения:
                это может вызывать мастерство, оглушение, ошибки или нестабильную работу.
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        decorateModal(overlay, modal);

        const closeBtn = modal.querySelector('#helpModalCloseBtn');
        if (closeBtn) {
            closeBtn.onclick = () => overlay.remove();
        }

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
    }

    // =========================================================
    // 16. СИНХРОНИЗАЦИЯ UI И ВРЕМЕННАЯ ЛОГИКА
    // Что здесь:
    // - обновление полей и кнопок
    // - вычисление московского времени
    // - автозапуск по окнам событий
    // - быстрые проверки лимитов и автостопов
    // =========================================================

    function updateInputsFromValues() {
        donateInput.value = values[currentMode].donate;
        refreshInput.value = values[currentMode].refresh;
    }

    function updateAutoStartButton() {
        autoStartBtn.textContent = `⏱ Автозапуск: ${autoStartEnabled ? 'вкл' : 'выкл'}`;
        syncPrimaryButtons();
    }

    function getMoscowNow() {
        const now = new Date();
        const localOffset = now.getTimezoneOffset();
        return new Date(now.getTime() + (3 * 60 + localOffset) * 60000);
    }

    function getEventWindowState() {
        const now = getMoscowNow();
        const h = now.getHours();
        const m = now.getMinutes();
        const s = now.getSeconds();
        const totalMinutes = h * 60 + m;

        if (isBoostPage) {
            const startMinute = 21 * 60 + 1;   // 21:01
            const endMinute = 21 * 60 + 10;    // 21:10

            const inStartGrace = (h === 21 && m === 1 && s >= 0 && s <= 59);
            const active = totalMinutes >= startMinute && totalMinutes <= endMinute;

            return {
                active,
                inStartGrace,
                type: 'boost'
            };
        }

        if (isBossPage) {
            const startMinute = 17 * 60 + 0;   // 17:00
            const endMinute = 18 * 60 + 59;    // 18:59

            const inStartGrace = (h === 17 && m === 0 && s >= 0 && s <= 59);
            const active = totalMinutes >= startMinute && totalMinutes <= endMinute;

            return {
                active,
                inStartGrace,
                type: 'boss'
            };
        }

        return {
            active: false,
            inStartGrace: false,
            type: null
        };
    }

    function shouldAutoStartNow() {
        return getEventWindowState().active;
    }

    function isInStartupGracePeriod() {
        return isRunning && (Date.now() - clickerStartedAt < 60000);
    }

    function isBoostEventAlreadyFinished() {
        const bar = document.querySelector('#my-progress .pbar__track[role="progressbar"]');
        if (!bar) return false;

        const nowValue = parseInt(bar.getAttribute('aria-valuenow'), 10) || 0;
        const maxValue = parseInt(bar.getAttribute('aria-valuemax'), 10) || 0;

        return maxValue > 0 && nowValue >= maxValue;
    }

    function isBossEventAlreadyFinished() {
        const hpFill = document.getElementById('hpFill');
        if (hpFill) {
            const raw = getComputedStyle(hpFill).getPropertyValue('--health').trim();
            const hp = parseInt(raw, 10);

            if (!Number.isNaN(hp) && hp <= 0) {
                return true;
            }
        }

        const dlePush = document.getElementById('DLEPush');
        const text = (dlePush?.textContent || '').trim();

        if (
            text.includes('Босс уже был побежден') ||
            text.includes('Событие вторжения босса завершено')
        ) {
            return true;
        }

        return false;
    }

    function isCurrentEventAlreadyFinished() {
        if (isBoostPage) return isBoostEventAlreadyFinished();
        if (isBossPage) return isBossEventAlreadyFinished();
        return false;
    }

    function hasBoostActionButtons() {
        if (!isBoostPage) return false;

        const hasDonate = !!document.querySelector('button.club__boost-btn');
        const hasRefresh = !!document.querySelector('button.club__boost__refresh-btn');

        return hasDonate || hasRefresh;
    }

    function runBoostPreStartButtonsCheck() {
        if (!isBoostPage) return;

        if (hasBoostActionButtons()) {
            console.log('[AutoStart][Boost] Кнопки найдены, ожидание 21:01');
            return;
        }

        console.log('[AutoStart][Boost] Кнопки не найдены в 21:00 — перезагрузка страницы');
        setTimeout(() => location.reload(), 100);
    }

    function startAutoStartWatch() {
        stopAutoStartWatch();

        let boostPreCheckStarted = false;
        let boostPreCheckInterval = null;

        autoStartInterval = setInterval(() => {
            if (!autoStartEnabled) return;

            const moscowNow = getMoscowNow();
            const h = moscowNow.getHours();
            const m = moscowNow.getMinutes();
            const s = moscowNow.getSeconds();

            // =====================================================
            // ВКЛАДЫ: предварительная проверка кнопок в 21:00
            // =====================================================
            if (isBoostPage) {
                const isPreCheckMinute = (h === 21 && m === 0);

                if (isPreCheckMinute && !boostPreCheckStarted) {
                    boostPreCheckStarted = true;
                    console.log('[AutoStart][Boost] 21:00 — запускаем предварительную проверку кнопок');
                    runBoostPreStartButtonsCheck();
                    boostPreCheckInterval = setInterval(runBoostPreStartButtonsCheck, 5000);
                }

                if (!isPreCheckMinute && !(h === 21 && m === 1)) {
                    boostPreCheckStarted = false;

                    if (boostPreCheckInterval) {
                        clearInterval(boostPreCheckInterval);
                        boostPreCheckInterval = null;
                    }
                }
            }

            const windowState = getEventWindowState();

            if (!windowState.active) {
                autoStartEventLock = false;
                autoStartBlockedUntilWindowEnds = false;
                return;
            }

            if (isRunning) return;
            if (autoStartEventLock) return;
            if (autoStartBlockedUntilWindowEnds) return;

            // =====================================================
            // ВКЛАДЫ: в стартовую минуту тоже обязательно проверяем кнопки
            // =====================================================
            if (isBoostPage && windowState.inStartGrace) {
                if (!hasBoostActionButtons()) {
                    console.log('[AutoStart][Boost] 21:01 — кнопки не найдены, автозапуск отменен');
                    autoStartBlockedUntilWindowEnds = true;

                    if (boostPreCheckInterval) {
                        clearInterval(boostPreCheckInterval);
                        boostPreCheckInterval = null;
                    }
                    return;
                }

                if (soundEnabled) playSound();

                autoStartEventLock = true;
                startClicking(true);

                if (boostPreCheckInterval) {
                    clearInterval(boostPreCheckInterval);
                    boostPreCheckInterval = null;
                }
                return;
            }

            // =====================================================
            // БОСС: стартовая минута остается как была
            // =====================================================
            if (isBossPage && windowState.inStartGrace) {
                if (soundEnabled) playSound();
                autoStartEventLock = true;
                startClicking(true);
                return;
            }

            // После стартовой минуты проверяем завершение события
            if (isCurrentEventAlreadyFinished()) {
                autoStartBlockedUntilWindowEnds = true;
                console.log('[AutoStart] Событие уже завершено, автозапуск отменен до конца окна');
                return;
            }

            // Для вкладов после стартовой минуты тоже не стартуем без кнопок
            if (isBoostPage && !hasBoostActionButtons()) {
                console.log('[AutoStart][Boost] Кнопки не найдены, автозапуск после стартовой минуты отменен');
                autoStartBlockedUntilWindowEnds = true;
                return;
            }

            if (soundEnabled) playSound();

            autoStartEventLock = true;
            startClicking(true);
        }, 1000);
    }

    /**
     * Запускает частую проверку лимитов и условий автостопа.
     * Для вкладов следит за progressbar, для босса — за HP и текстами завершения.
     */
    function startFastLimitCheck() {
        clearInterval(limitCheckerInterval);

        installBossLowHpRequestWatcher();

        limitCheckerInterval = setInterval(() => {
            if (!isRunning) return;

            // В первую минуту после старта вообще ничего не стопаем
            if (isInStartupGracePeriod()) {
                return;
            }

            if (isBoostPage) {
                const bar = document.querySelector('#my-progress .pbar__track[role="progressbar"]');
                if (bar) {
                    const nowValue = parseInt(bar.getAttribute('aria-valuenow'), 10) || 0;
                    const maxValue = parseInt(bar.getAttribute('aria-valuemax'), 10) || 0;

                    if (maxValue > 0 && nowValue >= maxValue) {
                        console.log('[Boost AutoStop] Достигнут лимит вкладов');
                        stopClicking(true);
                        return;
                    }
                }
            }

            if (isBossPage) {
                const hpFill = document.getElementById('hpFill');
                if (hpFill) {
                    const raw = getComputedStyle(hpFill).getPropertyValue('--health').trim();
                    const hp = parseInt(raw, 10);

                    if (!Number.isNaN(hp) && hp <= 0) {
                        console.log('[Boss AutoStop] HP босса <= 0');
                        bossAutoStopped = true;
                        resetAutoUltraSession('boss-killed-hp');
                        stopClicking(true);
                        setTimeout(() => location.reload(), 100);
                        return;
                    }

                    if (!Number.isNaN(hp) && hp <= 2500) {
                        bossLowHpRequestWatchEnabled = true;
                    }
                }

                const dlePush = document.getElementById('DLEPush');
                const text = (dlePush?.textContent || '').trim();

                if (
                    text.includes('Босс уже был побежден') ||
                    text.includes('Событие вторжения босса завершено')
                ) {
                    console.log('[Boss AutoStop] Найдено сообщение завершения в DLEPush');
                    bossAutoStopped = true;
                    resetAutoUltraSession('boss-killed-dlepush');
                    stopClicking(true);
                    setTimeout(() => location.reload(), 100);
                    return;
                }
            }
        }, 250);
    }

    // =========================================================
    // 17. ВВОД ЗНАЧЕНИЙ, ПЕРЕКЛЮЧЕНИЕ РЕЖИМОВ И ГОРЯЧИЕ КЛАВИШИ
    // Что здесь:
    // - смена ms/cps
    // - запись значений в localStorage
    // - обработка хоткея старта и ульты
    // =========================================================

    donateInput.addEventListener('change', () => {
        const value = Math.max(1, parseInt(donateInput.value, 10) || 1);
        values[currentMode].donate = value;
        localStorage.setItem(getStorageKey(currentMode, 'donate'), value);
        donateInput.value = value;
        if (isRunning) setupClickWorkers();
    });

    refreshInput.addEventListener('change', () => {
        const value = Math.max(1, parseInt(refreshInput.value, 10) || 1);
        values[currentMode].refresh = value;
        localStorage.setItem(getStorageKey(currentMode, 'refresh'), value);
        refreshInput.value = value;
        if (isRunning) setupClickWorkers();
    });

    msBtn.onclick = () => {
        currentMode = 'ms';
        localStorage.setItem(STORAGE.MODE, currentMode);
        updateInputsFromValues();
        syncPrimaryButtons();
        if (isRunning) setupClickWorkers();
    };

    cpsBtn.onclick = () => {
        currentMode = 'cps';
        localStorage.setItem(STORAGE.MODE, currentMode);
        updateInputsFromValues();
        syncPrimaryButtons();
        if (isRunning) setupClickWorkers();
    };

    document.addEventListener('keydown', (e) => {
        if (waitingForHotkey) {
            e.preventDefault();
            const key = e.key.length === 1 ? e.code : e.key;
            currentHotkey = normalizeHotkeyValue(key);
            localStorage.setItem(STORAGE.HOTKEY, currentHotkey);
            waitingForHotkey = false;
            renderSettingsPanelContent();
            return;
        }

        if (waitingForUltraHotkey) {
            e.preventDefault();
            const key = e.key.length === 1 ? e.code : e.key;
            currentUltraHotkey = normalizeHotkeyValue(key);
            localStorage.setItem(STORAGE.ULTRA_HOTKEY, currentUltraHotkey);
            waitingForUltraHotkey = false;
            renderSettingsPanelContent();
            return;
        }

        if (eventMatchesHotkey(e, currentHotkey)) {
            e.preventDefault();
            if (isRunning) stopClicking();
            else startClicking();
            return;
        }

        if (isBossPage && eventMatchesHotkey(e, currentUltraHotkey)) {
            e.preventDefault();
            enableUltraOneKey();
        }
    });

    // =========================================================
    // 18. ОБНОВЛЕНИЕ ЧАСОВ И ИНИЦИАЛИЗАЦИЯ
    // Что здесь:
    // - живые часы по МСК
    // - восстановление состояния панели
    // - восстановление автозапуска, темы и running-state
    // =========================================================

    /**
     * Обновляет отображение текущего московского времени в панели.
     */
    function updateClock() {
        const clockDisplay = panel.querySelector('#clockDisplay');
        if (!clockDisplay) return;

        const moscowNow = getMoscowNow();
        const hh = String(moscowNow.getHours()).padStart(2, '0');
        const mm = String(moscowNow.getMinutes()).padStart(2, '0');
        const ss = String(moscowNow.getSeconds()).padStart(2, '0');

        clockDisplay.textContent = `⏰ ${hh}:${mm}:${ss} МСК`;
        if (currentTheme === 'neon') {
            clockDisplay.style.color = '#67e8f9';
            clockDisplay.style.textShadow = '0 0 6px rgba(103,232,249,.14), 0 0 12px rgba(40,199,220,.06)';
        }
    }

    setInterval(updateClock, 1000);

    applyClickerTheme(currentTheme);

    updateClock();

    if (localStorage.getItem(STORAGE.PANEL_HIDDEN) === 'true') {
        panel.style.display = 'none';
        showButton.style.display = 'block';
    }

    updateInputsFromValues();
    updateAutoStartButton();
    updateBossRandomizerButtons();

    if (localStorage.getItem(STORAGE.RUNNING) === 'true') {
        startClicking();
    }

    if (autoStartEnabled) {
        startAutoStartWatch();
    }

    syncPrimaryButtons();
    syncNeonTextFallback();

})();
