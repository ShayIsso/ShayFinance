/**
 * Shared error-result mapping for NotAssignableCategoryError (ADR-0011 §3):
 * every action that writes a category assignment (rules, transaction
 * assign/bulk-assign) surfaces the same rejection to the client.
 */
const NOT_ASSIGNABLE_MESSAGE = "לא ניתן לשייך לקטגוריית קבוצה — יש לבחור קטגוריית משנה";

export function notAssignableResult(): {
  error: string;
  fieldErrors: { categoryId: string };
} {
  return { error: NOT_ASSIGNABLE_MESSAGE, fieldErrors: { categoryId: NOT_ASSIGNABLE_MESSAGE } };
}
