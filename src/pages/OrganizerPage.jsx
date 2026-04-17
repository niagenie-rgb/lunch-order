import { useState, useEffect } from "react";
import {
  collection, addDoc, doc, onSnapshot,
  updateDoc, serverTimestamp, getDocs, deleteField
} from "firebase/firestore";
import { db } from "../firebase";
function Toast({ msg }) {
  return msg ? <div className="toast">{msg}</div> : null;
}
export default function OrganizerPage({ navigate, sessionId, setSessionId }) {
  const [tab, setTab] = useState(sessionId ? "manage" : "setup");
  const [toast, setToast] = useState("");
  const [allRestaurants, setAllRestaurants] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedFoodId, setSelectedFoodId] = useState("");
  const [selectedDrinkId, setSelectedDrinkId] = useState("");
  const [selectedFoodInfo, setSelectedFoodInfo] = useState({ phone: "", address: "", deliveryNote: "" });
  const [selectedDrinkInfo, setSelectedDrinkInfo] = useState({ phone: "", address: "", deliveryNote: "" });
  const [restaurantName, setRestaurantName] = useState("");
  const [drinkName, setDrinkName] = useState("");
  const [menuItems, setMenuItems] = useState([]);
  const [drinkItems, setDrinkItems] = useState([]);
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newDrinkName, setNewDrinkName] = useState("");
  const [newDrinkPrice, setNewDrinkPrice] = useState("");
  const [creating, setCreating] = useState(false);
  const [session, setSession] = useState(null);
  const [orders, setOrders] = useState([]);
  const [shareLink, setShareLink] = useState("");
  const [drinkExcluded, setDrinkExcluded] = useState(false);
  useEffect(() => {
    getDocs(collection(db, "restaurants")).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setAllRestaurants(list);
    });
  }, []);
  useEffect(() => {
    if (!sessionId) return;
    const link = `${window.location.origin}${window.location.pathname}?session=${sessionId}`;
    setShareLink(link);
    const unsub = onSnapshot(doc(db, "sessions", sessionId), snap => {
      if (snap.exists()) setSession({ id: snap.id, ...snap.data() });
    });
    const unsubOrders = onSnapshot(collection(db, "sessions", sessionId, "orders"), snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsub(); unsubOrders(); };
  }, [sessionId]);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };
  const onSelectFood = (id) => {
    setSelectedFoodId(id);
    if (!id || id === "__manual__") {
      setRestaurantName(""); setMenuItems([]);
      setSelectedFoodInfo({ phone: "", address: "", deliveryNote: "" });
      return;
    }
    const r = allRestaurants.find(r => r.id === id);
    if (r) {
      setRestaurantName(r.name);
      setMenuItems(r.items || []);
      setSelectedFoodInfo({ phone: r.phone || "", address: r.address || "", deliveryNote: r.deliveryNote || "" });
    }
  };
  const onSelectDrink = (id) => {
    setSelectedDrinkId(id);
    if (!id || id === "__manual__") { setDrinkName(""); setDrinkItems([]); return; }
    const r = allRestaurants.find(r => r.id === id);
    if (r) {
      setDrinkName(r.name);
      setDrinkItems(r.items || []);
      setSelectedDrinkInfo({ phone: r.phone || "", address: r.address || "", deliveryNote: r.deliveryNote || "" });
    }
  };
  const addMenuItem = () => {
    if (!newItemName || !newItemPrice) return;
    setMenuItems([...menuItems, { name: newItemName, price: Number(newItemPrice) }]);
    setNewItemName(""); setNewItemPrice("");
  };
  const addDrinkItem = () => {
    if (!newDrinkName || !newDrinkPrice) return;
    setDrinkItems([...drinkItems, { name: newDrinkName, price: Number(newDrinkPrice) }]);
    setNewDrinkName(""); setNewDrinkPrice("");
  };
  const createSession = async () => {
    if (!restaurantName) { showToast("請選擇或輸入餐廳名稱"); return; }
    if (menuItems.length === 0) { showToast("餐點菜單至少要有一個品項"); return; }
    setCreating(true);
    try {
      const ref = await addDoc(collection(db, "sessions"), {
        date, restaurantName,
        restaurantPhone: selectedFoodInfo.phone || "",
        restaurantAddress: selectedFoodInfo.address || "",
        restaurantNote: selectedFoodInfo.deliveryNote || "",
        drinkName: drinkName || "",
        drinkPhone: selectedDrinkInfo.phone || "",
        drinkAddress: selectedDrinkInfo.address || "",
        drinkNote: selectedDrinkInfo.deliveryNote || "",
        menuItems,
        drinkItems: drinkName ? drinkItems : [],
        status: "open",
        createdAt: serverTimestamp(),
      });
      setSessionId(ref.id);
      setTab("manage");
      showToast("✅ 訂單已建立！");
    } catch (e) { showToast("建立失敗，請重試"); }
    setCreating(false);
  };
  const copyLink = () => { navigator.clipboard.writeText(shareLink); showToast("🔗 連結已複製！"); };
  const togglePaid = async (orderId, current) => {
    await updateDoc(doc(db, "sessions", sessionId, "orders", orderId), { paid: !current });
  };
  const closeSession = async () => {
    if (!window.confirm("確定要結單嗎？結單後可以從這裡叫回重新開啟。")) return;
    await updateDoc(doc(db, "sessions", sessionId), { status: "closed", closedAt: serverTimestamp() });
    showToast("✅ 已結單！");
    setTimeout(() => navigate("history"), 1000);
  };
  // ▼▼▼ 新增：重新開啟已結單的訂單 ▼▼▼
  const reopenSession = async () => {
    if (!window.confirm("確定要重新開啟這筆訂單嗎？")) return;
    await updateDoc(doc(db, "sessions", sessionId), {
      status: "open",
      closedAt: deleteField(),
    });
    showToast("🔓 訂單已重新開啟！");
  };
  // ▲▲▲ 新增結束 ▲▲▲
  const getSummary = () => {
    const foodMap = {}, drinkMap = {};
    let total = 0;
    orders.forEach(o => {
      (o.foodItems || []).forEach(item => {
        if (!foodMap[item.name]) foodMap[item.name] = { name: item.name, price: item.price, qty: 0 };
        foodMap[item.name].qty += item.qty; total += item.price * item.qty;
      });
      if (!drinkExcluded) {
        (o.drinkItems || []).forEach(item => {
          if (!drinkMap[item.name]) drinkMap[item.name] = { name: item.name, price: item.price, qty: 0 };
          drinkMap[item.name].qty += item.qty; total += item.price * item.qty;
        });
      }
    });
    return { food: Object.values(foodMap), drinks: Object.values(drinkMap), total };
  };
  const summary = session ? getSummary() : null;
  const isClosed = session?.status === "closed";
  const foodRestaurants = allRestaurants.filter(r => r.type === "food");
  const drinkRestaurants = allRestaurants.filter(r => r.type === "drink");
  // ========== SETUP ==========
  if (tab === "setup" || !sessionId) {
    return (
      <div className="page">
        <div className="top-bar">
          <button className="btn btn-icon" onClick={() => navigate("home")}>←</button>
          <h1>建立今日訂單</h1>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("menumanager")}>📋 菜單庫</button>
        </div>
        <div className="card">
          <div className="card-title">基本資訊</div>
          <div className="field">
            <label>用餐日期</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>
        {/* Food picker */}
        <div className="card">
          <div className="card-title">選擇餐廳</div>
          {foodRestaurants.length > 0 ? (
            <div className="field">
              <label>從菜單庫選擇</label>
              <select value={selectedFoodId} onChange={e => onSelectFood(e.target.value)}>
                <option value="">— 請選擇 —</option>
                {foodRestaurants.map(r => (
                  <option key={r.id} value={r.id}>{r.name}（{(r.items||[]).length} 項）</option>
                ))}
                <option value="__manual__">＋ 手動輸入新餐廳</option>
              </select>
            </div>
          ) : (
            <div style={{ background: "var(--amber-bg)", border: "1px solid #F0C060", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 13, color: "var(--amber)" }}>
              💡 點右上角「菜單庫」先建立常用餐廳，以後選餐廳會更快！
            </div>
          )}
          {(selectedFoodId === "__manual__" || foodRestaurants.length === 0) && (
            <div className="field">
              <label>餐廳名稱</label>
              <input placeholder="例：大碗公自助餐" value={restaurantName} onChange={e => setRestaurantName(e.target.value)} />
            </div>
          )}
          {restaurantName && (
            <div style={{ marginTop: 8 }}>
              <div className="card-title" style={{ marginBottom: 8 }}>菜單品項</div>
              {menuItems.length === 0 && <p style={{ color: "var(--text3)", fontSize: 13, marginBottom: 8 }}>尚無品項</p>}
              {menuItems.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ flex: 1, fontSize: 14 }}>{item.name}</span>
                  <span className="badge badge-amber">$ {item.price}</span>
                  <button onClick={() => setMenuItems(menuItems.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", fontSize: 15 }}>✕</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input style={{ flex: 2, padding: "8px 11px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 14, fontFamily: "inherit" }} placeholder="品項名稱" value={newItemName} onChange={e => setNewItemName(e.target.value)} />
                <input style={{ flex: 1, padding: "8px 11px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 14, fontFamily: "inherit" }} placeholder="價格" type="number" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} />
                <button className="btn btn-secondary btn-sm" onClick={addMenuItem}>+</button>
              </div>
            </div>
          )}
        </div>
        {/* Drink picker */}
        <div className="card">
          <div className="card-title">選擇飲料店（選填）</div>
          {drinkRestaurants.length > 0 ? (
            <div className="field">
              <label>從菜單庫選擇</label>
              <select value={selectedDrinkId} onChange={e => onSelectDrink(e.target.value)}>
                <option value="">— 不點飲料 —</option>
                {drinkRestaurants.map(r => (
                  <option key={r.id} value={r.id}>{r.name}（{(r.items||[]).length} 項）</option>
                ))}
                <option value="__manual__">＋ 手動輸入飲料店</option>
              </select>
            </div>
          ) : (
            <div className="field">
              <label>飲料店名稱（留空表示不點飲料）</label>
              <input placeholder="例：50嵐、清心" value={drinkName} onChange={e => setDrinkName(e.target.value)} />
            </div>
          )}
          {selectedDrinkId === "__manual__" && (
            <div className="field">
              <label>飲料店名稱</label>
              <input placeholder="例：50嵐" value={drinkName} onChange={e => setDrinkName(e.target.value)} />
            </div>
          )}
          {drinkName && (
            <div style={{ marginTop: 8 }}>
              <div className="card-title" style={{ marginBottom: 8 }}>飲料品項</div>
              {drinkItems.length === 0 && <p style={{ color: "var(--text3)", fontSize: 13, marginBottom: 8 }}>尚無品項</p>}
              {drinkItems.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ flex: 1, fontSize: 14 }}>{item.name}</span>
                  <span className="badge badge-purple">$ {item.price}</span>
                  <button onClick={() => setDrinkItems(drinkItems.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", fontSize: 15 }}>✕</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input style={{ flex: 2, padding: "8px 11px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 14, fontFamily: "inherit" }} placeholder="飲料名稱" value={newDrinkName} onChange={e => setNewDrinkName(e.target.value)} />
                <input style={{ flex: 1, padding: "8px 11px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 14, fontFamily: "inherit" }} placeholder="價格" type="number" value={newDrinkPrice} onChange={e => setNewDrinkPrice(e.target.value)} />
                <button className="btn btn-secondary btn-sm" onClick={addDrinkItem}>+</button>
              </div>
            </div>
          )}
        </div>
        <button className="btn btn-primary" onClick={createSession} disabled={creating}>
          {creating ? "建立中..." : "🚀 產生點餐連結"}
        </button>
        <Toast msg={toast} />
      </div>
    );
  }
  // ========== MANAGE ==========
  return (
    <div className="page-wide">
      <div className="top-bar">
        <button className="btn btn-icon" onClick={() => navigate("home")}>←</button>
        <h1>
          {session?.restaurantName || "..."}
          <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text2)", marginLeft: 8 }}>{session?.date}</span>
        </h1>
        {isClosed ? <span className="badge badge-gray">已結單</span> : <span className="badge badge-green">進行中</span>}
      </div>
      <div className="tab-bar">
        <button className={`tab-btn ${tab === "manage" ? "active" : ""}`} onClick={() => setTab("manage")}>📋 訂單總覽</button>
        <button className={`tab-btn ${tab === "summary" ? "active" : ""}`} onClick={() => setTab("summary")}>🛒 匯整點餐</button>
        <button className={`tab-btn ${tab === "share" ? "active" : ""}`} onClick={() => setTab("share")}>🔗 分享連結</button>
      </div>
      {tab === "share" && (
        <div>
          <div className="card">
            <div className="card-title">分享給同事點餐</div>
            <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 12 }}>把以下連結傳給同事，他們可以直接點餐</p>
            <div className="link-box">
              <span>{shareLink}</span>
              <button className="btn btn-secondary btn-sm" onClick={copyLink}>複製</button>
            </div>
          </div>
          <div className="card" style={{ background: "var(--amber-bg)", border: "1.5px solid #F0C060" }}>
            <p style={{ fontSize: 13, color: "var(--amber)" }}>💡 也可以截圖或在群組貼上連結</p>
          </div>
        </div>
      )}
      {tab === "manage" && (
        <div>
          {orders.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🍽️</div>
              <p>還沒有人點餐</p>
              <p style={{ marginTop: 6 }}>分享連結給同事吧！</p>
            </div>
          ) : (
            orders.map(order => {
              const personTotal =
                (order.foodItems || []).reduce((s, i) => s + i.price * i.qty, 0) +
                (drinkExcluded ? 0 : (order.drinkItems || []).reduce((s, i) => s + i.price * i.qty, 0));
              return (
                <div key={order.id} className="card">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div className="person-avatar">{(order.userName || "？")[0]}</div>
                    <div style={{ flex: 1 }}>
                      <div className="person-name">{order.userName || "匿名"}</div>
                      <div className="person-items">
                        {[
                          ...(order.foodItems || []),
                          ...(drinkExcluded ? [] : (order.drinkItems || []))
                        ].map(i => `${i.name}×${i.qty}`).join("、")}
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, color: "var(--accent)", fontSize: 16 }}>$ {personTotal}</div>
                  </div>
                  {order.note && (
                    <div style={{ fontSize: 12, color: "var(--text2)", background: "var(--bg)", padding: "6px 10px", borderRadius: 6, marginBottom: 10 }}>
                      📝 備註：{order.note}
                    </div>
                  )}
                  {!isClosed && (
                    <label className="paid-toggle" onClick={() => togglePaid(order.id, order.paid)}>
                      <div className={`toggle-switch ${order.paid ? "on" : ""}`} />
                      <span style={{ fontSize: 13, color: order.paid ? "var(--green)" : "var(--text2)", fontWeight: 600 }}>
                        {order.paid ? "✅ 已收款" : "⏳ 未收款"}
                      </span>
                    </label>
                  )}
                  {isClosed && <span className={`badge ${order.paid ? "badge-green" : "badge-red"}`}>{order.paid ? "已收款" : "未收款"}</span>}
                </div>
              );
            })
          )}
          {/* ▼▼▼ 改動處：進行中顯示結單，已結單顯示重新開啟 ▼▼▼ */}
          {orders.length > 0 && !isClosed && (
            <div style={{ marginTop: 20 }}>
              <hr className="divider" />
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 14, color: "var(--text2)" }}>
                <span>總人數：{orders.length} 人</span>
                <span>總金額：<strong style={{ color: "var(--accent)" }}>$ {summary?.total || 0}</strong></span>
              </div>
              <button className="btn btn-green" onClick={closeSession}>🎉 完成訂餐・結單</button>
            </div>
          )}
          {isClosed && (
            <div style={{ marginTop: 20 }}>
              <hr className="divider" />
              <div style={{ marginBottom: 10, fontSize: 13, color: "var(--text2)", textAlign: "center" }}>
                此訂單已結單。若需修改，可重新開啟。
              </div>
              <button
                className="btn btn-secondary"
                onClick={reopenSession}
                style={{ width: "100%", border: "1.5px solid var(--amber)", color: "var(--amber)", background: "var(--amber-bg)" }}
              >
                🔓 重新開啟訂單
              </button>
            </div>
          )}
          {/* ▲▲▲ 改動結束 ▲▲▲ */}
        </div>
      )}
      {tab === "summary" && (
        <div>
          <div className="card">
            <div className="card-title">📦 餐廳點餐清單（{session?.restaurantName}）</div>
            {(session?.restaurantPhone || session?.restaurantAddress) && (
              <div style={{ marginBottom: 12, padding: "10px 12px", background: "var(--bg2)", borderRadius: 8 }}>
                {session?.restaurantPhone && <div style={{ fontSize: 13, marginBottom: 3 }}>📞 <a href={`tel:${session.restaurantPhone}`} style={{ color: "var(--accent)", fontWeight: 600 }}>{session.restaurantPhone}</a></div>}
                {session?.restaurantAddress && <div style={{ fontSize: 12, color: "var(--text2)" }}>📍 {session.restaurantAddress}</div>}
                {session?.restaurantNote && <div style={{ fontSize: 12, color: "var(--green)", marginTop: 2 }}>🛵 {session.restaurantNote}</div>}
              </div>
            )}
            {summary?.food.length === 0
              ? <p style={{ color: "var(--text3)", fontSize: 14 }}>尚無餐點訂單</p>
              : summary?.food.map((item, i) => {
                const orderers = orders.filter(o =>
                  (o.foodItems || []).some(fi => fi.name === item.name)
                ).map(o => ({ name: o.userName, qty: (o.foodItems || []).find(fi => fi.name === item.name)?.qty || 0, note: o.note }));
                return (
                  <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--bg2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600 }}>{item.name}</span>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <span className="badge badge-gray">× {item.qty}</span>
                        <span style={{ color: "var(--accent)", fontWeight: 600, minWidth: 60, textAlign: "right" }}>$ {item.price * item.qty}</span>
                      </div>
                    </div>
                    {orderers.some(o => o.note) && (
                      <div style={{ marginTop: 4 }}>
                        {orderers.filter(o => o.note).map((o, j) => (
                          <div key={j} style={{ fontSize: 12, color: "var(--text2)", paddingLeft: 8 }}>
                            └ <span style={{ fontWeight: 600, color: "var(--accent)" }}>{o.name}</span>：{o.note}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            }
          </div>
          {session?.drinkName && (
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div className="card-title" style={{ marginBottom: 0 }}>🧋 飲料點餐清單（{session?.drinkName}）</div>
                <button
                  onClick={() => setDrinkExcluded(prev => !prev)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 20,
                    border: drinkExcluded ? "1.5px solid var(--red)" : "1.5px solid var(--border)",
                    background: drinkExcluded ? "var(--red-bg, #fff0f0)" : "transparent",
                    color: drinkExcluded ? "var(--red)" : "var(--text3)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.15s",
                  }}
                >
                  {drinkExcluded ? "❌ 未達標（已排除）" : "未達標"}
                </button>
              </div>
              {drinkExcluded ? (
                <div style={{
                  padding: "12px 14px",
                  background: "var(--red-bg, #fff0f0)",
                  border: "1px solid var(--red)",
                  borderRadius: 8,
                  color: "var(--red)",
                  fontSize: 13,
                  fontWeight: 500,
                }}>
                  飲料未達訂購門檻，已從統計與收款中排除。
                </div>
              ) : (
                <>
                  {(session?.drinkPhone || session?.drinkAddress) && (
                    <div style={{ marginBottom: 12, padding: "10px 12px", background: "var(--bg2)", borderRadius: 8 }}>
                      {session?.drinkPhone && <div style={{ fontSize: 13, marginBottom: 3 }}>📞 <a href={`tel:${session.drinkPhone}`} style={{ color: "var(--purple)", fontWeight: 600 }}>{session.drinkPhone}</a></div>}
                      {session?.drinkAddress && <div style={{ fontSize: 12, color: "var(--text2)" }}>📍 {session.drinkAddress}</div>}
                      {session?.drinkNote && <div style={{ fontSize: 12, color: "var(--green)", marginTop: 2 }}>🛵 {session.drinkNote}</div>}
                    </div>
                  )}
                  {summary?.drinks.length === 0
                    ? <p style={{ color: "var(--text3)", fontSize: 14 }}>尚無飲料訂單</p>
                    : (() => {
                      const drinkOrders = [];
                      orders.forEach(o => {
                        (o.drinkItems || []).forEach(item => {
                          drinkOrders.push({ userName: o.userName, ...item, note: o.note });
                        });
                      });
                      return drinkOrders.map((item, i) => (
                        <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--bg2)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <span style={{ fontWeight: 600 }}>{item.name}</span>
                              <span style={{ fontSize: 12, color: "var(--text2)", marginLeft: 6 }}>（{item.userName}）</span>
                            </div>
                            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                              <span className="badge badge-gray">× {item.qty}</span>
                              <span style={{ color: "var(--purple)", fontWeight: 600, minWidth: 60, textAlign: "right" }}>$ {item.price * item.qty}</span>
                            </div>
                          </div>
                          {(item.sugar || item.ice) && (
                            <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 3, paddingLeft: 4 }}>
                              🍬 {item.sugar || "-"}　🧊 {item.ice || "-"}
                            </div>
                          )}
                        </div>
                      ));
                    })()
                  }
                </>
              )}
            </div>
          )}
          <div className="card" style={{ background: "var(--bg2)" }}>
            <div className="price-total">
              <span className="label">
                💰 全部合計
                {drinkExcluded && (
                  <span style={{ fontSize: 11, color: "var(--red)", marginLeft: 6, fontWeight: 500 }}>
                    （飲料未計入）
                  </span>
                )}
              </span>
              <span className="amount">$ {summary?.total || 0}</span>
            </div>
          </div>
        </div>
      )}
      <Toast msg={toast} />
    </div>
  );
}
