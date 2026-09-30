import { fail, ok, toErrorResponse } from "@/lib/http";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { hashResetToken } from "@/lib/auth/resetToken";
import { hashPassword } from "@/lib/auth/password";
import { signToken } from "@/lib/auth/jwt";
import {
  findPasswordResetToken,
  findUserById,
  markPasswordResetTokenUsed,
  updateUserPassword,
} from "@/lib/users/repository";

const INVALID_TOKEN_MESSAGE = "Invalid or expired reset token";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, password } = resetPasswordSchema.parse(body);

    const tokenHash = hashResetToken(token);
    const record = await findPasswordResetToken(tokenHash);

    if (!record || record.usedAt !== null || new Date(record.expiresAt).getTime() < Date.now()) {
      return fail(400, INVALID_TOKEN_MESSAGE);
    }

    const user = await findUserById(record.userId);
    if (!user) {
      // the user row is gone but the token row survived somehow; same message,
      // nothing useful to tell the caller either way.
      return fail(400, INVALID_TOKEN_MESSAGE);
    }

    const passwordHash = await hashPassword(password);
    await updateUserPassword(user.id, passwordHash);
    // single-use: this exact link can't be replayed after a successful reset.
    await markPasswordResetTokenUsed(tokenHash);

    // log the user in immediately, same shape POST /api/auth/login returns.
    const authToken = signToken({ sub: user.id, name: user.name });
    return ok({ user: { id: user.id, email: user.email, name: user.name }, token: authToken });
  } catch (error) {
    return toErrorResponse(error);
  }
}
