import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getUserById, updateUserProfile } from "@/lib/account-store";
import { isAppLanguage } from "@/lib/i18n";

interface AccountBody {
  name?: string;
  language?: string;
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
      language: user.language,
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
  const name = body?.name?.trim();
  const language = body?.language?.trim();

  if (name !== undefined && name.length > 0 && name.length < 2) {
    return NextResponse.json({ error: "invalid_payload", message: "Name must be at least 2 characters." }, { status: 400 });
  }
  if (language !== undefined && !isAppLanguage(language)) {
    return NextResponse.json({ error: "invalid_payload", message: "Language must be one of en or tr." }, { status: 400 });
  }
  if ((name === undefined || name.length === 0) && language === undefined) {
    return NextResponse.json({ error: "invalid_payload", message: "At least one account field is required." }, { status: 400 });
  }

  const user = await updateUserProfile({
    userId: session.user.id,
    name: name && name.length > 0 ? name : undefined,
    language: isAppLanguage(language) ? language : undefined,
  });
  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      language: user.language,
    },
  });
}
