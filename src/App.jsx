import { useState, useEffect } from "react";
import HomePage from "./pages/HomePage";
import OrganizerPage from "./pages/OrganizerPage";
import OrderPage from "./pages/OrderPage";
import MyOrderPage from "./pages/MyOrderPage";
import HistoryPage from "./pages/HistoryPage";
import MenuManagerPage from "./pages/MenuManagerPage";
import "./App.css";

export default function App() {
  const [page, setPage] = useState("home");
  const [sessionId, setSessionId] = useState(null);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    // Parse URL params for routing
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session");
    const uid = params.get("uid");
    const p = params.get("page");

    if (sid) {
      setSessionId(sid);
      if (uid) setUserId(uid);
      if (p === "myorder") setPage("myorder");
      else if (p === "history") setPage("history");
      else setPage("order");
    }
  }, []);

  const navigate = (p, sid, uid) => {
    setPage(p);
    if (sid) setSessionId(sid);
    if (uid) setUserId(uid);
  };

  return (
    <div className="app">
      {page === "home" && <HomePage navigate={navigate} />}
      {page === "organizer" && <OrganizerPage navigate={navigate} sessionId={sessionId} setSessionId={setSessionId} />}
      {page === "order" && <OrderPage navigate={navigate} sessionId={sessionId} userId={userId} setUserId={setUserId} />}
      {page === "myorder" && <MyOrderPage navigate={navigate} sessionId={sessionId} userId={userId} />}
      {page === "history" && <HistoryPage navigate={navigate} />}
      {page === "menumanager" && <MenuManagerPage navigate={navigate} />}
    </div>
  );
}
