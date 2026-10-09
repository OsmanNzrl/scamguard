
const RISK_CONFIG = {
  SAFE: {
    label: "Təhlükəsiz görünür",
    className: "safe",
    icon: "✓",
  },
  SUSPICIOUS: {
    label: "Şübhəli",
    className: "suspicious",
    icon: "!",
  },
  DANGEROUS: {
    label: "Təhlükəlidir",
    className: "dangerous",
    icon: "⚠",
  },
};

export default function ResultCard({
  result,
  title = "Analiz nəticəsi",
  status = "done",
  error = "",
  onRetry,
  onRemove,
}) {
  if (status === "reading") {
    return (
      <article className="result-card result-pending">
        <div className="result-card-header">
          <h3>{title}</h3>
          <span className="result-status">Mətn oxunur...</span>
        </div>
        <p>Şəkildəki yazılar müəyyən edilir. Zəhmət olmasa gözlə.</p>
      </article>
    );
  }

  if (status === "loading") {
    return (
      <article className="result-card result-pending">
        <div className="result-card-header">
          <h3>{title}</h3>
          <span className="result-status">Analiz edilir...</span>
        </div>
        <div className="result-progress">
          <div className="result-progress-bar" />
        </div>
        <p>Mesaj yoxlanılır. Bu, bir neçə saniyə çəkə bilər.</p>
      </article>
    );
  }

  if (status === "error") {
    return (
      <article className="result-card result-error">
        <div className="result-card-header">
          <h3>{title}</h3>
          <span className="risk-badge dangerous">Xəta</span>
        </div>
        <p>{error || "Analiz zamanı xəta baş verdi."}</p>
        <div className="result-actions">
          {onRetry && (
            <button type="button" onClick={onRetry}>
              Yenidən yoxla
            </button>
          )}
          {onRemove && (
            <button type="button" onClick={onRemove}>
              Nəticəni sil
            </button>
          )}
        </div>
      </article>
    );
  }

  if (!result) return null;

  const rawRisk = String(result.risk_level || "SUSPICIOUS").toUpperCase();
  const risk = RISK_CONFIG[rawRisk] || RISK_CONFIG.SUSPICIOUS;
  const score = Number(result.risk_score);
  const safeScore = Number.isFinite(score)
    ? Math.max(0, Math.min(100, score))
    : null;

  const indicators = Array.isArray(result.indicators)
    ? result.indicators
    : [];

  const actions = Array.isArray(result.recommended_actions)
    ? result.recommended_actions
    : [];

  return (
    <article className={`result-card risk-${risk.className}`}>
      <div className="result-card-header">
        <div>
          <p className="result-eyebrow">SCAMGUARD ANALİZİ</p>
          <h3>{title}</h3>
        </div>

        <span className={`risk-badge ${risk.className}`}>
          {risk.icon} {risk.label}
        </span>
      </div>

      {safeScore !== null && (
        <div className="risk-score-section">
          <div className="risk-score-heading">
            <span>Risk balı</span>
            <strong>{safeScore}/100</strong>
          </div>

          <div
            className="risk-score-track"
            role="progressbar"
            aria-label="Risk balı"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={safeScore}
          >
            <div
              className={`risk-score-fill ${risk.className}`}
              style={{ width: `${safeScore}%` }}
            />
          </div>
        </div>
      )}

      {result.category && (
        <p className="result-category">
          <strong>Kateqoriya:</strong> {result.category}
        </p>
      )}

      {result.summary && (
        <div className="result-section">
          <h4>Analizin nəticəsi</h4>
          <p>{result.summary}</p>
        </div>
      )}

      {indicators.length > 0 && (
        <div className="result-section">
          <h4>Diqqət çəkən məqamlar</h4>
          <ul>
            {indicators.map((item, index) => (
              <li key={`${index}-${String(item)}`}>
                {typeof item === "string"
                  ? item
                  : item?.description || item?.message || JSON.stringify(item)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {actions.length > 0 && (
        <div className="result-section">
          <h4>Nə etməlisən?</h4>
          <ul>
            {actions.map((item, index) => (
              <li key={`${index}-${String(item)}`}>
                {typeof item === "string"
                  ? item
                  : item?.description || item?.message || JSON.stringify(item)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.warning && (
        <p className="result-warning">
          <strong>Qeyd:</strong> {result.warning}
        </p>
      )}

      <div className="result-actions">
        {onRetry && (
          <button type="button" onClick={onRetry}>
            Yenidən analiz et
          </button>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove}>
            Nəticəni sil
          </button>
        )}
      </div>

      <p className="result-disclaimer">
        Bu nəticə avtomatik analizə əsaslanır və mesajın təhlükəsizliyinə
        tam zəmanət vermir. Şübhəli linkləri açma və təsdiq kodlarını paylaşma.
      </p>
    </article>
  );
}