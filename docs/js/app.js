/* Запуск приложения: тема, установка PWA и офлайн-режим. */
(function () {
  "use strict";

  var THEME_KEY = "habit-kanban.theme";

  function readTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (e) {
      return null;
    }
  }

  function systemPrefersDark() {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function applyTheme(theme) {
    var root = document.documentElement;
    if (theme === "light" || theme === "dark") {
      root.setAttribute("data-theme", theme);
    } else {
      root.removeAttribute("data-theme");
    }

    var dark = theme === "dark" || (!theme && systemPrefersDark());
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0f1816" : "#0f766e");

    var button = document.getElementById("theme-toggle");
    if (button) {
      button.textContent = dark ? "☀" : "◐";
      button.setAttribute("aria-label", dark ? "Включить светлую тему" : "Включить тёмную тему");
      button.setAttribute("title", dark ? "Светлая тема" : "Тёмная тема");
    }
  }

  function toggleTheme() {
    var saved = readTheme();
    var darkNow = saved ? saved === "dark" : systemPrefersDark();
    var next = darkNow ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (e) {
      /* приватный режим — тема просто не запомнится */
    }
    applyTheme(next);
  }

  function setupInstall() {
    var button = document.getElementById("install-btn");
    if (!button) return;
    var deferred = null;

    window.addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      deferred = event;
      button.hidden = false;
    });

    button.addEventListener("click", function () {
      if (!deferred) return;
      deferred.prompt();
      var choice = deferred.userChoice;
      if (choice && choice.finally) {
        choice.finally(function () {
          deferred = null;
          button.hidden = true;
        });
      }
    });

    window.addEventListener("appinstalled", function () {
      deferred = null;
      button.hidden = true;
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {
        /* офлайн-режим недоступен — приложение продолжает работать */
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(readTheme());

    var toggle = document.getElementById("theme-toggle");
    if (toggle) toggle.addEventListener("click", toggleTheme);

    if (window.matchMedia) {
      var media = window.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function () {
        if (!readTheme()) applyTheme(null);
      };
      if (media.addEventListener) media.addEventListener("change", onChange);
    }

    if (window.KanbanBoard) window.KanbanBoard.init();

    setupInstall();
    registerServiceWorker();
  });
})();
