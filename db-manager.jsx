import { useState, useEffect, useRef, useCallback } from "react";

// ─── Config ────────────────────────────────────────────────────────────────
const API = "http://localhost:3737/api";
const genId = () => Math.random().toString(36).slice(2, 10);

// ─── DB Definitions ────────────────────────────────────────────────────────
const DB_TYPES = [
  { id:"postgresql", name:"PostgreSQL",     icon:"🐘", color:"#336791", fields:[{k:"host",l:"الخادم",ph:"localhost"},{k:"port",l:"المنفذ",ph:"5432"},{k:"database",l:"قاعدة البيانات",ph:"mydb"},{k:"username",l:"المستخدم",ph:"postgres"},{k:"password",l:"كلمة المرور",t:"password"},{k:"ssl",l:"SSL",ph:"true/false"}] },
  { id:"mysql",      name:"MySQL",          icon:"🐬", color:"#00758F", fields:[{k:"host",l:"الخادم",ph:"localhost"},{k:"port",l:"المنفذ",ph:"3306"},{k:"database",l:"قاعدة البيانات"},{k:"username",l:"المستخدم",ph:"root"},{k:"password",l:"كلمة المرور",t:"password"}] },
  { id:"sqlite",     name:"SQLite",         icon:"💾", color:"#7B8B9A", fields:[{k:"filename",l:"مسار الملف",ph:"/path/to/db.sqlite"}] },
  { id:"mongodb",    name:"MongoDB",        icon:"🍃", color:"#47A248", fields:[{k:"uri",l:"Connection URI",ph:"mongodb://localhost:27017"},{k:"database",l:"قاعدة البيانات"}] },
  { id:"redis",      name:"Redis",          icon:"🔴", color:"#DC382D", fields:[{k:"host",l:"الخادم",ph:"localhost"},{k:"port",l:"المنفذ",ph:"6379"},{k:"password",l:"كلمة المرور",t:"password"},{k:"db_number",l:"رقم DB",ph:"0"}] },
  { id:"supabase",   name:"Supabase",       icon:"⚡", color:"#3ECF8E", fields:[{k:"host",l:"Host",ph:"db.xxx.supabase.co"},{k:"port",l:"Port",ph:"5432"},{k:"database",l:"Database",ph:"postgres"},{k:"username",l:"User",ph:"postgres"},{k:"password",l:"Password",t:"password"}] },
  { id:"neon",       name:"Neon",           icon:"💡", color:"#00E5BF", fields:[{k:"host",l:"Host",ph:"ep-xxx.us-east-2.aws.neon.tech"},{k:"database",l:"Database",ph:"neondb"},{k:"username",l:"User"},{k:"password",l:"Password",t:"password"},{k:"ssl",l:"SSL",ph:"true"}] },
  { id:"planetscale",name:"PlanetScale",    icon:"🪐", color:"#8B5CF6", fields:[{k:"host",l:"Host",ph:"xxx.connect.psdb.cloud"},{k:"username",l:"User"},{k:"password",l:"Password",t:"password"},{k:"database",l:"Database"}] },
  { id:"turso",      name:"Turso",          icon:"🦋", color:"#4FF8D2", fields:[{k:"filename",l:"Local DB or :memory:",ph:":memory:"}] },
  { id:"d1",         name:"Cloudflare D1",  icon:"☁️", color:"#F6821F", fields:[{k:"filename",l:"D1 Local File",ph:"./local.db"}] },
  { id:"cockroachdb",name:"CockroachDB",    icon:"🪳", color:"#6933FF", fields:[{k:"host",l:"Host"},{k:"port",l:"Port",ph:"26257"},{k:"database",l:"Database"},{k:"username",l:"User"},{k:"password",l:"Password",t:"password"},{k:"ssl",l:"SSL",ph:"true"}] },
  { id:"firebase",   name:"Firebase RTDB",  icon:"🔥", color:"#FFCA28", fields:[{k:"filename",l:"JSON Export Path",ph:"./firebase-export.json"}] },
];

const FIELD_TYPES = ["SERIAL","INTEGER","BIGINT","VARCHAR(255)","TEXT","BOOLEAN","FLOAT","DECIMAL(10,2)","DATE","DATETIME","TIMESTAMP","JSON","JSONB","UUID","BLOB"];
const CONSTRAINTS = ["PRIMARY KEY","NOT NULL","UNIQUE","AUTO_INCREMENT","DEFAULT NULL"];

// ─── Helpers ───────────────────────────────────────────────────────────────
const sqlMapped = (type) => {
  const pg = ["postgresql","supabase","neon","planetscale","cockroachdb"];
  const my = ["mysql"];
  const sl = ["sqlite","turso","d1","firebase"];
  if (pg.includes(type)) return "postgresql";
  if (my.includes(type)) return "mysql";
  if (sl.includes(type)) return "sqlite";
  return type;
};

// ─── Toast ─────────────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", zIndex:9999, display:"flex", flexDirection:"column", gap:8, alignItems:"center" }}>
      {toasts.map(t => (
        <div key={t.id} style={{ background: t.type==="error"?"#450a0a":t.type==="warn"?"#451a03":"#052e16", border:`1px solid ${t.type==="error"?"#dc2626":t.type==="warn"?"#ea580c":"#16a34a"}`, color:"#fff", padding:"11px 22px", borderRadius:10, fontSize:14, fontWeight:600, boxShadow:"0 8px 32px rgba(0,0,0,.6)", whiteSpace:"nowrap" }}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────
export default function DBManager() {
  const [step, setStep]           = useState("select");
  const [selectedDB, setSelectedDB] = useState(null);
  const [connFields, setConnFields] = useState({});
  const [connId]                  = useState(genId());
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [backendOk, setBackendOk] = useState(null); // null=checking, true, false

  const [tables, setTables]       = useState([]);
  const [activeTable, setActiveTable] = useState(null);
  const [schema, setSchema]       = useState([]);
  const [tableData, setTableData] = useState({ rows:[], fields:[], total:0 });
  const [dataPage, setDataPage]   = useState(0);
  const [loadingData, setLoadingData] = useState(false);

  const [tab, setTab]             = useState("tables"); // tables|schema|data|query|create|ai
  const [sqlHistory, setSqlHistory] = useState([]);

  const [newTable, setNewTable]   = useState({ name:"", columns:[] });

  const [aiPrompt, setAiPrompt]   = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [generatedSQL, setGeneratedSQL] = useState("");

  const [toasts, setToasts]       = useState([]);
  const notify = useCallback((msg, type="success") => {
    const id = genId();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  // Check backend on mount
  useEffect(() => {
    fetch(`${API.replace("/api","/health")}`)
      .then(r => r.json())
      .then(d => setBackendOk(d.ok))
      .catch(() => setBackendOk(false));
  }, []);

  // ── API helpers ──────────────────────────────────────────────────────────
  const apiFetch = async (path, opts={}) => {
    const r = await fetch(API + path, {
      headers:{ "Content-Type":"application/json" },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "خطأ في الخادم");
    return d;
  };

  const loadTables = async () => {
    const d = await apiFetch(`/${connId}/tables`);
    setTables(d.tables);
  };

  const loadSchema = async (tbl) => {
    const d = await apiFetch(`/${connId}/schema/${tbl}`);
    setSchema(d.columns);
  };

  const loadData = async (tbl, page=0) => {
    setLoadingData(true);
    try {
      const d = await apiFetch(`/${connId}/data/${tbl}?limit=50&offset=${page*50}`);
      setTableData(d);
      setDataPage(page);
    } catch(e) { notify(e.message,"error"); }
    setLoadingData(false);
  };

  // ── Connect ──────────────────────────────────────────────────────────────
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const mappedType = sqlMapped(selectedDB.id);
      await apiFetch("/connect", { method:"POST", body:{ id:connId, type:mappedType, config:connFields } });
      setConnected(true);
      setStep("dashboard");
      await loadTables();
      notify(`✅ تم الاتصال بـ ${selectedDB.name}`);
    } catch(e) {
      notify(e.message, "error");
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    try { await apiFetch("/disconnect", { method:"POST", body:{ id:connId } }); } catch(_){}
    setConnected(false); setSelectedDB(null); setTables([]); setActiveTable(null);
    setSchema([]); setTableData({ rows:[],fields:[],total:0 });
    setStep("select"); notify("تم قطع الاتصال","warn");
  };

  // ── Select table ─────────────────────────────────────────────────────────
  const selectTable = async (tbl) => {
    setActiveTable(tbl);
    setTab("schema");
    try {
      await loadSchema(tbl);
      await loadData(tbl, 0);
    } catch(e) { notify(e.message,"error"); }
  };

  // ── Drop table ───────────────────────────────────────────────────────────
  const dropTable = async (tbl) => {
    if (!window.confirm(`حذف جدول "${tbl}"؟ لا يمكن التراجع!`)) return;
    try {
      await apiFetch(`/${connId}/table/${tbl}`, { method:"DELETE" });
      await loadTables();
      if (activeTable===tbl) { setActiveTable(null); setSchema([]); }
      notify(`🗑️ تم حذف جدول "${tbl}"`);
    } catch(e) { notify(e.message,"error"); }
  };

  // ── Create table ─────────────────────────────────────────────────────────
  const buildSQL = () => {
    if (!newTable.name || !newTable.columns.length) return "";
    const cols = newTable.columns.map(c =>
      `  ${c.name} ${c.type}${c.constraints.length ? " "+c.constraints.join(" ") : ""}`
    ).join(",\n");
    return `CREATE TABLE ${newTable.name} (\n${cols}\n);`;
  };

  const createTable = async () => {
    const sql = buildSQL();
    if (!sql) return;
    try {
      await apiFetch(`/${connId}/create-table`, { method:"POST", body:{ sql } });
      await loadTables();
      setNewTable({ name:"", columns:[] });
      setTab("tables");
      notify(`✅ تم إنشاء جدول "${newTable.name}"`);
    } catch(e) { notify(e.message,"error"); }
  };

  // ── AI generate ──────────────────────────────────────────────────────────
  const generateWithAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true); setGeneratedSQL("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"claude-sonnet-4-6", max_tokens:1000,
          messages:[{ role:"user", content:`أنت خبير ${selectedDB?.name||"SQL"}. اكتب SQL فقط بدون أي شرح أو backticks.\nالطلب: ${aiPrompt}` }]
        })
      });
      const d = await res.json();
      setGeneratedSQL(d.content?.map(b=>b.text||"").join("").trim());
    } catch(e) { notify("خطأ في AI: "+e.message,"error"); }
    setAiLoading(false);
  };

  const applyAISQL = async () => {
    for (const stmt of generatedSQL.split(";").map(s=>s.trim()).filter(Boolean)) {
      try {
        await apiFetch(`/${connId}/query`, { method:"POST", body:{ sql:stmt+";" } });
      } catch(e) { notify(e.message,"error"); return; }
    }
    await loadTables();
    notify("✅ تم تطبيق SQL بنجاح");
    setGeneratedSQL(""); setAiPrompt("");
  };

  const exportSchema = async () => {
    try {
      const d = await apiFetch(`/${connId}/export`);
      const blob = new Blob([d.sql], { type:"text/sql" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `schema_${Date.now()}.sql`;
      a.click();
      notify("✅ تم تصدير Schema");
    } catch(e) { notify(e.message,"error"); }
  };

  const copy = (text) => { navigator.clipboard.writeText(text); notify("تم النسخ 📋"); };

  // ─── Render ───────────────────────────────────────────────────────────────
  const S = styles;
  return (
    <div dir="rtl" style={S.root}>
      <Toast toasts={toasts} />

      {/* HEADER */}
      <header style={S.header}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:26 }}>🗄️</span>
          <div>
            <div style={S.brandName}>DB Connect Pro</div>
            <div style={S.brandSub}>مدير قواعد البيانات الشامل</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {/* Backend indicator */}
          <div style={S.badge(backendOk===true?"#22c55e":backendOk===false?"#dc2626":"#f59e0b")}>
            <span style={{ width:7,height:7,borderRadius:"50%",background:backendOk===true?"#22c55e":backendOk===false?"#dc2626":"#f59e0b",display:"inline-block" }}/>
            {backendOk===true?"Backend متصل":backendOk===false?"Backend غير متاح":"فحص..."}
          </div>
          {connected && (
            <>
              <div style={S.badge("#22c55e")}>
                <span style={{ width:7,height:7,borderRadius:"50%",background:"#22c55e",display:"inline-block" }}/>
                {selectedDB?.name}
              </div>
              <button onClick={handleDisconnect} style={S.btnSm}>قطع الاتصال</button>
              <button onClick={exportSchema} style={{ ...S.btnSm, background:"#1a1a2e", color:"#818cf8", borderColor:"#333" }}>⬇ تصدير SQL</button>
            </>
          )}
        </div>
      </header>

      <div style={{ maxWidth:1200, margin:"0 auto", padding:"20px 16px" }}>

        {/* ── STEP: SELECT DB ── */}
        {step==="select" && (
          <div>
            {backendOk===false && (
              <div style={S.warning}>
                ⚠️ <strong>Backend غير متاح</strong> — الأداة تعمل بالكامل مع Node.js backend.
                شغّل: <code style={{ background:"#111", padding:"2px 8px", borderRadius:4, fontSize:12 }}>cd backend && npm install && npm start</code>
              </div>
            )}
            <h2 style={S.heading}>اختر قاعدة البيانات</h2>
            <p style={{ color:"#555", marginBottom:24, fontSize:13 }}>12 نوع مدعوم — اتصال حقيقي عبر Backend</p>
            <div style={S.dbGrid}>
              {DB_TYPES.map(db => (
                <div key={db.id} onClick={() => { setSelectedDB(db); setConnFields({}); setStep("connect"); }}
                  style={S.dbCard(db.color)}
                  onMouseEnter={e => e.currentTarget.style.borderColor=db.color}
                  onMouseLeave={e => e.currentTarget.style.borderColor="#1e1e24"}>
                  <span style={{ fontSize:28 }}>{db.icon}</span>
                  <div style={{ fontWeight:600, fontSize:14, color:"#e5e5e5", marginTop:8 }}>{db.name}</div>
                  <div style={{ fontSize:11, color:"#555", marginTop:3 }}>{db.fields.length} إعدادات</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: CONNECT ── */}
        {step==="connect" && selectedDB && (
          <div style={{ maxWidth:500, margin:"0 auto" }}>
            <button onClick={() => setStep("select")} style={S.back}>← رجوع</button>
            <div style={S.card}>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:22 }}>
                <span style={{ fontSize:36 }}>{selectedDB.icon}</span>
                <div>
                  <h2 style={{ color:"#f0c040", margin:0, fontSize:20 }}>الاتصال بـ {selectedDB.name}</h2>
                  <p style={{ color:"#555", margin:0, fontSize:13 }}>أدخل بيانات الاتصال</p>
                </div>
              </div>
              {selectedDB.fields.map(f => (
                <div key={f.k} style={{ marginBottom:13 }}>
                  <label style={S.label}>{f.l}</label>
                  <input type={f.t||"text"} placeholder={f.ph||""}
                    value={connFields[f.k]||""}
                    onChange={e => setConnFields(p=>({...p,[f.k]:e.target.value}))}
                    style={S.input} />
                </div>
              ))}
              <div style={{ display:"flex", gap:10, marginTop:18 }}>
                <button onClick={handleConnect} disabled={connecting||backendOk===false}
                  style={{ ...S.btnPrimary, flex:1, opacity:connecting||backendOk===false?0.6:1 }}>
                  {connecting?"⏳ جارٍ الاتصال...":"🔌 اتصال"}
                </button>
                <button onClick={() => setConnFields({})} style={S.btnSm}>مسح</button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: DASHBOARD ── */}
        {step==="dashboard" && (
          <div style={{ display:"grid", gridTemplateColumns:"220px 1fr", gap:18, alignItems:"start" }}>

            {/* Sidebar */}
            <div style={S.sidebar}>
              <div style={S.sidebarHeader}>
                <span style={{ fontSize:12, color:"#666", fontWeight:600 }}>الجداول ({tables.length})</span>
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={() => { setTab("create"); setActiveTable(null); }} style={S.btnXS}>+ جديد</button>
                  <button onClick={loadTables} style={{ ...S.btnXS, background:"#1a1a1f" }}>↻</button>
                </div>
              </div>
              <div style={{ overflowY:"auto", maxHeight:"55vh" }}>
                {tables.length===0 && <div style={{ padding:"16px", color:"#444", fontSize:12, textAlign:"center" }}>لا يوجد جداول</div>}
                {tables.map(t => (
                  <div key={t.name} onClick={() => selectTable(t.name)}
                    style={S.tableRow(activeTable===t.name)}>
                    <div style={{ display:"flex", alignItems:"center", gap:7, flex:1, overflow:"hidden" }}>
                      <span style={{ fontSize:13 }}>📋</span>
                      <span style={{ fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.name}</span>
                    </div>
                    <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                      {t.size && t.size!=="—" && <span style={{ fontSize:10, color:"#444" }}>{t.size}</span>}
                      <button onClick={e=>{e.stopPropagation();dropTable(t.name);}}
                        style={{ background:"none", border:"none", color:"#444", cursor:"pointer", fontSize:12, padding:"0 2px", lineHeight:1 }}
                        title="حذف">✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding:"12px 10px", borderTop:"1px solid #1e1e24" }}>
                <button onClick={() => setTab("ai")} style={S.btnAI}>✨ إنشاء بالـ AI</button>
              </div>
            </div>

            {/* Main */}
            <div>
              {/* Tab bar */}
              <div style={S.tabBar}>
                {[
                  {k:"tables",l:"📋 الجداول"},
                  {k:"schema",l:"🗂️ المخطط"},
                  {k:"data",  l:"📊 البيانات"},
                  {k:"query", l:"⚡ SQL"},
                  {k:"erd",   l:"🔗 ERD"},
                  {k:"health",l:"❤️ Health"},
                  {k:"create",l:"➕ إنشاء"},
                  {k:"ai",    l:"✨ AI"},
                ].map(t => (
                  <button key={t.k} onClick={()=>setTab(t.k)} style={S.tabBtn(tab===t.k)}>{t.l}</button>
                ))}
              </div>

              {/* TABLES */}
              {tab==="tables" && (
                <div style={S.grid3}>
                  {tables.map(t => (
                    <div key={t.name} onClick={() => selectTable(t.name)} style={S.tableCard}
                      onMouseEnter={e=>e.currentTarget.style.borderColor="#f0c040"}
                      onMouseLeave={e=>e.currentTarget.style.borderColor="#1e1e24"}>
                      <div style={{ fontSize:26, marginBottom:8 }}>📋</div>
                      <div style={{ fontWeight:600, fontSize:15 }}>{t.name}</div>
                      {t.size && <div style={{ fontSize:11, color:"#444", marginTop:4 }}>{t.size}</div>}
                    </div>
                  ))}
                  <div onClick={()=>setTab("create")} style={S.tableCardNew}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor="#f0c040";e.currentTarget.style.color="#f0c040";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="#1e1e24";e.currentTarget.style.color="#333";}}>
                    <span style={{ fontSize:28 }}>+</span>
                    <span style={{ fontSize:13, marginTop:6 }}>جدول جديد</span>
                  </div>
                </div>
              )}

              {/* SCHEMA */}
              {tab==="schema" && (
                activeTable ? (
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                      <h3 style={S.subH}>🗂️ {activeTable}</h3>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={()=>copy(`SELECT * FROM ${activeTable} LIMIT 100;`)} style={S.btnSm}>نسخ SELECT</button>
                        <button onClick={()=>dropTable(activeTable)} style={{ ...S.btnSm, color:"#f87171", borderColor:"#7f1d1d" }}>حذف الجدول</button>
                      </div>
                    </div>
                    <SchemaTable columns={schema} />
                    {schema.length>0 && (
                      <div style={S.sqlPreview}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                          <span style={{ fontSize:12, color:"#555" }}>CREATE TABLE SQL</span>
                          <button onClick={()=>copy(schemaToSQL(activeTable,schema))} style={S.btnSm}>نسخ</button>
                        </div>
                        <pre style={S.code}>{schemaToSQL(activeTable,schema)}</pre>
                      </div>
                    )}
                  </div>
                ) : <EmptyState icon="🗂️" msg="اختر جدول من الشريط الجانبي" />
              )}

              {/* DATA */}
              {tab==="data" && (
                activeTable ? (
                  <DataView data={tableData} loading={loadingData} page={dataPage}
                    onPage={(p)=>loadData(activeTable,p)} tableName={activeTable} />
                ) : <EmptyState icon="📊" msg="اختر جدول أولاً" />
              )}

              {/* QUERY */}
              {tab==="query" && (
                <QueryEditor connId={connId} apiFetch={apiFetch} notify={notify}
                  history={sqlHistory} setHistory={setSqlHistory} />
              )}

              {/* CREATE TABLE */}
              {tab==="create" && (
                <CreateTablePanel newTable={newTable} setNewTable={setNewTable}
                  buildSQL={buildSQL} createTable={createTable} backendOk={backendOk} />
              )}

              {/* AI */}
              {tab==="ai" && (
                <AIPanel dbName={selectedDB?.name} aiPrompt={aiPrompt} setAiPrompt={setAiPrompt}
                  aiLoading={aiLoading} generatedSQL={generatedSQL}
                  onGenerate={generateWithAI} onApply={applyAISQL} onCopy={copy} />
              )}

              {/* ERD */}
              {tab==="erd" && (
                <ERDPanel tables={tables} connId={connId} apiFetch={apiFetch} notify={notify} />
              )}

              {/* HEALTH */}
              {tab==="health" && (
                <HealthPanel tables={tables} connId={connId} apiFetch={apiFetch} notify={notify} selectedDB={selectedDB} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SchemaTable({ columns }) {
  if (!columns.length) return <EmptyState icon="🗂️" msg="لا يوجد أعمدة" />;
  return (
    <div style={{ background:"#111116", border:"1px solid #1e1e24", borderRadius:12, overflow:"hidden" }}>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr style={{ background:"#0a0a0d" }}>
            {["العمود","النوع","Nullable","Default","PK"].map(h=>(
              <th key={h} style={{ padding:"10px 14px", textAlign:"right", fontSize:12, color:"#555", borderBottom:"1px solid #1e1e24" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((c,i)=>(
            <tr key={i} style={{ borderBottom:"1px solid #111" }}>
              <td style={{ padding:"10px 14px", fontSize:14, color:"#e5e5e5", fontWeight:600 }}>
                {c.is_pk && <span style={{ color:"#f0c040", marginLeft:5 }}>🔑</span>}{c.name}
              </td>
              <td style={{ padding:"10px 14px" }}>
                <span style={{ background:"#1a1a2e", color:"#818cf8", fontSize:12, padding:"3px 9px", borderRadius:6 }}>{c.type}</span>
              </td>
              <td style={{ padding:"10px 14px", fontSize:12, color: c.is_nullable==="YES"?"#22c55e":"#f87171" }}>{c.is_nullable||"—"}</td>
              <td style={{ padding:"10px 14px", fontSize:12, color:"#555" }}>{c.column_default||"—"}</td>
              <td style={{ padding:"10px 14px", fontSize:13 }}>{c.is_pk?"✅":"—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DataView({ data, loading, page, onPage, tableName }) {
  const { rows, fields, total } = data;
  const pages = Math.ceil(total/50);
  const cols = fields.length ? fields : (rows[0] ? Object.keys(rows[0]) : []);
  if (loading) return <div style={{ textAlign:"center", padding:60, color:"#444" }}>⏳ جارٍ التحميل...</div>;
  if (!rows.length) return <EmptyState icon="📊" msg="الجدول فارغ" />;
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <span style={{ color:"#555", fontSize:13 }}>إجمالي: {total} صف</span>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={()=>onPage(page-1)} disabled={page===0} style={{ ...styles.btnSm, opacity:page===0?0.4:1 }}>← سابق</button>
          <span style={{ fontSize:12, color:"#555" }}>{page+1}/{pages||1}</span>
          <button onClick={()=>onPage(page+1)} disabled={page>=pages-1} style={{ ...styles.btnSm, opacity:page>=pages-1?0.4:1 }}>التالي →</button>
        </div>
      </div>
      <div style={{ overflowX:"auto", background:"#111116", border:"1px solid #1e1e24", borderRadius:12 }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:"#0a0a0d" }}>
              {cols.map(c=>(
                <th key={c} style={{ padding:"10px 14px", textAlign:"right", fontSize:12, color:"#555", borderBottom:"1px solid #1e1e24", whiteSpace:"nowrap" }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row,i)=>(
              <tr key={i} style={{ borderBottom:"1px solid #0d0d10" }}>
                {cols.map(c=>(
                  <td key={c} style={{ padding:"9px 14px", fontSize:13, color:"#ccc", maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {row[c]===null?"null":String(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QueryEditor({ connId, apiFetch, notify, history, setHistory }) {
  const [sql, setSql] = useState("SELECT * FROM users LIMIT 10;");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setRunning(true); setError(""); setResult(null);
    try {
      const d = await apiFetch(`/${connId}/query`, { method:"POST", body:{ sql } });
      setResult(d);
      setHistory(h => [{ sql, time: new Date().toLocaleTimeString("ar"), rows: d.rows?.length||0 }, ...h.slice(0,19)]);
      notify(`✅ تم — ${d.rows?.length||d.affected||0} ${d.rows ? "صف" : "صف متأثر"} (${d.duration}ms)`);
    } catch(e) { setError(e.message); }
    setRunning(false);
  };

  const cols = result?.fields?.length ? result.fields : (result?.rows?.[0] ? Object.keys(result.rows[0]) : []);

  return (
    <div>
      <div style={{ background:"#111116", border:"1px solid #1e1e24", borderRadius:12, overflow:"hidden" }}>
        <div style={{ padding:"10px 14px", borderBottom:"1px solid #1e1e24", display:"flex", justifyContent:"space-between" }}>
          <span style={{ fontSize:13, color:"#555" }}>محرر SQL</span>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>setSql("")} style={styles.btnSm}>مسح</button>
            <button onClick={run} disabled={running} style={{ ...styles.btnPrimary, padding:"5px 18px", fontSize:13 }}>
              {running?"⏳":"▶"} تشغيل
            </button>
          </div>
        </div>
        <textarea value={sql} onChange={e=>setSql(e.target.value)} rows={6}
          onKeyDown={e=>{ if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();run();} }}
          style={{ width:"100%", background:"#0a0a0c", border:"none", color:"#a5b4fc", fontSize:13, padding:16, outline:"none", resize:"vertical", fontFamily:"monospace", boxSizing:"border-box" }}
          placeholder="اكتب SQL هنا... (Ctrl+Enter للتشغيل)" />
      </div>

      {error && <div style={{ marginTop:10, background:"#450a0a", border:"1px solid #dc2626", borderRadius:8, padding:"10px 14px", color:"#fca5a5", fontSize:13 }}>❌ {error}</div>}

      {result && result.rows?.length>0 && (
        <div style={{ marginTop:14, background:"#111116", border:"1px solid #1e1e24", borderRadius:12, overflow:"hidden" }}>
          <div style={{ padding:"8px 14px", borderBottom:"1px solid #1e1e24", fontSize:12, color:"#555" }}>{result.rows.length} صف — {result.duration}ms</div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr style={{ background:"#0a0a0d" }}>
                {cols.map(c=><th key={c} style={{ padding:"9px 12px", textAlign:"right", fontSize:12, color:"#555", borderBottom:"1px solid #1e1e24" }}>{c}</th>)}
              </tr></thead>
              <tbody>
                {result.rows.map((r,i)=>(
                  <tr key={i} style={{ borderBottom:"1px solid #0d0d10" }}>
                    {cols.map(c=><td key={c} style={{ padding:"8px 12px", fontSize:13, color:"#ccc" }}>{r[c]===null?"null":String(r[c])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && !result.rows?.length && (
        <div style={{ marginTop:10, background:"#052e16", border:"1px solid #166534", borderRadius:8, padding:"10px 14px", color:"#86efac", fontSize:13 }}>
          ✅ تم التنفيذ — {result.affected||0} صف متأثر ({result.duration}ms)
        </div>
      )}

      {history.length>0 && (
        <div style={{ marginTop:16 }}>
          <div style={{ fontSize:12, color:"#444", marginBottom:8 }}>سجل الاستعلامات</div>
          {history.map((h,i)=>(
            <div key={i} onClick={()=>setSql(h.sql)}
              style={{ background:"#0d0d10", border:"1px solid #1a1a1f", borderRadius:8, padding:"8px 12px", marginBottom:6, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <code style={{ fontSize:12, color:"#818cf8", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.sql}</code>
              <span style={{ fontSize:11, color:"#444", marginRight:10, whiteSpace:"nowrap" }}>{h.rows} صف • {h.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateTablePanel({ newTable, setNewTable, buildSQL, createTable, backendOk }) {
  const addCol = () => setNewTable(t=>({...t, columns:[...t.columns,{name:"",type:"VARCHAR(255)",constraints:[]}]}));
  const rmCol = i => setNewTable(t=>({...t, columns:t.columns.filter((_,j)=>j!==i)}));
  const upCol = (i,k,v) => setNewTable(t=>{const c=[...t.columns];c[i]={...c[i],[k]:v};return{...t,columns:c};});
  const togCon = (i,c) => setNewTable(t=>{
    const cols=[...t.columns];
    const cons=cols[i].constraints||[];
    cols[i]={...cols[i],constraints:cons.includes(c)?cons.filter(x=>x!==c):[...cons,c]};
    return{...t,columns:cols};
  });
  const sql = buildSQL();
  return (
    <div style={{ maxWidth:700 }}>
      <h3 style={styles.subH}>➕ إنشاء جدول جديد</h3>
      <input placeholder="اسم الجدول..." value={newTable.name}
        onChange={e=>setNewTable(t=>({...t,name:e.target.value}))}
        style={{ ...styles.input, fontSize:16, marginBottom:18 }} />
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
        <span style={{ color:"#aaa", fontSize:14 }}>الأعمدة ({newTable.columns.length})</span>
        <button onClick={addCol} style={styles.btnPrimary}>+ عمود</button>
      </div>
      {newTable.columns.map((col,i)=>(
        <div key={i} style={{ background:"#0d0d10", border:"1px solid #1a1a1f", borderRadius:10, padding:14, marginBottom:10 }}>
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            <input placeholder="اسم العمود" value={col.name} onChange={e=>upCol(i,"name",e.target.value)}
              style={{ ...styles.input, flex:1 }} />
            <select value={col.type} onChange={e=>upCol(i,"type",e.target.value)}
              style={{ background:"#111116", border:"1px solid #1e1e24", borderRadius:8, padding:"9px 12px", color:"#e5e5e5", fontSize:13, outline:"none" }}>
              {FIELD_TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
            <button onClick={()=>rmCol(i)} style={{ background:"#7f1d1d", border:"none", color:"#fff", borderRadius:8, padding:"9px 14px", cursor:"pointer" }}>✕</button>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {CONSTRAINTS.map(c=>(
              <button key={c} onClick={()=>togCon(i,c)}
                style={{ background:col.constraints?.includes(c)?"#1a2a1a":"#1a1a1f", border:`1px solid ${col.constraints?.includes(c)?"#22c55e":"#2a2a2f"}`, color:col.constraints?.includes(c)?"#22c55e":"#666", borderRadius:6, padding:"3px 10px", cursor:"pointer", fontSize:11 }}>{c}</button>
            ))}
          </div>
        </div>
      ))}
      {sql && (
        <div style={styles.sqlPreview}>
          <div style={{ fontSize:12, color:"#555", marginBottom:6 }}>معاينة SQL</div>
          <pre style={styles.code}>{sql}</pre>
        </div>
      )}
      <button onClick={createTable} disabled={!newTable.name||!newTable.columns.length||backendOk===false}
        style={{ ...styles.btnPrimary, width:"100%", padding:13, fontSize:15, marginTop:14, opacity:!newTable.name||!newTable.columns.length?0.5:1 }}>
        🚀 إنشاء الجدول في قاعدة البيانات
      </button>
    </div>
  );
}

function AIPanel({ dbName, aiPrompt, setAiPrompt, aiLoading, generatedSQL, onGenerate, onApply, onCopy }) {
  const suggestions = [
    "أنشئ جدول مستخدمين مع email وpassword وrole",
    "جداول تجارة إلكترونية كاملة (منتجات، طلبات، فئات)",
    "نظام تعليقات مع ردود متداخلة",
    "جداول نظام CRM للعملاء والصفقات",
  ];
  return (
    <div style={{ maxWidth:680 }}>
      <h3 style={{ color:"#a78bfa", fontSize:18, marginBottom:6 }}>✨ إنشاء SQL بالذكاء الاصطناعي</h3>
      <p style={{ color:"#555", fontSize:13, marginBottom:16 }}>اشرح ما تريده بالعربية وسيولّد {dbName} SQL كامل</p>
      <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:14 }}>
        {suggestions.map(s=>(
          <button key={s} onClick={()=>setAiPrompt(s)}
            style={{ background:"#1a1a2e", border:"1px solid #2d1f5e", color:"#818cf8", borderRadius:20, padding:"5px 13px", cursor:"pointer", fontSize:12 }}>{s}</button>
        ))}
      </div>
      <textarea placeholder="صف ما تريده..." value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} rows={4}
        style={{ ...styles.input, resize:"vertical", fontFamily:"inherit", fontSize:14 }} />
      <button onClick={onGenerate} disabled={aiLoading||!aiPrompt.trim()}
        style={{ ...styles.btnPrimary, width:"100%", marginTop:10, background:aiLoading?"#1a1a2e":"linear-gradient(135deg,#6d28d9,#7c3aed)", padding:12, opacity:!aiPrompt.trim()?0.5:1 }}>
        {aiLoading?"⏳ جارٍ التوليد...":"✨ ولّد SQL"}
      </button>
      {generatedSQL && (
        <div style={{ marginTop:18, background:"#0a0a0c", border:"1px solid #2d1f5e", borderRadius:12, overflow:"hidden" }}>
          <div style={{ padding:"10px 14px", borderBottom:"1px solid #1a1a2e", display:"flex", justifyContent:"space-between" }}>
            <span style={{ color:"#a78bfa", fontSize:13 }}>SQL المولّد</span>
            <button onClick={()=>onCopy(generatedSQL)} style={styles.btnSm}>نسخ</button>
          </div>
          <pre style={{ ...styles.code, padding:16, color:"#c4b5fd" }}>{generatedSQL}</pre>
          <div style={{ padding:"12px 14px", borderTop:"1px solid #1a1a2e" }}>
            <button onClick={onApply} style={{ ...styles.btnPrimary, width:"100%" }}>🚀 تطبيق وإنشاء الجداول</button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, msg }) {
  return (
    <div style={{ textAlign:"center", padding:60, color:"#333" }}>
      <div style={{ fontSize:40, marginBottom:12 }}>{icon}</div>
      <div style={{ fontSize:14 }}>{msg}</div>
    </div>
  );
}


// ─── ERD Diagram Component ──────────────────────────────────────────────────
function ERDPanel({ tables, connId, apiFetch, notify }) {
  const canvasRef = useRef(null);
  const [schemasMap, setSchemasMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [positions, setPositions] = useState({});
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x:0, y:0 });
  const [zoom, setZoom] = useState(1);
  const [relations, setRelations] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRelations, setAiRelations] = useState([]);

  const COLORS = ["#6366f1","#22c55e","#f59e0b","#ec4899","#14b8a6","#f97316","#8b5cf6","#06b6d4"];
  const CARD_W = 200;
  const ROW_H = 28;
  const HEAD_H = 40;

  // Load all schemas
  useEffect(() => {
    if (!tables.length) return;
    loadAllSchemas();
  }, [tables]);

  const loadAllSchemas = async () => {
    setLoading(true);
    const map = {};
    for (const t of tables) {
      try {
        const d = await apiFetch(`/${connId}/schema/${t.name}`);
        map[t.name] = d.columns || [];
      } catch(_) {
        map[t.name] = [];
      }
    }
    setSchemasMap(map);

    // Auto-layout: grid positions
    const pos = {};
    tables.forEach((t, i) => {
      const cols = 3;
      const col = i % cols;
      const row = Math.floor(i / cols);
      pos[t.name] = { x: 40 + col * 260, y: 40 + row * 220 };
    });
    setPositions(pos);

    // Detect FK relations by naming convention (col_name ends with _id)
    const rels = [];
    for (const [tbl, cols] of Object.entries(map)) {
      for (const col of cols) {
        if (col.name.endsWith("_id") && !col.is_pk) {
          const ref = col.name.replace(/_id$/, "");
          const refPlural = ref + "s";
          const target = Object.keys(map).find(t => t === ref || t === refPlural);
          if (target && target !== tbl) {
            rels.push({ from: tbl, fromCol: col.name, to: target, toCol: "id" });
          }
        }
      }
    }
    setRelations(rels);
    setLoading(false);
  };

  const detectWithAI = async () => {
    if (!Object.keys(schemasMap).length) return;
    setAiLoading(true);
    try {
      const schemaDesc = Object.entries(schemasMap).map(([t, cols]) =>
        `${t}: ${cols.map(c => c.name).join(", ")}`
      ).join("
");

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `حلل هذه الجداول واكتشف العلاقات بينها. أجب بـ JSON فقط بدون أي نص آخر.
الجداول:
${schemaDesc}

أجب بهذا الشكل فقط:
[{"from":"table1","fromCol":"col","to":"table2","toCol":"col","type":"one-to-many"}]`
          }]
        })
      });
      const data = await res.json();
      const text = data.content?.map(b => b.text || "").join("").trim();
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setAiRelations(parsed);
      notify(`✅ اكتشف AI ${parsed.length} علاقة`);
    } catch(e) {
      notify("خطأ في AI: " + e.message, "error");
    }
    setAiLoading(false);
  };

  const allRelations = [...relations, ...aiRelations];

  // Drag handlers
  const onMouseDown = (e, tbl) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setDragging(tbl);
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const onMouseMove = useCallback((e) => {
    if (!dragging) return;
    const container = document.getElementById("erd-canvas");
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setPositions(p => ({
      ...p,
      [dragging]: {
        x: Math.max(0, (e.clientX - rect.left) / zoom - dragOffset.x),
        y: Math.max(0, (e.clientY - rect.top) / zoom - dragOffset.y)
      }
    }));
  }, [dragging, dragOffset, zoom]);

  const onMouseUp = () => setDragging(null);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove]);

  const exportSVG = () => {
    const svg = document.getElementById("erd-svg");
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "erd-diagram.svg";
    a.click();
    notify("✅ تم تصدير ERD كـ SVG");
  };

  const getCardHeight = (tbl) => HEAD_H + ((schemasMap[tbl]?.length || 0) * ROW_H) + 10;

  // Calculate connector line between two tables
  const getLine = (rel) => {
    const fp = positions[rel.from];
    const tp = positions[rel.to];
    if (!fp || !tp) return null;
    const fx = fp.x + CARD_W;
    const fy = fp.y + HEAD_H / 2;
    const tx = tp.x;
    const ty = tp.y + HEAD_H / 2;
    const mx = (fx + tx) / 2;
    return { fx, fy, tx, ty, mx };
  };

  const tblNames = Object.keys(schemasMap);
  const svgW = Math.max(900, ...tblNames.map(t => (positions[t]?.x || 0) + CARD_W + 40));
  const svgH = Math.max(600, ...tblNames.map(t => (positions[t]?.y || 0) + getCardHeight(t) + 40));

  if (loading) return (
    <div style={{ textAlign:"center", padding:80, color:"#444" }}>
      <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
      <div>جارٍ تحميل المخططات...</div>
    </div>
  );

  if (!tblNames.length) return <EmptyState icon="🔗" msg="لا يوجد جداول لعرض ERD" />;

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
        <h3 style={{ color:"#f0c040", margin:0, fontSize:16, marginLeft:"auto" }}>🔗 ERD Diagram</h3>
        <span style={{ fontSize:12, color:"#444" }}>{tblNames.length} جدول — {allRelations.length} علاقة</span>
        <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} style={styles.btnSm}>+</button>
        <button onClick={() => setZoom(z => Math.max(0.4, z - 0.1))} style={styles.btnSm}>−</button>
        <button onClick={() => setZoom(1)} style={styles.btnSm}>{Math.round(zoom*100)}%</button>
        <button onClick={loadAllSchemas} style={styles.btnSm}>↻ تحديث</button>
        <button onClick={detectWithAI} disabled={aiLoading}
          style={{ ...styles.btnSm, background:"linear-gradient(135deg,#6d28d9,#7c3aed)", color:"#fff", border:"none" }}>
          {aiLoading ? "⏳" : "✨ AI كشف العلاقات"}
        </button>
        <button onClick={exportSVG} style={{ ...styles.btnSm, color:"#22c55e", borderColor:"#166534" }}>⬇ SVG</button>
      </div>

      {/* Canvas */}
      <div id="erd-canvas" style={{ overflow:"auto", background:"#080809", border:"1px solid #1e1e24", borderRadius:12, cursor: dragging ? "grabbing" : "default" }}>
        <div style={{ transform:`scale(${zoom})`, transformOrigin:"top right", width:svgW, height:svgH }}>
          <svg id="erd-svg" width={svgW} height={svgH} style={{ position:"absolute", top:0, right:0, pointerEvents:"none" }}>
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#f0c040" />
              </marker>
              <marker id="arrow-many" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
                <path d="M0,0 L10,5 L0,10 M5,0 L5,10" stroke="#f0c040" fill="none" strokeWidth="1.5"/>
              </marker>
            </defs>
            {/* Grid dots */}
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="#1a1a1f" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Relation lines */}
            {allRelations.map((rel, i) => {
              const line = getLine(rel);
              if (!line) return null;
              const { fx, fy, tx, ty, mx } = line;
              return (
                <g key={i}>
                  <path
                    d={`M${fx},${fy} C${mx},${fy} ${mx},${ty} ${tx},${ty}`}
                    stroke="#f0c040" strokeWidth="1.5" fill="none" strokeDasharray="5,3"
                    markerEnd="url(#arrow)" opacity="0.7"
                  />
                  <text x={mx} y={(fy+ty)/2 - 6} fill="#f0c040" fontSize="10" textAnchor="middle" opacity="0.8">
                    {rel.type || "FK"}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Table Cards */}
          {tblNames.map((tbl, ti) => {
            const pos = positions[tbl] || { x: 40, y: 40 };
            const cols = schemasMap[tbl] || [];
            const color = COLORS[ti % COLORS.length];
            const cardH = getCardHeight(tbl);

            return (
              <div key={tbl}
                onMouseDown={(e) => onMouseDown(e, tbl)}
                style={{
                  position:"absolute", left:pos.x, top:pos.y,
                  width:CARD_W, cursor:"grab", userSelect:"none",
                  background:"#111116", border:`2px solid ${color}`,
                  borderRadius:10, overflow:"hidden", boxShadow:`0 4px 20px ${color}33`,
                  zIndex: dragging===tbl ? 10 : 1
                }}>
                {/* Header */}
                <div style={{ background:color, padding:"8px 12px", display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:14 }}>📋</span>
                  <span style={{ fontWeight:700, fontSize:13, color:"#fff" }}>{tbl}</span>
                  <span style={{ marginRight:"auto", fontSize:10, color:"rgba(255,255,255,0.7)" }}>{cols.length} عمود</span>
                </div>
                {/* Columns */}
                {cols.map((col, ci) => (
                  <div key={ci} style={{
                    padding:"4px 12px", borderBottom:"1px solid #1a1a1f",
                    display:"flex", alignItems:"center", gap:6, height:ROW_H
                  }}>
                    {col.is_pk && <span style={{ fontSize:10 }}>🔑</span>}
                    {!col.is_pk && col.name.endsWith("_id") && <span style={{ fontSize:10 }}>🔗</span>}
                    {!col.is_pk && !col.name.endsWith("_id") && <span style={{ fontSize:10, color:"#333" }}>•</span>}
                    <span style={{ fontSize:12, color: col.is_pk ? "#f0c040" : "#ccc", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{col.name}</span>
                    <span style={{ fontSize:10, color:"#444", whiteSpace:"nowrap" }}>{col.type?.split("(")[0]}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:"flex", gap:16, marginTop:12, fontSize:12, color:"#555" }}>
        <span>🔑 Primary Key</span>
        <span>🔗 Foreign Key</span>
        <span style={{ color:"#f0c040" }}>── علاقة مكتشفة</span>
        <span style={{ color:"#555" }}>اسحب الجداول لإعادة الترتيب</span>
      </div>
    </div>
  );
}


// ─── Health Monitor Component ────────────────────────────────────────────────
function HealthPanel({ tables, connId, apiFetch, notify, selectedDB }) {
  const [stats, setStats]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [aiTips, setAiTips]     = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState(null);

  useEffect(() => { if (tables.length) runHealthCheck(); }, [tables]);

  const runHealthCheck = async () => {
    setLoading(true);
    const result = [];
    for (const t of tables) {
      try {
        const dataRes = await apiFetch(`/${connId}/data/${t.name}?limit=1&offset=0`);
        const schemaRes = await apiFetch(`/${connId}/schema/${t.name}`);
        const cols = schemaRes.columns || [];
        const rowCount = dataRes.total || 0;
        const hasPK = cols.some(c => c.is_pk);
        const hasCreatedAt = cols.some(c => c.name.includes("created_at") || c.name.includes("created"));
        const fkCols = cols.filter(c => c.name.endsWith("_id") && !c.is_pk);
        const colCount = cols.length;

        // Health score
        let score = 100;
        const issues = [];
        const tips = [];

        if (!hasPK) { score -= 30; issues.push({ sev:"error", msg:"لا يوجد Primary Key" }); }
        if (rowCount > 100000 && fkCols.length === 0 && colCount > 5) {
          score -= 15; issues.push({ sev:"warn", msg:"جدول كبير بدون Foreign Keys" });
        }
        if (!hasCreatedAt) { score -= 10; tips.push("أضف عمود created_at للتتبع"); }
        if (colCount > 20) { score -= 10; issues.push({ sev:"warn", msg:`${colCount} عمود — فكّر في تقسيم الجدول` }); }
        if (rowCount === 0) { tips.push("الجدول فارغ"); }
        if (colCount === 0) { score -= 40; issues.push({ sev:"error", msg:"لا يوجد أعمدة" }); }

        result.push({
          name: t.name,
          rowCount,
          colCount,
          hasPK,
          hasCreatedAt,
          fkCount: fkCols.length,
          score: Math.max(0, score),
          issues,
          tips,
          size: t.size || "—"
        });
      } catch(e) {
        result.push({ name: t.name, rowCount: 0, colCount: 0, score: 0, issues:[{ sev:"error", msg: e.message }], tips:[], fkCount:0, hasPK:false });
      }
    }
    setStats(result);
    setLastCheck(new Date().toLocaleTimeString("ar"));
    setLoading(false);
  };

  const getAITips = async () => {
    if (!stats.length) return;
    setAiLoading(true); setAiTips("");
    try {
      const summary = stats.map(s =>
        `جدول "${s.name}": ${s.rowCount} صف، ${s.colCount} عمود، score=${s.score}، مشاكل: ${s.issues.map(i=>i.msg).join("، ") || "لا يوجد"}`
      ).join("
");

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 1000,
          messages: [{ role: "user", content:
            `أنت خبير قواعد بيانات. حلّل هذا التقرير وأعطِ توصيات عملية بالعربية (5 نقاط كحد أقصى، كن محدداً ومختصراً):
${summary}`
          }]
        })
      });
      const d = await res.json();
      setAiTips(d.content?.map(b=>b.text||"").join("").trim());
    } catch(e) { notify("خطأ في AI","error"); }
    setAiLoading(false);
  };

  const scoreColor = (s) => s >= 80 ? "#22c55e" : s >= 50 ? "#f59e0b" : "#ef4444";
  const scoreLabel = (s) => s >= 80 ? "ممتاز" : s >= 50 ? "متوسط" : "ضعيف";

  const totalRows = stats.reduce((a,s) => a + s.rowCount, 0);
  const avgScore  = stats.length ? Math.round(stats.reduce((a,s) => a + s.score, 0) / stats.length) : 0;
  const issues    = stats.flatMap(s => s.issues).length;

  return (
    <div>
      {/* Top bar */}
      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:16, flexWrap:"wrap" }}>
        <h3 style={{ color:"#f0c040", margin:0, fontSize:16 }}>❤️ Database Health Monitor</h3>
        {lastCheck && <span style={{ fontSize:11, color:"#444" }}>آخر فحص: {lastCheck}</span>}
        <button onClick={runHealthCheck} disabled={loading}
          style={{ ...styles.btnSm, marginRight:"auto" }}>{loading?"⏳ فحص...":"↻ فحص الآن"}</button>
        <button onClick={getAITips} disabled={aiLoading||!stats.length}
          style={{ ...styles.btnSm, background:"linear-gradient(135deg,#6d28d9,#7c3aed)", color:"#fff", border:"none" }}>
          {aiLoading?"⏳":"✨"} توصيات AI
        </button>
      </div>

      {/* Summary cards */}
      {stats.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:18 }}>
          {[
            { label:"إجمالي الجداول", value:stats.length, icon:"📋", color:"#6366f1" },
            { label:"إجمالي الصفوف", value:totalRows.toLocaleString("ar"), icon:"📊", color:"#22c55e" },
            { label:"متوسط الصحة", value:avgScore+"%", icon:"❤️", color:scoreColor(avgScore) },
            { label:"مشاكل مكتشفة", value:issues, icon:"⚠️", color: issues>0?"#ef4444":"#22c55e" },
          ].map(c => (
            <div key={c.label} style={{ background:"#111116", border:`1px solid ${c.color}33`, borderRadius:12, padding:"14px 16px" }}>
              <div style={{ fontSize:22, marginBottom:6 }}>{c.icon}</div>
              <div style={{ fontSize:22, fontWeight:700, color:c.color }}>{c.value}</div>
              <div style={{ fontSize:11, color:"#555", marginTop:2 }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* AI Tips */}
      {aiTips && (
        <div style={{ background:"#1a1a2e", border:"1px solid #4c1d95", borderRadius:12, padding:16, marginBottom:18 }}>
          <div style={{ color:"#a78bfa", fontSize:14, fontWeight:600, marginBottom:10 }}>✨ توصيات الذكاء الاصطناعي</div>
          <div style={{ color:"#c4b5fd", fontSize:13, lineHeight:1.8, whiteSpace:"pre-wrap" }}>{aiTips}</div>
        </div>
      )}

      {loading && <div style={{ textAlign:"center", padding:60, color:"#444" }}>⏳ جارٍ فحص قواعد البيانات...</div>}

      {/* Table health cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:14 }}>
        {stats.map(s => (
          <div key={s.name} style={{ background:"#111116", border:`1px solid ${scoreColor(s.score)}33`, borderRadius:12, overflow:"hidden" }}>
            {/* Header */}
            <div style={{ padding:"12px 16px", borderBottom:"1px solid #1a1a1f", display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:18 }}>📋</span>
              <span style={{ fontWeight:700, fontSize:14, flex:1 }}>{s.name}</span>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ width:36, height:36, borderRadius:"50%", background:`${scoreColor(s.score)}22`, border:`2px solid ${scoreColor(s.score)}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:scoreColor(s.score) }}>
                  {s.score}
                </div>
              </div>
            </div>

            {/* Score bar */}
            <div style={{ height:3, background:"#1a1a1f" }}>
              <div style={{ height:"100%", width:`${s.score}%`, background:scoreColor(s.score), transition:"width .5s" }} />
            </div>

            {/* Stats */}
            <div style={{ padding:"12px 16px" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:12 }}>
                {[
                  { l:"الصفوف", v: s.rowCount.toLocaleString("ar") },
                  { l:"الأعمدة", v: s.colCount },
                  { l:"الحالة", v: scoreLabel(s.score) },
                ].map(m => (
                  <div key={m.l} style={{ background:"#0d0d10", borderRadius:8, padding:"8px 10px", textAlign:"center" }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#e5e5e5" }}>{m.v}</div>
                    <div style={{ fontSize:10, color:"#555", marginTop:2 }}>{m.l}</div>
                  </div>
                ))}
              </div>

              {/* Badges */}
              <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:10 }}>
                <span style={{ fontSize:11, padding:"2px 8px", borderRadius:4, background: s.hasPK?"#1a2a1a":"#2a1a1a", color: s.hasPK?"#22c55e":"#ef4444" }}>
                  {s.hasPK?"✅ PK":"❌ بدون PK"}
                </span>
                <span style={{ fontSize:11, padding:"2px 8px", borderRadius:4, background:"#1a1a2e", color:"#818cf8" }}>
                  🔗 {s.fkCount} FK
                </span>
                {s.hasCreatedAt && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:4, background:"#1a2a1a", color:"#22c55e" }}>✅ created_at</span>}
                {s.size !== "—" && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:4, background:"#111", color:"#555" }}>💾 {s.size}</span>}
              </div>

              {/* Issues */}
              {s.issues.map((issue, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 10px", borderRadius:6, marginBottom:4, background: issue.sev==="error"?"#450a0a":"#451a03", border:`1px solid ${issue.sev==="error"?"#7f1d1d":"#78350f"}` }}>
                  <span style={{ fontSize:12 }}>{issue.sev==="error"?"❌":"⚠️"}</span>
                  <span style={{ fontSize:12, color: issue.sev==="error"?"#fca5a5":"#fcd34d" }}>{issue.msg}</span>
                </div>
              ))}
              {s.tips.map((tip, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 10px", borderRadius:6, marginBottom:4, background:"#0c1a0c", border:"1px solid #1a3a1a" }}>
                  <span style={{ fontSize:12 }}>💡</span>
                  <span style={{ fontSize:12, color:"#86efac" }}>{tip}</span>
                </div>
              ))}
              {!s.issues.length && !s.tips.length && (
                <div style={{ fontSize:12, color:"#22c55e", textAlign:"center", padding:"6px 0" }}>✅ لا توجد مشاكل</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Utils ──────────────────────────────────────────────────────────────────
function schemaToSQL(table, cols) {
  const lines = cols.map(c =>
    `  ${c.name} ${c.type}${c.is_nullable==="NO"?" NOT NULL":""}${c.is_pk?" PRIMARY KEY":""}${c.column_default&&c.column_default!=="null"?` DEFAULT ${c.column_default}`:""}`
  ).join(",\n");
  return `CREATE TABLE ${table} (\n${lines}\n);`;
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = {
  root: { fontFamily:"'Segoe UI',Tahoma,sans-serif", background:"#080809", minHeight:"100vh", color:"#e5e5e5" },
  header: { background:"#0d0d10", borderBottom:"1px solid #1a1a1f", padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 },
  brandName: { fontSize:18, fontWeight:700, color:"#f0c040" },
  brandSub:  { fontSize:11, color:"#444" },
  badge: (c) => ({ display:"flex", alignItems:"center", gap:6, background:"#111116", border:`1px solid ${c}22`, color:c, fontSize:12, padding:"4px 10px", borderRadius:20 }),
  btnSm: { background:"#111116", border:"1px solid #2a2a2f", color:"#888", padding:"5px 12px", borderRadius:6, cursor:"pointer", fontSize:12 },
  btnXS: { background:"#f0c040", border:"none", color:"#000", padding:"3px 10px", borderRadius:6, cursor:"pointer", fontSize:11, fontWeight:700 },
  btnPrimary: { background:"#f0c040", border:"none", color:"#000", padding:"8px 18px", borderRadius:8, cursor:"pointer", fontSize:14, fontWeight:700 },
  btnAI: { width:"100%", background:"linear-gradient(135deg,#6d28d9,#7c3aed)", border:"none", color:"#fff", borderRadius:8, padding:"9px", cursor:"pointer", fontSize:13, fontWeight:600 },
  back: { background:"none", border:"none", color:"#555", cursor:"pointer", marginBottom:14, fontSize:13, display:"block" },
  card: { background:"#111116", border:"1px solid #1e1e24", borderRadius:16, padding:26 },
  label: { fontSize:13, color:"#888", display:"block", marginBottom:5 },
  input: { width:"100%", background:"#0d0d10", border:"1px solid #1e1e24", borderRadius:8, padding:"9px 13px", color:"#e5e5e5", fontSize:13, outline:"none", boxSizing:"border-box" },
  heading: { color:"#f0c040", fontSize:22, marginBottom:8 },
  subH:    { color:"#f0c040", fontSize:16, margin:"0 0 14px" },
  warning: { background:"#1c0a00", border:"1px solid #92400e", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#fcd34d", marginBottom:20 },
  dbGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:12 },
  dbCard: (c) => ({ background:"#111116", border:"1px solid #1e1e24", borderRadius:12, padding:"18px 14px", cursor:"pointer", transition:"border-color .15s", textAlign:"center" }),
  sidebar: { background:"#111116", border:"1px solid #1e1e24", borderRadius:12, overflow:"hidden" },
  sidebarHeader: { padding:"12px 12px", borderBottom:"1px solid #1e1e24", display:"flex", justifyContent:"space-between", alignItems:"center" },
  tableRow: (active) => ({ padding:"9px 12px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between", borderRight: active?"3px solid #f0c040":"3px solid transparent", background:active?"#1a1a2e":"transparent", color:active?"#f0c040":"#999", transition:"background .1s" }),
  tabBar: { display:"flex", gap:4, marginBottom:16, flexWrap:"wrap" },
  tabBtn: (active) => ({ background:active?"#f0c040":"#111116", border:`1px solid ${active?"#f0c040":"#1e1e24"}`, color:active?"#000":"#888", borderRadius:8, padding:"7px 14px", cursor:"pointer", fontSize:12, fontWeight:active?700:400 }),
  grid3: { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:12 },
  tableCard: { background:"#111116", border:"1px solid #1e1e24", borderRadius:12, padding:18, cursor:"pointer", transition:"border-color .15s", textAlign:"center" },
  tableCardNew: { background:"#080809", border:"2px dashed #1e1e24", borderRadius:12, padding:18, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:100, color:"#333", transition:"all .15s" },
  sqlPreview: { marginTop:14, background:"#0a0a0c", border:"1px solid #1a1a1f", borderRadius:10, padding:14 },
  code: { color:"#a5b4fc", fontSize:12, margin:0, overflowX:"auto", whiteSpace:"pre-wrap" },
};
