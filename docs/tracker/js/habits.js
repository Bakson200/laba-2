/* Модуль 1. Менеджер привычек (Habit Manager Module). */
(function (global) {
  "use strict";

  var D = global.HabitDates;
  var WEEKDAY_NAMES = D.WEEKDAY_SHORT;
  var ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

  function normalizeWeekdays(value) {
    var list = (value || [])
      .map(Number)
      .filter(function (day) { return day >= 0 && day <= 6; });
    list = Array.from(new Set(list)).sort(function (a, b) { return a - b; });
    return list.length ? list : ALL_DAYS.slice();
  }

  class Habit {
    constructor(data) {
      data = data || {};
      this.id = String(data.id || D.newId());
      this.name = String(data.name == null ? "" : data.name).trim();
      if (!this.name) throw new Error("Название привычки не может быть пустым");
      this.description = String(data.description == null ? "" : data.description).trim().slice(0, 200);
      this.weekdays = normalizeWeekdays(data.weekdays);
      this.time = data.time ? String(data.time).slice(0, 5) : null;
      this.created = data.created || D.todayISO();
      this.archived = !!data.archived;
    }

    get isDaily() {
      return this.weekdays.length === 7;
    }

    isScheduled(dayISO) {
      if (dayISO < this.created) return false;
      return this.weekdays.indexOf(D.weekdayIndex(D.parseISO(dayISO))) >= 0;
    }

    scheduleText() {
      if (this.isDaily) return "ежедневно";
      return this.weekdays.map(function (day) { return WEEKDAY_NAMES[day]; }).join(", ");
    }

    toJSON() {
      return {
        id: this.id,
        name: this.name,
        description: this.description,
        weekdays: this.weekdays.slice(),
        time: this.time,
        created: this.created,
        archived: this.archived
      };
    }

    static fromJSON(object) {
      return new Habit(object);
    }
  }

  class HabitService {
    constructor(habits) {
      this.habits = habits || [];
    }

    create(data, createdISO) {
      var habit = new Habit(
        Object.assign({}, data, { created: createdISO || D.todayISO() })
      );
      this.habits.push(habit);
      return habit;
    }

    get(id) {
      var found = this.habits.filter(function (habit) { return habit.id === id; })[0];
      if (!found) throw new Error("Привычка не найдена");
      return found;
    }

    list(includeArchived) {
      return this.habits
        .filter(function (habit) { return includeArchived || !habit.archived; })
        .slice()
        .sort(function (a, b) {
          if (!!a.time !== !!b.time) return a.time ? -1 : 1;
          if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
          return a.name.localeCompare(b.name, "ru");
        });
    }

    update(id, patch) {
      var current = this.get(id);
      var updated = new Habit(Object.assign(current.toJSON(), patch));
      Object.assign(current, updated);
      return current;
    }

    archive(id) {
      this.get(id).archived = true;
    }

    unarchive(id) {
      this.get(id).archived = false;
    }

    remove(id) {
      this.get(id);
      this.habits = this.habits.filter(function (habit) { return habit.id !== id; });
    }

    all() {
      return this.habits.slice();
    }
  }

  global.HabitModel = {
    ALL_DAYS: ALL_DAYS,
    WEEKDAY_NAMES: WEEKDAY_NAMES,
    Habit: Habit,
    HabitService: HabitService
  };
})(window);
