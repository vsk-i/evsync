import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v = v / 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : i === 1 ? 0 : 1;
  return `${v.toFixed(digits)} ${units[i]}`;
}

function StatusPill({ tone, children }) {
  const styleByTone = {
    ok: {
      background: "rgba(35, 213, 171, 0.14)",
      border: "1px solid rgba(35, 213, 171, 0.30)",
      color: "rgba(255,255,255,0.92)",
    },
    warn: {
      background: "rgba(255, 215, 0, 0.12)",
      border: "1px solid rgba(255, 215, 0, 0.25)",
      color: "rgba(255,255,255,0.92)",
    },
    danger: {
      background: "rgba(255, 77, 109, 0.12)",
      border: "1px solid rgba(255, 77, 109, 0.28)",
      color: "rgba(255,255,255,0.92)",
    },
    info: {
      background: "rgba(124, 92, 255, 0.14)",
      border: "1px solid rgba(124, 92, 255, 0.30)",
      color: "rgba(255,255,255,0.92)",
    },
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        borderRadius: 999,
        fontSize: 12,
        ...styleByTone[tone],
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background:
            tone === "ok"
              ? "var(--accent-2)"
              : tone === "danger"
              ? "var(--danger)"
              : tone === "warn"
              ? "gold"
              : "var(--accent)",
          boxShadow: "0 0 0 4px rgba(255,255,255,0.04)",
        }}
      />
      {children}
    </span>
  );
}

function DownloadPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("t") || "", [searchParams]);

  const [meta, setMeta] = useState(null);
  const [password, setPassword] = useState("");
  const [uiError, setUiError] = useState("");
  const [busy, setBusy] = useState(false);

  const reloadMeta = async () => {
    setUiError("");
    try {
      const r = await fetch(`/link/${id}`);
      const data = await r.json();
      setMeta(data);
    } catch (e) {
      console.error(e);
      setUiError("Не удалось загрузить информацию о ссылке (ошибка сети).");
    }
  };

  useEffect(() => {
    setMeta(null);
    reloadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const computed = useMemo(() => {
    if (!meta || meta.error) return { tone: "info", text: "Загрузка..." };

    if (!token) return { tone: "danger", text: "В ссылке отсутствует токен доступа" };

    if (meta.expired) return { tone: "danger", text: "Ссылка истекла" };

    if (meta.downloadsLeft <= 0) return { tone: "danger", text: "Лимит скачиваний исчерпан" };

    if (meta.passwordRequired) return { tone: "warn", text: "Нужен пароль для скачивания" };

    return { tone: "ok", text: "Готово к скачиванию" };
  }, [meta, token]);

  const doDownload = async (asZip) => {
    setUiError("");

    if (!token) {
      setUiError("Не хватает токена (?t=...). Попросите отправителя прислать корректную ссылку.");
      return;
    }
    if (!meta || meta.error) return;

    if (meta.expired) {
      setUiError("Ссылка уже истекла.");
      return;
    }
    if (meta.downloadsLeft <= 0) {
      setUiError("Лимит скачиваний исчерпан.");
      return;
    }
    if (meta.passwordRequired && !password) {
      setUiError("Введите пароль.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/link/${id}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password: meta.passwordRequired ? password : undefined,
          zip: asZip,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUiError(data?.error ? `Ошибка: ${data.error}` : "Ошибка скачивания");
        setBusy(false);
        await reloadMeta(); // вдруг лимит/ttl изменился
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;

      const baseName = meta.originalName || "download";
      a.download = asZip ? `${baseName}.zip` : baseName;

      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);

      await reloadMeta();
    } catch (e) {
      console.error(e);
      setUiError("Ошибка сети при скачивании.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="h1">Скачивание</h1>
      <p className="sub">
        Это страница Evsync для безопасного скачивания файла по ссылке.
      </p>

      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <StatusPill tone={computed.tone}>{computed.text}</StatusPill>
        {meta && !meta.error && (
          <>
            <span className="badge">Осталось: {meta.downloadsLeft}</span>
            <span className="badge">
              Истекает: {new Date(meta.expiresAt).toLocaleString()}
            </span>
          </>
        )}
      </div>

      <div className="row" style={{ marginTop: 18 }}>
        <div className="card">
          {!meta && !uiError && <div className="sub">Загружаем данные…</div>}

          {uiError && <p className="err">{uiError}</p>}

          {meta && meta.error && (
            <p className="err">Ошибка: {meta.error}</p>
          )}

          {meta && !meta.error && (
            <>
              <div style={{ display: "grid", gap: 8 }}>
                <div>
                  <span className="label">Файл</span>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{meta.originalName}</div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span className="badge">Размер: {formatBytes(meta.size)}</span>
                  <span className="badge">
                    Пароль: {meta.passwordRequired ? "нужен" : "не нужен"}
                  </span>
                </div>
              </div>

              {meta.passwordRequired && (
                <div style={{ marginTop: 14 }}>
                  <label className="label">Пароль</label>
                  <input
                    className="input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Введите пароль"
                  />
                  <div className="sub" style={{ marginTop: 6 }}>
                    Пароль не хранится в URL и отправляется только при скачивании.
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <button className="btn" disabled={busy || computed.tone === "danger"} onClick={() => doDownload(false)}>
                  {busy ? "Скачиваем..." : "Скачать"}
                </button>

                <button className="btn secondary" disabled={busy || computed.tone === "danger"} onClick={() => doDownload(true)}>
                  Скачать ZIP
                </button>

                <button className="btn secondary" disabled={busy} onClick={reloadMeta}>
                  Обновить
                </button>
              </div>

              {computed.tone === "danger" && (
                <div className="sub" style={{ marginTop: 12 }}>
                  Если ссылка истекла или лимит закончился — отправитель должен загрузить файл заново.
                </div>
              )}
            </>
          )}
        </div>

        <div className="card">
          <div style={{ fontWeight: 800 }}>Подсказки</div>
          <div className="sub" style={{ marginTop: 8 }}>
            • Если требуется пароль — попросите его у отправителя.<br />
            • ZIP полезен, когда хотите “как архив”.<br />
            • Ссылки могут быть одноразовыми и автоматически удаляться.
          </div>

          <div className="hr" />

          <div className="sub">
            Хотите создать свою ссылку?
          </div>
          <div style={{ marginTop: 10 }}>
            <Link className="btn secondary" to="/">
              Перейти к загрузке
            </Link>
          </div>

          <div className="hr" />

          <div className="mono">
            ID: {id}
            <br />
            Token: {token ? token.slice(0, 10) + "…" : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DownloadPage;
