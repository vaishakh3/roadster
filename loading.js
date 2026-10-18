// Progress describes completed preparation work, never an elapsed-time timer.
export function createLoadingDisplay({ recordHistory = false } = {}) {
  const root = document.getElementById("loading"),
    meter = document.getElementById("loading-meter"),
    history = [];
  let active = true,
    progress = 0,
    stage = "Starting",
    slowTimer;
  function update(value, name, detail, step = 0) {
    progress = Math.max(progress, Math.min(100, value));
    stage = name;
    root.style.setProperty("--load-progress", progress / 100);
    meter.setAttribute("aria-valuenow", String(Math.round(progress)));
    meter.setAttribute(
      "aria-valuetext",
      `${Math.round(progress)} percent · ${name}`,
    );
    document.getElementById("loading-percent").textContent = String(
      Math.round(progress),
    ).padStart(2, "0");
    document.getElementById("loading-stage").textContent = name;
    document.getElementById("loading-detail").textContent = detail;
    root.querySelectorAll("[data-load-step]").forEach((el, i) => {
      el.dataset.state = i < step ? "done" : i === step ? "active" : "waiting";
    });
    if (recordHistory) {
      history.push({ stage, progress });
      if (history.length > 80) history.shift();
    }
    clearTimeout(slowTimer);
    document.getElementById("loading-slow").hidden = true;
    if (active)
      slowTimer = setTimeout(() => {
        document.getElementById("loading-slow").hidden = false;
      }, 12000);
  }
  return {
    begin(venue, mode = "boot") {
      active = true;
      progress = 0;
      history.length = 0;
      root.hidden = false;
      const app = document.getElementById("app");
      if (app) app.inert = true;
      root.dataset.mode = mode;
      document.getElementById("loading-venue").textContent =
        venue.toUpperCase();
      update(0, "Starting", "Preparing your first view.", 0);
    },
    update,
    complete() {
      update(100, "Ready to race", "Your venue is ready.", 4);
      active = false;
      clearTimeout(slowTimer);
      root.hidden = true;
      const app = document.getElementById("app");
      if (app) app.inert = false;
    },
    cancel() {
      active = false;
      clearTimeout(slowTimer);
      root.hidden = true;
      const app = document.getElementById("app");
      if (app) app.inert = false;
    },
    get state() {
      return {
        active,
        progress,
        stage,
        history: history.map((x) => ({ ...x })),
      };
    },
  };
}
