/* Модуль 3. Метрики и Стрики (Streak & Gamification Module).
   Правила как в Python-версии: считаются только дни по графику; сегодняшний
   неотмеченный день серию не обрывает; пропуск или неотметка в прошлом — обрыв. */
(function (global) {
  "use strict";

  var D = global.HabitDates;

  class StreakCalculator {
    constructor(log) {
      this.log = log;
    }

    currentStreak(habit, todayISO) {
      var today = todayISO || D.todayISO();
      var streak = 0;
      var day = today;
      while (day >= habit.created) {
        if (habit.isScheduled(day)) {
          if (this.log.isDone(habit.id, day)) {
            streak += 1;
          } else if (day === today && this.log.status(habit.id, day) === null) {
            /* сегодня ещё можно успеть — серию не обрываем */
          } else {
            break;
          }
        }
        day = D.iso(D.addDays(D.parseISO(day), -1));
      }
      return streak;
    }

    bestStreak(habit, todayISO) {
      var today = todayISO || D.todayISO();
      var best = 0;
      var run = 0;
      var day = habit.created;
      while (day <= today) {
        if (habit.isScheduled(day)) {
          if (this.log.isDone(habit.id, day)) {
            run += 1;
            if (run > best) best = run;
          } else if (day === today && this.log.status(habit.id, day) === null) {
            /* сегодня ещё можно успеть */
          } else {
            run = 0;
          }
        }
        day = D.iso(D.addDays(D.parseISO(day), 1));
      }
      return best;
    }
  }

  class HabitStatistics {
    constructor(log) {
      this.log = log;
      this.streaks = new StreakCalculator(log);
    }

    monthSuccessRate(habit, year, month, todayISO) {
      var today = todayISO || D.todayISO();
      var first = new Date(year, month, 1, 12);
      var last = new Date(year, month + 1, 0, 12);
      var created = D.parseISO(habit.created);
      var todayDate = D.parseISO(today);

      var start = first < created ? created : first;
      var end = last > todayDate ? todayDate : last;
      if (start > end) return 0;

      var planned = 0;
      var done = 0;
      var cursor = start;
      while (cursor <= end) {
        var day = D.iso(cursor);
        if (habit.isScheduled(day)) {
          if (this.log.isDone(habit.id, day)) {
            planned += 1;
            done += 1;
          } else if (!(day === today && this.log.status(habit.id, day) === null)) {
            planned += 1;
          }
        }
        cursor = D.addDays(cursor, 1);
      }
      return planned ? Math.round((1000 * done) / planned) / 10 : 0;
    }

    summary(habit, todayISO) {
      var today = todayISO || D.todayISO();
      var totalDone = this.log.entriesFor(habit.id).filter(function (entry) {
        return entry.status === "done";
      }).length;
      return {
        currentStreak: this.streaks.currentStreak(habit, today),
        bestStreak: this.streaks.bestStreak(habit, today),
        monthRate: this.monthSuccessRate(habit, D.parseISO(today).getFullYear(), D.parseISO(today).getMonth(), today),
        totalDone: totalDone
      };
    }

    static badge(streak) {
      if (streak >= 100) return "🏆";
      if (streak >= 30) return "💎";
      if (streak >= 7) return "🔥";
      if (streak >= 3) return "⭐";
      return "";
    }
  }

  global.HabitStats = {
    StreakCalculator: StreakCalculator,
    HabitStatistics: HabitStatistics
  };
})(window);
