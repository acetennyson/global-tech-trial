import { withRequestLogging } from "@/lib/observability";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { loginSchema } from "@/lib/validation/auth";
import { verifyPassword } from "@/lib/auth/password";
import { signToken } from "@/lib/auth/jwt";
import { findUserByEmail } from "@/lib/users/repository";

async function handlePOST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    const user = await findUserByEmail(email);
    // Same message for an unknown email and a wrong password. The bcrypt compare
    // always runs (against a dummy hash if there's no user), so response time
    // doesn't reveal which emails exist.
    const passwordHash = user?.passwordHash ?? DUMMY_HASH;
    const validPassword = await verifyPassword(password, passwordHash);

    if (!user || !validPassword) {
      return fail(401, "Invalid email or password");
    }

    const token = signToken({ sub: user.id, name: user.name });
    return ok({ user: { id: user.id, email: user.email, name: user.name }, token });
  } catch (error) {
    return toErrorResponse(error);
  }
}

// Dummy bcrypt hash, so "no such user" takes as long as "wrong password".
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8w5R.d1B9r5g/PkGoK.Rw9E1yz.iOG";

export const POST = withRequestLogging(handlePOST);
