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
  const [step, setStep] = useState("name");
  const [userName, setUserName] = useState("");
  const [foodSelections, setFoodSelections] = useState({});
  const [drinkSelections, setDrinkSelections] = useState({});
  const [drinkOptions, setDrinkOptions] = useState({});
  const [note, setNote] = useState("");
  const [toast, setToast] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [existingOrderId, setExistingOrderId] = useState(null);
  const [finalOrder, setFinalOrder] = useState(null);

  const SUGAR_OPTIONS = ["全糖", "半糖", "三分糖", "無糖"];
  const ICE_OPTIONS = ["冰", "微冰", "去冰", "溫熱"];

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      const snap = await getDoc(doc(db, "sessions", sessionId));
      if (snap.exists()) setSession({ id: snap.id, ...snap.data() });
      setLoading(false);
    })();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !userId) return;
    (async () => {
      const q = query(collection(db, "sessions", sessionId, "orders"), where("userId", "==", userId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const existing = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setExistingOrderId(existing.id);
        setUserName(existing.userName || "");
        setNote(existing.note || "");
        const food = {};
        (existing.foodItems || []).forEach(i => { food[i.name] = i.qty; });
        setFoodSelections(food);
        const drink = {};
        const dOpts = {};
        (existing.drinkItems || []).forEach(i => {
          drink[i.name] = i.qty;
          if (i.sugar || i.ice) dOpts[i.name] = { sugar: i.sugar || "全糖", ice: i.ice || "冰" };
        });
        setDrinkSelections(drink);
        setDrinkOptions(dOpts);
        setStep("food");
      }
    })();
  }, [sessionId, userId]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

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
      if (cur === 0) setDrinkOptions(opts => ({ ...opts, [name]: opts[name] || { sugar: "全糖", ice: "冰" } }));
      return { ...prev, [name]: next };
    });
  };

  const setDrinkOpt = (name, field, val) => {
    setDrinkOptions(prev => ({ ...prev, [name]: { ...(prev[name] || { sugar: "全糖", ice: "冰" }), [field]: val } }));
  };

  const getFoodItems = () => session
    ? Object.entries(foodSelections).map(([name, qty]) => ({
        name, qty,
        price: session.menuItems.find(m => m.name === name)?.price || 0,
        category: session.menuItems.find(m => m.name === name)?.category || "",
      }))
    : [];

  const getDrinkItems = () => session
    ? Object.entries(drinkSelections).map(([name, qty]) => ({
        name, qty,
        price: session.drinkItems.find(m => m.name === name)?.price || 0,
        sugar: drinkOptions[name]?.sugar || "全糖",
        ice: drinkOptions[name]?.ice || "冰",
      }))
    : [];

  const getTotal = (f, d) =>
    f.reduce((s, i) => s + i.price * i.qty, 0) + d.reduce((s, i) => s + i.price * i.qty, 0);

  const groupByCategory = (items) => {
    const groups = {};
    items.forEach(item => {
      const cat = item.category || "";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  };

  const submit = async () => {
    const foodItems = getFoodItems();
    const drinkItems = getDrinkItems();
    if (foodItems.length === 0 && drinkItems.length === 0) { showToast("請至少選一樣餐點"); return; }
    setSubmitting(true);
    const uid = userId || `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const total = getTotal(foodItems, drinkItems);
    const payload = { userId: uid, userName, foodItems, drinkItems, note, total, paid: false, updatedAt: serverTimestamp() };
    try {
      if (existingOrderId) {
        await updateDoc(doc(db, "sessions", sessionId, "orders", existingOrderId), payload);
      } else {
        const ref = await addDoc(collection(db, "sessions", sessionId, "orders"), { ...payload, createdAt: serverTimestamp() });
        setExistingOrderId(ref.id);
      }
      setUserId(uid);
      localStorage.setItem("lunch_uid", uid);
      localStorage.setItem("lunch_session", sessionId);
      setFinalOrder({ foodItems, drinkItems, total, userName });
      setStep("done");
    } catch (e) { showToast("送出失敗，請重試"); }
    setSubmitting(false);
  };

  if (loading) return <div className="loading">載入中...</div>;
  if (!session) return <div className="page"><div className="empty"><div className="empty-icon">😕</div><p>找不到這個訂單</p></div></div>;
  if (session.status === "closed") return (
    <div className="page">
      <div className="top-bar"><div className="logo-mark">🍱</div><h1>午餐快點</h1></div>
      <div className="empty"><div className="empty-icon">🔒</div><p style={{ fontWeight: 700 }}>此訂單已結單</p></div>
    </div>
  );

  // ── DONE ─────────────────────────────────────────────────────────
  if (step === "done" && finalOrder) {
    const shareLink = `${window.location.origin}${window.location.pathname}?session=${sessionId}`;
    return (
      <div className="page">
        <div className="top-bar"><div className="logo-mark">🍱</div><h1>午餐快點</h1></div>

        <div style={{ textAlign: "center", padding: "28px 0 20px" }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>✅</div>
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>點餐成功！</h2>
          <p style={{ color: "var(--text2)", fontSize: 14, marginTop: 6 }}>{finalOrder.userName}，記得向發起人繳費喔</p>
        </div>

        <div className="card">
          <div className="card-title">📋 訂單明細</div>

          {finalOrder.foodItems.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 8 }}>🍱 {session.restaurantName}</div>
              {finalOrder.foodItems.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--bg2)", fontSize: 14 }}>
                  <span>{item.name} <span style={{ color: "var(--text3)" }}>× {item.qty}</span></span>
                  <span style={{ fontWeight: 600 }}>$ {item.price * item.qty}</span>
                </div>
              ))}
            </div>
          )}

          {finalOrder.drinkItems.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--purple)", marginBottom: 8 }}>🧋 {session.drinkName}</div>
              {finalOrder.drinkItems.map((item, i) => (
                <div key={i} style={{ padding: "7px 0", borderBottom: "1px solid var(--bg2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>{item.name} <span style={{ color: "var(--text3)" }}>× {item.qty}</span></span>
                    <span style={{ fontWeight: 600, color: "var(--purple)" }}>$ {item.price * item.qty}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 3 }}>🍬 {item.sugar}　🧊 {item.ice}</div>
                </div>
              ))}
            </div>
          )}

          {note && (
            <div style={{ fontSize: 12, color: "var(--text2)", background: "var(--bg)", padding: "7px 10px", borderRadius: 6, marginTop: 10 }}>
              📝 備註：{note}
            </div>
          )}

          <div className="price-total">
            <span className="label">合計</span>
            <span className="amount">$ {finalOrder.total}</span>
          </div>
        </div>

        <div className="card" style={{ background: "var(--amber-bg)", border: "1.5px solid #F0C060", textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--amber)" }}>💰 請向發起人繳交 $ {finalOrder.total}</div>
        </div>

        <button className="btn btn-outline" onClick={() => navigate("myorder", sessionId, userId || localStorage.getItem("lunch_uid"))}>
          📋 查詢 / 修改我的訂單
        </button>

        <div style={{ marginTop: 16, padding: "16px", background: "var(--bg2)", borderRadius: "var(--radius-sm)", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 10 }}>需要幫別人點餐，或重新點餐？</p>
          <button className="btn btn-secondary btn-sm"
            onClick={() => { navigator.clipboard.writeText(shareLink); showToast("🔗 連結已複製！"); }}>
            複製點餐連結
          </button>
        </div>

        <Toast msg={toast} />
      </div>
    );
  }

  // ── NAME ─────────────────────────────────────────────────────────
  if (step === "name") {
    return (
      <div className="page">
        <div className="top-bar"><div className="logo-mark">🍱</div><h1>午餐快點</h1></div>
        <div className="card" style={{ background: "var(--green-bg)", border: "1.5px solid #8DD4B0" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{session.restaurantName}</div>
          {session.drinkName && <div style={{ fontSize: 13, color: "var(--green)", marginTop: 2 }}>+ {session.drinkName}</div>}
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>📅 {session.date}</div>
        </div>
        <div className="card">
          <div className="card-title">你是誰？</div>
          <div className="field">
            <label>你的姓名 / 暱稱</label>
            <input placeholder="例：小明、阿強、Emma" value={userName}
              onChange={e => setUserName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && userName && setStep("food")} autoFocus />
          </div>
          <button className="btn btn-primary"
            onClick={() => { if (!userName) { showToast("請輸入你的名字"); return; } setStep("food"); }}>
            開始點餐 →
          </button>
        </div>
        <Toast msg={toast} />
      </div>
    );
  }

  // ── FOOD ─────────────────────────────────────────────────────────
  if (step === "food") {
    const groups = groupByCategory(session.menuItems || []);
    const cats = Object.keys(groups);
    const hasCats = cats.some(k => k !== "");

    return (
      <div className="page">
        <div className="top-bar">
          <button className="btn btn-icon" onClick={() => setStep("name")}>←</button>
          <h1>{session.restaurantName}</h1>
          <span style={{ fontSize: 13, color: "var(--text2)" }}>{userName}</span>
        </div>

        {hasCats ? (
          cats.map(cat => (
            <div key={cat}>
              {cat && (
                <div style={{
                  background: "var(--accent)", color: "white",
                  padding: "5px 14px", borderRadius: 6,
                  fontSize: 13, fontWeight: 700,
                  margin: "16px 0 8px", display: "inline-block"
                }}>{cat}</div>
              )}
              {groups[cat].map((item, i) => {
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
            </div>
          ))
        ) : (
          (session.menuItems || []).map((item, i) => {
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
          })
        )}

        <div className="field" style={{ marginTop: 16 }}>
          <label>訂單備註（選填）</label>
          <textarea placeholder="例如：不要飯、半飯、少辣…"
            value={note} onChange={e => setNote(e.target.value)} style={{ minHeight: 60 }} />
        </div>

        <button className="btn btn-primary"
          onClick={() => session.drinkName ? setStep("drink") : setStep("confirm")}>
          {session.drinkName ? "下一步：選飲料 →" : "確認訂單 →"}
        </button>
        <Toast msg={toast} />
      </div>
    );
  }

  // ── DRINK ─────────────────────────────────────────────────────────
  if (step === "drink") {
    return (
      <div className="page">
        <div className="top-bar">
          <button className="btn btn-icon" onClick={() => setStep("food")}>←</button>
          <h1>{session.drinkName}</h1>
        </div>
        <p className="section-label">選擇飲料</p>
        {(session.drinkItems || []).map((item, i) => {
          const qty = drinkSelections[item.name] || 0;
          const opts = drinkOptions[item.name] || { sugar: "全糖", ice: "冰" };
          return (
            <div key={i} style={{
              background: qty > 0 ? "#F8F5FF" : "var(--card)",
              border: `1.5px solid ${qty > 0 ? "var(--purple)" : "var(--border)"}`,
              borderRadius: "var(--radius-sm)", padding: "14px", marginBottom: 10
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{item.name}</div>
                  <div style={{ fontSize: 13, color: "var(--purple)", fontWeight: 600, marginTop: 2 }}>$ {item.price}</div>
                </div>
                <div className="qty-control">
                  <button onClick={() => setDrink(item.name, -1)} disabled={qty === 0}>−</button>
                  <span className="qty-num">{qty}</span>
                  <button onClick={() => setDrink(item.name, 1)}>+</button>
                </div>
              </div>
              {qty > 0 && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--bg2)", paddingTop: 12 }}>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 6 }}>🍬 糖度</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {SUGAR_OPTIONS.map(s => (
                        <button key={s} onClick={() => setDrinkOpt(item.name, "sugar", s)} style={{
                          padding: "5px 12px", borderRadius: 20, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
                          background: opts.sugar === s ? "var(--purple)" : "var(--bg2)",
                          color: opts.sugar === s ? "white" : "var(--text2)",
                          border: `1.5px solid ${opts.sugar === s ? "var(--purple)" : "var(--border)"}`,
                          fontWeight: opts.sugar === s ? 600 : 400
                        }}>{s}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 6 }}>🧊 冰量</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {ICE_OPTIONS.map(ic => (
                        <button key={ic} onClick={() => setDrinkOpt(item.name, "ice", ic)} style={{
                          padding: "5px 12px", borderRadius: 20, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
                          background: opts.ice === ic ? "#0C9CF0" : "var(--bg2)",
                          color: opts.ice === ic ? "white" : "var(--text2)",
                          border: `1.5px solid ${opts.ice === ic ? "#0C9CF0" : "var(--border)"}`,
                          fontWeight: opts.ice === ic ? 600 : 400
                        }}>{ic}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
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

  // ── CONFIRM ─────────────────────────────────────────────────────
  if (step === "confirm") {
    const foodItems = getFoodItems();
    const drinkItems = getDrinkItems();
    const total = getTotal(foodItems, drinkItems);
    return (
      <div className="page">
        <div className="top-bar">
          <button className="btn btn-icon" onClick={() => session.drinkName ? setStep("drink") : setStep("food")}>←</button>
          <h1>確認訂單</h1>
        </div>
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{userName}</div>
          <div style={{ fontSize: 13, color: "var(--text2)" }}>{session.restaurantName}{session.drinkName ? ` + ${session.drinkName}` : ""}</div>
        </div>
        <div className="card">
          {foodItems.length > 0 && (
            <>
              <div className="card-title">🍱 餐點</div>
              {foodItems.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--bg2)", fontSize: 14 }}>
                  <span>{item.name} × {item.qty}</span>
                  <span style={{ fontWeight: 600 }}>$ {item.price * item.qty}</span>
                </div>
              ))}
            </>
          )}
          {drinkItems.length > 0 && (
            <div style={{ marginTop: foodItems.length > 0 ? 14 : 0 }}>
              <div className="card-title">🧋 飲料</div>
              {drinkItems.map((item, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--bg2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>{item.name} × {item.qty}</span>
                    <span style={{ fontWeight: 600, color: "var(--purple)" }}>$ {item.price * item.qty}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 3 }}>🍬 {item.sugar}　🧊 {item.ice}</div>
                </div>
              ))}
            </div>
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
