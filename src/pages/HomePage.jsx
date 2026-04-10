import { useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../firebase";

export default function HomePage({ navigate }) {
  const [loading, setLoading] = useState(false);

  const goOrganizer = () => {
    navigate("organizer", null, null);
  };

  const goHistory = async () => {
    navigate("history", null, null);
  };

  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", minHeight: "100vh", paddingTop: 60 }}>
      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          width: 72, height: 72,
          background: "var(--accent)",
          borderRadius: 20,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 36, margin: "0 auto 16px"
        }}>🍱</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>午餐快點</h1>
        <p style={{ color: "var(--text2)", fontSize: 15, marginTop: 6 }}>辦公室訂餐神器</p>
      </div>

      {/* Role cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <button
          className="card"
          onClick={goOrganizer}
          style={{
            textAlign: "left", cursor: "pointer",
            border: "1.5px solid var(--border)",
            transition: "all 0.15s",
            background: "white",
            padding: "20px"
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 48, height: 48,
              background: "#FFF0EB",
              borderRadius: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, flexShrink: 0
            }}>🧑‍💼</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>我是午餐發起人</div>
              <div style={{ color: "var(--text2)", fontSize: 13, marginTop: 3 }}>選餐廳、產生連結、管理訂單</div>
            </div>
            <div style={{ marginLeft: "auto", color: "var(--text3)", fontSize: 20 }}>›</div>
          </div>
        </button>

        <button
          className="card"
          onClick={goHistory}
          style={{
            textAlign: "left", cursor: "pointer",
            border: "1.5px solid var(--border)",
            transition: "all 0.15s",
            background: "white",
            padding: "20px"
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--purple)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 48, height: 48,
              background: "var(--purple-bg)",
              borderRadius: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, flexShrink: 0
            }}>📋</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>查看歷史訂單</div>
              <div style={{ color: "var(--text2)", fontSize: 13, marginTop: 3 }}>查閱過去的訂餐紀錄</div>
            </div>
            <div style={{ marginLeft: "auto", color: "var(--text3)", fontSize: 20 }}>›</div>
          </div>
        </button>
      </div>

      <div style={{ marginTop: "auto", paddingTop: 40, textAlign: "center" }}>
        <p style={{ fontSize: 12, color: "var(--text3)" }}>收到朋友的點餐連結？直接點擊連結即可開始點餐 🙌</p>
      </div>
    </div>
  );
}
