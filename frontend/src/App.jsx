import { useCallback, useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import Tesseract from "tesseract.js";

import {
  analyzeMessage,
  clearToken,
  deleteAnalysis,
  getHistory,
  getProfile,
  getToken,
  login,
  logout,
  register,
  saveAnalysis,
} from "./services/api";

const riskLabels = {
  low: "Aşağı risk",
  medium: "Şübhəli",
  high: "Yüksək risk",
  safe: "Aşağı risk",
  suspicious: "Şübhəli",
  dangerous: "Yüksək risk",
  critical: "Yüksək risk",
};

function getRisk(result = {}) {
  const value = String(
    result.risk_level ?? result.category ?? ""
  ).toLowerCase();

  if (/critical|high|danger|yüksək/.test(value)) {
    return { label: "Yüksək risk", className: "high" };
  }

  if (/medium|suspicious|şübhəli|orta/.test(value)) {
    return { label: "Şübhəli", className: "medium" };
  }

  if (/low|safe|təhlükəsiz|aşağı/.test(value)) {
    return {
      label: riskLabels[value] || "Aşağı risk",
      className: "low",
    };
  }

  if (
    result.risk_score !== null &&
    result.risk_score !== undefined &&
    result.risk_score !== "" &&
    Number.isFinite(Number(result.risk_score))
  ) {
    const score = Number(result.risk_score);

    if (score >= 70) {
      return { label: "Yüksək risk", className: "high" };
    }

    if (score >= 35) {
      return { label: "Şübhəli", className: "medium" };
    }

    return { label: "Aşağı risk", className: "low" };
  }

  return {
    label: value || "Nəticə hazırdır",
    className: "medium",
  };
}

function getContactFields(contact) {
  if (!contact) return [];

  if (typeof contact === "string") {
    const raw = contact.trim();
    if (!raw) return [];

    try {
      return getContactFields(JSON.parse(raw));
    } catch {
      return [{ label: "Məlumat", value: raw }];
    }
  }

  if (Array.isArray(contact)) {
    return contact.flatMap((item) => getContactFields(item));
  }

  if (typeof contact !== "object") {
    return [{ label: "Məlumat", value: String(contact) }];
  }

  const labels = {
    organization: "Təşkilat",
    organization_name: "Təşkilat",
    company: "Təşkilat",
    company_name: "Rəsmi Şirkət",
    institution: "Təşkilat",
    name: "Təşkilat",
    phone: "Telefon",
    phones: "Telefon(lar)",
    telephone: "Telefon",
    phone_number: "Telefon",
    support_phone: "Rəsmi Dəstək Həddi",
    email: "Email",
    emails: "Email(lər)",
    email_address: "Email",
    support_email: "Rəsmi Dəstək Emaili",
    website: "Rəsmi sayt",
    official_website: "Rəsmi sayt",
    official_domains: "Rəsmi domenlər",
    official_domain: "Həqiqi Rəsmi Domen",
    real_domain: "Həqiqi Rəsmi Domen",
    url: "Rəsmi sayt",
    domain: "Rəsmi Domen",
    source_urls: "Mənbə keçidləri",
    source_url: "Mənbə keçidi",
    user_message: "Əlavə qeyd",
    user_note: "Əlavə qeyd",
    user: "Qeyd",
    message: "Qeyd məlumatı",
    address: "Ünvan",
    description: "Əlavə məlumat",
    note: "Qeyd",
    contact_page: "Əlaqə səhifəsi",
  };

  const fields = [];

  Object.entries(contact).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      return;
    }

    const normalizedKey = key.toLowerCase().replace(/[\s-]+/g, "_");

    if (Array.isArray(value)) {
      if (value.length === 0) return;
      fields.push({
        label: labels[normalizedKey] || normalizedKey,
        value: value.join(", "),
      });
      return;
    }

    if (typeof value === "object") {
      const nestedFields = getContactFields(value);
      nestedFields.forEach((field) => {
        fields.push({
          label: field.label,
          value: field.value,
        });
      });
      return;
    }

    const label =
      labels[normalizedKey] ||
      key
        .replace(/([A-Z])/g, " $1")
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());

    fields.push({
      label,
      value: String(value),
    });
  });

  return fields;
}

function ContactValue({ label, value }) {
  const isEmail = /email/i.test(label);
  const isPhone = /telefon|phone|həddi/i.test(label);
  const isWebsite = /sayt|website|url|domain|domen|page|keçid/i.test(label);

  if (isEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return <a href={`mailto:${value}`}>{value}</a>;
  }

  if (isPhone && /^[+\d\s().,-]+$/.test(value)) {
    const phoneItems = value.split(",");
    return (
      <>
        {phoneItems.map((p, idx) => {
          const rawNum = p.trim();
          const cleanNum = rawNum.replace(/[^\d+]/g, "");
          return (
            <span key={idx}>
              {idx > 0 && ", "}
              <a href={`tel:${cleanNum}`}>{rawNum}</a>
            </span>
          );
        })}
      </>
    );
  }

  if (isWebsite) {
    const urls = value.split(",");
    return (
      <>
        {urls.map((u, idx) => {
          const rawUrl = u.trim();
          const href = /^https?:\/\//i.test(rawUrl)
            ? rawUrl
            : `https://${rawUrl}`;
          return (
            <span key={idx}>
              {idx > 0 && ", "}
              <a href={href} target="_blank" rel="noopener noreferrer">
                {rawUrl}
              </a>
            </span>
          );
        })}
      </>
    );
  }

  return value;
}

function OfficialContact({ contact }) {
  const fields = getContactFields(contact);

  if (fields.length === 0) return null;

  return (
    <section className="official-contact">
      <div className="contact-heading">
        <h3>Rəsmi əlaqə məlumatları</h3>
        <p>
          Məlumatları istifadə etməzdən əvvəl müstəqil rəsmi mənbədən yoxla.
        </p>
      </div>

      <div className="contact-list">
        {fields.map((field, index) => (
          <div className="contact-item" key={`${field.label}-${index}`}>
            <span className="contact-label">{field.label}</span>
            <span className="contact-value">
              <ContactValue label={field.label} value={field.value} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProtectedRoute({ user, authLoading, children }) {
  const location = useLocation();

  if (authLoading) {
    return <div className="page-message">Hesab yoxlanılır...</div>;
  }

  if (!user) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    );
  }

  return children;
}

function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Bəli",
  cancelText = "Ləğv et",
  type = "danger",
  loading = false,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className={`modal-icon ${type}`}>
            {type === "danger" ? "✕" : "↳"}
          </div>
          <h3>{title}</h3>
        </div>
        <p className="modal-body">{message}</p>
        <div className="modal-actions">
          <button
            type="button"
            className="modal-btn cancel-btn"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`modal-btn ${type}-btn`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Gözləyin..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function Header({ user, onRequestLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" to="/" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark">s.</span>
          <span>scamguard</span>
        </Link>

        <button
          className="mobile-menu-button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menyunu aç"
          aria-expanded={menuOpen}
        >
          {menuOpen ? "Bağla ×" : "Menyu +"}
        </button>

        <nav className={`main-nav ${menuOpen ? "nav-open" : ""}`}>
          <NavLink to="/" end onClick={() => setMenuOpen(false)}>
            Ana səhifə
          </NavLink>

          <a href="/#how-it-works" onClick={() => setMenuOpen(false)}>
            Necə işləyir?
          </a>

          {user && (
            <NavLink to="/history" onClick={() => setMenuOpen(false)}>
              Analizlərim
            </NavLink>
          )}

          {user ? (
            <>
              <NavLink to="/account" onClick={() => setMenuOpen(false)}>
                Hesabım
              </NavLink>

              <button
                className="nav-login"
                onClick={() => {
                  setMenuOpen(false);
                  onRequestLogout();
                }}
              >
                Çıxış
              </button>
            </>
          ) : (
            <Link
              className="nav-login"
              to="/login"
              onClick={() => setMenuOpen(false)}
            >
              Daxil ol <span aria-hidden="true">↗</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function ResultPanel({ result, title }) {
  const risk = getRisk(result);

  const indicators = Array.isArray(result.indicators) ? result.indicators : [];
  const actions = Array.isArray(result.recommended_actions)
    ? result.recommended_actions
    : [];

  const score =
    result.risk_score !== null &&
    result.risk_score !== undefined &&
    result.risk_score !== "" &&
    Number.isFinite(Number(result.risk_score))
      ? Number(result.risk_score)
      : null;

  const contactData = result.official_contact || result.official_contacts;

  return (
    <section className="result-panel" aria-live="polite">
      <div className="result-topline">
        <span className="eyebrow">{title || "ANALİZ NƏTİCƏSİ"}</span>

        <span className={`risk-label ${risk.className}`}>
          <span className="risk-dot" />
          {risk.label}
        </span>
      </div>

      <div className="result-score-row">
        <div>
          <h2>{risk.label}</h2>
          <p className="result-summary">
            {result.summary ||
              "Analiz tamamlandı. Aşağıdakı göstəriciləri nəzərdən keçir."}
          </p>
        </div>

        {score !== null && (
          <div className={`score-number ${risk.className}`}>
            <strong>{score}</strong>
            <span>/100 risk balı</span>
          </div>
        )}
      </div>

      {result.category && (
        <p className="category-note">
          <strong>Kateqoriya:</strong> {result.category}
        </p>
      )}

      {indicators.length > 0 && (
        <div className="result-section">
          <h3>Nələrə diqqət etməli?</h3>
          <ul>
            {indicators.map((item, index) => (
              <li key={`${String(item)}-${index}`}>
                {typeof item === "string"
                  ? item
                  : item?.description ||
                    item?.name ||
                    "Şübhəli göstərici aşkarlandı."}
              </li>
            ))}
          </ul>
        </div>
      )}

      {actions.length > 0 && (
        <div className="result-section action-section">
          <h3>Nə etməlisən?</h3>
          <ul>
            {actions.map((item, index) => (
              <li key={`${String(item)}-${index}`}>
                {typeof item === "string"
                  ? item
                  : item?.description ||
                    item?.action ||
                    "Təhlükəsizlik tövsiyəsini nəzərdən keçir."}
              </li>
            ))}
          </ul>
        </div>
      )}

      {contactData && <OfficialContact contact={contactData} />}

      <p className="result-disclaimer">
        Bu nəticə risk əlamətlərinə əsaslanan qiymətləndirmədir. Heç bir nəticə
        mesajın tam təhlükəsiz olduğuna zəmanət vermir.
      </p>
    </section>
  );
}

function HomePage({ user }) {
  const [message, setMessage] = useState("");
  const [selectedImages, setSelectedImages] = useState([]);
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);

  function clearImages() {
    setSelectedImages((prev) => {
      prev.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
  }

  function handleImage(event) {
    const fileList = Array.from(event.target.files || []);
    event.target.value = "";

    if (fileList.length === 0) return;

    const newFiles = [];

    for (const file of fileList) {
      if (!file.type.startsWith("image/")) {
        setError("Zəhmət olmasa yalnız şəkil faylları seçin.");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setError("Şəkillərin hər birinin ölçüsü 10 MB-dan çox olmamalıdır.");
        return;
      }

      newFiles.push({
        file,
        id: Math.random().toString(36).substring(2, 9),
        previewUrl: URL.createObjectURL(file),
      });
    }

    setSelectedImages((prev) => [...prev, ...newFiles]);
    setError("");
    setNotice("");
    setResults([]);
  }

  function removeImage(id) {
    setSelectedImages((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  }

  function handleTextChange(event) {
    setMessage(event.target.value);
    if (error) setError("");
  }

  function extractUrls(text) {
    const urlRegex = /(https?:\/\/[^\s]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\/?[^\s]*)/g;
    return text.match(urlRegex) || [];
  }

  function extractDomain(url) {
    try {
      const cleanUrl = url.startsWith("http") ? url : `https://${url}`;
      const parsed = new URL(cleanUrl);
      return parsed.hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }

  async function handleAnalyze(event) {
    event.preventDefault();

    const typedMessage = message.trim();

    if (!typedMessage && selectedImages.length === 0) {
      setError("Mesaj, keçid (URL) daxil et və ya analiz üçün ekran görüntüsü (Screenshot ) yüklə.");
      return;
    }

    if (typedMessage.length > 20000) {
      setError("Mesaj 20 000 simvoldan uzun olmamalıdır.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    setResults([]);

    const analysisList = [];

    try {
      if (selectedImages.length > 0) {
        setOcrBusy(true);

        for (let i = 0; i < selectedImages.length; i++) {
          const imgObj = selectedImages[i];
          setNotice(`${i + 1}/${selectedImages.length} şəkildəki mətn oxunur...`);

          let extractedText = "";
          try {
            const output = await Tesseract.recognize(
              imgObj.file,
              "aze+eng"
            );
            extractedText = output.data.text?.trim() || "";
          } catch (ocrErr) {
            console.error("OCR Error:", ocrErr);
          }

          if (!extractedText) {
            setError(`Şəkil ${i + 1}-dən oxuna bilən mətn tapılmadı.`);
            continue;
          }

          const foundUrls = extractUrls(extractedText);
          let promptPayload = extractedText;

          if (foundUrls.length > 0) {
            const domains = foundUrls.map(extractDomain).join(", ");
            promptPayload += `\n\n[TƏHLÜKƏSİZLİK TƏLƏBİ]: Ekran görüntüsündə (SS) bu keçidlər tapıldı: ${foundUrls.join(", ")} (Domenlər: ${domains}). Lütfən bu domenləri fişinq və brend təqlidi baxımından yoxla. Əgər bu URL hər hansı rəsmi qurumu təqlid edirsə, 'official_contact' obyekti daxilində MÜTLƏQ həmin qurumun HƏQİQİ rəsmi domenini, dəstək telefonunu və emailini təqdim et.`;
          }

          setNotice(`Şəkil ${i + 1} AI ilə analiz edilir...`);
          const data = await analyzeMessage(promptPayload);

          if (getToken()) {
            try {
              await saveAnalysis({
                input_type: "screenshot",
                input_text: extractedText,
                result: data,
                risk_level: data.risk_level ?? getRisk(data).label,
                risk_score: Number.isFinite(Number(data.risk_score))
                  ? Number(data.risk_score)
                  : null,
              });
            } catch (saveErr) {
              console.error("Save error:", saveErr);
            }
          }

          analysisList.push({
            id: imgObj.id,
            title: selectedImages.length > 1 ? `EKRAN GÖRÜNTÜSÜ ANALİZİ (${i + 1})` : "EKRAN GÖRÜNTÜSÜ ANALİZİ",
            result: data,
          });
        }
        setOcrBusy(false);
      }

      if (typedMessage) {
        setNotice("Daxil edilən mətn/keçid analiz edilir...");

        const foundUrls = extractUrls(typedMessage);
        let promptPayload = typedMessage;
        let isUrlOnly = false;

        if (foundUrls.length > 0) {
          if (typedMessage.trim() === foundUrls[0]) {
            isUrlOnly = true;
          }

          const domains = foundUrls.map(extractDomain).join(", ");

          promptPayload = `DAXİL EDİLMİŞ MƏTN / URL:
${typedMessage}

[SİSTEM TƏLƏBİ - RƏSMİ ƏLAQƏ MƏLUMATI]:
1. Yuxarıdakı keçidi (${foundUrls.join(", ")}) və domeni (${domains}) analizi et.
2. Bu URL-in fişinq, brend təqlidi və ya saxta sayt olub-olmadığını müəyyən et.
3. Əgər daxil edilən URL hər hansı tanınmış brendi / qurumu təqlid edirsə VƏ YA həmin rəsmi brendə aiddirsə, 'official_contact' obyektini MÜTLƏQ doldur:
  - organization_name: Təşkilatın həqiqi rəsmi adı
  - official_domain: Həqiqi rəsmi veb-sayt domeni
  - support_phone: Həqiqi rəsmi dəstək / çağrı mərkəzi nömrəsi
  - support_email: Həqiqi rəsmi dəstək e-poçt ünvanı`;
        }

        const data = await analyzeMessage(promptPayload);

        if (getToken()) {
          try {
            await saveAnalysis({
              input_type: isUrlOnly ? "url" : "message",
              input_text: typedMessage,
              result: data,
              risk_level: data.risk_level ?? getRisk(data).label,
              risk_score: Number.isFinite(Number(data.risk_score))
                ? Number(data.risk_score)
                : null,
            });
          } catch (saveErr) {
            console.error("Save error:", saveErr);
          }
        }

        analysisList.push({
          id: "typed-text-" + Date.now(),
          title: isUrlOnly ? "KEÇİD (URL) ANALİZİ" : "MƏTN ANALİZİ",
          result: data,
        });
      }

      if (analysisList.length === 0) {
        throw new Error("Analiz etmək üçün istifadəyə yararlı mətn və ya keçid tapılmadı.");
      }

      setResults(analysisList);
      setNotice("Analizlər tamamlandı.");
      clearImages();
    } catch (err) {
      setError(err.message || "Analiz zamanı xəta baş verdi.");
      setNotice("");
    } finally {
      setBusy(false);
      setOcrBusy(false);
    }
  }

  return (
    <>
      <main>
        <section className="hero section-wrap">
          <div className="hero-copy hx-copy">
            <span className="hx-badge">
              <span className="hx-badge-dot" aria-hidden="true" />
              Onlayn təhlükəsizlik, sadə dildə
            </span>

            <h1 className="hx-title">
              Şübhəli mesajı, keçidi (URL) və ya ekran görüntüsünü (SS) yoxla,{" "}
              <span className="hx-accent">qərar ver.</span>
            </h1>

            <p className="hx-lead">
              Mesajı, keçidi (URL — vebsayt ünvanı) və ya ekran görüntüsünü
              (SS — screenshot) əlavə et. ScamGuard risk əlamətlərini tapır,
              nəyə diqqət etməli olduğunu və növbəti addımı sadə dildə izah edir.
            </p>

            <div className="hx-actions">
              <a href="#check-panel" className="hx-btn hx-btn-primary">
                İndi yoxla <span aria-hidden="true">→</span>
              </a>
              <a href="#how-it-works" className="hx-btn hx-btn-ghost">
                Necə işləyir?
              </a>
            </div>

            <ul className="hx-trust">
              <li><span aria-hidden="true">✓</span> Texniki bilik tələb etmir</li>
              <li><span aria-hidden="true">✓</span> SMS, keçid (URL) və ekran görüntüsü (SS)</li>
              <li><span aria-hidden="true">✓</span> Rəsmi əlaqə məlumatları</li>
            </ul>
          </div>

          <div className="message-workspace" id="check-panel">
            <div className="workspace-heading">
              <span className="eyebrow">YOXLAMA PANELİ</span>
              <span className="step-number">01 / 01</span>
            </div>

            <form onSubmit={handleAnalyze}>
              <div className="form-header-row">
                <label className="field-label" htmlFor="message-input">
                  Şübhəli mesaj, keçid (URL) və ya ekran görüntüsü (SS)
                </label>
                <span className="upload-hint-text">Ekran görüntüsü (SS) yükləyə bilərsən</span>
              </div>

              <div className="input-box-wrapper">
                {selectedImages.length > 0 && (
                  <div className="image-previews-grid">
                    {selectedImages.map((imgObj) => (
                      <div className="preview-card" key={imgObj.id}>
                        <img
                          src={imgObj.previewUrl}
                          alt="Əlavə edilmiş ekran görüntüsü"
                        />
                        <button
                          type="button"
                          className="remove-preview-btn"
                          onClick={() => removeImage(imgObj.id)}
                          disabled={busy}
                          title="Şəkli sil"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  id="message-input"
                  value={message}
                  onChange={handleTextChange}
                  placeholder="Məsələn: https://kapital-bank-az.com/login, şübhəli SMS mətni və ya ekran görüntüsü (SS) yükləyin..."
                  rows={6}
                  maxLength={20000}
                  disabled={busy}
                />
              </div>

              <div className="input-meta">
                <label className="upload-link">
                  <span aria-hidden="true">＋</span>
                  Ekran görüntüsü (SS) yüklə
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    onChange={handleImage}
                    disabled={busy}
                    hidden
                  />
                </label>

                <span>{message.length.toLocaleString("az-AZ")}/20 000</span>
              </div>

              <button
                className="primary-button analyze-button"
                type="submit"
                disabled={busy}
              >
                {ocrBusy
                  ? "Ekran görüntüsündən mətn oxunur..."
                  : busy
                  ? "Yoxlanılır..."
                  : "Yoxla"}
                <span aria-hidden="true">→</span>
              </button>
            </form>

            {error && <p className="feedback error-feedback">{error}</p>}
            {notice && <p className="feedback notice-feedback">{notice}</p>}

            {/* NƏTİCƏLƏR HƏMİŞƏ AŞAĞIDA ALT-ALTA GÖRÜNƏCƏK */}
            {results.length > 0 && (
              <div className="results-container">
                {results.map((item) => (
                  <ResultPanel
                    key={item.id}
                    result={item.result}
                    title={item.title}
                  />
                ))}
              </div>
            )}

            <p className="workspace-footnote">
              Şifrə, bank kartı məlumatları və digər məxfi məlumatları şübhəli
              saytlara daxil etmə.
            </p>
          </div>
        </section>

        <section className="how-section" id="how-it-works">
          <div className="section-wrap">
            <div className="section-heading">
              <p className="eyebrow">ÜÇ SADƏ ADDIM</p>
              <h2>Yoxlamaq çətin olmamalıdır.</h2>
            </div>

            <div className="steps-grid">
              <article className="step-item">
                <span className="step-index">01</span>
                <h3>Mesajı, keçidi və ya ekran görüntüsünü əlavə et</h3>
                <p>Şübhəli mesajı, keçidi (URL) yaz və ya ekran görüntüsünü (SS) yüklə.</p>
              </article>

              <article className="step-item">
                <span className="step-index">02</span>
                <h3>Risk əlamətlərini yoxla</h3>
                <p>
                  Domen oxşarlığı, fişinq və rəsmi əlaqə məlumatları ilə tanış ol.
                </p>
              </article>

              <article className="step-item">
                <span className="step-index">03</span>
                <h3>Özünü qoru</h3>
                <p>Nəticəyə və tövsiyələrə əsasən daha ehtiyatlı qərar ver.</p>
              </article>
            </div>
          </div>
        </section>

        {!user && (
          <section className="join-section section-wrap">
            <div>
              <p className="eyebrow">ANALİZLƏRİNİ SAXLA</p>
              <h2>Yoxlamaların bir yerdə olsun.</h2>
              <p>Hesab yarat və əvvəlki nəticələrinə istədiyin vaxt qayıt.</p>
            </div>

            <Link to="/register" className="secondary-button">
              Hesab yarat <span aria-hidden="true">→</span>
            </Link>
          </section>
        )}
      </main>

      <Footer />
    </>
  );
}

function AuthPage({ mode, onAuthenticated }) {
  const isRegister = mode === "register";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setEmail("");
    setPassword("");
    setError("");
  }, [mode]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Email və şifrəni daxil et.");
      return;
    }

    if (isRegister && password.length < 10) {
      setError("Şifrə ən azı 10 simvol olmalıdır.");
      return;
    }

    setBusy(true);

    try {
      const user = isRegister
        ? await register(email, password)
        : await login(email, password);

      onAuthenticated(user);

      navigate(location.state?.from || "/account", { replace: true });
    } catch (err) {
      setError(err.message || "Əməliyyat uğursuz oldu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <main className="auth-page section-wrap">
        <div className="auth-intro">
          <p className="eyebrow">SCAMGUARD HESABI</p>
          <h1>{isRegister ? "Qorunmağa başla." : "Yenidən xoş gəldin."}</h1>
          <p>
            {isRegister
              ? "Hesab yarat, analizlərini saxla və nəticələrinə istənilən vaxt qayıt."
              : "Hesabına daxil ol və əvvəlki analizlərinə bax."}
          </p>

          <div className="auth-aside">
            <span>“</span>
            <p>Şübhə edirsənsə, əvvəl yoxla. Sonra qərar ver.</p>
          </div>
        </div>

        <div className="auth-form-panel">
          <h2>{isRegister ? "Yeni hesab" : "Hesaba giriş"}</h2>
          <p className="muted">
            {isRegister
              ? "Başlamaq üçün məlumatlarını daxil et."
              : "Davam etmək üçün hesab məlumatlarını daxil et."}
          </p>

          <form onSubmit={handleSubmit} className="auth-form">
            <label htmlFor="auth-email">Email ünvanı</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ad@example.com"
              required
            />

            <label htmlFor="auth-password">Şifrə</label>
            <div className="password-field">
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                autoComplete={
                  isRegister ? "new-password" : "current-password"
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isRegister ? "Ən azı 10 simvol" : "Şifrən"}
                minLength={isRegister ? 10 : undefined}
                required
              />

              <button
                type="button"
                className="show-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "Gizlət" : "Göstər"}
              </button>
            </div>

            {error && <p className="feedback error-feedback">{error}</p>}

            <button className="primary-button" type="submit" disabled={busy}>
              {busy
                ? "Gözlə..."
                : isRegister
                ? "Hesab yarat"
                : "Daxil ol"}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <p className="auth-switch">
            {isRegister ? "Artıq hesabın var?" : "Hələ hesabın yoxdur?"}{" "}
            <Link to={isRegister ? "/login" : "/register"}>
              {isRegister ? "Daxil ol" : "Qeydiyyatdan keç"}
            </Link>
          </p>

          <p className="auth-terms">
            Hesab yaratmaqla məlumatlarının xidmətin işləməsi üçün emal
            edilməsini qəbul edirsən.
          </p>
        </div>
      </main>

      <Footer />
    </>
  );
}

function HistoryPage() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadHistory = useCallback(async () => {
    setBusy(true);
    setError("");

    try {
      setItems(await getHistory());
    } catch (err) {
      setError(err.message || "Tarixçəni yükləmək mümkün olmadı.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  function handlePromptDelete(item) {
    setDeleteTarget(item);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;

    const id = deleteTarget.id ?? deleteTarget.analysis_id;

    if (!id) {
      setError("Bu analizin ID-si tapılmadı.");
      setDeleteTarget(null);
      return;
    }

    setDeleting(id);
    setError("");

    try {
      await deleteAnalysis(id);
      setItems((current) =>
        current.filter(
          (entry) => String(entry.id ?? entry.analysis_id) !== String(id)
        )
      );
      setDeleteTarget(null);
    } catch (err) {
      setError(err.message || "Analizi silmək mümkün olmadı.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      <main className="inner-page section-wrap">
        <div className="page-heading">
          <p className="eyebrow">ŞƏXSİ HESAB</p>
          <h1>Mənim analizlərim</h1>
          <p>Əvvəl yoxladığın mesajların, keçidlərin (URL) və ekran görüntülərinin (SS) nəticələri burada saxlanılır.</p>
        </div>

        {error && <p className="feedback error-feedback">{error}</p>}

        {busy ? (
          <div className="page-message">Tarixçə yüklənir...</div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <span className="empty-mark">↗</span>
            <h2>Hələ analiz yoxdur</h2>
            <p>
              İlk şübhəli mesajını, keçidi (URL) və ya ekran görüntüsünü (SS) yoxla. Saxlanılan nəticələr burada görünəcək.
            </p>
            <Link to="/" className="primary-button">
              Yoxla <span>→</span>
            </Link>
          </div>
        ) : (
          <div className="history-list">
            {items.map((item, index) => {
              const id = item.id ?? item.analysis_id ?? index;
              const risk = getRisk(item);
              const text = item.input_text || "Analiz edilmiş məzmun";

              const createdAt = item.created_at
                ? new Date(item.created_at).toLocaleString("az-AZ")
                : "Tarix göstərilməyib";

              return (
                <article className="history-item" key={id}>
                  <div className="history-main">
                    <div className="history-meta">
                      <span className={`risk-label ${risk.className}`}>
                        <span className="risk-dot" />
                        {risk.label}
                      </span>
                      <span>{createdAt}</span>
                    </div>

                    <h3>
                      {text.length > 180 ? `${text.slice(0, 180)}…` : text}
                    </h3>

                    {item.risk_score != null && (
                      <p className="muted">Risk balı: {item.risk_score}/100</p>
                    )}
                  </div>

                  <button
                    className="text-button danger-text"
                    onClick={() => handlePromptDelete(item)}
                  >
                    Sil
                  </button>
                </article>
              );
            })}
          </div>
        )}

        <ConfirmModal
          isOpen={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
          title="Analizi sil"
          message="Bu analizi tarixçədən silmək istədiyinizdən əminsiniz? Bu əməliyyat geri qaytarıla bilməz."
          confirmText="Bəli, sil"
          cancelText="Ləğv et"
          type="danger"
          loading={Boolean(deleting)}
        />
      </main>

      <Footer />
    </>
  );
}

function AccountPage({ user }) {
  const userInitial = (user?.email?.[0] || "İ").toUpperCase();

  return (
    <>
      <main className="inner-page section-wrap">
        <div className="page-heading">
          <p className="eyebrow">İDARƏ PANELİ</p>
          <h1>Şəxsi Hesabım</h1>
          <p>Profil məlumatlarınız və ScamGuard təhlükəsizlik xidmətləri.</p>
        </div>

        <div className="account-pro-container">
          <div className="account-profile-card">
            <div className="account-user-info">
              <div className="account-avatar-large">{userInitial}</div>
              <div className="account-details">
                <h2>{user?.email || "İstifadəçi Ünvanı"}</h2>
                <div className="account-status-badge">
                  <span className="account-status-dot"></span>
                  ScamGuard Aktiv Mühafizə
                </div>
              </div>
            </div>
          </div>

          <div className="account-dashboard-grid">
            <Link to="/history" className="pro-card">
              <div className="pro-card-icon">📋</div>
              <div className="pro-card-content">
                <h3>Analiz tarixçəm</h3>
                <p>Əvvəl yoxladığınız məlumatlara və nəticələrə baxın.</p>
              </div>
              <span className="pro-card-arrow">→</span>
            </Link>

            <Link to="/" className="pro-card">
              <div className="pro-card-icon">🔍</div>
              <div className="pro-card-content">
                <h3>Yeni analiz et</h3>
                <p>Şübhəli sms, keçid (URL) və ya ekran görüntüsünü (SS) yoxlayın.</p>
              </div>
              <span className="pro-card-arrow">→</span>
            </Link>
          </div>

          <div className="account-security-banner">
            <div className="security-icon">🛡️</div>
            <div className="security-text">
              <h4>Məfiliyin Qorunması</h4>
              <p>
                Analiz etdiyiniz məlumatlar tam məxfi saxlanılır. Şifrələrinizi və ya kart məlumatlarınızı heç vaxt üçüncü şəxslərlə paylaşmayın.
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}

function NotFound() {
  return (
    <>
      <main className="empty-state section-wrap">
        <p className="eyebrow">404</p>
        <h1>Səhifə tapılmadı.</h1>
        <Link to="/" className="primary-button">
          Ana səhifəyə qayıt →
        </Link>
      </main>
      <Footer />
    </>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <Link className="brand footer-brand" to="/">
          <span className="brand-mark">s.</span>
          <span>scamguard</span>
        </Link>
        <p>Şübhə edirsənsə, əvvəl yoxla.</p>
        <span>© {new Date().getFullYear()} ScamGuard</span>
      </div>
    </footer>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(getToken()));
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      if (!getToken()) {
        setAuthLoading(false);
        return;
      }

      try {
        const profile = await getProfile();

        if (active) {
          setUser(profile);
        }
      } catch {
        clearToken();

        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleUnauthorized() {
      setUser(null);
      navigate("/login", { replace: true });
    }

    window.addEventListener("scamguard:unauthorized", handleUnauthorized);

    return () => {
      window.removeEventListener("scamguard:unauthorized", handleUnauthorized);
    };
  }, [navigate]);

  function confirmLogout() {
    logout();
    setUser(null);
    setIsLogoutModalOpen(false);
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <Header
        user={user}
        onRequestLogout={() => setIsLogoutModalOpen(true)}
      />

      <Routes>
        <Route path="/" element={<HomePage user={user} />} />
        <Route
          path="/login"
          element={
            <AuthPage mode="login" onAuthenticated={(u) => setUser(u)} />
          }
        />
        <Route
          path="/register"
          element={
            <AuthPage mode="register" onAuthenticated={(u) => setUser(u)} />
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute user={user} authLoading={authLoading}>
              <HistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/account"
          element={
            <ProtectedRoute user={user} authLoading={authLoading}>
              <AccountPage user={user} />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>

      <ConfirmModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={confirmLogout}
        title="Hesabdan çıxış"
        message="Hesabınızdan çıxmaq istədiyinizdən əminsiniz?"
        confirmText="Çıxış et"
        cancelText="Ləğv et"
        type="warning"
      />
    </div>
  );
}