(() => {
  "use strict";

  const byId = id => document.getElementById(id);

  const input = byId("input");
  const output = byId("output");
  const reportFixed = byId("reportFixed");
  const reportOpen = byId("reportOpen");
  const reportSub = byId("reportSub");
  const fixedCount = byId("fixedCount");
  const openCount = byId("openCount");
  const summary = byId("summary");
  const status = byId("status");
  const inputMeta = byId("inputMeta");
  const outputMeta = byId("outputMeta");
  const indentSelect = byId("indentSelect");
  const themeSelect = byId("themeSelect");
  const fileInput = byId("fileInput");
  const statsBar = byId("stats");
  const searchBox = byId("reportSearch");
  const filterBar = byId("filters");
  const showDetails = byId("optShowDetails");

  const toggles = {
    autofix: byId("optAutofix"),
    tableAttrs: byId("optTableAttrs"),
    requireBorder: byId("optRequireBorder"),
    widthSync: byId("optWidthSync"),
    heightSync: byId("optHeightSync"),
    forceWidthFix: byId("optForceWidthFix"),
    mediaSync: byId("optMediaSync"),
    crossMedia: byId("optCrossMedia"),
    duplicateProps: byId("optDuplicateProps"),
    emptyAttrs: byId("optEmptyAttrs"),
    unusedClasses: byId("optUnusedClasses"),
    bestPractice: byId("optBestPractice"),
    expandConditionals: byId("optExpandConditionals")
  };

  const GROUP_TITLES = {
    "structure": "Tag structure",
    "attributes": "Attributes",
    "table-attrs": "Table attributes",
    "dimension-sync": "Width and height",
    "media-sync": "Media query parity",
    "cross-media": "Breakpoint differences",
    "duplicate-prop": "Duplicate properties",
    "empty-attr": "Empty attributes",
    "links": "Links",
    "spacing": "Spacing",
    "practice": "Email best practice",
    "unused-class": "Classes"
  };

  const GROUP_ORDER = [
    "structure",
    "attributes",
    "table-attrs",
    "dimension-sync",
    "media-sync",
    "cross-media",
    "duplicate-prop",
    "empty-attr",
    "links",
    "spacing",
    "practice",
    "unused-class"
  ];

  let lastIssues = [];
  let lastStats = null;
  let levelFilter = "all";
  let lastOutput = "";

  /* The output pane is drawn line by line so every finding can be
     reached by its line number. Very large files stay plain text. */
  function paintOutput(text) {
    lastOutput = text;
    output.innerHTML = "";

    if (!text) return;

    const rows = text.split("\n");

    if (rows.length > 8000) {
      output.textContent = text;
      return;
    }

    const frag = document.createDocumentFragment();

    rows.forEach((row, index) => {
      const line = document.createElement("div");
      line.className = "code-line";
      line.dataset.line = index + 1;

      const number = document.createElement("span");
      number.className = "ln";
      number.textContent = index + 1;

      const code = document.createElement("span");
      code.className = "src";
      code.textContent = row || " ";

      line.appendChild(number);
      line.appendChild(code);
      frag.appendChild(line);
    });

    output.appendChild(frag);
  }

  function jumpToLine(line) {
    const row = output.querySelector('[data-line="' + line + '"]');

    if (!row) {
      setStatus("Line " + line + " is not shown in this view.", "err");
      return;
    }

    output.querySelectorAll(".code-line.flash").forEach(el => el.classList.remove("flash"));
    row.classList.add("flash");
    setTimeout(() => row.classList.remove("flash"), 1600);

    if (typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function readOptions() {
    const indent = indentSelect.value === "tab"
      ? "\t"
      : " ".repeat(Number(indentSelect.value));

    const opts = { indent: indent };
    for (const key in toggles) opts[key] = toggles[key].checked;
    return opts;
  }

  function paintToggles() {
    for (const key in toggles) {
      toggles[key].parentElement.classList.toggle("on", toggles[key].checked);
    }
  }

  const GMAIL_LIMIT = 102400;

  function byteSize(text) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  }

  function sizeLabel(text) {
    const bytes = byteSize(text);
    return (bytes / 1024).toFixed(1) + " KB";
  }

  function updateMeta() {
    inputMeta.textContent = input.value.length.toLocaleString() + " chars · " + sizeLabel(input.value);

    const bytes = byteSize(lastOutput);
    outputMeta.textContent =
      lastOutput.length.toLocaleString() + " chars · " + sizeLabel(lastOutput) +
      (bytes > GMAIL_LIMIT ? " · over Gmail's 102 KB clip limit" : "");
    outputMeta.style.color = bytes > GMAIL_LIMIT ? "var(--danger)" : "";
  }

  /* Theme choice is remembered when the browser allows it. */
  function applyTheme(name) {
    document.documentElement.setAttribute("data-theme", name);
    try { localStorage.setItem("ehb-theme", name); } catch (error) { /* private mode */ }
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem("ehb-theme"); } catch (error) { saved = null; }

    const name = saved || "soft";
    themeSelect.value = name;
    document.documentElement.setAttribute("data-theme", name);
  }

  function loadFile(file) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      input.value = String(reader.result || "");
      setStatus(file.name + " loaded.", "ok");
      run();
    };

    reader.onerror = () => setStatus("Could not read " + file.name + ".", "err");
    reader.readAsText(file);
  }

  function setStatus(message, type) {
    status.textContent = message;
    status.className = "status " + (type || "");
  }

  function statTile(key, value, tone, hint) {
    const tile = document.createElement("div");
    tile.className = "stat" + (tone ? " " + tone : "");
    if (hint) tile.title = hint;

    const k = document.createElement("span");
    k.className = "k";
    k.textContent = key;

    const v = document.createElement("span");
    v.className = "v";
    v.textContent = value;

    tile.appendChild(k);
    tile.appendChild(v);
    return tile;
  }

  function renderStats(stats) {
    statsBar.innerHTML = "";
    if (!stats) return;

    const links = stats.links;
    const bytes = byteSize(lastOutput);

    const notLinkedHint = [
      links.missing + " with no href",
      links.empty + ' with href=""',
      links.placeholder + ' with href="#"',
      links.anchor + " anchor only",
      links.relative + " relative path"
    ].join(" · ");

    const tiles = [
      statTile("Links", links.total, "", "Every <a> tag in the document"),
      statTile("Linked", links.linked, links.linked ? "good" : "", "Full URLs, merge tags, mailto and tel"),
      statTile("Not linked", links.notLinked, links.notLinked ? "flag" : "", notLinkedHint),
      statTile("mailto:", links.mailto, "", "Links that open a mail client"),
      statTile("tel:", links.tel, "", "Links that dial a number"),
      statTile("Tables", stats.tables, "", "Total <table> tags"),
      statTile("Images", stats.images, "", "Total <img> tags"),
      statTile("Conditionals", stats.conditionals, "", "Outlook conditional blocks"),
      statTile("Breakpoints", stats.breakpoints, "", stats.mediaBlocks + " @media blocks in total"),
      statTile(
        "Output",
        (bytes / 1024).toFixed(1) + " KB",
        bytes > GMAIL_LIMIT ? "bad" : "",
        bytes > GMAIL_LIMIT ? "Over Gmail's 102 KB clipping limit" : "Under Gmail's 102 KB clipping limit"
      )
    ];

    tiles.forEach(tile => statsBar.appendChild(tile));
  }

  function applyFilters() {
    const term = searchBox.value.trim().toLowerCase();
    let visible = 0;

    document.querySelectorAll(".report-body .issue").forEach(row => {
      const level = row.dataset.level;
      const text = (row.dataset.text || "");
      const levelOk = levelFilter === "all" || level === levelFilter;
      const textOk = !term || text.indexOf(term) !== -1;
      const show = levelOk && textOk;

      row.classList.toggle("hidden", !show);
      if (show) visible++;
    });

    document.querySelectorAll(".report-body .issue-group").forEach(group => {
      const any = group.querySelector(".issue:not(.hidden)");
      group.style.display = any ? "" : "none";
    });

    if ((term || levelFilter !== "all") && !visible) {
      setStatus("No findings match this filter.", "");
    }
  }

  function renderSummary(issues) {
    const counts = { fix: 0, warn: 0, error: 0, info: 0 };
    issues.forEach(issue => { counts[issue.level] = (counts[issue.level] || 0) + 1; });

    const pills = [];
    if (counts.fix) pills.push(["fix", counts.fix + " fixed"]);
    if (counts.error) pills.push(["error", counts.error + " to fix by hand"]);
    if (counts.warn) pills.push(["warn", counts.warn + " to review"]);
    if (counts.info) pills.push(["", counts.info + " note" + (counts.info === 1 ? "" : "s")]);
    if (!pills.length) pills.push(["", "nothing to report"]);

    summary.innerHTML = "";

    pills.forEach(pair => {
      const span = document.createElement("span");
      span.className = "pill " + pair[0];
      span.textContent = pair[1];
      summary.appendChild(span);
    });
  }

  /* Repeated findings fold into a single row with a count. */
  function aggregate(issues) {
    const map = new Map();

    issues.forEach(issue => {
      const key = issue.rule + "||" + issue.level + "||" + issue.message;

      if (!map.has(key)) {
        map.set(key, {
          rule: issue.rule,
          level: issue.level,
          message: issue.message,
          count: 0,
          details: [],
          hidden: 0,
          lines: [],
          hiddenLines: 0
        });
      }

      const entry = map.get(key);
      entry.count++;

      if (issue.line) {
        if (entry.lines.indexOf(issue.line) === -1) {
          if (entry.lines.length < 8) entry.lines.push(issue.line);
          else entry.hiddenLines++;
        }
      }

      if (!issue.detail) return;
      if (entry.details.length < 3) entry.details.push(issue.detail);
      else entry.hidden++;
    });

    const rows = Array.from(map.values());
    rows.forEach(row => row.lines.sort((a, b) => a - b));
    return rows;
  }

  function renderColumn(container, issues, emptyText) {
    container.innerHTML = "";

    if (!issues.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = emptyText;
      container.appendChild(empty);
      return;
    }

    const rows = aggregate(issues);
    const groups = new Map();

    rows.forEach(row => {
      if (!groups.has(row.rule)) groups.set(row.rule, []);
      groups.get(row.rule).push(row);
    });

    const keys = Array.from(groups.keys()).sort(
      (a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b)
    );

    keys.forEach(key => {
      const list = groups.get(key);
      const total = list.reduce((sum, row) => sum + row.count, 0);

      const section = document.createElement("div");
      section.className = "issue-group";

      const title = document.createElement("div");
      title.className = "group-title";
      title.textContent = GROUP_TITLES[key] || key;

      const count = document.createElement("span");
      count.className = "group-count";
      count.textContent = total;
      title.appendChild(count);
      section.appendChild(title);

      list.forEach(row => {
        const item = document.createElement("div");
        item.className = "issue";
        item.dataset.level = row.level;
        item.dataset.text = (row.message + " " + row.details.join(" ")).toLowerCase();

        const dot = document.createElement("span");
        dot.className = "dot " + row.level;

        const body = document.createElement("div");

        /* message, repeat count and line chips share one row */
        const head = document.createElement("div");
        head.className = "issue-row";

        const text = document.createElement("span");
        text.className = "msg";
        text.textContent = row.message;

        if (row.count > 1) {
          const times = document.createElement("span");
          times.className = "times";
          times.textContent = "×" + row.count;
          text.appendChild(times);
        }

        head.appendChild(text);

        if (row.lines.length) {
          const lines = document.createElement("span");
          lines.className = "lines";

          row.lines.forEach(line => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "line-chip";
            chip.textContent = "L" + line;
            chip.title = "Jump to line " + line + " of the formatted output";
            chip.addEventListener("click", () => jumpToLine(line));
            lines.appendChild(chip);
          });

          if (row.hiddenLines) {
            const more = document.createElement("span");
            more.className = "line-chip more";
            more.textContent = "+" + row.hiddenLines;
            more.title = row.hiddenLines + " more occurrences";
            lines.appendChild(more);
          }

          head.appendChild(lines);
        }

        body.appendChild(head);

        /* details stay folded away until asked for */
        if (row.details.length) {
          const wrap = document.createElement("details");
          wrap.className = "detail-wrap";
          wrap.open = showDetails.checked;

          const summary = document.createElement("summary");
          summary.textContent = row.details.length === 1
            ? "details"
            : row.details.length + " examples";

          const detail = document.createElement("div");
          detail.className = "detail";
          detail.textContent =
            row.details.join("\n") + (row.hidden ? "\n+ " + row.hidden + " more" : "");

          wrap.appendChild(summary);
          wrap.appendChild(detail);
          body.appendChild(wrap);
        }

        item.appendChild(dot);
        item.appendChild(body);
        section.appendChild(item);
      });

      container.appendChild(section);
    });
  }

  function renderReport(issues) {
    renderSummary(issues);

    const fixed = issues.filter(issue => issue.level === "fix");
    const open = issues.filter(issue => issue.level !== "fix");

    fixedCount.textContent = fixed.length;
    openCount.textContent = open.length;

    renderColumn(
      reportFixed,
      fixed,
      toggles.autofix.checked
        ? "Nothing needed fixing."
        : "Fixes are switched off, so nothing was changed."
    );

    renderColumn(reportOpen, open, "Nothing left to review.");

    renderStats(lastStats);
    applyFilters();

    reportSub.textContent = issues.length
      ? fixed.length + " change" + (fixed.length === 1 ? "" : "s") + " applied · " +
        open.length + " item" + (open.length === 1 ? "" : "s") + " left for you"
      : "Every check passed.";
  }

  function clearReport() {
    reportFixed.innerHTML = "";
    reportOpen.innerHTML = "";
    statsBar.innerHTML = "";
    lastStats = null;
    summary.innerHTML = "";
    fixedCount.textContent = "0";
    openCount.textContent = "0";
    reportSub.textContent = "Run a format to see the results.";
  }

  function reportAsText(issues) {
    if (!issues.length) return "Email HTML checks: all passed.";

    const line = issue =>
      "- " + (issue.line ? "L" + issue.line + "  " : "") + issue.message +
      (issue.detail ? "\n    " + issue.detail : "");
    const fixedList = issues.filter(i => i.level === "fix");
    const openList = issues.filter(i => i.level !== "fix");

    return [
      "FIXED (" + fixedList.length + ")",
      fixedList.length ? fixedList.map(line).join("\n") : "- nothing",
      "",
      "NEEDS ATTENTION (" + openList.length + ")",
      openList.length ? openList.map(line).join("\n") : "- nothing"
    ].join("\n");
  }

  function run() {
    if (!input.value.trim()) {
      paintOutput("");
      lastIssues = [];
      clearReport();
      updateMeta();
      setStatus("Paste HTML into the input first.");
      return;
    }

    try {
      const result = EmailTool.process(input.value, readOptions());
      lastStats = result.stats;
      paintOutput(result.html);
      lastIssues = result.issues;
      renderReport(result.issues);
      updateMeta();

      const fixed = result.issues.filter(i => i.level === "fix").length;
      const open = result.issues.length - fixed;
      const needsHand = result.issues.filter(i => i.level === "warn" || i.level === "error").length;

      setStatus(
        "Formatted. " + fixed + " fix" + (fixed === 1 ? "" : "es") + " applied · " + open + " item" + (open === 1 ? "" : "s") + " listed on the right.",
        needsHand ? "" : "ok"
      );
    } catch (error) {
      setStatus("Could not format the HTML: " + error.message, "err");
    }
  }

  async function copyText(text, okMessage) {
    if (!text) {
      setStatus("Nothing to copy.", "err");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setStatus(okMessage, "ok");
    } catch {
      const temp = document.createElement("textarea");
      temp.value = text;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      temp.remove();
      setStatus(okMessage, "ok");
    }
  }

  byId("formatBtn").addEventListener("click", run);

  byId("copyBtn").addEventListener("click", () => {
    copyText(lastOutput, "Formatted HTML copied to clipboard.");
  });

  byId("copyReportBtn").addEventListener("click", () => {
    copyText(reportAsText(lastIssues), "Check report copied to clipboard.");
  });

  byId("downloadBtn").addEventListener("click", () => {
    const text = lastOutput;

    if (!text) {
      setStatus("Nothing to download.", "err");
      return;
    }

    const blob = new Blob([text], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "formatted-email.html";
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 500);
    setStatus("formatted-email.html downloaded.", "ok");
  });

  byId("clearBtn").addEventListener("click", () => {
    input.value = "";
    paintOutput("");
    lastIssues = [];
    clearReport();
    updateMeta();
    setStatus("Cleared.");
    input.focus();
  });

  indentSelect.addEventListener("change", () => { if (input.value.trim()) run(); });

  themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));

  searchBox.addEventListener("input", applyFilters);

  filterBar.addEventListener("click", event => {
    const chip = event.target.closest(".chip");
    if (!chip) return;

    levelFilter = chip.dataset.filter;
    filterBar.querySelectorAll(".chip").forEach(el => el.classList.toggle("on", el === chip));
    applyFilters();
  });

  showDetails.addEventListener("change", () => {
    showDetails.parentElement.classList.toggle("on", showDetails.checked);
    document.querySelectorAll(".detail-wrap").forEach(el => { el.open = showDetails.checked; });
  });

  byId("openBtn").addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    loadFile(fileInput.files && fileInput.files[0]);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach(name => {
    input.addEventListener(name, event => {
      event.preventDefault();
      input.classList.add("dropping");
    });
  });

  ["dragleave", "dragend", "drop"].forEach(name => {
    input.addEventListener(name, () => input.classList.remove("dropping"));
  });

  input.addEventListener("drop", event => {
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file) return;
    event.preventDefault();
    loadFile(file);
  });

  for (const key in toggles) {
    toggles[key].addEventListener("change", () => {
      paintToggles();
      if (input.value.trim()) run();
    });
  }

  input.addEventListener("input", updateMeta);

  input.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      run();
    }

    if (event.key === "Tab") {
      event.preventDefault();
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const indent = indentSelect.value === "tab" ? "\t" : " ".repeat(Number(indentSelect.value));
      input.setRangeText(indent, start, end, "end");
    }
  });

  /* Sample input that exercises every check. */
  input.value = '<html lang=""><head><style>body{margin:0;}.MsoHyperlink{color:#0000ee;}.wrapper{width:600px;width:640px;}.mHide{display:block;}.oldPromo{color:#999999;}@media only screen and (max-width:520px){.wrapper{width:100% !important;}.mHide{display:none !important;}.w100pc{width:100% !important;}}@media only screen and (max-width:520px){.wrapper{width:320px !important;}.mHide{display:none !important;}}@media only screen and (max-width:420px){.w100pc{width:200% !important;}}</style></head><body bgcolor=""><table width="100%" border="0" align="center" class=""><tr><td align="center" style="padding:0;"><table class="wrapper" width="600" border="0" cellpadding="0" style="width:640px;"><tr><td align="center" class="mHide  ghostClass" style="padding:20px;"><a href="https://example.com" target="_blank"><img src="logo.png" width="240" alt="" style="display:block;width:200px;" /></a></td></tr><tr><td align="left" style="padding:0 20px" style="padding:0 24px">Summer  offers are  live <strong>today</strong>. <a href="mailto:hello@example.com">Mail us</a> or <a href="tel:+919000000000">call us</a>, <a href="#">terms</a> and <a href="">privacy</a>.</td></tr><tr><td align="center" class="w100pc"><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://example.com/cta" style="height:44px;width:220px;" arcsize="10%" fillcolor="#e20074"><w:anchorlock/><center style="color:#ffffff;"><![endif]--><a href="https://example.com/cta" class="btn" style="display:block;">Jetzt buchen</a><!--[if mso]></center></v:roundrect><![endif]--></td></tr></table></td></tr></table></body></html>';

  initTheme();
  paintToggles();
  updateMeta();
  run();
})();
