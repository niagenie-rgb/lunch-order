import { useState, useEffect } from "react";
import {
  collection, getDocs, query, orderBy,
  doc, deleteDoc, writeBatch
} from "firebase/firestore";
import { db } from "../firebase";

export default function HistoryPage({ navigate }) {
  const [sessions, setSessions] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [expandedData, setExpandedData] = useState({});
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    loadAndClean();
  }, []);

  const loadAndClean = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "sessions"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Auto-delete sessions older than 7 days
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const toDelete = all.filter(s => {
        const createdMs = s.createdAt?.seconds ? s.createdAt.seconds * 1000 : 0;
        return createdMs > 0 && createdMs < sevenDaysAgo;
      });

      if (toDelete.length > 0) {
        setCleaning(true);
        for (const s of toDelete) {
          // Delete all orders in this session first
          const ordersSnap = await getDocs(collection(db, "sessions", s.id, "orders"));
          for (const orderDoc of ordersSnap.docs) {
            await deleteDoc(doc(db, "sessions", s.id, "orders", orderDoc.id));
          }
          // Then delete the session
          await deleteDoc(doc(db, "sessions", s.id));
        }
        setCleaning(false);
      }

      // Show remaining sessions (newer than 7 days)
      const recent = all.filter(s => {
        const createdMs = s.createdAt?.seconds ? s.createdAt.seconds * 1000 : 0;
        return createdMs === 0 || createdMs >= sevenDaysAgo;
      });
      setSessions(recent);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const toggleExpand = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (expandedData[id]) return;
    const ordersSnap = await getDocs(collection(db, "sessions", id, "orders"));
    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    setExpandedData(prev => ({ ...prev, [id]: orders }));
  };

  const deleteSession = async (id, e) => {
    e.stopPropagation(); // 避免觸發展開
    if (!window.confirm("確定要刪除這筆訂單嗎？")) return;
    const ordersSnap = await getDocs(collection(db, "sessions", id, "orders"));
    for (const orderDoc of ordersSnap.docs) {
      await deleteDoc(doc(db, "sessions", id, "orders", orderDoc.id));
    }
    await deleteDoc(doc(db, "sessions", id));
    setSessions(prev => prev.filter(s => s.id !== id));
    if (expanded === id) setExpanded(null);
  };

  const formatDate = (session) => {
    if (session.date) return session.date;
    if (session.createdAt?.seconds) {
      return new Date(session.createdAt.seconds * 1000).toLocaleDateString("zh-TW");
    }
    return "";
  };

  const daysAgo = (session) => {
    if (!session.createdAt?.seconds) return "";
    const diff = Date.now() - session.createdAt.seconds * 1000;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    if (days === 0) return "今天";
    if (days === 1) return "昨天";
    return `${days} 天前`;
  };

  if (loading) return <div className="loading">{cleaning ? "清理過期訂單中..." : "載入中..."}</div>;

  return (
    <div className="page">
      <div className="top-bar">
        <button className="btn btn-icon" onClick={() => navigate("home")}>←</button>
        <h1>歷史訂單</h1>
      </div>

      <div className="card" style={{ background: "var(--bg2)", marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: "var(--text2)" }}>
          📅 顯示近 7 天的訂單，超過 7 天自動刪除
        </p>
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
              <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                onClick={() => toggleExpand(sess.id)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{sess.restaurantName}</div>
                  <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>
                    📅 {formatDate(sess)}
                    {sess.drinkName ? ` · 🧋 ${sess.drinkName}` : ""}
                    <span style={{ marginLeft: 8, color: "var(--text3)" }}>{daysAgo(sess)}</span>
                  </div>
                </div>
                <span className={`badge ${sess.status === "closed" ? "badge-gray" : "badge-green"}`} style={{ flexShrink: 0 }}>
                  {sess.status === "closed" ? "已結單" : "進行中"}
                </span>
                <button
                  onClick={(e) => deleteSession(sess.id, e)}
                  style={{ background: "var(--red-bg)", color: "var(--red)", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer", flexShrink: 0, fontFamily: "inherit" }}
                >刪除</button>
                <span style={{ color: "var(--text3)", fontSize: 18, transition: "transform 0.2s", display: "inline-block", transform: isOpen ? "rotate(90deg)" : "none", flexShrink: 0 }}>›</span>
              </div>

              {isOpen && (
                <div style={{ marginTop: 14, borderTop: "1.5px solid var(--border)", paddingTop: 14 }}>
                  {orders.length === 0 ? (
                    <p style={{ color: "var(--text3)", fontSize: 13 }}>無訂單紀錄</p>
                  ) : (
                    <>
                      {orders.map(order => {
                        const personTotal =
                          (order.foodItems || []).reduce((s, i) => s + i.price * i.qty, 0) +
                          (order.drinkItems || []).reduce((s, i) => s + i.price * i.qty, 0);
                        return (
                          <div key={order.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--bg2)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontWeight: 600 }}>{order.userName}</span>
                                <div style={{ color: "var(--text2)", fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {(order.foodItems || []).map(i => `${i.name}×${i.qty}`).join("、")}
                                  {(order.drinkItems || []).length > 0 && (order.foodItems || []).length > 0 && "、"}
                                  {(order.drinkItems || []).map(i => `${i.name}×${i.qty}(${i.sugar || ""}/${i.ice || ""})`).join("、")}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, marginLeft: 8 }}>
                                <span style={{ fontWeight: 700, color: "var(--accent)" }}>$ {personTotal}</span>
                                <span className={`badge ${order.paid ? "badge-green" : "badge-red"}`} style={{ fontSize: 11, padding: "2px 8px" }}>
                                  {order.paid ? "已付" : "未付"}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontWeight: 700, fontSize: 14 }}>
                        <span>共 {orders.length} 人 · 收款 {paidCount}/{orders.length}</span>
                        <span style={{ color: "var(--accent)" }}>合計 $ {total}</span>
                      </div>
                    </>
                  )}

                  {sess.status === "open" && (
                    <button className="btn btn-outline" style={{ marginTop: 12 }}
                      onClick={() => navigate("organizer", sess.id, null)}>
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
