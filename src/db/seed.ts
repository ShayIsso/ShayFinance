import { db } from "./index";
import { categories } from "./schema";
import "dotenv/config";

const defaultCategories = [
  { name: "משכורת", type: "income" as const, icon: "Banknote", color: "#10b981", isDefault: true },
  {
    name: "הכנסה אחרת",
    type: "income" as const,
    icon: "CirclePlus",
    color: "#34d399",
    isDefault: true,
  },
  {
    name: "מזון וסופר",
    type: "expense" as const,
    icon: "ShoppingCart",
    color: "#f59e0b",
    isDefault: true,
  },
  {
    name: "מסעדות וקפה",
    type: "expense" as const,
    icon: "Coffee",
    color: "#d97706",
    isDefault: true,
  },
  { name: "רכב ודלק", type: "expense" as const, icon: "Car", color: "#6366f1", isDefault: true },
  {
    name: "דיור ושכירות",
    type: "expense" as const,
    icon: "Home",
    color: "#8b5cf6",
    isDefault: true,
  },
  {
    name: "חשבונות ושירותים",
    type: "expense" as const,
    icon: "Receipt",
    color: "#64748b",
    isDefault: true,
  },
  { name: "בריאות", type: "expense" as const, icon: "Heart", color: "#ef4444", isDefault: true },
  {
    name: "בילויים ופנאי",
    type: "expense" as const,
    icon: "Clapperboard",
    color: "#ec4899",
    isDefault: true,
  },
  {
    name: "קניות וביגוד",
    type: "expense" as const,
    icon: "ShoppingBag",
    color: "#f97316",
    isDefault: true,
  },
  {
    name: "חינוך",
    type: "expense" as const,
    icon: "GraduationCap",
    color: "#0ea5e9",
    isDefault: true,
  },
  { name: "ביטוח", type: "expense" as const, icon: "Shield", color: "#475569", isDefault: true },
  { name: "מנויים", type: "expense" as const, icon: "Repeat", color: "#a855f7", isDefault: true },
  {
    name: "מתנות ואירועים",
    type: "expense" as const,
    icon: "Gift",
    color: "#e11d48",
    isDefault: true,
  },
  {
    name: "השקעות",
    type: "investment" as const,
    icon: "TrendingUp",
    color: "#059669",
    isDefault: true,
  },
  {
    name: "חיסכון",
    type: "investment" as const,
    icon: "PiggyBank",
    color: "#047857",
    isDefault: true,
  },
  {
    name: "העברה פנימית",
    type: "transfer" as const,
    icon: "ArrowLeftRight",
    color: "#94a3b8",
    isDefault: true,
  },
  {
    name: "תשלום כ. אשראי",
    type: "ignore" as const,
    icon: "CreditCard",
    color: "#cbd5e1",
    isDefault: true,
  },
  {
    name: "אחר",
    type: "expense" as const,
    icon: "MoreHorizontal",
    color: "#9ca3af",
    isDefault: true,
  },
];

async function seed() {
  console.log("Seeding default categories...");

  for (const category of defaultCategories) {
    await db.insert(categories).values(category).onConflictDoNothing();
  }

  console.log(`Seeded ${defaultCategories.length} categories.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
