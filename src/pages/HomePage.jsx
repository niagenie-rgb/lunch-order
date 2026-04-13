export default function HomePage({ navigate }) {
  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", minHeight: "100vh", paddingTop: 60 }}>
      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{
          width: 72, height: 72, background: "var(--accent)", borderRadius: 20,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 36, margin: "0 auto 16px"
        }}>🍱</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>午餐快點</h1>
        <p style={{ color: "var(--text2)", fontSize: 15, marginTop: 6 }}>辦公室訂餐神器</p>
      </div>

      {/* Main actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        {/* 發起人 */}
        <button className="card" onClick={() => navigate("organizer")} style={{
          textAlign: "left", cursor: "pointer", border: "1.5px solid var(--border)",
          transition: "all 0.15s", background: "white", padding: "18px"
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 46, height: 46, background: "#FFF0EB", borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🧑‍💼</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>我是午餐發起人</div>
              <div style={{ color: "var(--text2)", fontSize: 13, marginTop: 2 }}>選餐廳、產生連結、管理訂單</div>
            </div>
            <div style={{ marginLeft: "auto", color: "var(--text3)", fontSize: 20 }}>›</div>
          </div>
        </button>

        {/* 菜單庫 */}
        <button className="card" onClick={() => navigate("menumanager")} style={{
          textAlign: "left", cursor: "pointer", border: "1.5px solid var(--border)",
          transition: "all 0.15s", background: "white", padding: "18px"
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--green)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 46, height: 46, background: "var(--green-bg)", borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🗂️</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>菜單庫管理</div>
              <div style={{ color: "var(--text2)", fontSize: 13, marginTop: 2 }}>新增、編輯餐廳和飲料店菜單</div>
            </div>
            <div style={{ marginLeft: "auto", color: "var(--text3)", fontSize: 20 }}>›</div>
          </div>
        </button>

        {/* 歷史訂單 */}
        <button className="card" onClick={() => navigate("history")} style={{
          textAlign: "left", cursor: "pointer", border: "1.5px solid var(--border)",
          transition: "all 0.15s", background: "white", padding: "18px"
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--purple)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 46, height: 46, background: "var(--purple-bg)", borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>📋</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>歷史訂單</div>
              <div style={{ color: "var(--text2)", fontSize: 13, marginTop: 2 }}>查閱近7天的訂餐紀錄</div>
            </div>
            <div style={{ marginLeft: "auto", color: "var(--text3)", fontSize: 20 }}>›</div>
          </div>
        </button>

      </div>

      <div style={{ marginTop: "auto", paddingTop: 32, textAlign: "center" }}>
        <p style={{ fontSize: 12, color: "var(--text3)" }}>收到朋友的點餐連結？直接點擊連結即可開始點餐 🙌</p>
      </div>
    </div>
  );
}
