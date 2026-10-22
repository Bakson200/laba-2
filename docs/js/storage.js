/* Хранилище доски: localStorage + демо-данные при первом запуске. */
(function (global) {
  "use strict";

  var KEY = "habit-kanban.cards.v1";
  var VERSION = 1;

  var available = (function () {
    try {
      var probe = "__kanban_probe__";
      global.localStorage.setItem(probe, "1");
      global.localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  })();

  function uid() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }
    return "c-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  var SEED = [
    {
      title: "Менеджер привычек",
      note: "Habit / HabitService: создание, расписание, архив и удаление привычек.",
      tag: "m1",
      col: "done",
      order: 1
    },
    {
      title: "Журнал отметок",
      note: "CheckInEntry / HabitLog: статус за день, заметка и календарь месяца.",
      tag: "m2",
      col: "done",
      order: 2
    },
    {
      title: "Метрики и стрики",
      note: "StreakCalculator: текущая серия, лучший стрик и процент успешности.",
      tag: "m3",
      col: "review",
      order: 1
    },
    {
      title: "Напоминания и хранение",
      note: "ReminderConfig / HabitStorage: список на сегодня и сохранение в JSON.",
      tag: "m4",
      col: "doing",
      order: 1
    },
    {
      title: "Интерфейс: консоль и веб",
      note: "CLI-команды и веб-версия на Flask с карточками привычек и календарём.",
      tag: "ui",
      col: "doing",
      order: 2
    },
    {
      title: "Тесты",
      note: "Unittest для привычек, отметок, стриков, хранилища и веб-маршрутов.",
      tag: "qa",
      col: "backlog",
      order: 1
    },
    {
      title: "Защита проекта",
      note: "README, демонстрация MVP и рассказ про архитектуру приложения.",
      tag: "docs",
      col: "backlog",
      order: 2
    }
  ];

  function seed() {
    var now = Date.now();
    return SEED.map(function (item, index) {
      return {
        id: uid(),
        title: item.title,
        note: item.note,
        tag: item.tag,
        col: item.col,
        order: item.order,
        created: now + index
      };
    });
  }

  function normalize(card) {
    if (!card || typeof card !== "object") return null;
    var title = String(card.title == null ? "" : card.title).trim().slice(0, 120);
    if (!title) return null;
    var order = Number(card.order);
    return {
      id: typeof card.id === "string" && card.id ? card.id : uid(),
      title: title,
      note: String(card.note == null ? "" : card.note).trim().slice(0, 300),
      tag: typeof card.tag === "string" && card.tag ? card.tag : "m1",
      col: typeof card.col === "string" && card.col ? card.col : "backlog",
      order: isFinite(order) ? order : 0,
      created: Number(card.created) || Date.now()
    };
  }

  function save(cards) {
    if (!available) return false;
    try {
      global.localStorage.setItem(KEY, JSON.stringify({ version: VERSION, cards: cards }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function load() {
    if (!available) return seed();
    var raw = null;
    try {
      raw = global.localStorage.getItem(KEY);
    } catch (e) {
      return seed();
    }
    if (!raw) {
      var initial = seed();
      save(initial);
      return initial;
    }
    try {
      var parsed = JSON.parse(raw);
      var list = Array.isArray(parsed)
        ? parsed
        : parsed && Array.isArray(parsed.cards)
          ? parsed.cards
          : null;
      if (!list) return seed();
      return list.map(normalize).filter(Boolean);
    } catch (e) {
      return seed();
    }
  }

  function reset() {
    var cards = seed();
    save(cards);
    return cards;
  }

  global.KanbanStore = {
    load: load,
    save: save,
    reset: reset,
    newId: uid,
    available: available
  };
})(window);
