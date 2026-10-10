import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Must be a valid email address"),
  // Length only: "must contain a symbol" rules lead to predictable passwords, and
  // bcrypt's cost factor already slows cracking.
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().min(1).max(255).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Must be a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Must be a valid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, "token is required"),
  // same rule as registerSchema.password
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(1, "token is required"),
});

export const resendVerificationSchema = z.object({
  email: z.string().trim().toLowerCase().email("Must be a valid email address"),
});
