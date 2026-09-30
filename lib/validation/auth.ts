import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Must be a valid email address"),
  // Length only, deliberately: composition rules ("must contain a symbol")
  // push people toward predictable substitutions and don't meaningfully raise
  // resistance to offline cracking the way bcrypt's cost factor already does.
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
  // same length-only rule as registerSchema.password, deliberately kept in sync
  password: z.string().min(8, "Password must be at least 8 characters"),
});
