
export const RISK_LEVELS = {
  SAFE: {
    label: "Təhlükəsiz görünür",
    min: 0,
    max: 29,
    color: "safe",
  },
  SUSPICIOUS: {
    label: "Şübhəli",
    min: 30,
    max: 69,
    color: "suspicious",
  },
  DANGEROUS: {
    label: "Təhlükəlidir",
    min: 70,
    max: 100,
    color: "dangerous",
  },
};

/**
 * Risk balını 0–100 aralığında saxlayır.
 */
export function normalizeRiskScore(score) {
  const number = Number(score);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(number)));
}

/**
 * Risk balına uyğun səviyyəni qaytarır.
 */
export function getRiskLevel(score) {
  const normalized = normalizeRiskScore(score);

  if (normalized === null) {
    return null;
  }

  if (normalized < 30) {
    return "SAFE";
  }

  if (normalized < 70) {
    return "SUSPICIOUS";
  }

  return "DANGEROUS";
}

/**
 * Backend-dən gələn risk səviyyəsini normallaşdırır.
 */
export function normalizeRiskLevel(level) {
  const normalized = String(level || "").trim().toUpperCase();

  if (normalized === "SAFE" || normalized === "SUSPICIOUS" ||
      normalized === "DANGEROUS") {
    return normalized;
  }

  return "SUSPICIOUS";
}

/**
 * Risk səviyyəsinin istifadəçiyə göstərilən adını qaytarır.
 */
export function getRiskLabel(level) {
  const normalized = normalizeRiskLevel(level);
  return RISK_LEVELS[normalized].label;
}

/**
 * Sadə qaydalar əsasında ilkin risk balı hesablayır.
 * Bu, AI analizini əvəz etmir və təkbaşına təhlükəsizlik qərarı verməməlidir.
 */
export function calculateRiskScore(message) {
  const text = String(message || "").toLowerCase();

  if (!text.trim()) {
    return 0;
  }

  let score = 0;

  const rules = [
    {
      pattern: /\b(parol|password|şifrə)\b/i,
      points: 15,
    },
    {
      pattern: /\b(otp|təsdiq kodu|verification code)\b/i,
      points: 20,
    },
    {
      pattern: /\b(təcili|dərhal|son şans|hesabınız bağlanacaq)\b/i,
      points: 15,
    },
    {
      pattern: /\b(qazandınız|mükafat|hədiyyə|uduş)\b/i,
      points: 10,
    },
    {
      pattern: /\b(kart məlumatları|cvv|pin kodu)\b/i,
      points: 25,
    },
    {
      pattern: /\b(linkə daxil ol|buraya kliklə|click here)\b/i,
      points: 15,
    },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      score += rule.points;
    }
  }

  return Math.min(100, score);
}