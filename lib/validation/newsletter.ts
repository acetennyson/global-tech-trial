import { z } from "zod";

export const newsletterSubscribeSchema = z.object({
  email: z.string().trim().toLowerCase().email("Must be a valid email address"),
});

export const newsletterUnsubscribeSchema = z.object({
  token: z.string().trim().min(1, "token is required"),
});
