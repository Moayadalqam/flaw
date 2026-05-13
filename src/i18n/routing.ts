export const locales = ["el-CY", "en-CY"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "el-CY";
