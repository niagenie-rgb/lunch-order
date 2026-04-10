import { useState, useEffect } from "react";
import { collection, getDocs, query, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

export default function HistoryPage({ navigate }) {
  const [sessions, setSessions] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [expandedData, setExpandedData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const q = query(collection(db, "sessions"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    })();
  }, []);

  const toggleExpand = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (expandedData[id]) return;
    const ordersSnap = await getDocs(collection(db, "sessions", id, "orders"));
    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    setExpandedData(prev => ({ ...prev, [id]: orders }));
  };

  if (loading) return <div className="loading">載入中...</div>;

  return (
    <div className="page">
      <div className="top-bar">
        <button className="btn btn-icon" onClick={() => navigate("home")}>←</button>
        <h1>歷史訂單</h1>
      </div>

      {sessions.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📭</div>
          <p>還沒有任何訂單紀錄</p>
        </div>
      ) : (
        sessions.map(sess => {
          const isOpen = expanded === sess.id;
          const orders = expandedData[sess.id] || [];
          const total = orders.reduce((s, o) => s + (o.total || 0), 0);
          const paidCount = orders.filter(o => o.paid).length;

          return (
            <div key={sess.id} className="card" style={{ marginBottom: 12 }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                onClick={() => toggleExpand(sess.id)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{sess.restaurantName}</div>
                  <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>
                    📅 {sess.date}
                    {sess.drinkName ? ` · 🧋 ${sess.drinkName}` : ""}
                  </div>
                </div>
                <span className={`badge ${sess.status === "closed" ? "badge-gray" : "badge-green"}`}>
                  {sess.status === "closed" ? "已結單" : "進行中"}
                </span>
                <span style={{ color: "var(--text3)", fontSize: 18, transition: "transform 0.2s", display: "inline-block", transform: isOpen ? "rotate(90deg)" : "none" }}>›</span>
              </div>

              {isOpen && (
                <div style={{ marginTop: 14, borderTop: "1.5px solid var(--border)", paddingTop: 14 }}>
                  {orders.length === 0 ? (
                    <p style={{ color: "var(--text3)", fontSize: 13 }}>無訂單紀錄</p>
                  ) : (
                    <>
                      {orders.map(order => {
                        const personTotal = (order.foodItems || []).reduce((s, i) => s + i.price * i.qty, 0)
                          + (order.drinkItems || []).reduce((s, i) => s + i.price * i.qty, 0);
                        return (
                          <div key={order.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--bg2)", fontSize: 14 }}>
                            <div>
                              <span style={{ fontWeight: 600 }}>{order.userName}</span>
                              <span style={{ color: "var(--text2)", fontSize: 12, marginLeft: 8 }}>
                                {[...(order.foodItems||[]), ...(order.drinkItems||[])].map(i => `${i.name}×${i.qty}`).join("、")}
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ fontWeight: 700, color: "var(--accent)" }}>$ {personTotal}</span>
                              <span className={`badge ${order.paid ? "badge-green" : "badge-red"}`} style={{ fontSize: 11, padding: "2px 8px" }}>
                                {order.paid ? "已付" : "未付"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontWeight: 700, fontSize: 14 }}>
                        <span>共 {orders.length} 人・收款 {paidCount}/{orders.length}</span>
                        <span style={{ color: "var(--accent)" }}>合計 $ {total}</span>
                      </div>
                    </>
                  )}

                  {sess.status === "open" && (
                    <button
                      className="btn btn-outline"
                      style={{ marginTop: 12 }}
                      onClick={() => navigate("organizer", sess.id, null)}
                    >
                      繼續管理這張訂單
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
