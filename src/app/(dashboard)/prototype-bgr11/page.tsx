import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// PROTOTYPE ONLY (BGR11 #168 stage-1 gate). Landing page linking the three
// דוחות monthly-report layout variants. Deleted before the implementation PR.

const VARIANTS = [
  {
    href: "/prototype-bgr11/a",
    title: "וריאנט A · הד לוח הבקרה",
    blurb:
      "בורר חודש כצעדן קודם/הבא (כמו הדשבורד). כותרות סיכום באותו רשת כרטיסים, עם צ'יפ שינוי (±% מול אשתקד) מתחת לכל מספר. פירוט קטגוריות בעזרת הרשימה הנפתחת הדו-שכבתית של הדשבורד, עם ערך אשתקד מעומעם בכל שורה.",
  },
  {
    href: "/prototype-bgr11/b",
    title: "וריאנט B · טבלת השוואה",
    blurb:
      "בורר חודש כתפריט נפתח. סיכומים כטבלת השוואה דו-טורית (החודש · אותו חודש אשתקד · Δ). פירוט קטגוריות כטבלה מלאה: קטגוריה · החודש · אשתקד · Δ% · נתח, שורות קבוצה נפתחות לעלים.",
  },
  {
    href: "/prototype-bgr11/c",
    title: "וריאנט C · אזור השוואה ייעודי",
    blurb:
      "בורר חודש כרצועת חודשים אופקית. כותרות סיכום נקיות ללא YoY משולב, ואזור 'לעומת אשתקד' ייעודי עם צ'יפים לכל מדד. פירוט דו-שכבתי עם מתג להצגת פסי-רפאים של אשתקד.",
  },
];

export default function PrototypeIndexPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">אב-טיפוס · דוחות (BGR11)</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          שלושה טיפולי פריסה לדף הדוח החודשי. השווה בין בורר החודש, הצגת ההשוואה השנתית (YoY) וטיפול
          הפירוט. נתונים לדוגמה בלבד.
        </p>
      </div>
      <div className="grid gap-4">
        {VARIANTS.map((v) => (
          <Link key={v.href} href={v.href}>
            <Card className="hover:bg-muted/40 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">{v.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm leading-relaxed">{v.blurb}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
