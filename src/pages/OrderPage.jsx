import { useState, useEffect } from "react";
import {
  doc, getDoc, addDoc, collection,
  query, where, getDocs, updateDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase";

function Toast({ msg }) {
  return msg ? <div className="toast">{msg}</div> : null;
}

export default function OrderPage({ navigate, sessionId, userId, setUserId }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState("name"); // name → food → drink → confirm
  const [userName, setUserName] = useState("");
  const [foodSelections, setFoodSelections] = useState({});
  const [drinkSelections, setDrinkSelections] = useState({});
  const [note, setNote] = useState("");
  const [toast, setToast] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [existingOrderId, setExistingOrderId] = useState(null);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      const snap = await getDoc(doc(db, "sessions", sessionId));
      if (snap.exists()) setSession({ id: snap.id, ...snap.data() });
      setLoading(false);
    })();
  }, [sessionId]);

  // If userId, try to load existing order
  useEffect(() => {
    if (!sessionId || !userId) return;
    (async () => {
      const q = query(
        collection(db, "sessions", sessionId, "orders"),
        where("userId", "==", userId)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const existing = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setExistingOrderId(existing.id);
        setUserName(existing.userName || "");
        setNote(existing.note || "");
        // Restore selections
        const food = {};
        (existing.foodItems || []).forEach(i => { food[i.name] = i.qty; });
        setFoodSelections(food);
        const drink = {};
        (existing.drinkItems || []).forEach(i => { drink[i.name] = i.qty; });
        setDrinkSelections(drink);
        setStep("food");
      }
    })();
  }, [sessionId, userId]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const setFood = (name, delta) => {
    setFoodSelections(prev => {
      const cur = prev[name] || 0;
      const next = Math.max(0, cur + delta);
      if (next === 0) { const copy = { ...prev }; delete copy[name]; return copy; }
      return { ...prev, [name]: next };
    });
  };

  const setDrink = (name, delta) => {
    setDrinkSelections(prev => {
      const cur = prev[name] || 0;
      const next = Math.max(0, cur + delta);
      if (next === 0) { const copy = { ...prev }; delete copy[name]; return copy; }
      return { ...prev, [name]: next };
    });
  };

  const foodItems = session
    ? Object.entries(foodSelections).map(([name, qty]) => ({
        name, qty, price: session.menuItems.find(m => m.name === name)?.price || 0
      }))
    : [];

  const drinkItems = session
    ? Object.entries(drinkSelections).map(([name, qty]) => ({
        name, qty, price: session.drinkItems.find(m => m.name === name)?.price || 0
      }))
    : [];

  const total =
    foodItems.reduce((s, i) => s + i.price * i.qty, 0) +
    drinkItems.reduce((s, i) => s + i.price * i.qty, 0);

  const submit = async () => {
    if (foodItems.length === 0 && drinkItems.length === 0) {
      showToast("請至少選一樣餐點");
      return;
    }
    setSubmitting(true);

    const uid = userId || `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const payload = {
      userId: uid,
      userName,
      foodItems,
      drinkItems,
      note,
      total,
      paid: false,
      updatedAt: serverTimestamp(),
    };

    try {
      if (existingOrderId) {
        await updateDoc(doc(db, "sessions", sessionId, "orders", existingOrderId), payload);
      } else {
        const ref = await addDoc(collection(db, "sessions", sessionId, "orders"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setExistingOrderId(ref.id);
      }
      setUserId(uid);
      const myOrderLink = `${window.location.origin}${window.location.pathname}?session=${sessionId}&uid=${uid}&page=myorder`;
      setStep("done");
      // Store locally
      localStorage.setItem("lunch_uid", uid);
      localStorage.setItem("lunch_session", sessionId);
    } catch (e) {
      showToast("送出失敗，請重試");
    }
    setSubmitting(false);
  };

  if (loading) return <div className="loading">載入中...</div>;

  if (!session) return (
    <div className="page">
      <div className="empty">
        <div className="empty-icon">😕</div>
        <p>找不到這個訂單</p>
        <p style={{ marginTop: 6 }}>連結可能已失效</p>
      </div>
    </div>
  );

  if (session.status === "closed") return (
    <div className="page">
      <div className="top-bar">
        <div className="logo-mark">🍱</div>
        <h1>午餐快點</h1>
      </div>
      <div className="empty">
        <div className="empty-icon">🔒</div>
        <p style={{ fontWeight: 700, fontSize: 16 }}>此訂單已結單</p>
        <p style={{ marginTop: 6 }}>發起人已完成收單</p>
      </div>
    </div>
  );

  // DONE step
  if (step === "done") {
    const myOrderLink = `${window.location.origin}${window.location.pathname}?session=${sessionId}&uid=${userId || localStorage.getItem("lunch_uid")}&page=myorder`;
    return (
      <div className="page">
        <div className="top-bar">
          <div className="logo-mark">🍱</div>
          <h1>午餐快點</h1>
        </div>
        <div style={{ textAlign: "center", padding: "30px 0 20px" }}>
          <div style={{ fontSize: 60, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>點餐成功！</h2>
          <p style={{ color: "var(--text2)", marginTop: 8 }}>記得向發起人繳費喔</p>
        </div>

        <div className="card">
          <div className="card-title">我的訂單明細</div>
          {foodItems.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--bg2)", fontSize: 14 }}>
              <span>{item.name} × {item.qty}</span>
              <span style={{ fontWeight: 600 }}>$ {item.price * item.qty}</span>
            </div>
          ))}
          {drinkItems.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--bg2)", fontSize: 14 }}>
              <span>{item.name} × {item.qty}</span>
              <span style={{ fontWeight: 600, color: "var(--purple)" }}>$ {item.price * item.qty}</span>
            </div>
          ))}
          {note && <p style={{ fontSize: 12, color: "var(--text2)", marginTop: 8 }}>📝 備註：{note}</p>}
          <div className="price-total">
            <span className="label">合計</span>
            <span className="amount">$ {total}</span>
          </div>
        </div>

        <div className="card" style={{ background: "var(--amber-bg)", border: "1.5px solid #F0C060" }}>
          <p style={{ fontSize: 13, color: "var(--amber)", fontWeight: 600 }}>💰 請向發起人繳交 $ {total}</p>
        </div>

        <button className="btn btn-outline" onClick={() => navigate("myorder", sessionId, userId || localStorage.getItem("lunch_uid"))}>
          查詢 / 修改我的訂單
        </button>
        <Toast msg={toast} />
      </div>
    );
  }

  // NAME step
  if (step === "name") {
    return (
      <div className="page">
        <div className="top-bar">
          <div className="logo-mark">🍱</div>
          <h1>午餐快點</h1>
        </div>

        <div className="card" style={{ background: "var(--green-bg)", border: "1.5px solid #8DD4B0" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{session.restaurantName}</div>
          {session.drinkName && <div style={{ fontSize: 13, color: "var(--green)", marginTop: 2 }}>+ {session.drinkName}</div>}
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>📅 {session.date}</div>
        </div>

        <div className="card">
          <div className="card-title">你是誰？</div>
          <div className="field">
            <label>你的姓名 / 暱稱</label>
            <input
              placeholder="例：小明、阿強、Emma"
              value={userName}
              onChange={e => setUserName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && userName && setStep("food")}
              autoFocus
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={() => { if (!userName) { showToast("請輸入你的名字"); return; } setStep("food"); }}
          >
            開始點餐 →
          </button>
        </div>
        <Toast msg={toast} />
      </div>
    );
  }

  // FOOD step
  if (step === "food") {
    return (
      <div className="page">
        <div className="top-bar">
          <button className="btn btn-icon" onClick={() => setStep("name")}>←</button>
          <h1>{session.restaurantName}</h1>
          <span style={{ fontSize: 13, color: "var(--text2)" }}>{userName}</span>
        </div>

        <p className="section-label">選擇餐點</p>
        {session.menuItems.map((item, i) => {
          const qty = foodSelections[item.name] || 0;
          return (
            <div key={i} className={`menu-item ${qty > 0 ? "selected" : ""}`}>
              <div className="menu-item-info">
                <div className="menu-item-name">{item.name}</div>
                <div className="menu-item-price">$ {item.price}</div>
              </div>
              <div className="qty-control">
                <button onClick={() => setFood(item.name, -1)} disabled={qty === 0}>−</button>
                <span className="qty-num">{qty}</span>
                <button onClick={() => setFood(item.name, 1)}>+</button>
              </div>
            </div>
          );
        })}

        <div className="field" style={{ marginTop: 16 }}>
          <label>訂單備註（選填）</label>
          <textarea
            placeholder="例如：不要飯、半飯、少辣…"
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{ minHeight: 60 }}
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={() => session.drinkName ? setStep("drink") : setStep("confirm")}
        >
          {session.drinkName ? "下一步：選飲料 →" : "確認訂單 →"}
        </button>
        <Toast msg={toast} />
      </div>
    );
  }

  // DRINK step
  if (step === "drink") {
    return (
      <div className="page">
        <div className="top-bar">
          <button className="btn btn-icon" onClick={() => setStep("food")}>←</button>
          <h1>{session.drinkName}</h1>
        </div>

        <p className="section-label">選擇飲料</p>
        {session.drinkItems.map((item, i) => {
          const qty = drinkSelections[item.name] || 0;
          return (
            <div key={i} className={`menu-item ${qty > 0 ? "selected" : ""}`}>
              <div className="menu-item-info">
                <div className="menu-item-name">{item.name}</div>
                <div className="menu-item-price" style={{ color: "var(--purple)" }}>$ {item.price}</div>
              </div>
              <div className="qty-control">
                <button onClick={() => setDrink(item.name, -1)} disabled={qty === 0}>−</button>
                <span className="qty-num">{qty}</span>
                <button onClick={() => setDrink(item.name, 1)}>+</button>
              </div>
            </div>
          );
        })}

        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setStep("confirm")}>
          確認訂單 →
        </button>
        <Toast msg={toast} />
      </div>
    );
  }

  // CONFIRM step
  if (step === "confirm") {
    return (
      <div className="page">
        <div className="top-bar">
          <button className="btn btn-icon" onClick={() => session.drinkName ? setStep("drink") : setStep("food")}>←</button>
          <h1>確認訂單</h1>
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{userName}</div>
          <div style={{ fontSize: 13, color: "var(--text2)" }}>{session.restaurantName} {session.drinkName ? `+ ${session.drinkName}` : ""}</div>
        </div>

        <div className="card">
          <div className="card-title">餐點</div>
          {foodItems.length === 0 ? <p style={{ color: "var(--text3)", fontSize: 14 }}>未選擇餐點</p> : (
            foodItems.map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--bg2)", fontSize: 14 }}>
                <span>{item.name} × {item.qty}</span>
                <span style={{ fontWeight: 600 }}>$ {item.price * item.qty}</span>
              </div>
            ))
          )}
          {drinkItems.length > 0 && (
            <>
              <div className="card-title" style={{ marginTop: 14 }}>飲料</div>
              {drinkItems.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--bg2)", fontSize: 14 }}>
                  <span>{item.name} × {item.qty}</span>
                  <span style={{ fontWeight: 600, color: "var(--purple)" }}>$ {item.price * item.qty}</span>
                </div>
              ))}
            </>
          )}
          {note && <p style={{ fontSize: 12, color: "var(--text2)", marginTop: 8 }}>📝 {note}</p>}
          <div className="price-total">
            <span className="label">合計</span>
            <span className="amount">$ {total}</span>
          </div>
        </div>

        <button className="btn btn-green" onClick={submit} disabled={submitting}>
          {submitting ? "送出中..." : (existingOrderId ? "✅ 更新訂單" : "✅ 送出訂單")}
        </button>
        <Toast msg={toast} />
      </div>
    );
  }

  return null;
}
