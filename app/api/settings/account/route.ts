import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getUserById, updateUserProfile } from "@/lib/account-store";

interface AccountBody {
  name?: string;
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "auth_error", message: "Authentication required." }, { status: 401 });
  }

  const user = await getUserById(session.user.id);
  if (!user) {
    return NextResponse.json({ error: "not_found", message: "User not found." }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      createdAt: user.created_at,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "auth_error", message: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as AccountBody | null;
  const name = body?.name?.trim() ?? "";
  if (name.length < 2) {
    return NextResponse.json({ error: "invalid_payload", message: "Name must be at least 2 characters." }, { status: 400 });
  }

  const user = await updateUserProfile({ userId: session.user.id, name });
  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
    },
  });
}
