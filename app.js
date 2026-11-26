/**
 * Money Mind Audit — Debt Snowball Calculator
 * All math runs in the browser. Nothing is sent anywhere.
 * Inputs are kept in this browser's localStorage only.
 *
 * Method (each month, in whole cents):
 *   1. Interest first: every open debt grows by round(balance × APR / 12).
 *   2. The monthly budget is fixed: the sum of every starting minimum + the extra.
 *      Each open debt gets its minimum (or less, if it needs less to hit $0).
 *   3. Everything left goes to the open debt with the smallest STARTING balance.
 *      If that clears it mid-month, the remainder spills into the next debt
 *      in the same month. Once a debt is paid off, its old minimum stays in
 *      the budget, so it rolls into the next one ("the snowball").
 *   4. A debt's payoff month is the month its balance reaches $0.
 * Minimums-only comparison: each debt pays only its own minimum, no extra,
 * no rollover. Simulations stop at 600 months (50 years).
 */
(function (root) {
  "use strict";

  var MAX_MONTHS = 600;
  var STORAGE_KEY = "mma-debt-snowball-v1";

  var EXAMPLE = {
    extra: 100,
    debts: [
      { name: "Credit card", balance: 4200, minimum: 126, apr: 24.99 },
      { name: "Medical bill", balance: 850, minimum: 50, apr: 0 },
      { name: "Car loan", balance: 9800, minimum: 310, apr: 6.9 },
    ],
  };

  function parseNumber(value) {
    if (value == null) return NaN;
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    var cleaned = String(value).trim().replace(/[$,%\s]/g, "");
    if (cleaned === "") return NaN;
    var n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }

  function toCents(n) {
    return Math.round((Number(n) || 0) * 100);
  }

  function monthlyInterestCents(balanceCents, apr) {
    if (!(apr > 0) || balanceCents <= 0) return 0;
    return Math.round((balanceCents * apr) / 100 / 12);
  }

  /** Normalize raw debts; drop rows with no positive balance. */
  function cleanDebts(debts) {
    var out = [];
    (debts || []).forEach(function (d, i) {
      var balance = parseNumber(d.balance);
      if (!(balance > 0)) return;
      var minimum = parseNumber(d.minimum);
      var apr = parseNumber(d.apr);
      out.push({
        index: i,
        name: (d.name && String(d.name).trim()) || "Debt " + (i + 1),
        balanceCents: toCents(balance),
        minimumCents: Math.max(0, toCents(minimum) || 0),
        apr: Math.max(0, Number.isFinite(apr) ? apr : 0),
      });
    });
    return out;
  }

  /** Snowball order: smallest starting balance first; ties keep the order entered. */
  function snowballOrder(debts) {
    return debts.slice().sort(function (a, b) {
      return a.balanceCents - b.balanceCents || a.index - b.index;
    });
  }

  /**
   * Core simulation.
   * mode "snowball": fixed budget = sum(minimums) + extra, surplus to smallest balance.
   * mode "minimums": each debt pays only its own minimum.
   */
  function simulate(debts, extraCents, mode) {
    var order = snowballOrder(debts);
    var state = order.map(function (d) {
      return {
        name: d.name,
        index: d.index,
        apr: d.apr,
        minimumCents: d.minimumCents,
        startCents: d.balanceCents,
        balance: d.balanceCents,
        interestCents: 0,
        paidCents: 0,
        payoffMonth: null,
      };
    });
    var budget = 0;
    state.forEach(function (s) { budget += s.minimumCents; });
    if (mode === "snowball") budget += Math.max(0, extraCents || 0);

    var totalInterest = 0;
    var month = 0;
    var open = state.length;

    while (open > 0 && month < MAX_MONTHS) {
      month += 1;

      // 1. Interest first.
      state.forEach(function (s) {
        if (s.balance <= 0) return;
        var i = monthlyInterestCents(s.balance, s.apr);
        s.balance += i;
        s.interestCents += i;
        totalInterest += i;
      });

      // 2. Minimums (capped at what each debt needs).
      var pool = budget;
      state.forEach(function (s) {
        if (s.balance <= 0) return;
        var pay = Math.min(s.minimumCents, s.balance);
        s.balance -= pay;
        s.paidCents += pay;
        if (mode === "snowball") pool -= pay;
      });

      // 3. Snowball surplus, smallest starting balance first, spilling over.
      if (mode === "snowball") {
        for (var k = 0; k < state.length && pool > 0; k++) {
          var s = state[k];
          if (s.balance <= 0) continue;
          var extra = Math.min(pool, s.balance);
          s.balance -= extra;
          s.paidCents += extra;
          pool -= extra;
        }
      }

      // 4. Record payoffs.
      state.forEach(function (s) {
        if (s.balance <= 0 && s.payoffMonth === null) {
          s.balance = 0;
          s.payoffMonth = month;
          open -= 1;
        }
      });
    }

    return {
      mode: mode,
      debts: state,
      finished: open === 0,
      months: open === 0 ? month : null,
      monthsSimulated: month,
      totalInterestCents: totalInterest,
      budgetCents: budget,
    };
  }

  function addMonths(start, n) {
    return new Date(start.getFullYear(), start.getMonth() + n, 1);
  }

  function formatMonthYear(date) {
    return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
  }

  function formatMonthYearLong(date) {
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
  }

  /** Month 1 = the calendar month after `today`. */
  function monthLabel(today, n) {
    return formatMonthYear(addMonths(today, n));
  }

  function calculate(input, today) {
    today = today || new Date();
    var debts = cleanDebts(input.debts);
    var extraRaw = parseNumber(input.extra);
    var extraCents = Math.max(0, Number.isFinite(extraRaw) ? toCents(extraRaw) : 0);

    var warnings = [];
    debts.forEach(function (d) {
      var firstInterest = monthlyInterestCents(d.balanceCents, d.apr);
      if (d.apr > 0 && d.minimumCents <= firstInterest) {
        warnings.push({
          name: d.name,
          kind: "interest",
          interestCents: firstInterest,
          minimumCents: d.minimumCents,
        });
      } else if (d.minimumCents === 0) {
        warnings.push({ name: d.name, kind: "zero-minimum", interestCents: 0, minimumCents: 0 });
      }
    });

    var snow = simulate(debts, extraCents, "snowball");
    var mins = simulate(debts, 0, "minimums");

    var debtFreeDate = snow.finished ? addMonths(today, snow.months) : null;

    var comparison = {
      minimumsFinished: mins.finished,
      minimumsMonths: mins.months,
      minimumsInterestCents: mins.totalInterestCents,
      interestSavedCents: mins.finished ? mins.totalInterestCents - snow.totalInterestCents : null,
      monthsSaved: mins.finished && snow.finished ? mins.months - snow.months : null,
    };

    return {
      today: today,
      debtCount: debts.length,
      extraCents: extraCents,
      snowball: snow,
      minimums: mins,
      debtFreeDate: debtFreeDate,
      comparison: comparison,
      warnings: warnings,
      maxMonths: MAX_MONTHS,
    };
  }

  function formatMoneyCents(cents, wholeDollars) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: wholeDollars ? 0 : 2,
      maximumFractionDigits: wholeDollars ? 0 : 2,
    }).format((Number(cents) || 0) / 100);
  }

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many || one + "s");
  }

  function yearsMonths(n) {
    var y = Math.floor(n / 12);
    var m = n % 12;
    if (y === 0) return plural(m, "month");
    if (m === 0) return plural(y, "year");
    return plural(y, "year") + ", " + plural(m, "month");
  }

  var api = {
    MAX_MONTHS: MAX_MONTHS,
    EXAMPLE: EXAMPLE,
    parseNumber: parseNumber,
    cleanDebts: cleanDebts,
    simulate: simulate,
    calculate: calculate,
    monthLabel: monthLabel,
    formatMoneyCents: formatMoneyCents,
    yearsMonths: yearsMonths,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MoneyMindSnowball = api;

  if (typeof document === "undefined") return;

  // ---------------- DOM ----------------

  var rowsEl = document.getElementById("debt-rows");
  var addBtn = document.getElementById("add-debt");
  var resetBtn = document.getElementById("reset-example");
  var extraEl = document.getElementById("extra");
  var form = document.getElementById("calc-form");
  var rowTpl = document.getElementById("debt-row-template");
  var rowCounter = 0;

  function moneyInputValue(n) {
    if (n === "" || n == null || !Number.isFinite(Number(n))) return "";
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(n));
  }

  function addRow(d, focus) {
    rowCounter += 1;
    var id = "d" + rowCounter;
    var frag = rowTpl.content.cloneNode(true);
    var row = frag.querySelector(".debt-row");
    row.dataset.id = id;
    var titleEl = row.querySelector(".debt-row-title");
    titleEl.id = id + "-title";
    row.setAttribute("aria-labelledby", titleEl.id);
    ["name", "balance", "minimum", "apr"].forEach(function (f) {
      var input = row.querySelector('[data-field="' + f + '"]');
      var label = row.querySelector('[data-label="' + f + '"]');
      input.id = id + "-" + f;
      label.setAttribute("for", input.id);
      if (d) {
        var v = d[f];
        input.value = f === "name" ? v || "" : f === "apr" ? (v === "" || v == null ? "" : String(v)) : moneyInputValue(v);
      }
    });
    rowsEl.appendChild(frag);
    renumber();
    if (focus) row.querySelector('[data-field="name"]').focus();
    return row;
  }

  function renumber() {
    var rows = rowsEl.querySelectorAll(".debt-row");
    rows.forEach(function (row, i) {
      var title = row.querySelector(".debt-row-title");
      var nameVal = row.querySelector('[data-field="name"]').value.trim();
      title.textContent = "Debt " + (i + 1);
      var rm = row.querySelector(".btn-remove");
      rm.setAttribute("aria-label", "Remove " + (nameVal || "debt " + (i + 1)));
      rm.disabled = rows.length === 1;
    });
  }

  function readInputs() {
    var debts = [];
    rowsEl.querySelectorAll(".debt-row").forEach(function (row) {
      debts.push({
        name: row.querySelector('[data-field="name"]').value,
        balance: row.querySelector('[data-field="balance"]').value,
        minimum: row.querySelector('[data-field="minimum"]').value,
        apr: row.querySelector('[data-field="apr"]').value,
      });
    });
    return { debts: debts, extra: extraEl.value };
  }

  function save() {
    try {
      var data = readInputs();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* storage off: fine */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.debts) || !data.debts.length) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function fill(data) {
    rowsEl.innerHTML = "";
    data.debts.forEach(function (d) {
      addRow({
        name: d.name,
        balance: parseNumber(d.balance),
        minimum: parseNumber(d.minimum),
        apr: d.apr,
      });
    });
    var x = parseNumber(data.extra);
    extraEl.value = Number.isFinite(x) ? moneyInputValue(x) : "";
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var out = {
    panel: document.querySelector(".results-panel"),
    empty: document.getElementById("empty-msg"),
    body: document.getElementById("results-body"),
    date: document.getElementById("out-date"),
    label: document.getElementById("out-label"),
    sub: document.getElementById("out-sub"),
    months: document.getElementById("out-months"),
    interest: document.getElementById("out-interest"),
    budget: document.getElementById("out-budget"),
    compare: document.getElementById("out-compare"),
    order: document.getElementById("out-order"),
    timeline: document.getElementById("out-timeline"),
    axis: document.getElementById("out-axis"),
    warnings: document.getElementById("out-warnings"),
  };

  function render() {
    var input = readInputs();
    var r = calculate(input, new Date());
    save();

    if (r.debtCount === 0) {
      out.panel.setAttribute("data-state", "empty");
      out.empty.hidden = false;
      out.body.hidden = true;
      return;
    }
    out.panel.setAttribute("data-state", "ready");
    out.empty.hidden = true;
    out.body.hidden = false;

    var s = r.snowball;
    var today = r.today;

    // Warnings
    out.warnings.innerHTML = "";
    r.warnings.forEach(function (w) {
      var li = el("li");
      if (w.kind === "interest") {
        li.textContent =
          w.name + ": the " + formatMoneyCents(w.minimumCents) + " minimum doesn’t cover the " +
          formatMoneyCents(w.interestCents) + " of interest it adds each month. Paying only the minimum, this balance grows. Double-check the minimum on your statement.";
      } else {
        li.textContent = w.name + " has no minimum payment entered. It only shrinks once the snowball reaches it.";
      }
      out.warnings.appendChild(li);
    });
    out.warnings.hidden = r.warnings.length === 0;

    // Hero
    if (s.finished) {
      out.date.textContent = formatMonthYearLong(r.debtFreeDate);
      out.sub.textContent = "Month " + s.months + " · " + yearsMonths(s.months) + " from now, paying " + formatMoneyCents(s.budgetCents) + " a month in total.";
    } else {
      out.date.textContent = "Not in 50 years";
      out.sub.textContent = "At " + formatMoneyCents(s.budgetCents) + " a month, interest keeps up with your payments. Raise the extra payment or check each minimum.";
    }
    out.months.textContent = s.finished ? String(s.months) : "600+";
    out.interest.textContent = s.finished ? formatMoneyCents(s.totalInterestCents) : "Keeps growing";
    out.label.textContent = s.finished ? "Debt-free in" : "Debt-free date";
    out.budget.textContent = formatMoneyCents(s.budgetCents);

    // Comparison
    var c = r.comparison;
    out.compare.innerHTML = "";
    if (!s.finished) {
      out.compare.appendChild(el("p", null, "No comparison until the snowball plan finishes inside 50 years."));
    } else if (!c.minimumsFinished) {
      out.compare.appendChild(el("p", "compare-big", "Minimums alone never get you there."));
      out.compare.appendChild(el("p", null, "Paying only minimums, at least one balance is still open after 50 years. The snowball clears everything in " + yearsMonths(s.months) + "."));
    } else {
      var big = el("p", "compare-big");
      big.textContent = c.interestSavedCents > 0
        ? formatMoneyCents(c.interestSavedCents) + " less interest, " + plural(c.monthsSaved, "month") + " sooner"
        : plural(c.monthsSaved, "month") + " sooner";
      out.compare.appendChild(big);
      out.compare.appendChild(el("p", null,
        "Minimums only: debt-free in Month " + c.minimumsMonths + " (" + monthLabel(today, c.minimumsMonths) + "), " +
        formatMoneyCents(c.minimumsInterestCents) + " in interest. That plan also pays less each month, because nothing rolls over and there’s no " +
        formatMoneyCents(r.extraCents, true) + " extra."));
    }

    // Payoff order + timeline
    out.order.innerHTML = "";
    out.timeline.innerHTML = "";
    var span = s.finished ? s.months : s.monthsSimulated;
    s.debts.forEach(function (d, i) {
      var li = el("li");
      var head = el("div", "order-head");
      head.appendChild(el("span", "order-num", String(i + 1).padStart(2, "0")));
      head.appendChild(el("span", "order-name", d.name));
      head.appendChild(el("span", "order-when", d.payoffMonth ? "Month " + d.payoffMonth + " · " + monthLabel(today, d.payoffMonth) : "Not paid off"));
      li.appendChild(head);
      li.appendChild(el("p", "order-meta",
        formatMoneyCents(d.startCents, true) + " balance · " + formatMoneyCents(d.minimumCents, true) + "/mo minimum · " +
        (d.apr ? d.apr + "% APR" : "0% APR") + " · " +
        (d.payoffMonth ? formatMoneyCents(d.interestCents) + " interest" : "balance still growing")));
      out.order.appendChild(li);

      var row = el("div", "tl-row");
      var label = el("span", "tl-label", d.name);
      var track = el("div", "tl-track");
      var bar = el("div", "tl-bar");
      var end = d.payoffMonth || span;
      bar.style.width = Math.max(2, (end / span) * 100) + "%";
      if (!d.payoffMonth) bar.classList.add("tl-open");
      bar.appendChild(el("span", "tl-val", d.payoffMonth ? "M" + d.payoffMonth : "open"));
      track.appendChild(bar);
      row.appendChild(label);
      row.appendChild(track);
      out.timeline.appendChild(row);
    });
    out.timeline.setAttribute("aria-label", "Timeline: " + s.debts.map(function (d) {
      return d.name + " paid off " + (d.payoffMonth ? "in month " + d.payoffMonth : "not within 50 years");
    }).join("; "));
    out.axis.innerHTML = "";
    out.axis.appendChild(el("span", null, "Now"));
    out.axis.appendChild(el("span", null, s.finished ? monthLabel(today, span) : "50 yrs"));
  }

  function formatOnBlur(e) {
    var t = e.target;
    if (!t.matches || !t.matches('[data-money="true"]')) return;
    var n = parseNumber(t.value);
    if (t.value.trim() === "" || !Number.isFinite(n) || n < 0) return;
    t.value = moneyInputValue(n);
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); render(); });
  form.addEventListener("input", function (e) {
    if (e.target && e.target.getAttribute("data-field") === "name") renumber();
    render();
  });
  form.addEventListener("focusout", formatOnBlur);
  addBtn.addEventListener("click", function () { addRow(null, true); render(); });
  resetBtn.addEventListener("click", function () { fill(EXAMPLE); render(); });
  rowsEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".btn-remove");
    if (!btn) return;
    var row = btn.closest(".debt-row");
    if (rowsEl.querySelectorAll(".debt-row").length <= 1) return;
    var next = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    renumber();
    render();
    if (next) next.querySelector('[data-field="name"]').focus();
  });

  fill(load() || EXAMPLE);
  render();
})(typeof window !== "undefined" ? window : globalThis);
