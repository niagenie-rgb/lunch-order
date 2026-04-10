import { useState, useEffect } from "react";
import {
  doc, getDoc, collection, query, where, getDocs, onSnapshot
} from "firebase/firestore";
import { db } from "../firebase";

export default function MyOrderPage({ navigate, sessionId, userId }) {
  const [session, setSession] = useState(null);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId || !userId) { setLoading(false); return; }

    (async () => {
      const sessSnap = await getDoc(doc(db, "sessions", sessionId));
      if (sessSnap.exists()) setSession({ id: sessSnap.id, ...sessSnap.data() });
    })();

    const q = query(
      collection(db, "sessions", sessionId, "orders"),
      where("userId", "==", userId)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setOrder({ id: snap.docs[0].id, ...snap.docs[0].data() });
      }
      setLoading(false);
    });

    return () => unsub();
  }, [sessionId, userId]);

  if (loading) return <div className="loading">載入中...</div>;

  if (!order) return (
    <div className="page">
      <div className="top-bar">
        <button className="btn btn-icon" onClick={() => navigate("home")}>←</button>
        <h1>我的訂單</h1>
      </div>
      <div className="empty">
        <div className="empty-icon">🤔</div>
        <p>找不到你的訂單</p>
        <p style={{ marginTop: 8 }}>
          <button className="btn btn-outline" onClick={() => navigate("order", sessionId, userId)}>
            重新點餐
          </button>
        </p>
      </div>
    </div>
  );

  const isClosed = session?.status === "closed";
  const canEdit = !isClosed;

  const foodTotal = (order.foodItems || []).reduce((s, i) => s + i.price * i.qty, 0);
  const drinkTotal = (order.drinkItems || []).reduce((s, i) => s + i.price * i.qty, 0);
  const total = foodTotal + drinkTotal;

  return (
    <div className="page">
      <div className="top-bar">
        <button className="btn btn-icon" onClick={() => navigate("home")}>←</button>
        <h1>我的訂單</h1>
        {order.paid
          ? <span className="badge badge-green">已繳費</span>
          : <span className="badge badge-amber">待繳費</span>
        }
      </div>

      <div className="card" style={{ background: "var(--green-bg)", border: "1.5px solid #8DD4B0" }}>
        <div style={{ fontWeight: 700 }}>{session?.restaurantName}</div>
        <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2 }}>📅 {session?.date}</div>
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13 }}>👤 {order.userName}</span>
          {isClosed
            ? <span className="badge badge-gray">已結單</span>
            : <span className="badge badge-green">可修改</span>
          }
        </div>
      </div>

      <div className="card">
        <div className="card-title">訂單明細</div>
        {(order.foodItems || []).map((item, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--bg2)", fontSize: 14 }}>
            <span>{item.name} × {item.qty}</span>
            <span style={{ fontWeight: 600 }}>$ {item.price * item.qty}</span>
          </div>
        ))}
        {(order.drinkItems || []).map((item, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--bg2)", fontSize: 14 }}>
            <span>{item.name} × {item.qty}</span>
            <span style={{ fontWeight: 600, color: "var(--purple)" }}>$ {item.price * item.qty}</span>
          </div>
        ))}
        {order.note && (
          <p style={{ fontSize: 12, color: "var(--text2)", marginTop: 8 }}>📝 備註：{order.note}</p>
        )}
        <div className="price-total">
          <span className="label">合計</span>
          <span className="amount">$ {total}</span>
        </div>
      </div>

      {!order.paid && (
        <div className="card" style={{ background: "var(--amber-bg)", border: "1.5px solid #F0C060" }}>
          <p style={{ fontSize: 14, color: "var(--amber)", fontWeight: 600 }}>
            💰 請向發起人繳交 $ {total}
          </p>
        </div>
      )}

      {canEdit && (
        <button
          className="btn btn-outline"
          onClick={() => navigate("order", sessionId, userId)}
        >
          ✏️ 修改訂單
        </button>
      )}
    </div>
  );
}
