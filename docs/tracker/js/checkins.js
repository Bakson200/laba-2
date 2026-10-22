/* Модуль 2. Журнал отметок и Календарь (Check-in Module). */
(function (global) {
  "use strict";

  var DONE = "done";
  var SKIPPED = "skipped";
  var STATUSES = [DONE, SKIPPED];
  var MAX_NOTE = 200;

  class CheckInEntry {
    constructor(habitId, day, status, note) {
      if (STATUSES.indexOf(status) < 0) {
        throw new Error("Статус должен быть done или skipped");
      }
      this.habitId = habitId;
      this.day = day;
      this.status = status;
      this.note = String(note == null ? "" : note).trim().slice(0, MAX_NOTE);
    }

    get isDone() {
      return this.status === DONE;
    }

    toJSON() {
      return { s: this.status, n: this.note };
    }
  }

  class HabitLog {
    constructor(entries) {
      this.entries = entries || {};
    }

    static key(habitId, day) {
      return habitId + "|" + day;
    }

    mark(habitId, day, status, note) {
      var entry = new CheckInEntry(habitId, day, status, note);
      this.entries[HabitLog.key(habitId, day)] = entry.toJSON();
      return entry;
    }

    markDone(habitId, day, note) {
      return this.mark(habitId, day, DONE, note);
    }

    markSkipped(habitId, day, note) {
      return this.mark(habitId, day, SKIPPED, note);
    }

    unmark(habitId, day) {
      delete this.entries[HabitLog.key(habitId, day)];
    }

    get(habitId, day) {
      var raw = this.entries[HabitLog.key(habitId, day)];
      if (!raw) return null;
      return new CheckInEntry(habitId, day, raw.s, raw.n || "");
    }

    status(habitId, day) {
      var entry = this.get(habitId, day);
      return entry ? entry.status : null;
    }

    isDone(habitId, day) {
      return this.status(habitId, day) === DONE;
    }

    entriesFor(habitId) {
      var prefix = habitId + "|";
      var result = [];
      Object.keys(this.entries).forEach(function (key) {
        if (key.indexOf(prefix) !== 0) return;
        var day = key.slice(prefix.length);
        var raw = this.entries[key];
        if (!raw) return;
        result.push(new CheckInEntry(habitId, day, raw.s, raw.n || ""));
      }, this);
      return result.sort(function (a, b) { return a.day < b.day ? -1 : a.day > b.day ? 1 : 0; });
    }

    deleteHabit(habitId) {
      var prefix = habitId + "|";
      Object.keys(this.entries).forEach(function (key) {
        if (key.indexOf(prefix) === 0) delete this.entries[key];
      }, this);
    }

    all() {
      return Object.keys(this.entries).map(function (key) {
        var parts = key.split("|");
        var raw = this.entries[key];
        return new CheckInEntry(parts[0], parts[1], raw.s, raw.n || "");
      }, this).sort(function (a, b) {
        if (a.day !== b.day) return a.day < b.day ? -1 : 1;
        return a.habitId < b.habitId ? -1 : 1;
      });
    }

    toJSON() {
      return this.entries;
    }
  }

  global.HabitCheckins = {
    DONE: DONE,
    SKIPPED: SKIPPED,
    STATUSES: STATUSES,
    CheckInEntry: CheckInEntry,
    HabitLog: HabitLog
  };
})(window);
