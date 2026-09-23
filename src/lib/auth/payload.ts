import { getCitizenSettings, type CitizenUser } from "@/lib/auth/usersDb";
import type { CitizenProfileSettings } from "@/types/civic";

/* What a session response hands the browser. Deliberately narrow: the account
   row's secrets never appear here, and the settings document is the citizen's
   own editable record. */

export interface CitizenSessionUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  district: string;
  email_verified: boolean;
  /** Pinned to "citizen" — the operational consoles are type-incompatible with
      anything projected from the public session. */
  role: "citizen";
}

export interface CitizenSessionPayload {
  user: CitizenSessionUser;
  settings: CitizenProfileSettings;
}

export function toSessionUser(user: CitizenUser): CitizenSessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    district: user.district,
    email_verified: user.emailVerified,
    role: "citizen",
  };
}

export async function buildSessionPayload(
  user: CitizenUser,
): Promise<CitizenSessionPayload> {
  return {
    user: toSessionUser(user),
    settings: await getCitizenSettings(user),
  };
}
