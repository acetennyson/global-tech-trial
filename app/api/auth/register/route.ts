import { withRequestLogging } from "@/lib/observability";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { registerSchema } from "@/lib/validation/auth";
import { hashPassword } from "@/lib/auth/password";
import { signToken } from "@/lib/auth/jwt";
import { createUser } from "@/lib/users/repository";

async function handlePOST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name } = registerSchema.parse(body);

    const passwordHash = await hashPassword(password);
    const result = await createUser({ email, passwordHash, name: name ?? null });

    if (result.status === "email_taken") {
      return fail(409, "An account with this email already exists");
    }

    const token = signToken({ sub: result.user.id, name: result.user.name });
    return ok({ user: { id: result.user.id, email: result.user.email, name: result.user.name }, token }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const POST = withRequestLogging(handlePOST);
