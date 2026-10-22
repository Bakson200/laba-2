/* Модуль 4. Напоминания и Хранение (Notification & Storage Module). */
(function (global) {
  "use strict";

  var D = global.HabitDates;
  var Model = global.HabitModel;
  var Checkins = global.HabitCheckins;

  var KEY = "habit-tracker.v1";
  var VERSION = 1;

  class ReminderConfig {
    constructor(habit, at) {
      this.habit = habit;
      this.at = at || null;
    }

    text() {
      var when = this.at ? this.at : "в любое время";
      return "[" + when + "] " + this.habit.name;
    }

    static forToday(service, log, todayISO) {
      var today = todayISO || D.todayISO();
      return service
        .list()
        .filter(function (habit) {
          return habit.isScheduled(today) && log.status(habit.id, today) === null;
        })
        .map(function (habit) {
          return new ReminderConfig(habit, habit.time);
        })
        .sort(function (a, b) {
          if (!!a.at !== !!b.at) return a.at ? -1 : 1;
          if (a.at && b.at && a.at !== b.at) return a.at < b.at ? -1 : 1;
          return a.habit.name.localeCompare(b.habit.name, "ru");
        });
    }
  }

  function seedState() {
    var today = D.todayISO();
    var service = new Model.HabitService();
    var log = new Checkins.HabitLog();
    var allDays = Model.ALL_DAYS.slice();

    function dayFromOffset(offset) {
      return D.iso(D.addDays(D.parseISO(today), -offset));
    }

    function fill(habit, daysAgo, skipOffsets, leaveToday) {
      for (var offset = daysAgo; offset >= 0; offset -= 1) {
        var day = dayFromOffset(offset);
        if (!habit.isScheduled(day)) continue;
        if (leaveToday && offset === 0) continue;
        if (skipOffsets.indexOf(offset) >= 0) log.markSkipped(habit.id, day);
        else log.markDone(habit.id, day);
      }
    }

    var exercise = service.create(
      {
        name: "Зарядка",
        description: "15 минут: разминка, приседания и растяжка",
        weekdays: allDays,
        time: "07:30"
      },
      dayFromOffset(25)
    );
    fill(exercise, 25, [7, 15], false);
    log.markDone(exercise.id, dayFromOffset(3), "Сделал до завтрака — легче, чем кажется");

    var reading = service.create(
      {
        name: "Чтение",
        description: "20 минут перед сном",
        weekdays: [0, 2, 4],
        time: "21:00"
      },
      dayFromOffset(40)
    );
    fill(reading, 40, [9], true);
    var doneEntries = log.entriesFor(reading.id).filter(function (entry) {
      return entry.status === Checkins.DONE;
    });
    if (doneEntries.length > 2) {
      var noteEntry = doneEntries[doneEntries.length - 3];
      log.markDone(reading.id, noteEntry.day, "Дочитал главу про привычки");
    }

    var water = service.create(
      {
        name: "Вода",
        description: "8 стаканов в течение дня",
        weekdays: allDays,
        time: null
      },
      dayFromOffset(14)
    );
    fill(water, 14, [], true);

    return { service: service, log: log };
  }

  class HabitStorage {
    constructor(key) {
      this.key = key || KEY;
      this.available = (function () {
        try {
          var probe = "__habit_probe__";
          global.localStorage.setItem(probe, "1");
          global.localStorage.removeItem(probe);
          return true;
        } catch (error) {
          return false;
        }
      })();
    }

    load() {
      if (!this.available) return seedState();

      var raw = null;
      try {
        raw = global.localStorage.getItem(this.key);
      } catch (error) {
        return seedState();
      }

      if (!raw) {
        var initial = seedState();
        this.save(initial.service, initial.log);
        return initial;
      }

      try {
        var data = JSON.parse(raw);
        var habits = (data.habits || []).map(function (item) {
          return Model.Habit.fromJSON(item);
        });
        var log = new Checkins.HabitLog(data.entries || {});
        return { service: new Model.HabitService(habits), log: log };
      } catch (error) {
        try {
          global.localStorage.setItem(this.key + ".broken", raw);
        } catch (ignored) {
          /* место в хранилище могло закончиться */
        }
        var fallback = seedState();
        this.save(fallback.service, fallback.log);
        return fallback;
      }
    }

    save(service, log) {
      if (!this.available) return false;
      try {
        global.localStorage.setItem(
          this.key,
          JSON.stringify({
            version: VERSION,
            habits: service.all().map(function (habit) { return habit.toJSON(); }),
            entries: log.toJSON()
          })
        );
        return true;
      } catch (error) {
        return false;
      }
    }

    reset() {
      var state = seedState();
      this.save(state.service, state.log);
      return state;
    }
  }

  global.HabitStorageModule = {
    KEY: KEY,
    ReminderConfig: ReminderConfig,
    HabitStorage: HabitStorage,
    seedState: seedState
  };
})(window);
