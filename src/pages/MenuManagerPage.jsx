import { useState, useEffect, useRef } from "react";
import {
  collection, addDoc, deleteDoc, updateDoc,
  doc, onSnapshot, serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase";

function Toast({ msg, type = "default" }) {
  if (!msg) return null;
  const bg = type === "success" ? "#2D9E6B" : type === "error" ? "#D63B3B" : "var(--text)";
  return <div className="toast" style={{ background: bg }}>{msg}</div>;
}

export default function MenuManagerPage({ navigate }) {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ msg: "", type: "default" });
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("food");
  const [saving, setSaving] = useState(false);
  const [editItems, setEditItems] = useState([]);
  const [editInfo, setEditInfo] = useState({ phone: "", address: "", deliveryNote: "" });
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importStep, setImportStep] = useState("idle");
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, storeName: "" });
  const fileInputRef = useRef();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "restaurants"), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setRestaurants(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const showToast = (msg, type = "default") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "default" }), 3000);
  };

  // ── Excel Import ─────────────────────────────────────────────────
  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      showToast("請選擇 .xlsx 格式的 Excel 檔案", "error"); return;
    }
    setImporting(true);
    try {
      if (!window.XLSX) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
          script.onload = resolve; script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      const data = await file.arrayBuffer();
      const workbook = window.XLSX.read(data, { type: "array" });
      let allRows = [];
      for (const sheetName of workbook.SheetNames) {
        if (sheetName.includes("說明") || sheetName.includes("統計")) continue;
        const sheet = workbook.Sheets[sheetName];
        const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (rows.length > 0 && rows[0].store_name !== undefined) {
          allRows = [...allRows, ...rows];
        }
      }
      if (allRows.length === 0) { showToast("找不到有效資料，請確認 Excel 格式", "error"); setImporting(false); return; }

      const storeMap = {};
      for (const row of allRows) {
        const name = String(row.store_name || "").trim();
        const type = String(row.store_type || "").trim();
        const itemName = String(row.item_name || "").trim();
        const price = Number(row.price) || 0;
        const category = String(row.category || "").trim();
        const temperature = String(row.temperature || "").trim();
        const iceOptions = String(row.ice_options || "").trim();
        const sugarOptions = String(row.sugar_options || "").trim();
        if (!name || !itemName || !type) continue;
        if (name.startsWith("（範例）") || itemName.startsWith("（範例）")) continue;
        const phone = String(row.phone || "").trim();
        const address = String(row.address || "").trim();
        const deliveryNote = String(row.delivery_note || "").trim();
        if (!storeMap[name]) {
          storeMap[name] = { name, type: type === "drink" ? "drink" : "food", items: [] };
        }
        // Update store-level info if present
        if (phone) storeMap[name].phone = phone;
        if (address) storeMap[name].address = address;
        if (deliveryNote) storeMap[name].deliveryNote = deliveryNote;;
        if (price > 0) {
          const itemObj = { name: itemName, price };
          if (category) itemObj.category = category;
          if (type === "drink") {
            if (temperature) itemObj.temperature = temperature;
            if (iceOptions) itemObj.iceOptions = iceOptions;
            if (sugarOptions) itemObj.sugarOptions = sugarOptions;
          }
          storeMap[name].items.push(itemObj);
        }
      }
      const stores = Object.values(storeMap).filter(s => s.items.length > 0);
      if (stores.length === 0) { showToast("Excel 裡沒有找到有效品項", "error"); setImporting(false); return; }
      const existingNames = new Set(restaurants.map(r => r.name));
      setImportPreview({
        stores,
        newStores: stores.filter(s => !existingNames.has(s.name)),
        dupStores: stores.filter(s => existingNames.has(s.name))
      });
      setImportStep("preview");
    } catch (err) {
      showToast("讀取 Excel 失敗：" + err.message, "error");
    }
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const confirmImport = async (mode = "new_only") => {
    if (!importPreview) return;
    setImportStep("importing");
    setImportProgress({ current: 0, total: 0, storeName: "" });
    const { stores, dupStores } = importPreview;
    const existingMap = {};
    restaurants.forEach(r => { existingMap[r.name] = r.id; });
    let added = 0, updated = 0, skipped = 0;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    try {
      const toAdd = stores.filter(s => !existingMap[s.name]);
      const toUpdate = mode === "overwrite_all" ? stores.filter(s => existingMap[s.name]) : [];
      skipped = mode === "new_only" ? dupStores.length : 0;
      const allTasks = [...toAdd.map(s => ({ s, op: "add" })), ...toUpdate.map(s => ({ s, op: "update" }))];
      const total = allTasks.length;
      for (let i = 0; i < allTasks.length; i++) {
        const { s, op } = allTasks[i];
        setImportProgress({ current: i + 1, total, storeName: s.name });
        const CHUNK = 10;
        const chunks = [];
        for (let j = 0; j < s.items.length; j += CHUNK) chunks.push(s.items.slice(j, j + CHUNK));
        if (op === "add") {
          const firstItems = chunks[0] || [];
          const ref = await addDoc(collection(db, "restaurants"), {
            name: s.name, type: s.type, items: firstItems,
            phone: s.phone || "", address: s.address || "", deliveryNote: s.deliveryNote || "",
            createdAt: serverTimestamp(),
          });
          await sleep(200);
          let allItems = [...firstItems];
          for (let c = 1; c < chunks.length; c++) {
            allItems = [...allItems, ...chunks[c]];
            await updateDoc(doc(db, "restaurants", ref.id), { items: allItems });
            await sleep(200);
          }
          added++;
        } else {
          let allItems = [];
          const id = existingMap[s.name];
          for (let c = 0; c < chunks.length; c++) {
            allItems = [...allItems, ...chunks[c]];
            const updatePayload = { items: allItems };
            if (s.phone) updatePayload.phone = s.phone;
            if (s.address) updatePayload.address = s.address;
            if (s.deliveryNote) updatePayload.deliveryNote = s.deliveryNote;
            await updateDoc(doc(db, "restaurants", id), updatePayload);
            await sleep(200);
          }
          updated++;
        }
        await sleep(300);
      }
      setImportStep("done");
      setImportPreview({ ...importPreview, added, updated, skipped });
    } catch (err) {
      showToast("匯入失敗：" + err.message, "error");
      setImportStep("preview");
    }
  };

  const resetImport = () => { setImportStep("idle"); setImportPreview(null); };

  // ── Manual CRUD ───────────────────────────────────────────────────
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newDeliveryNote, setNewDeliveryNote] = useState("");

  const addRestaurant = async () => {
    if (!newName.trim()) { showToast("請輸入名稱", "error"); return; }
    setSaving(true);
    await addDoc(collection(db, "restaurants"), {
      name: newName.trim(), type: newType, items: [],
      phone: newPhone.trim(), address: newAddress.trim(), deliveryNote: newDeliveryNote.trim(),
      createdAt: serverTimestamp()
    });
    setNewName(""); setNewType("food"); setNewPhone(""); setNewAddress(""); setNewDeliveryNote("");
    setShowAddForm(false); setSaving(false);
    showToast("✅ 新增成功！", "success");
  };

  const deleteRestaurant = async (id) => {
    if (!window.confirm("確定要刪除嗎？")) return;
    await deleteDoc(doc(db, "restaurants", id));
    if (editingId === id) setEditingId(null);
    showToast("已刪除");
  };

  const startEdit = (r) => {
    setEditingId(r.id);
    setEditItems([...(r.items || [])]);
    setEditInfo({ phone: r.phone || "", address: r.address || "", deliveryNote: r.deliveryNote || "" });
    setNewItemName(""); setNewItemPrice(""); setNewItemCategory("");
  };

  const addItem = () => {
    if (!newItemName.trim() || !newItemPrice) { showToast("請填寫名稱和價格", "error"); return; }
    const item = { name: newItemName.trim(), price: Number(newItemPrice) };
    if (newItemCategory.trim()) item.category = newItemCategory.trim();
    setEditItems([...editItems, item]);
    setNewItemName(""); setNewItemPrice(""); setNewItemCategory("");
  };

  const removeItem = (i) => setEditItems(editItems.filter((_, idx) => idx !== i));

  const moveItem = (i, dir) => {
    const arr = [...editItems];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setEditItems(arr);
  };

  const saveItems = async () => {
    setSaving(true);
    await updateDoc(doc(db, "restaurants", editingId), {
      items: editItems,
      phone: editInfo.phone.trim(),
      address: editInfo.address.trim(),
      deliveryNote: editInfo.deliveryNote.trim(),
    });
    setSaving(false); setEditingId(null);
    showToast("✅ 已儲存！", "success");
  };

  if (loading) return <div className="loading">載入中...</div>;

  const foodList = restaurants.filter(r => r.type === "food");
  const drinkList = restaurants.filter(r => r.type === "drink");

  // ── Import Preview ────────────────────────────────────────────────
  if (importStep === "preview" && importPreview) {
    const { stores, newStores, dupStores } = importPreview;
    return (
      <div className="page">
        <div className="top-bar">
          <button className="btn btn-icon" onClick={resetImport}>←</button>
          <h1>確認匯入內容</h1>
        </div>
        <div className="card" style={{ background: "var(--green-bg)", border: "1.5px solid #8DD4B0" }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
            共找到 {stores.length} 間店、{stores.reduce((s, r) => s + r.items.length, 0)} 個品項
          </div>
          <div style={{ fontSize: 13, color: "var(--text2)" }}>
            新增 {newStores.length} 間，已存在 {dupStores.length} 間
          </div>
        </div>
        {newStores.length > 0 && (
          <div className="card">
            <div className="card-title" style={{ color: "var(--green)" }}>✅ 新增（{newStores.length} 間）</div>
            {newStores.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--bg2)", fontSize: 14 }}>
                <span>{s.type === "food" ? "🍱" : "🧋"} {s.name}</span>
                <span className="badge badge-green">{s.items.length} 項</span>
              </div>
            ))}
          </div>
        )}
        {dupStores.length > 0 && (
          <div className="card">
            <div className="card-title" style={{ color: "var(--amber)" }}>⚠️ 已存在（{dupStores.length} 間）</div>
            {dupStores.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--bg2)", fontSize: 14 }}>
                <span>{s.type === "food" ? "🍱" : "🧋"} {s.name}</span>
                <span className="badge badge-amber">{s.items.length} 項</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <button className="btn btn-green" onClick={() => confirmImport("new_only")}>
            ✅ 只匯入新的（{newStores.length} 間）
          </button>
          {dupStores.length > 0 && (
            <button className="btn btn-outline" onClick={() => confirmImport("overwrite_all")}>
              🔄 全部匯入（覆蓋已存在的 {dupStores.length} 間）
            </button>
          )}
          <button className="btn btn-secondary" onClick={resetImport}>取消</button>
        </div>
      </div>
    );
  }

  // ── Importing ─────────────────────────────────────────────────────
  if (importStep === "importing") {
    const pct = importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0;
    return (
      <div className="page" style={{ textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>匯入中，請稍候...</div>
        <div style={{ color: "var(--text2)", fontSize: 14, marginTop: 8, marginBottom: 24 }}>正在寫入資料庫，請不要關閉視窗</div>
        {importProgress.total > 0 && (
          <div style={{ maxWidth: 300, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{importProgress.storeName}</span>
              <span>{importProgress.current} / {importProgress.total}</span>
            </div>
            <div style={{ background: "var(--bg2)", borderRadius: 8, height: 12, overflow: "hidden" }}>
              <div style={{ background: "var(--accent)", height: "100%", width: pct + "%", borderRadius: 8, transition: "width 0.3s ease" }} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--accent)", marginTop: 12 }}>{pct}%</div>
          </div>
        )}
      </div>
    );
  }

  // ── Import Done ───────────────────────────────────────────────────
  if (importStep === "done" && importPreview) {
    const { added = 0, updated = 0, skipped = 0 } = importPreview;
    return (
      <div className="page" style={{ textAlign: "center", paddingTop: 60 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>匯入完成！</h2>
        <div className="card" style={{ textAlign: "left", marginTop: 24 }}>
          {added > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--bg2)", fontSize: 15 }}><span>✅ 新增</span><span style={{ fontWeight: 700, color: "var(--green)" }}>{added} 間</span></div>}
          {updated > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--bg2)", fontSize: 15 }}><span>🔄 更新</span><span style={{ fontWeight: 700, color: "var(--purple)" }}>{updated} 間</span></div>}
          {skipped > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontSize: 15 }}><span>⏭️ 跳過</span><span style={{ fontWeight: 700, color: "var(--text2)" }}>{skipped} 間</span></div>}
        </div>
        <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={resetImport}>回到菜單庫</button>
      </div>
    );
  }

  // ── Main ──────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="top-bar">
        <button className="btn btn-icon" onClick={() => navigate("home")}>←</button>
        <h1>菜單庫管理</h1>
        <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddForm(true); setEditingId(null); }}>+ 新增</button>
      </div>

      {/* Excel Import */}
      <div className="card" style={{ background: "var(--purple-bg)", border: "1.5px solid #C4B5F5", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 24, flexShrink: 0 }}>📥</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>從 Excel 批次匯入菜單</div>
            <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 1 }}>支援 menu_simple.xlsx / menu_with_category.xlsx</div>
          </div>
          <button className="btn btn-sm" style={{ background: "var(--purple)", color: "white", border: "none", flexShrink: 0 }}
            onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? "讀取中..." : "選擇檔案"}
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFileSelect} />
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="card" style={{ border: "1.5px solid var(--accent)" }}>
          <div className="card-title">手動新增餐廳 / 飲料店</div>
          <div className="field">
            <label>類型</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className={`btn btn-sm ${newType === "food" ? "btn-primary" : "btn-secondary"}`} style={{ flex: 1 }} onClick={() => setNewType("food")}>🍱 餐廳</button>
              <button className={`btn btn-sm ${newType === "drink" ? "btn-primary" : "btn-secondary"}`} style={{ flex: 1 }} onClick={() => setNewType("drink")}>🧋 飲料店</button>
            </div>
          </div>
          <div className="field">
            <label>名稱</label>
            <input placeholder={newType === "food" ? "例：大碗公自助餐" : "例：50嵐"} value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>電話（選填）</label>
            <input placeholder="例：06-2306620" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
          </div>
          <div className="field">
            <label>地址（選填）</label>
            <input placeholder="例：台南市歸仁區中正南路一段37號" value={newAddress} onChange={e => setNewAddress(e.target.value)} />
          </div>
          <div className="field">
            <label>備註（選填）</label>
            <input placeholder="例：可外送、僅自取、需預訂" value={newDeliveryNote} onChange={e => setNewDeliveryNote(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={addRestaurant} disabled={saving}>{saving ? "新增中..." : "✅ 新增"}</button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddForm(false)}>取消</button>
          </div>
        </div>
      )}

      {/* Food List */}
      <div className="section-label">🍱 餐廳（{foodList.length} 間）</div>
      {foodList.length === 0 && <div className="empty" style={{ padding: "20px" }}><p>還沒有餐廳，點「選擇檔案」匯入 Excel</p></div>}
      {foodList.map(r => (
        <RestaurantCard key={r.id} restaurant={r} isEditing={editingId === r.id}
          editItems={editItems} editInfo={editInfo} setEditInfo={setEditInfo}
          newItemName={newItemName} newItemPrice={newItemPrice} newItemCategory={newItemCategory}
          setNewItemName={setNewItemName} setNewItemPrice={setNewItemPrice} setNewItemCategory={setNewItemCategory}
          onEdit={() => startEdit(r)} onDelete={() => deleteRestaurant(r.id)}
          onAddItem={addItem} onRemoveItem={removeItem} onMoveItem={moveItem}
          onSave={saveItems} onCancel={() => setEditingId(null)} saving={saving} />
      ))}

      {/* Drink List */}
      <div className="section-label">🧋 飲料店（{drinkList.length} 間）</div>
      {drinkList.length === 0 && <div className="empty" style={{ padding: "20px" }}><p>還沒有飲料店，點「選擇檔案」匯入 Excel</p></div>}
      {drinkList.map(r => (
        <RestaurantCard key={r.id} restaurant={r} isEditing={editingId === r.id}
          editItems={editItems} editInfo={editInfo} setEditInfo={setEditInfo}
          newItemName={newItemName} newItemPrice={newItemPrice} newItemCategory={newItemCategory}
          setNewItemName={setNewItemName} setNewItemPrice={setNewItemPrice} setNewItemCategory={setNewItemCategory}
          onEdit={() => startEdit(r)} onDelete={() => deleteRestaurant(r.id)}
          onAddItem={addItem} onRemoveItem={removeItem} onMoveItem={moveItem}
          onSave={saveItems} onCancel={() => setEditingId(null)} saving={saving} />
      ))}

      <Toast msg={toast.msg} type={toast.type} />
    </div>
  );
}

function RestaurantCard({
  restaurant, isEditing, editItems,
  newItemName, newItemPrice, newItemCategory,
  setNewItemName, setNewItemPrice, setNewItemCategory,
  onEdit, onDelete, onAddItem, onRemoveItem, onMoveItem, onSave, onCancel, saving
}) {
  return (
    <div className="card" style={{ borderColor: isEditing ? "var(--accent)" : "var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: isEditing ? 14 : 0 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: restaurant.type === "food" ? "#FFF0EB" : "var(--purple-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
          {restaurant.type === "food" ? "🍱" : "🧋"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{restaurant.name}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 1 }}>{(restaurant.items || []).length} 個品項</div>
          {restaurant.phone && <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 1 }}>📞 {restaurant.phone}</div>}
          {restaurant.address && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>📍 {restaurant.address}</div>}
          {restaurant.deliveryNote && <div style={{ fontSize: 11, color: "var(--green)", marginTop: 1 }}>🛵 {restaurant.deliveryNote}</div>}
        </div>
        {!isEditing && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button className="btn btn-secondary btn-sm" onClick={onEdit}>✏️ 編輯</button>
            <button onClick={onDelete} style={{ background: "var(--red-bg)", color: "var(--red)", border: "none", padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap" }}>刪除</button>
          </div>
        )}
      </div>

      {/* View mode preview */}
      {!isEditing && (restaurant.items || []).length > 0 && (
        <div style={{ marginTop: 10, borderTop: "1px solid var(--bg2)", paddingTop: 10 }}>
          {(restaurant.items || []).slice(0, 5).map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "3px 0", color: "var(--text2)", gap: 8 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.category && <span style={{ fontSize: 11, background: "var(--bg2)", borderRadius: 4, padding: "1px 5px", marginRight: 5, color: "var(--text3)", whiteSpace: "nowrap" }}>{item.category}</span>}
                {item.name}
              </span>
              <span style={{ fontWeight: 600, color: restaurant.type === "food" ? "var(--accent)" : "var(--purple)", flexShrink: 0 }}>$ {item.price}</span>
            </div>
          ))}
          {(restaurant.items || []).length > 5 && (
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>還有 {restaurant.items.length - 5} 個品項...</div>
          )}
        </div>
      )}

      {/* Edit mode */}
      {isEditing && (
        <div>
          {/* Store info editing */}
          <div style={{ marginBottom: 14, padding: "12px", background: "var(--bg2)", borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 10 }}>📋 店家資訊</div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 4 }}>📞 電話</div>
              <input style={{ width: "100%", padding: "8px 11px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: "var(--card)", color: "var(--text)", boxSizing: "border-box" }}
                placeholder="例：06-2306620"
                value={editInfo.phone}
                onChange={e => setEditInfo(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 4 }}>📍 地址</div>
              <input style={{ width: "100%", padding: "8px 11px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: "var(--card)", color: "var(--text)", boxSizing: "border-box" }}
                placeholder="例：台南市歸仁區中正南路一段37號"
                value={editInfo.address}
                onChange={e => setEditInfo(prev => ({ ...prev, address: e.target.value }))}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 4 }}>🛵 外送/自取備註</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                {["可外送","僅自取","外送+自取"].map(opt => (
                  <button key={opt} onClick={() => setEditInfo(prev => ({ ...prev, deliveryNote: opt }))}
                    style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontFamily: "inherit", cursor: "pointer",
                      background: editInfo.deliveryNote === opt ? "var(--green)" : "var(--bg2)",
                      color: editInfo.deliveryNote === opt ? "white" : "var(--text2)",
                      border: `1.5px solid ${editInfo.deliveryNote === opt ? "var(--green)" : "var(--border)"}`,
                    }}>{opt}</button>
                ))}
              </div>
              <input style={{ width: "100%", padding: "8px 11px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: "var(--card)", color: "var(--text)", boxSizing: "border-box" }}
                placeholder="或自行填寫備註..."
                value={editInfo.deliveryNote}
                onChange={e => setEditInfo(prev => ({ ...prev, deliveryNote: e.target.value }))}
              />
            </div>
          </div>

          {editItems.length === 0
            ? <p style={{ color: "var(--text3)", fontSize: 13, marginBottom: 12 }}>還沒有品項，從下方新增</p>
            : (
              <div style={{ marginBottom: 14, maxHeight: 320, overflowY: "auto" }}>
                {editItems.map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--bg2)" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                      <button onClick={() => onMoveItem(i, -1)} disabled={i === 0} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text3)", lineHeight: 1, padding: "1px 4px" }}>▲</button>
                      <button onClick={() => onMoveItem(i, 1)} disabled={i === editItems.length - 1} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text3)", lineHeight: 1, padding: "1px 4px" }}>▼</button>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                      {item.category && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>{item.category}</div>}
                    </div>
                    <span className="badge badge-amber" style={{ fontSize: 12, flexShrink: 0 }}>$ {item.price}</span>
                    <button onClick={() => onRemoveItem(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", fontSize: 16, padding: "0 4px", flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            )
          }

          {/* Add item form - stacked layout to prevent overflow */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                style={{ flex: 1, padding: "9px 11px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: "var(--card)", color: "var(--text)", minWidth: 0 }}
                placeholder="品項名稱"
                value={newItemName} onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && onAddItem()}
              />
              <input
                style={{ width: 76, padding: "9px 11px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: "var(--card)", color: "var(--text)", flexShrink: 0 }}
                placeholder="價格" type="number"
                value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)}
                onKeyDown={e => e.key === "Enter" && onAddItem()}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ flex: 1, padding: "9px 11px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: "var(--card)", color: "var(--text)", minWidth: 0 }}
                placeholder="分類（選填，例：麵食系列）"
                value={newItemCategory} onChange={e => setNewItemCategory(e.target.value)}
                onKeyDown={e => e.key === "Enter" && onAddItem()}
              />
              <button className="btn btn-secondary btn-sm" onClick={onAddItem} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>+ 新增</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={onSave} disabled={saving}>{saving ? "儲存中..." : "💾 儲存菜單"}</button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onCancel}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
