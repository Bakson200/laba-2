/* Общие помощники для дат и идентификаторов. */
(function (global) {
  "use strict";

  var WEEKDAY_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
  var WEEKDAY_FULL = [
    "понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"
  ];
  var MONTHS = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
  ];
  var MONTHS_GENITIVE = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря"
  ];

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function iso(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function parseISO(value) {
    var parts = String(value).split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12);
  }

  function addDays(date, amount) {
    var copy = new Date(date.getTime());
    copy.setDate(copy.getDate() + amount);
    return copy;
  }

  function weekdayIndex(date) {
    return (date.getDay() + 6) % 7;
  }

  function todayISO() {
    return iso(new Date());
  }

  function formatLong(value) {
    var date = parseISO(value);
    return date.getDate() + " " + MONTHS_GENITIVE[date.getMonth()] + " " + date.getFullYear();
  }

  function formatShort(value) {
    var date = parseISO(value);
    return pad(date.getDate()) + "." + pad(date.getMonth() + 1) + "." + date.getFullYear();
  }

  function newId() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID().slice(0, 8);
    }
    return "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  global.HabitDates = {
    WEEKDAY_SHORT: WEEKDAY_SHORT,
    WEEKDAY_FULL: WEEKDAY_FULL,
    MONTHS: MONTHS,
    MONTHS_GENITIVE: MONTHS_GENITIVE,
    pad: pad,
    iso: iso,
    parseISO: parseISO,
    addDays: addDays,
    weekdayIndex: weekdayIndex,
    todayISO: todayISO,
    formatLong: formatLong,
    formatShort: formatShort,
    newId: newId
  };
})(window);
