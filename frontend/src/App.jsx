import { Routes, Route, NavLink } from "react-router-dom";
import UploadPage from "./pages/UploadPage.jsx";
import DownloadPage from "./pages/DownloadPage.jsx";

function App() {
  return (
    <div className="container">
      <header className="topbar">
        <div className="brand">
          <div className="logo" />
          <div>
            <div style={{ fontSize: 14 }}>Evsync</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
              share files fast • links with limits • ttl • zip
            </div>
          </div>
        </div>

        <nav className="nav">
          <NavLink
            to="/"
            className={({ isActive }) => `pill ${isActive ? "active" : ""}`}
          >
            Upload
          </NavLink>
        </nav>
      </header>

      <main className="page">
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/download/:id" element={<DownloadPage />} />
        </Routes>
      </main>

      <div style={{ marginTop: 14, color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
        Evsync — local build • ready for hosting
      </div>
    </div>
  );
}

export default App;
