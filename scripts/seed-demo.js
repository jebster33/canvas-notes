// Builds the demo workspace used for README screenshots.
// Runs inside the app page (dev server) via scripts/screenshots.mjs.
async () => {
  const { useStore } = await import("/src/lib/store.ts");
  const { starterTable, setCalcColumn } = await import("/src/lib/table.ts");
  const st = () => useStore.getState();
  const day = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !st().ready; i++) await wait(100);
  st().setHome(false);

  // Workspaces.
  st().renameWorkspace(st().activeWs, "Personal");
  st().createWorkspace("School", "#5EC2B0");
  st().renameBoard(st().activeId, "Exam prep");
  st().createWorkspace("Work", "#6EA8FE");
  const launch = st().activeId;
  st().renameBoard(launch, "Product launch");

  const add = (type, x, y, init) => {
    const id = st().addNode(type, x, y, init);
    st().setEditing(null);
    return id;
  };

  const frame = add("frame", 0, 0, { x: -760, y: -300, w: 700, h: 640, title: "Launch week", frame: { color: "#8B7CF6" } });
  void frame;
  const plan = add("note", 0, 0, {
    x: -720, y: -240, w: 320, h: 250, title: "Launch plan",
    html:
      "<p>Ship v1 to early users and collect feedback before the public launch.</p>" +
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Pricing page</p></div></li>' +
      '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Onboarding emails</p></div></li>' +
      '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Launch tweet thread</p></div></li></ul>',
  });
  const sticky = add("sticky", 0, 0, { x: -720, y: 60, w: 210, h: 190, html: "<p><strong>Ship it Friday!</strong> Keep the scope small.</p>" });
  const ideas = add("note", 0, 0, {
    x: -380, y: 60, w: 280, h: 200, title: "Open questions",
    html: "<ul><li>Free tier limits?</li><li>Annual discount</li><li>See [[Budget]] for ad spend</li></ul>",
  });

  const t1 = add("task", 0, 0, { x: 40, y: -300, w: 300, title: "Finalize landing page", tags: ["web"], task: { status: "working", owner: "Sam", start: day(-3), due: day(2), priority: "high", progress: 60, remind: "1d" } });
  const t2 = add("task", 0, 0, { x: 40, y: -10, w: 300, title: "Record demo video", tags: ["marketing"], task: { status: "todo", owner: "Alex", start: day(1), due: day(6), priority: "medium", progress: 0, remind: "due" } });
  add("task", 0, 0, { x: 380, y: -300, w: 300, title: "Press kit", tags: ["marketing"], task: { status: "stuck", owner: "Robin", start: day(0), due: day(3), priority: "critical", progress: 30, remind: "1h" } });
  add("task", 0, 0, { x: 380, y: -10, w: 300, title: "Beta feedback round", tags: ["web"], task: { status: "done", owner: "Sam", start: day(-8), due: day(-2), priority: "low", progress: 100, remind: "none" } });

  let table = starterTable(
    [["Item", "Qty", "Price"], ["Ads", "3", "120"], ["Hosting", "12", "8"], ["Swag", "50", "4"]],
    ["text", "number", "number"],
  );
  table = setCalcColumn(table, "mul", [table.cols[1].id, table.cols[2].id], "Amount");
  const budget = add("table", 0, 0, { x: 40, y: 300, w: 470, h: 250, title: "Budget", table });
  const chart = add("chart", 0, 0, { x: 560, y: 300, w: 380, h: 270, title: "Spend by item", chart: { source: budget, kind: "bar", labelCol: 0, valueCols: [3] } });
  add("code", 0, 0, {
    x: 990, y: 300, w: 360, h: 230, title: "Promo code check",
    code: { lang: "lua", text: 'local function isValid(code)\n  return code:match("^LAUNCH%d%d$") ~= nil\nend\n\nprint(isValid("LAUNCH24")) -- true' },
  });

  st().addEdge(plan, t1);
  st().addEdge(plan, t2);
  st().addEdge(plan, ideas);
  st().addEdge(budget, chart);
  st().addEdge(ideas, budget);
  st().mutate((d) => {
    const e = d.edges.find((x) => x.from === ideas && x.to === budget);
    if (e) { e.label = "costs"; e.dashed = true; }
    d.tagColors = { web: "#6EA8FE", marketing: "#F5A3D0" };
  });
  st().addStroke({ tool: "ellipse", pts: [-740, 40, -490, 270], color: "#F2C66D", width: 3 });
  void sticky;

  // A second board in Work for the graph view.
  st().createBoard("Brainstorm");
  const center = add("note", 0, 0, { x: -140, y: -90, w: 280, h: 140, title: "Growth ideas", html: "<p>Ways to reach the first 1,000 users.</p>" });
  const spokes = [["Referral program", -520, -320], ["Student discount", 260, -320], ["YouTube tutorials", -520, 200], ["Discord community", 260, 200], ["Template gallery", -120, 260]];
  for (const [title, x, y] of spokes) st().addEdge(center, add("note", 0, 0, { x, y, w: 240, h: 110, title, html: "<p>Draft notes</p>" }));
  st().addEdge(center, add("link", 0, 0, { x: 300, y: -60, w: 240, title: "Product launch", link: { boardId: launch } }));

  st().openBoard(launch);
  st().clearSel();
  // Let saves flush before the page reloads.
  await wait(1200);
  return "seeded";
}
