/* Интерфейс трекера: список привычек, отметки, календарь и архив. */
(function (global) {
  "use strict";

  var D = global.HabitDates;
  var Model = global.HabitModel;
  var Checkins = global.HabitCheckins;
  var Stats = global.HabitStats;
  var StorageModule = global.HabitStorageModule;

  var DONE = Checkins.DONE;
  var SKIPPED = Checkins.SKIPPED;

  var storage = new StorageModule.HabitStorage();
  var service = null;
  var log = null;
  var statistics = null;

  var view = { habitId: null, year: 0, month: 0, selectedDay: null };
  var editingId = null;
  var el = {};

  document.addEventListener("DOMContentLoaded", init);

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function todayISO() {
    return D.todayISO();
  }

  function say(message, isError) {
    if (!el.status) return;
    el.status.hidden = !message;
    el.status.textContent = message || "";
    el.status.className = "notice" + (isError ? " err" : "");
  }

  function save() {
    if (!storage.save(service, log)) {
      say("Не удалось сохранить изменения: браузер запретил доступ к localStorage.", true);
    } else {
      say("");
    }
  }

  function init() {
    var loaded = storage.load();
    service = loaded.service;
    log = loaded.log;
    statistics = new Stats.HabitStatistics(log);

    el.status = $("status");
    el.todayLine = $("today-line");
    el.todayText = $("today-text");
    el.todayFill = $("today-fill");
    el.todayBar = $("today-bar");
    el.reminders = $("reminders");
    el.listView = $("list-view");
    el.detailView = $("detail-view");
    el.grid = $("habit-grid");
    el.emptyState = $("empty-state");
    el.archivePanel = $("archive-panel");
    el.archiveTitle = $("archive-title");
    el.archiveList = $("archive-list");
    el.detailTitle = $("detail-title");
    el.detailMeta = $("detail-meta");
    el.detailDesc = $("detail-desc");
    el.detailBadge = $("detail-badge");
    el.detailStats = $("detail-stats");
    el.calTitle = $("cal-title");
    el.calWeekdays = $("cal-weekdays");
    el.calGrid = $("cal-grid");
    el.calRate = $("cal-rate");
    el.dayPanel = $("day-panel");
    el.dayTitle = $("day-title");
    el.dayNote = $("day-note");
    el.notesList = $("notes-list");
    el.dialog = $("habit-dialog");
    el.habitForm = $("habit-form");
    el.dialogTitle = $("dialog-title");
    el.dialogDays = $("dialog-days");
    el.themeToggle = $("theme-toggle");
    el.installBtn = $("install-btn");

    buildWeekdayChips();
    bindEvents();
    applyTheme(readTheme());
    renderAll();
    setupInstall();
    registerServiceWorker();

    if (!storage.available) {
      say("Браузер запретил localStorage: изменения не сохранятся после перезагрузки.", true);
    }
  }

  function bindEvents() {
    document.addEventListener("click", onClick);

    el.habitForm.addEventListener("submit", onSubmit);

    if (el.dialog) {
      el.dialog.addEventListener("click", function (event) {
        if (event.target === el.dialog) el.dialog.close();
      });
    }

    if (el.themeToggle) {
      el.themeToggle.addEventListener("click", toggleTheme);
    }

    if (window.matchMedia) {
      var media = window.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function () {
        if (!readTheme()) applyTheme(null);
      };
      if (media.addEventListener) media.addEventListener("change", onChange);
    }
  }

  function onClick(event) {
    var trigger = event.target.closest("[data-act]");
    if (!trigger) return;
    var action = trigger.getAttribute("data-act");

    if (action === "open-add") {
      openAddDialog();
    } else if (action === "close-dialog") {
      el.dialog.close();
    } else if (action === "add-examples") {
      addExamples();
    } else if (action === "open") {
      openHabit(trigger.getAttribute("data-id"));
    } else if (action === "back") {
      backToList();
    } else if (action === "edit") {
      openEditDialog(trigger.getAttribute("data-id"));
    } else if (action === "archive") {
      service.archive(trigger.getAttribute("data-id"));
      save();
      renderAll();
    } else if (action === "unarchive") {
      service.unarchive(trigger.getAttribute("data-id"));
      save();
      renderAll();
    } else if (action === "delete") {
      deleteHabit(trigger.getAttribute("data-id"));
    } else if (action === "mark") {
      markFromCard(trigger);
    } else if (action === "pick-day") {
      pickDay(trigger.getAttribute("data-day"));
    } else if (action === "mark-day") {
      markFromDayPanel(trigger.getAttribute("data-status"));
    } else if (action === "prev-month" || action === "next-month") {
      changeMonth(action === "prev-month" ? -1 : 1);
    }
  }

  /* ---------- привычки ---------- */

  function openHabit(id) {
    var now = D.parseISO(todayISO());
    view.habitId = id;
    view.year = now.getFullYear();
    view.month = now.getMonth();
    view.selectedDay = null;
    say("");
    renderAll();
    window.scrollTo(0, 0);
  }

  function backToList() {
    view.habitId = null;
    view.selectedDay = null;
    say("");
    renderAll();
    window.scrollTo(0, 0);
  }

  function deleteHabit(id) {
    if (!window.confirm("Удалить привычку вместе со всей историей?")) return;
    service.remove(id);
    log.deleteHabit(id);
    save();
    if (view.habitId === id) {
      view.habitId = null;
      view.selectedDay = null;
    }
    renderAll();
  }

  function addExamples() {
    var demo = StorageModule.seedState();
    demo.service.all().forEach(function (habit) {
      service.habits.push(habit);
    });
    Object.keys(demo.log.entries).forEach(function (key) {
      log.entries[key] = demo.log.entries[key];
    });
    save();
    renderAll();
  }

  /* ---------- отметки ---------- */

  function markHabit(habitId, day, status, note) {
    if (day > todayISO()) {
      say("Нельзя отмечать будущие дни", true);
      return;
    }
    if (status === "undo") {
      log.unmark(habitId, day);
    } else {
      log.mark(habitId, day, status, note || "");
    }
    save();
    renderAll();
  }

  function markFromCard(trigger) {
    var card = trigger.closest("[data-id]");
    if (!card) return;
    var input = card.querySelector('.mark input[name="note"]');
    markHabit(
      card.getAttribute("data-id"),
      todayISO(),
      trigger.getAttribute("data-status"),
      input ? input.value : ""
    );
  }

  function markFromDayPanel(status) {
    if (!view.habitId || !view.selectedDay) return;
    markHabit(view.habitId, view.selectedDay, status, el.dayNote.value);
  }

  function pickDay(day) {
    if (!day) return;
    if (day > todayISO()) {
      say("Нельзя отмечать будущие дни", true);
      return;
    }
    view.selectedDay = day;
    say("");
    renderDetail();
  }

  function changeMonth(delta) {
    var date = new Date(view.year, view.month + delta, 1, 12);
    view.year = date.getFullYear();
    view.month = date.getMonth();
    view.selectedDay = null;
    say("");
    renderDetail();
  }

  /* ---------- диалог создания и редактирования ---------- */

  function buildWeekdayChips() {
    if (!el.dialogDays) return;
    el.dialogDays.innerHTML = D.WEEKDAY_SHORT.map(function (name, index) {
      return (
        '<label class="chip-day"><input type="checkbox" name="weekdays" value="' +
        index +
        '"><span>' +
        name +
        "</span></label>"
      );
    }).join("");
  }

  function openAddDialog() {
    editingId = null;
    el.dialogTitle.textContent = "Новая привычка";
    el.habitForm.reset();
    el.dialog.showModal();
    el.habitForm.querySelector('[name="name"]').focus();
  }

  function openEditDialog(id) {
    var habit = service.get(id);
    editingId = id;
    el.dialogTitle.textContent = "Редактировать привычку";
    el.habitForm.querySelector('[name="name"]').value = habit.name;
    el.habitForm.querySelector('[name="description"]').value = habit.description;
    el.habitForm.querySelector('[name="time"]').value = habit.time || "";
    el.habitForm.querySelectorAll('input[name="weekdays"]').forEach(function (input) {
      input.checked = habit.weekdays.indexOf(Number(input.value)) >= 0;
    });
    el.dialog.showModal();
    el.habitForm.querySelector('[name="name"]').focus();
  }

  function onSubmit(event) {
    event.preventDefault();
    var form = el.habitForm;
    var name = String(form.querySelector('[name="name"]').value || "").trim();
    if (!name) {
      say("Введите название привычки", true);
      return;
    }
    var weekdays = Array.prototype.slice
      .call(form.querySelectorAll('input[name="weekdays"]:checked'))
      .map(function (input) { return Number(input.value); });

    var data = {
      name: name,
      description: form.querySelector('[name="description"]').value,
      time: form.querySelector('[name="time"]').value || null,
      weekdays: weekdays.length ? weekdays : Model.ALL_DAYS.slice()
    };

    try {
      if (editingId) service.update(editingId, data);
      else service.create(data, todayISO());
      save();
      el.dialog.close();
      renderAll();
    } catch (error) {
      say(error.message, true);
    }
  }

  /* ---------- отрисовка ---------- */

  function renderAll() {
    renderToday();
    renderReminders();
    renderList();
    renderArchive();

    if (view.habitId) {
      el.listView.hidden = true;
      el.detailView.hidden = false;
      renderDetail();
    } else {
      el.detailView.hidden = true;
      el.listView.hidden = false;
    }
  }

  function renderToday() {
    var date = D.parseISO(todayISO());
    el.todayLine.textContent =
      "Сегодня, " +
      date.getDate() +
      " " +
      D.MONTHS_GENITIVE[date.getMonth()] +
      " " +
      date.getFullYear() +
      " · " +
      D.WEEKDAY_FULL[D.weekdayIndex(date)];

    var scheduled = service.list().filter(function (habit) {
      return habit.isScheduled(todayISO());
    });
    var done = scheduled.filter(function (habit) {
      return log.isDone(habit.id, todayISO());
    }).length;
    var percent = scheduled.length ? Math.round((done * 100) / scheduled.length) : 0;

    el.todayText.textContent =
      done + " из " + scheduled.length + (scheduled.length ? " · " + percent + "%" : "");
    el.todayFill.style.width = percent + "%";
    el.todayBar.setAttribute("aria-valuenow", percent);
  }

  function renderReminders() {
    var reminders = StorageModule.ReminderConfig.forToday(service, log, todayISO());
    var scheduled = service.list().filter(function (habit) {
      return habit.isScheduled(todayISO());
    });

    if (!reminders.length) {
      if (scheduled.length) {
        el.reminders.hidden = false;
        el.reminders.innerHTML = '<div class="reminders-head">Всё по графику на сегодня выполнено 🎉</div>';
      } else {
        el.reminders.hidden = true;
        el.reminders.innerHTML = "";
      }
      return;
    }

    el.reminders.hidden = false;
    el.reminders.innerHTML =
      '<div class="reminders-head">Осталось сегодня: <b>' +
      reminders.length +
      "</b></div>" +
      '<div class="chips">' +
      reminders
        .map(function (reminder) {
          return (
            '<button class="chip" type="button" data-act="open" data-id="' +
            esc(reminder.habit.id) +
            '"><b>' +
            esc(reminder.at || "—") +
            "</b>" +
            esc(reminder.habit.name) +
            "</button>"
          );
        })
        .join("") +
      "</div>";
  }

  function renderList() {
    var habits = service.list();
    el.emptyState.hidden = habits.length > 0;
    el.grid.innerHTML = habits.map(cardHtml).join("");
  }

  function cardHtml(habit) {
    var summary = statistics.summary(habit, todayISO());
    var entry = log.get(habit.id, todayISO());
    var scheduledToday = habit.isScheduled(todayISO());
    var badge = Stats.HabitStatistics.badge(summary.currentStreak);

    return (
      '<article class="card" data-id="' + esc(habit.id) + '">' +
      '<div class="card-head"><h2><button class="title-btn" type="button" data-act="open" data-id="' +
      esc(habit.id) +
      '">' +
      esc(habit.name) +
      '</button></h2><span class="badge">' +
      badge +
      "</span></div>" +
      '<p class="meta">' +
      esc(habit.scheduleText()) +
      (habit.time ? " · " + esc(habit.time) : "") +
      "</p>" +
      (habit.description ? '<p class="desc">' + esc(habit.description) + "</p>" : "") +
      statsHtml(summary, false) +
      weekHtml(habit) +
      markHtml(habit, entry, scheduledToday) +
      '<div class="card-actions">' +
      '<button class="linkbtn" type="button" data-act="open" data-id="' + esc(habit.id) + '">Календарь</button>' +
      '<button class="linkbtn" type="button" data-act="edit" data-id="' + esc(habit.id) + '">Изменить</button>' +
      '<button class="linkbtn" type="button" data-act="archive" data-id="' + esc(habit.id) + '">В архив</button>' +
      "</div></article>"
    );
  }

  function statsHtml(summary, big) {
    return (
      '<div class="stats' + (big ? " big" : "") + '">' +
      "<div><b>" + summary.currentStreak + "</b><span>текущий стрик</span></div>" +
      "<div><b>" + summary.bestStreak + "</b><span>рекорд</span></div>" +
      "<div><b>" + Math.round(summary.monthRate) + "%</b><span>за месяц</span></div>" +
      "</div>"
    );
  }

  function weekHtml(habit) {
    var today = todayISO();
    var html = "";
    for (var offset = 6; offset >= 0; offset -= 1) {
      var day = D.iso(D.addDays(D.parseISO(today), -offset));
      var cls = dayClass(habit, day, today);
      html +=
        '<span class="dot ' +
        cls +
        '" title="' +
        D.formatShort(day) +
        '">' +
        D.WEEKDAY_SHORT[D.weekdayIndex(D.parseISO(day))] +
        "</span>";
    }
    return '<div class="week" aria-label="Последние 7 дней">' + html + "</div>";
  }

  function markHtml(habit, entry, scheduledToday) {
    if (!scheduledToday) {
      return '<p class="muted small">Сегодня не по графику</p>';
    }
    return (
      '<div class="mark">' +
      '<input name="note" maxlength="200" placeholder="Заметка (необязательно)" value="' +
      esc(entry ? entry.note : "") +
      '">' +
      '<div class="btns">' +
      '<button class="btn ok' +
      (entry && entry.status === DONE ? " on" : "") +
      '" type="button" data-act="mark" data-status="done">✓ Выполнено</button>' +
      '<button class="btn warn' +
      (entry && entry.status === SKIPPED ? " on" : "") +
      '" type="button" data-act="mark" data-status="skipped">✗ Пропущено</button>' +
      (entry
        ? '<button class="btn ghost" type="button" data-act="mark" data-status="undo">Снять</button>'
        : "") +
      "</div></div>"
    );
  }

  function renderArchive() {
    var archived = service.list(true).filter(function (habit) { return habit.archived; });
    el.archivePanel.hidden = archived.length === 0;
    if (!archived.length) return;
    el.archiveTitle.textContent = "Архив (" + archived.length + ")";
    el.archiveList.innerHTML = archived
      .map(function (habit) {
        return (
          '<li data-id="' + esc(habit.id) + '">' +
          '<span class="name">' + esc(habit.name) +
          ' <span class="muted small">· ' + esc(habit.scheduleText()) + "</span></span>" +
          '<button class="linkbtn" type="button" data-act="unarchive" data-id="' + esc(habit.id) + '">Вернуть</button>' +
          '<button class="linkbtn danger" type="button" data-act="delete" data-id="' + esc(habit.id) + '">Удалить</button>' +
          "</li>"
        );
      })
      .join("");
  }

  function renderDetail() {
    var habit;
    try {
      habit = service.get(view.habitId);
    } catch (error) {
      view.habitId = null;
      renderAll();
      return;
    }

    var summary = statistics.summary(habit, todayISO());
    el.detailTitle.textContent = habit.name;
    el.detailMeta.textContent =
      habit.scheduleText() +
      (habit.time ? " · " + habit.time : "") +
      " · с " +
      D.formatShort(habit.created);
    el.detailDesc.textContent = habit.description || "";
    el.detailDesc.hidden = !habit.description;
    el.detailBadge.textContent = Stats.HabitStatistics.badge(summary.currentStreak);
    el.detailStats.innerHTML = statsHtml(summary, true);

    renderCalendar(habit);
    renderDayPanel(habit);
    renderNotes(habit);
  }

  function monthCells(year, month) {
    var first = new Date(year, month, 1, 12);
    var offset = D.weekdayIndex(first);
    var days = new Date(year, month + 1, 0, 12).getDate();
    var cells = [];
    for (var i = 0; i < offset; i += 1) cells.push(null);
    for (var day = 1; day <= days; day += 1) cells.push(new Date(year, month, day, 12));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }

  function dayClass(habit, day, today) {
    var status = log.status(habit.id, day);
    if (status === DONE) return "done";
    if (status === SKIPPED) return "skipped";
    if (!habit.isScheduled(day)) return "off";
    if (day < today) return "missed";
    if (day === today) return "today";
    return "future";
  }

  function renderCalendar(habit) {
    el.calTitle.textContent = D.MONTHS[view.month] + " " + view.year;
    el.calWeekdays.innerHTML = D.WEEKDAY_SHORT.map(function (name) {
      return "<span>" + name + "</span>";
    }).join("");

    var today = todayISO();
    el.calGrid.innerHTML = monthCells(view.year, view.month)
      .map(function (date) {
        if (!date) return '<span class="cal-day empty"></span>';
        var day = D.iso(date);
        var cls = dayClass(habit, day, today);
        if (view.selectedDay === day) cls += " selected";
        return (
          '<button class="cal-day ' + cls + '" type="button" data-act="pick-day" data-day="' +
          day + '" aria-label="' + D.formatShort(day) + '">' + date.getDate() + "</button>"
        );
      })
      .join("");

    var rate = statistics.monthSuccessRate(habit, view.year, view.month, today);
    el.calRate.innerHTML = "Успешность за месяц: <b>" + Math.round(rate) + "%</b>";
  }

  function renderDayPanel(habit) {
    if (!view.selectedDay) {
      el.dayPanel.hidden = true;
      return;
    }

    var day = view.selectedDay;
    var entry = log.get(habit.id, day);
    el.dayPanel.hidden = false;
    el.dayTitle.textContent =
      D.formatLong(day) + " · " + D.WEEKDAY_FULL[D.weekdayIndex(D.parseISO(day))];
    el.dayNote.value = entry ? entry.note : "";

    el.dayPanel.querySelectorAll('[data-act="mark-day"]').forEach(function (button) {
      var status = button.getAttribute("data-status");
      button.classList.toggle("on", !!entry && status === entry.status);
      if (status === "undo") button.hidden = !entry;
    });
  }

  function renderNotes(habit) {
    var notes = log
      .entriesFor(habit.id)
      .filter(function (entry) { return entry.note; })
      .slice(-10)
      .reverse();

    if (!notes.length) {
      el.notesList.innerHTML = '<li class="notes-empty">Заметок пока нет</li>';
      return;
    }

    el.notesList.innerHTML = notes
      .map(function (entry) {
        return (
          '<li><span class="note-date">' +
          D.formatShort(entry.day) +
          " · " +
          (entry.status === DONE ? "выполнено" : "пропущено") +
          '</span><span class="note-text">' +
          esc(entry.note) +
          "</span></li>"
        );
      })
      .join("");
  }

  /* ---------- тема ---------- */

  var THEME_KEY = "habit-tracker.theme";

  function readTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (error) {
      return null;
    }
  }

  function systemPrefersDark() {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function applyTheme(theme) {
    var root = document.documentElement;
    if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");

    var dark = theme === "dark" || (!theme && systemPrefersDark());
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0f1816" : "#0f766e");

    if (el.themeToggle) {
      el.themeToggle.textContent = dark ? "☀" : "◐";
      el.themeToggle.setAttribute("aria-label", dark ? "Включить светлую тему" : "Включить тёмную тему");
      el.themeToggle.setAttribute("title", dark ? "Светлая тема" : "Тёмная тема");
    }
  }

  function toggleTheme() {
    var saved = readTheme();
    var darkNow = saved ? saved === "dark" : systemPrefersDark();
    var next = darkNow ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (error) {
      /* тема просто не запомнится */
    }
    applyTheme(next);
  }

  /* ---------- PWA ---------- */

  function setupInstall() {
    if (!el.installBtn) return;
    var deferred = null;

    window.addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      deferred = event;
      el.installBtn.hidden = false;
    });

    el.installBtn.addEventListener("click", function () {
      if (!deferred) return;
      deferred.prompt();
      var choice = deferred.userChoice;
      if (choice && choice.finally) {
        choice.finally(function () {
          deferred = null;
          el.installBtn.hidden = true;
        });
      }
    });

    window.addEventListener("appinstalled", function () {
      deferred = null;
      el.installBtn.hidden = true;
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {
        /* офлайн-режим недоступен, приложение продолжает работать */
      });
    });
  }
})(window);
