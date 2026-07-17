export interface CategoryDef {
  name: string;
  type: "income" | "expense" | "investment" | "transfer" | "ignore";
  icon: string;
  color: string;
  description: string;
}

/**
 * A default expense group and the leaf names (from TAXONOMY_V2) it parents.
 * `type` is always `expense` — the only typed hierarchy the default grouping
 * seeds (ADR-0011 §7). Groups carry no `description`: they are never assignable
 * and never rendered into the AI prompt (§6). Groups have no children of their
 * own (depth cap), and each must earn ≥2 leaves.
 */
export interface CategoryGroupDef {
  name: string;
  icon: string;
  color: string;
  children: string[];
}

/**
 * Canonical Taxonomy v2 (#133): the 17 flat categories, their presentation, and
 * the Hebrew positive/anti-example descriptions rendered into the AI
 * categorization prompt. Single source of truth shared by the seed and the
 * migration reconciliation step so the two never drift.
 */
export const TAXONOMY_V2: CategoryDef[] = [
  {
    name: "משכורת",
    type: "income",
    icon: "Banknote",
    color: "#10b981",
    description:
      "כולל: משכורת חודשית ממעסיק, תלושי שכר והפקדות שכר קבועות. לא כולל: הכנסות חד-פעמיות או שאינן משכר (→ הכנסה אחרת).",
  },
  {
    name: "הכנסה אחרת",
    type: "income",
    icon: "CirclePlus",
    color: "#34d399",
    description:
      "כולל: החזרים, זיכויים, ריבית, מתנות כספיות שהתקבלו והכנסות חד-פעמיות שאינן משכר. לא כולל: משכורת חודשית ממעסיק (→ משכורת); העברות בין החשבונות שלך (→ העברה פנימית).",
  },
  {
    name: "מזון וסופר",
    type: "expense",
    icon: "ShoppingCart",
    color: "#f59e0b",
    description:
      "כולל: סופרמרקטים, מכולות, שווקים וחנויות מזון לצריכה ביתית. לא כולל: מסעדות, בתי קפה ומשלוחי אוכל מוכן (→ מסעדות וקפה); בתי מרקחת ורשתות פארם גם כשנמכר בהן מזון (→ בריאות וטיפוח).",
  },
  {
    name: "מסעדות וקפה",
    type: "expense",
    icon: "Coffee",
    color: "#d97706",
    description:
      "כולל: מסעדות, בתי קפה, ברים, מזון מהיר ומשלוחי אוכל מוכן. לא כולל: קניות מזון בסופר לצריכה ביתית (→ מזון וסופר).",
  },
  {
    name: "תחבורה",
    type: "expense",
    icon: "Bus",
    color: "#6366f1",
    description:
      "כולל: דלק ותחנות דלק, חניונים ודמי חניה, דוחות חנייה, כבישי אגרה, תחבורה ציבורית (אוטובוס, רכבת, רב-קו), מוניות ושירותי נסיעה, וכן טיפולי רכב ומוסכים. לא כולל: ארנונה ותשלומים לרשות המקומית שאינם חניה (→ חשבונות ושירותים).",
  },
  {
    name: "דיור ושכירות",
    type: "expense",
    icon: "Home",
    color: "#8b5cf6",
    description:
      "כולל: שכר דירה ותשלומי דיור, ועד בית ותחזוקת דירה. לא כולל: חשבונות שירות כמו חשמל, מים וגז (→ חשבונות ושירותים).",
  },
  {
    name: "חשבונות ושירותים",
    type: "expense",
    icon: "Receipt",
    color: "#64748b",
    description:
      "כולל: חשבונות שירות שוטפים — חשמל, מים, גז, ארנונה, תקשורת (אינטרנט, טלפון, סלולר), ביטוחים והוראות קבע לספקי שירות. לא כולל: שכר דירה וועד בית (→ דיור ושכירות); מנויי תוכן ובידור דיגיטליים (→ מנויים).",
  },
  {
    name: "בריאות וטיפוח",
    type: "expense",
    icon: "Heart",
    color: "#ef4444",
    description:
      "כולל: בתי מרקחת ורשתות פארם, קופות חולים ומרפאות, טיפולי שיניים, מספרות, קוסמטיקה וטיפוח אישי. לא כולל: קניות מזון גם אם נעשו ברשת פארם (→ מזון וסופר).",
  },
  {
    name: "בילויים ופנאי",
    type: "expense",
    icon: "Clapperboard",
    color: "#ec4899",
    description:
      "כולל: בילויים ופנאי — קולנוע, הופעות, אירועי תרבות, אטרקציות, חדרי כושר וספורט, תחביבים. לא כולל: ארוחות במסעדות ובתי קפה (→ מסעדות וקפה); מנויי סטרימינג ותוכן דיגיטלי (→ מנויים).",
  },
  {
    name: "קניות וביגוד",
    type: "expense",
    icon: "ShoppingBag",
    color: "#f97316",
    description:
      "כולל: ביגוד, הנעלה, אביזרים, מוצרי חשמל, ריהוט, כלי בית ומוצרים כלליים לבית ולפרט. לא כולל: מוצרי טיפוח וקוסמטיקה (→ בריאות וטיפוח); מזון לצריכה ביתית (→ מזון וסופר).",
  },
  {
    name: "מנויים",
    type: "expense",
    icon: "Repeat",
    color: "#a855f7",
    description:
      "כולל: מנויים חוזרים לשירותים דיגיטליים — סטרימינג, מוזיקה, אחסון בענן, תוכנה ואפליקציות. לא כולל: חשבונות תשתית כמו סלולר ואינטרנט (→ חשבונות ושירותים).",
  },
  {
    name: "מתנות ואירועים",
    type: "expense",
    icon: "Gift",
    color: "#e11d48",
    description:
      "כולל: רכישת מתנות בפועל, פרחים, והוצאות על אירועים ומתנות לאירועים. לא כולל: העברות כסף גנריות (bit/PayBox) שמטרתן אינה ידועה בוודאות (→ מזומן ומשיכות).",
  },
  {
    name: "מזומן ומשיכות",
    type: "expense",
    icon: "HandCoins",
    color: "#78716c",
    description:
      "כולל: משיכות מזומן וכספומט, שיקים, והעברות עמית-לעמית גנריות (bit/PayBox) שמטרתן אינה ניתנת לזיהוי. בית ברירת המחדל לתנועות כסף שמטרתן אינה ידועה. לא כולל: העברות בין החשבונות שלך עצמך (→ העברה פנימית); העברה שידוע לך שהיא מתנה או רכישה (סווג ידנית לקטגוריה המתאימה).",
  },
  {
    name: "השקעות וחיסכון",
    type: "investment",
    icon: "TrendingUp",
    color: "#059669",
    description:
      "כולל: הפקדות לחיסכון והשקעות — קרנות, ניירות ערך, קופות גמל, קרנות פנסיה והשתלמות. לא כולל: העברות בין החשבונות שלך שאינן השקעה (→ העברה פנימית).",
  },
  {
    name: "העברה פנימית",
    type: "transfer",
    icon: "ArrowLeftRight",
    color: "#94a3b8",
    description:
      "כולל: העברות בין חשבונות ואמצעי תשלום בבעלותך שלך, ללא הוצאה או הכנסה אמיתית. לא כולל: העברות עמית-לעמית גנריות שמטרתן אינה ידועה (→ מזומן ומשיכות).",
  },
  {
    name: "הסדרה - כרטיס אשראי",
    type: "transfer",
    icon: "CreditCard",
    color: "#71717a",
    description:
      "כולל: הצד המפורט של חיוב האשראי — העסקאות הבודדות שמרכיבות תשלום מרוכז לכרטיס. לא כולל: חיוב האשראי המרוכז בחשבון העובר ושב (→ תשלום כ. אשראי).",
  },
  {
    name: "תשלום כ. אשראי",
    type: "ignore",
    icon: "CreditCard",
    color: "#cbd5e1",
    description:
      "כולל: חיוב כרטיס האשראי המרוכז בחשבון העובר ושב; מנוטרל מהחישובים כדי למנוע ספירה כפולה מול החיובים המפורטים. לא כולל: העסקאות הפרטניות עצמן (→ הסדרה - כרטיס אשראי).",
  },
];

/**
 * Default expense grouping (ADR-0011 §7). Seeded and backfilled by-name for the
 * live DB and fresh installs alike, so hierarchy is a feature users meet rather
 * than an empty affordance. Root leaves (תחבורה, בריאות וטיפוח, מזומן ומשיכות)
 * and every non-expense category stay flat. The 17-leaf set is untouched — this
 * only adds three group rows and sets `parent_id` on the named leaves.
 */
export const DEFAULT_GROUPS: CategoryGroupDef[] = [
  {
    name: "אוכל",
    icon: "Utensils",
    color: "#f59e0b",
    children: ["מזון וסופר", "מסעדות וקפה"],
  },
  {
    name: "בית וחשבונות",
    icon: "Home",
    color: "#8b5cf6",
    children: ["דיור ושכירות", "חשבונות ושירותים", "מנויים"],
  },
  {
    name: "פנאי וקניות",
    icon: "ShoppingBag",
    color: "#ec4899",
    children: ["בילויים ופנאי", "קניות וביגוד", "מתנות ואירועים"],
  },
];
