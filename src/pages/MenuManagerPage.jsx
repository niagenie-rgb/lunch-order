import { useState, useEffect, useRef } from "react";
import {
  collection, addDoc, deleteDoc, updateDoc,
  doc, onSnapshot, serverTimestamp, writeBatch
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
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null); // { stores: [...] }
  const [importStep, setImportStep] = useState("idle"); // idle | preview | importing | done
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

  // ── Excel 匯入 ──────────────────────────────────────────────────────
  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      showToast("請選擇 .xlsx 格式的 Excel 檔案", "error");
      return;
    }

    setImporting(true);
    try {
      // Dynamically load SheetJS
      if (!window.XLSX) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const data = await file.arrayBuffer();
      const workbook = window.XLSX.read(data, { type: "array" });

      // Find the sheet with menu data (look for 餐廳菜單, 飲料菜單, or any sheet with store_name column)
      let allRows = [];
      const targetSheets = ["🍱 餐廳菜單", "🧋 飲料菜單", "📋 匯入範本"];

      for (const sheetName of workbook.SheetNames) {
        if (sheetName.includes("說明") || sheetName.includes("統計")) continue;
        const sheet = workbook.Sheets[sheetName];
        const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (rows.length > 0 && rows[0].store_name !== undefined) {
          allRows = [...allRows, ...rows];
        }
      }

      if (allRows.length === 0) {
        showToast("找不到有效資料，請確認 Excel 格式是否正確", "error");
        setImporting(false);
        return;
      }

      // Group by store_name
      const storeMap = {};
      for (const row of allRows) {
        const name = String(row.store_name || "").trim();
        const type = String(row.store_type || "").trim();
        const itemName = String(row.item_name || "").trim();
        const price = Number(row.price) || 0;
        const temperature = String(row.temperature || "").trim();
        const iceOptions = String(row.ice_options || "").trim();
        const sugarOptions = String(row.sugar_options || "").trim();

        if (!name || !itemName || !type) continue;
        if (name.startsWith("（範例）") || itemName.startsWith("（範例）")) continue;

        if (!storeMap[name]) {
          storeMap[name] = {
            name,
            type: type === "drink" ? "drink" : "food",
            items: [],
            temperature: temperature || (type === "drink" ? "冷熱均可" : ""),
            iceOptions: iceOptions || "",
            sugarOptions: sugarOptions || "",
          };
        }
        if (price > 0) {
          storeMap[name].items.push({
            name: itemName,
            price,
            ...(type === "drink" && {
              temperature: temperature || storeMap[name].temperature,
              iceOptions: iceOptions || storeMap[name].iceOptions,
              sugarOptions: sugarOptions || storeMap[name].sugarOptions,
            })
          });
        }
      }

      const stores = Object.values(storeMap).filter(s => s.items.length > 0);
      if (stores.length === 0) {
        showToast("Excel 裡沒有找到有效品項，請檢查格式", "error");
        setImporting(false);
        return;
      }

      // Check duplicates with existing
      const existingNames = new Set(restaurants.map(r => r.name));
      const newStores = stores.filter(s => !existingNames.has(s.name));
      const dupStores = stores.filter(s => existingNames.has(s.name));

      setImportPreview({ stores, newStores, dupStores });
      setImportStep("preview");
    } catch (err) {
      console.error(err);
      showToast("讀取 Excel 失敗：" + err.message, "error");
    }
    setImporting(false);
    // Reset file input
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
      const toUpdate = mode === "overwrite_all"
        ? stores.filter(s => existingMap[s.name])
        : [];
      skipped = mode === "new_only" ? dupStores.length : 0;

      const allTasks = [
        ...toAdd.map(s => ({ s, op: "add" })),
        ...toUpdate.map(s => ({ s, op: "update" }))
      ];
      const total = allTasks.length;

      for (let i = 0; i < allTasks.length; i++) {
        const { s, op } = allTasks[i];
        setImportProgress({ current: i + 1, total, storeName: s.name });

        // Split items into chunks of 10 to avoid Firestore document size limits
        const CHUNK = 10;
        const chunks = [];
        for (let j = 0; j < s.items.length; j += CHUNK) {
          chunks.push(s.items.slice(j, j + CHUNK));
        }

        if (op === "add") {
          // Write first chunk when creating
          const firstItems = chunks[0] || [];
          const ref = await addDoc(collection(db, "restaurants"), {
            name: s.name, type: s.type, items: firstItems, createdAt: serverTimestamp(),
          });
          await sleep(200);
          // Append remaining chunks
          let allItems = [...firstItems];
          for (let c = 1; c < chunks.length; c++) {
            allItems = [...allItems, ...chunks[c]];
            await updateDoc(doc(db, "restaurants", ref.id), { items: allItems });
            await sleep(200);
          }
          added++;
        } else {
          // Overwrite in chunks
          let allItems = [];
          const id = existingMap[s.name];
          for (let c = 0; c < chunks.length; c++) {
            allItems = [...allItems, ...chunks[c]];
            await updateDoc(doc(db, "restaurants", id), { items: allItems });
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

  const resetImport = () => {
    setImportStep("idle");
    setImportPreview(null);
  };

  // ── 手動新增 ──────────────────────────────────────────────────────
  const addRestaurant = async () => {
    if (!newName.trim()) { showToast("請輸入名稱", "error"); return; }
    setSaving(true);
    await addDoc(collection(db, "restaurants"), {
      name: newName.trim(), type: newType, items: [], createdAt: serverTimestamp(),
    });
    setNewName(""); setNewType("food"); setShowAddForm(false); setSaving(false);
    showToast("✅ 新增成功！", "success");
  };

  const deleteRestaurant = async (id) => {
    if (!window.confirm("確定要刪除這間餐廳/飲料店嗎？")) return;
    await deleteDoc(doc(db, "restaurants", id));
    if (editingId === id) setEditingId(null);
    showToast("已刪除");
  };

  const startEdit = (restaurant) => {
    setEditingId(restaurant.id);
    setEditItems([...(restaurant.items || [])]);
    setNewItemName(""); setNewItemPrice("");
  };

  const addItem = () => {
    if (!newItemName.trim() || !newItemPrice) { showToast("請填寫名稱和價格", "error"); return; }
    setEditItems([...editItems, { name: newItemName.trim(), price: Number(newItemPrice) }]);
    setNewItemName(""); setNewItemPrice("");
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
    await updateDoc(doc(db, "restaurants", editingId), { items: editItems });
    setSaving(false); setEditingId(null);
    showToast("✅ 菜單已儲存！", "success");
  };

  if (loading) return <div className="loading">載入中...</div>;

  const foodList = restaurants.filter(r => r.type === "food");
  const drinkList = restaurants.filter(r => r.type === "drink");

  // ── 匯入預覽畫面 ──────────────────────────────────────────────────
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
            {foodList.length > 0 || drinkList.length > 0
              ? `其中 ${newStores.length} 間是新的、${dupStores.length} 間已存在`
              : "全部都是新的！"
            }
          </div>
        </div>

        {/* New stores */}
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

        {/* Duplicate stores */}
        {dupStores.length > 0 && (
          <div className="card">
            <div className="card-title" style={{ color: "var(--amber)" }}>⚠️ 已存在（{dupStores.length} 間）</div>
            {dupStores.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--bg2)", fontSize: 14 }}>
                <span>{s.type === "food" ? "🍱" : "🧋"} {s.name}</span>
                <span className="badge badge-amber">{s.items.length} 項</span>
              </div>
            ))}
            <p style={{ fontSize: 12, color: "var(--amber)", marginTop: 10 }}>
              以下按鈕可選擇要跳過，或覆蓋更新這些已存在的店家
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <button className="btn btn-green" onClick={() => confirmImport("new_only")}>
            ✅ 只匯入新的（{newStores.length} 間）{dupStores.length > 0 ? `，跳過已存在的` : ""}
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

  // ── 匯入中 ──────────────────────────────────────────────────────────
  if (importStep === "importing") {
    const pct = importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0;
    return (
      <div className="page" style={{ textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>匯入中，請稍候...</div>
        <div style={{ color: "var(--text2)", fontSize: 14, marginTop: 8, marginBottom: 24 }}>
          正在寫入資料庫，請不要關閉視窗
        </div>
        {importProgress.total > 0 && (
          <div style={{ maxWidth: 300, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>
              <span>{importProgress.storeName}</span>
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

  // ── 匯入完成 ──────────────────────────────────────────────────────
  if (importStep === "done" && importPreview) {
    const { added = 0, updated = 0, skipped = 0 } = importPreview;
    return (
      <div className="page" style={{ textAlign: "center", paddingTop: 60 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>匯入完成！</h2>

        <div className="card" style={{ textAlign: "left", marginTop: 24 }}>
          {added > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--bg2)", fontSize: 15 }}>
              <span>✅ 新增</span>
              <span style={{ fontWeight: 700, color: "var(--green)" }}>{added} 間</span>
            </div>
          )}
          {updated > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--bg2)", fontSize: 15 }}>
              <span>🔄 更新</span>
              <span style={{ fontWeight: 700, color: "var(--purple)" }}>{updated} 間</span>
            </div>
          )}
          {skipped > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontSize: 15 }}>
              <span>⏭️ 跳過（已存在）</span>
              <span style={{ fontWeight: 700, color: "var(--text2)" }}>{skipped} 間</span>
            </div>
          )}
        </div>

        <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={resetImport}>
          回到菜單庫
        </button>
      </div>
    );
  }

  // ── 主畫面 ────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="top-bar">
        <button className="btn btn-icon" onClick={() => navigate("home")}>←</button>
        <h1>菜單庫管理</h1>
        <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddForm(true); setEditingId(null); }}>
          + 新增
        </button>
      </div>

      {/* Excel 匯入區塊 */}
      <div className="card" style={{ background: "var(--purple-bg)", border: "1.5px solid #C4B5F5", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>📥</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>從 Excel 批次匯入菜單</div>
            <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>
              支援 menu_full.xlsx 格式，一次匯入所有餐廳和飲料店
            </div>
          </div>
          <button
            className="btn btn-sm"
            style={{ background: "var(--purple)", color: "white", border: "none", flexShrink: 0 }}
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? "讀取中..." : "選擇檔案"}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />
        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 8 }}>
          💡 請選擇之前下載的 menu_full.xlsx 檔案
        </div>
      </div>

      {/* 手動新增表單 */}
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
            <input placeholder={newType === "food" ? "例：大碗公自助餐" : "例：50嵐"} value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addRestaurant()} autoFocus />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={addRestaurant} disabled={saving}>{saving ? "新增中..." : "✅ 新增"}</button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddForm(false)}>取消</button>
          </div>
        </div>
      )}

      {/* 餐廳列表 */}
      <div className="section-label">🍱 餐廳（{foodList.length} 間）</div>
      {foodList.length === 0 && (
        <div className="empty" style={{ padding: "20px" }}>
          <p>還沒有餐廳，點上方「選擇檔案」匯入 Excel，或點「+ 新增」手動建立</p>
        </div>
      )}
      {foodList.map(r => (
        <RestaurantCard key={r.id} restaurant={r} isEditing={editingId === r.id}
          editItems={editItems} newItemName={newItemName} newItemPrice={newItemPrice}
          setNewItemName={setNewItemName} setNewItemPrice={setNewItemPrice}
          onEdit={() => startEdit(r)} onDelete={() => deleteRestaurant(r.id)}
          onAddItem={addItem} onRemoveItem={removeItem} onMoveItem={moveItem}
          onSave={saveItems} onCancel={() => setEditingId(null)} saving={saving} />
      ))}

      {/* 飲料店列表 */}
      <div className="section-label">🧋 飲料店（{drinkList.length} 間）</div>
      {drinkList.length === 0 && (
        <div className="empty" style={{ padding: "20px" }}>
          <p>還沒有飲料店，點上方「選擇檔案」匯入 Excel</p>
        </div>
      )}
      {drinkList.map(r => (
        <RestaurantCard key={r.id} restaurant={r} isEditing={editingId === r.id}
          editItems={editItems} newItemName={newItemName} newItemPrice={newItemPrice}
          setNewItemName={setNewItemName} setNewItemPrice={setNewItemPrice}
          onEdit={() => startEdit(r)} onDelete={() => deleteRestaurant(r.id)}
          onAddItem={addItem} onRemoveItem={removeItem} onMoveItem={moveItem}
          onSave={saveItems} onCancel={() => setEditingId(null)} saving={saving} />
      ))}

      <Toast msg={toast.msg} type={toast.type} />
    </div>
  );
}

function RestaurantCard({ restaurant, isEditing, editItems, newItemName, newItemPrice,
  setNewItemName, setNewItemPrice, onEdit, onDelete, onAddItem, onRemoveItem, onMoveItem,
  onSave, onCancel, saving }) {
  return (
    <div className="card" style={{ borderColor: isEditing ? "var(--accent)" : "var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: isEditing ? 14 : 0 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: restaurant.type === "food" ? "#FFF0EB" : "var(--purple-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
          {restaurant.type === "food" ? "🍱" : "🧋"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{restaurant.name}</div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 1 }}>{(restaurant.items || []).length} 個品項</div>
        </div>
        {!isEditing && (
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={onEdit}>✏️ 編輯</button>
            <button onClick={onDelete} style={{ background: "var(--red-bg)", color: "var(--red)", border: "none", padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>刪除</button>
          </div>
        )}
      </div>

      {/* 檢視模式：顯示品項 */}
      {!isEditing && (restaurant.items || []).length > 0 && (
        <div style={{ marginTop: 10, borderTop: "1px solid var(--bg2)", paddingTop: 10 }}>
          {(restaurant.items || []).slice(0, 5).map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0", color: "var(--text2)" }}>
              <span>{item.name}</span>
              <span style={{ fontWeight: 600, color: restaurant.type === "food" ? "var(--accent)" : "var(--purple)" }}>$ {item.price}</span>
            </div>
          ))}
          {(restaurant.items || []).length > 5 && (
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>還有 {restaurant.items.length - 5} 個品項...</div>
          )}
        </div>
      )}

      {/* 編輯模式 */}
      {isEditing && (
        <div>
          {editItems.length === 0
            ? <p style={{ color: "var(--text3)", fontSize: 13, marginBottom: 12 }}>還沒有品項，從下方新增</p>
            : (
              <div style={{ marginBottom: 14, maxHeight: 320, overflowY: "auto" }}>
                {editItems.map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--bg2)" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <button onClick={() => onMoveItem(i, -1)} disabled={i === 0} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text3)", lineHeight: 1, padding: "1px 4px" }}>▲</button>
                      <button onClick={() => onMoveItem(i, 1)} disabled={i === editItems.length - 1} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text3)", lineHeight: 1, padding: "1px 4px" }}>▼</button>
                    </div>
                    <span style={{ flex: 1, fontSize: 14 }}>{item.name}</span>
                    <span className="badge badge-amber" style={{ fontSize: 12 }}>$ {item.price}</span>
                    <button onClick={() => onRemoveItem(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", fontSize: 16, padding: "0 4px" }}>✕</button>
                  </div>
                ))}
              </div>
            )
          }
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <input style={{ flex: 2, padding: "9px 11px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: "var(--card)", color: "var(--text)" }} placeholder="品項名稱" value={newItemName} onChange={e => setNewItemName(e.target.value)} onKeyDown={e => e.key === "Enter" && onAddItem()} />
            <input style={{ flex: 1, padding: "9px 11px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: "var(--card)", color: "var(--text)" }} placeholder="價格" type="number" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} onKeyDown={e => e.key === "Enter" && onAddItem()} />
            <button className="btn btn-secondary btn-sm" onClick={onAddItem} style={{ flexShrink: 0 }}>+ 新增</button>
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
