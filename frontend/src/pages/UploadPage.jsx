import { useRef, useState } from "react";

function UploadPage() {
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [maxDownloads, setMaxDownloads] = useState(1);
  const [ttlMinutes, setTtlMinutes] = useState(60);
  const [password, setPassword] = useState("");

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const onPickFile = (f) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setError("");
    setProgress(0);
  };

  const uploadFile = () => {
    if (!file || uploading) return;

    setUploading(true);
    setError("");
    setProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("maxDownloads", String(maxDownloads));
    formData.append("ttlMinutes", String(ttlMinutes));
    if (password.trim()) formData.append("password", password);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/upload");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const p = Math.round((e.loaded / e.total) * 100);
        setProgress(p);
      }
    };

    xhr.onload = () => {
      setUploading(false);

      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) {
          setError(data?.error || "Ошибка загрузки");
          return;
        }

        const url = new URL(data.downloadUrl);
        const token = url.searchParams.get("t");
        const frontendLink = `${window.location.origin}/download/${data.id}?t=${token}`;

        setResult({
          ...data,
          frontendLink,
        });
      } catch {
        setError("Некорректный ответ сервера");
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setError("Ошибка сети");
    };

    xhr.send(formData);
  };

  return (
    <div>
      <h1 className="h1">Загрузка файла</h1>
      <p className="sub">
        Перетащите файл или выберите его вручную. Evsync создаст защищённую ссылку
        с ограничениями.
      </p>

      <div className="row">
        {/* Левая колонка */}
        <div className="card">
          {/* Drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onPickFile(e.dataTransfer.files?.[0]);
            }}
            style={{
              border: "2px dashed var(--border)",
              borderRadius: 16,
              padding: 28,
              textAlign: "center",
              cursor: "pointer",
              background: file ? "rgba(124,92,255,0.08)" : "transparent",
            }}
          >
            {!file ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  Перетащите файл сюда
                </div>
                <div className="sub">или нажмите, чтобы выбрать</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700 }}>{file.name}</div>
                <div className="sub">{file.size} байт</div>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={(e) => onPickFile(e.target.files?.[0])}
          />

          {/* Прогресс */}
          {uploading && (
            <div style={{ marginTop: 14 }}>
              <div className="badge">Загрузка: {progress}%</div>
              <div
                style={{
                  height: 8,
                  background: "rgba(255,255,255,0.08)",
                  borderRadius: 999,
                  marginTop: 8,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    background:
                      "linear-gradient(90deg, var(--accent), var(--accent-2))",
                  }}
                />
              </div>
            </div>
          )}

          <div className="hr" />

          <button className="btn" onClick={uploadFile} disabled={!file || uploading}>
            {uploading ? "Загружается..." : "Загрузить файл"}
          </button>

          {error && <p className="err">{error}</p>}
        </div>

        {/* Правая колонка */}
        <div className="card">
          <label className="label">Лимит скачиваний</label>
          <input
            className="input"
            type="number"
            min={1}
            max={1000}
            value={maxDownloads}
            onChange={(e) => setMaxDownloads(Number(e.target.value))}
          />

          <label className="label" style={{ marginTop: 12 }}>
            Срок жизни ссылки (в минутах)
          </label>
          <input
            className="input"
            type="number"
            min={1}
            max={43200}
            value={ttlMinutes}
            onChange={(e) => setTtlMinutes(Number(e.target.value))}
          />

          <label className="label" style={{ marginTop: 12 }}>
            Пароль (необязательно)
          </label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Оставьте пустым, если не нужен"
          />
        </div>
      </div>

      {/* Результат */}
      {result && (
        <div className="card" style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 700 }}>Ссылка готова 🎉</div>

          <div className="mono" style={{ marginTop: 8 }}>
            {result.frontendLink}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button
              className="btn secondary"
              onClick={() => navigator.clipboard.writeText(result.frontendLink)}
            >
              Скопировать
            </button>

            <a className="btn" href={result.frontendLink} target="_blank" rel="noreferrer">
              Открыть страницу скачивания
            </a>
          </div>

          <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
            Осталось скачиваний: {result.downloadsLeft} •
            Истекает: {new Date(result.expiresAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

export default UploadPage;
