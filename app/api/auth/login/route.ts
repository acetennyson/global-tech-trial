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

// A real bcrypt hash of an unguessable placeholder, purely so the timing of
// "no such user" matches "wrong password" (see comment above).
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8w5R.d1B9r5g/PkGoK.Rw9E1yz.iOG";

export const POST = withRequestLogging(handlePOST);
