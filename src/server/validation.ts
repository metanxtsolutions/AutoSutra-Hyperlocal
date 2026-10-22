import { z } from "zod";
import { ValidationError } from "./errors";

/** Parse with zod and convert failures into a ValidationError with per-field messages. */
export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  const first = Object.values(fieldErrors)[0] ?? "Invalid input";
  throw new ValidationError(Object.keys(fieldErrors).length > 1 ? "Please correct the highlighted fields" : first, fieldErrors);
}

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const optionalText = (max = 500) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
export const requiredText = (label: string, max = 200) =>
  z.string({ required_error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `${label} is too long`);

export const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
export const indianPhone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .refine((v) => /^(\+91)?[6-9]\d{9}$/.test(v), "Enter a valid Indian mobile number");
export const optionalIndianPhone = z.preprocess(blankToUndefined, indianPhone.optional());
export const pincode = z.string().trim().regex(/^[1-9]\d{5}$/, "PIN code must be 6 digits");
export const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "GSTIN format is not valid");
export const optionalGstin = z.preprocess(blankToUndefined, gstin.optional());
export const pan = z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "PAN format is not valid");
export const optionalPan = z.preprocess(blankToUndefined, pan.optional());
export const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .url("Enter a full URL starting with https://")
  .refine((v) => v.startsWith("https://"), "URL must use https://");
export const optionalHttpsUrl = z.preprocess(blankToUndefined, httpsUrl.optional());
export const latitude = z.coerce.number({ invalid_type_error: "Latitude must be a number" }).min(6, "Latitude is outside India").max(37.5, "Latitude is outside India");
export const longitude = z.coerce.number({ invalid_type_error: "Longitude must be a number" }).min(68, "Longitude is outside India").max(97.5, "Longitude is outside India");
export const pincodeList = z
  .preprocess((v) => (typeof v === "string" ? v.split(/[\s,]+/).filter(Boolean) : v ?? []), z.array(pincode).max(500))
  .transform((v) => Array.from(new Set(v)));

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
  "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal",
] as const;
export const indianState = z.enum(INDIAN_STATES, { errorMap: () => ({ message: "Choose a state or union territory" }) });

const COMMON_PASSWORDS = new Set([
  "password123", "password1234", "1234567890", "qwertyuiop", "iloveyou123", "welcome123", "admin12345",
  "autosutra123", "letmein1234", "india12345",
]);

export const password = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(200)
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), "This password is too common")
  .refine((v) => new Set(v).size >= 5, "Password needs more variety");
