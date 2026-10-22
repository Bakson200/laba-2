/* Отрисовка доски, формы и перетаскивание карточек. */
(function (global) {
  "use strict";

  var COLS = [
    { id: "backlog", name: "Бэклог" },
    { id: "doing", name: "В работе" },
    { id: "review", name: "На проверке" },
    { id: "done", name: "Готово" }
  ];

  var TAGS = {
    m1: "Модуль 1 · Менеджер",
    m2: "Модуль 2 · Журнал",
    m3: "Модуль 3 · Стрики",
    m4: "Модуль 4 · Хранение",
    ui: "Интерфейс",
    qa: "Тесты",
    docs: "Защита проекта"
  };

  var DEFAULT_TAG = "m1";

  function init() {
    var store = global.KanbanStore;
    var boardEl = document.getElementById("board");
    var statusEl = document.getElementById("status");
    var legendEl = document.getElementById("legend");
    var progressText = document.getElementById("progress-text");
    var progressFill = document.getElementById("progress-fill");
    var progressBar = document.getElementById("progress-bar");

    if (!boardEl || !store) return;

    var cards = store.load();
    var ui = { adding: null, editing: null, confirmDel: null, draft: {}, dragId: null };

    function esc(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
      });
    }

    function say(message, isError) {
      if (!statusEl) return;
      statusEl.hidden = !message;
      statusEl.textContent = message || "";
      statusEl.className = "notice" + (isError ? " err" : "");
    }

    function colId(card) {
      for (var i = 0; i < COLS.length; i++) {
        if (COLS[i].id === card.col) return card.col;
      }
      return COLS[0].id;
    }

    function tagId(card) {
      return TAGS[card.tag] ? card.tag : DEFAULT_TAG;
    }

    function inCol(id) {
      return cards
        .filter(function (card) { return colId(card) === id; })
        .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    }

    function findCard(id) {
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].id === id) return cards[i];
      }
      return null;
    }

    function persist() {
      if (!store.save(cards)) {
        say("Не удалось сохранить изменения: браузер запретил доступ к localStorage.", true);
      } else {
        say("");
      }
    }

    function focusTitle() {
      var input = document.getElementById("f-title");
      if (input) input.focus();
    }

    /* ---------- разметка ---------- */

    function tagOptions(selected) {
      return Object.keys(TAGS)
        .map(function (key) {
          return '<option value="' + esc(key) + '"' + (key === selected ? " selected" : "") + ">" + esc(TAGS[key]) + "</option>";
        })
        .join("");
    }

    function formHtml(mode, col, id) {
      var draft = ui.draft || {};
      return (
        '<form class="form" data-form="' + mode + '" data-col="' + esc(col) + '" data-id="' + esc(id || "") + '">' +
        '<input id="f-title" name="title" maxlength="120" placeholder="Название задачи" value="' + esc(draft.title) + '" required>' +
        '<select id="f-tag" name="tag" aria-label="Модуль">' + tagOptions(draft.tag) + "</select>" +
        '<textarea id="f-note" name="note" maxlength="300" placeholder="Описание (необязательно)">' + esc(draft.note) + "</textarea>" +
        '<div class="row">' +
        '<button class="btn primary" type="submit">' + (mode === "edit" ? "Сохранить" : "Добавить") + "</button>" +
        '<button class="btn" type="button" data-act="cancel">Отмена</button>' +
        '<span class="spacer"></span>' +
        (mode === "edit"
          ? ui.confirmDel === id
            ? '<button class="btn danger" type="button" data-act="delete" data-id="' + esc(id) + '">Точно удалить?</button>'
            : '<button class="linkbtn" type="button" data-act="ask-delete" data-id="' + esc(id) + '">Удалить</button>'
          : "") +
        "</div></form>"
      );
    }

    function cardHtml(card) {
      if (ui.editing === card.id) return formHtml("edit", colId(card), card.id);
      var index = COLS.findIndex(function (item) { return item.id === colId(card); });
      var tag = tagId(card);
      return (
        '<article class="card" draggable="true" data-id="' + esc(card.id) + '">' +
        "<h3>" + esc(card.title) + "</h3>" +
        (card.note ? "<p>" + esc(card.note) + "</p>" : "") +
        '<div class="card-foot">' +
        '<span class="tag tag-' + esc(tag) + '">' + esc(TAGS[tag]) + "</span>" +
        '<div class="acts">' +
        '<button class="ib" type="button" data-act="left" data-id="' + esc(card.id) + '" aria-label="Переместить в колонку левее"' + (index <= 0 ? " disabled" : "") + ">←</button>" +
        '<button class="ib" type="button" data-act="right" data-id="' + esc(card.id) + '" aria-label="Переместить в колонку правее"' + (index >= COLS.length - 1 ? " disabled" : "") + ">→</button>" +
        '<button class="ib" type="button" data-act="edit" data-id="' + esc(card.id) + '" aria-label="Изменить задачу">✎</button>' +
        "</div>" +
        "</div></article>"
      );
    }

    function render() {
      var active = document.activeElement;
      var activeId = active && active.id;
      var selectionStart = active && active.selectionStart != null ? active.selectionStart : null;

      var total = cards.length;
      var done = inCol("done").length;
      var percent = total ? Math.round((done * 100) / total) : 0;

      if (progressText) progressText.textContent = done + " из " + total + " · " + percent + "%";
      if (progressFill) progressFill.style.width = percent + "%";
      if (progressBar) progressBar.setAttribute("aria-valuenow", percent);

      boardEl.innerHTML = COLS.map(function (col) {
        var list = inCol(col.id);
        var body = list.map(cardHtml).join("");
        if (!list.length && ui.adding !== col.id) {
          body = '<div class="empty">Здесь пока пусто</div>';
        }
        var adder =
          ui.adding === col.id
            ? formHtml("add", col.id, "")
            : '<button class="btn add" type="button" data-act="add" data-col="' + esc(col.id) + '">+ Добавить задачу</button>';

        return (
          '<section class="col" data-col="' + esc(col.id) + '" aria-label="' + esc(col.name) + '">' +
          '<div class="col-head"><h2>' + esc(col.name) + '</h2><span class="count">' + list.length + "</span></div>" +
          '<div class="stack">' + body + "</div>" + adder + "</section>"
        );
      }).join("");

      if (activeId) {
        var element = document.getElementById(activeId);
        if (element) {
          element.focus();
          if (selectionStart != null && element.setSelectionRange) {
            try {
              element.setSelectionRange(selectionStart, selectionStart);
            } catch (e) {
              /* у select нет setSelectionRange — ничего страшного */
            }
          }
        }
      }
    }

    /* ---------- изменения ---------- */

    function orderFor(col, beforeId, ignoreId) {
      var list = inCol(col).filter(function (card) { return card.id !== ignoreId; });
      if (beforeId) {
        var index = list.findIndex(function (card) { return card.id === beforeId; });
        if (index >= 0) {
          var next = list[index];
          var prev = list[index - 1];
          return prev ? ((prev.order || 0) + (next.order || 0)) / 2 : (next.order || 0) - 1;
        }
      }
      if (!list.length) return 1;
      return (list[list.length - 1].order || 0) + 1;
    }

    function moveCard(id, targetCol, beforeId) {
      var card = findCard(id);
      if (!card || id === beforeId) return;
      var order = orderFor(targetCol, beforeId, id);
      if (colId(card) === targetCol && order === card.order) return;
      card.col = targetCol;
      card.order = order;
      render();
      persist();
    }

    /* ---------- события ---------- */

    boardEl.addEventListener("click", function (event) {
      var button = event.target.closest("[data-act]");
      if (!button) return;
      var action = button.getAttribute("data-act");
      var id = button.getAttribute("data-id");

      if (action === "add") {
        ui.adding = button.getAttribute("data-col");
        ui.editing = null;
        ui.confirmDel = null;
        ui.draft = { title: "", tag: DEFAULT_TAG, note: "" };
        render();
        focusTitle();
      } else if (action === "edit") {
        var card = findCard(id);
        if (!card) return;
        ui.editing = id;
        ui.adding = null;
        ui.confirmDel = null;
        ui.draft = { title: card.title, tag: tagId(card), note: card.note || "" };
        render();
        focusTitle();
      } else if (action === "cancel") {
        ui.adding = null;
        ui.editing = null;
        ui.confirmDel = null;
        render();
      } else if (action === "ask-delete") {
        ui.confirmDel = id;
        render();
      } else if (action === "delete") {
        ui.adding = null;
        ui.editing = null;
        ui.confirmDel = null;
        cards = cards.filter(function (item) { return item.id !== id; });
        render();
        persist();
      } else if (action === "left" || action === "right") {
        var current = findCard(id);
        if (!current) return;
        var index = COLS.findIndex(function (item) { return item.id === colId(current); });
        var target = COLS[index + (action === "left" ? -1 : 1)];
        if (target) moveCard(id, target.id, null);
      }
    });

    boardEl.addEventListener("input", function (event) {
      var name = event.target.name;
      if (name === "title" || name === "tag" || name === "note") {
        ui.draft[name] = event.target.value;
      }
    });

    boardEl.addEventListener("submit", function (event) {
      event.preventDefault();
      var form = event.target;
      var mode = form.getAttribute("data-form");
      var col = form.getAttribute("data-col");
      var id = form.getAttribute("data-id");
      var title = (ui.draft.title || "").trim();
      if (!title) return;

      var data = {
        title: title,
        tag: TAGS[ui.draft.tag] ? ui.draft.tag : DEFAULT_TAG,
        note: (ui.draft.note || "").trim()
      };

      if (mode === "edit") {
        var card = findCard(id);
        if (card) {
          card.title = data.title;
          card.tag = data.tag;
          card.note = data.note;
        }
        ui.editing = null;
        ui.confirmDel = null;
        render();
        persist();
      } else {
        cards.push({
          id: store.newId(),
          title: data.title,
          tag: data.tag,
          note: data.note,
          col: col,
          order: orderFor(col, null, null),
          created: Date.now()
        });
        ui.adding = null;
        render();
        persist();
      }
    });

    /* перетаскивание мышью; на телефоне работают стрелки */
    boardEl.addEventListener("dragstart", function (event) {
      var card = event.target.closest && event.target.closest(".card");
      if (!card) return;
      ui.dragId = card.getAttribute("data-id");
      card.classList.add("dragging");
      try {
        event.dataTransfer.setData("text/plain", ui.dragId);
        event.dataTransfer.effectAllowed = "move";
      } catch (e) {
        /* некоторые браузеры запрещают dataTransfer */
      }
    });

    boardEl.addEventListener("dragend", function () {
      ui.dragId = null;
      boardEl.querySelectorAll(".dragging,.over").forEach(function (node) {
        node.classList.remove("dragging", "over");
      });
    });

    boardEl.addEventListener("dragover", function (event) {
      var col = event.target.closest && event.target.closest(".col");
      if (!col || !ui.dragId) return;
      event.preventDefault();
      boardEl.querySelectorAll(".over").forEach(function (node) {
        if (node !== col) node.classList.remove("over");
      });
      col.classList.add("over");
    });

    boardEl.addEventListener("drop", function (event) {
      var col = event.target.closest && event.target.closest(".col");
      if (!col || !ui.dragId) return;
      event.preventDefault();
      var targetCol = col.getAttribute("data-col");
      var beforeId = null;
      var over = event.target.closest(".card");

      if (over && over.getAttribute("data-id") !== ui.dragId) {
        var rect = over.getBoundingClientRect();
        if (event.clientY < rect.top + rect.height / 2) {
          beforeId = over.getAttribute("data-id");
        } else {
          var list = inCol(targetCol).filter(function (item) { return item.id !== ui.dragId; });
          var index = list.findIndex(function (item) { return item.id === over.getAttribute("data-id"); });
          beforeId = list[index + 1] ? list[index + 1].id : null;
        }
      }

      var id = ui.dragId;
      boardEl.querySelectorAll(".dragging,.over").forEach(function (node) {
        node.classList.remove("dragging", "over");
      });
      ui.dragId = null;
      moveCard(id, targetCol, beforeId);
    });

    /* ---------- запуск ---------- */

    if (legendEl) {
      legendEl.innerHTML = Object.keys(TAGS)
        .map(function (key) {
          return '<span class="tag tag-' + esc(key) + '">' + esc(TAGS[key]) + "</span>";
        })
        .join("");
    }

    render();

    if (!store.available) {
      say("Браузер запретил localStorage: изменения не сохранятся после перезагрузки.", true);
    }
  }

  global.KanbanBoard = { init: init };
})(window);
