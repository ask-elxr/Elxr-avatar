/**
 * Memberstack Admin API helper
 * Fetches member details (email, name) for user provisioning.
 */

interface MemberstackMember {
  email: string;
  firstName: string | null;
  lastName: string | null;
}

// In-memory cache to avoid repeated API calls for the same member
const memberCache = new Map<string, MemberstackMember | null>();

/**
 * Fetch member details from Memberstack Admin API.
 * Returns { email, firstName, lastName } or null on failure.
 * Never throws — auth flow must not break if Memberstack API is down.
 */
export async function getMemberstackMember(memberstackId: string): Promise<MemberstackMember | null> {
  if (memberCache.has(memberstackId)) {
    const cached = memberCache.get(memberstackId)!;
    console.log(`[Memberstack] Cache hit for ${memberstackId}: ${cached?.email || 'null'}`);
    return cached;
  }

  const secretKey = process.env.MEMBERSTACK_SECRET_KEY;
  if (!secretKey) {
    console.warn('[Memberstack] MEMBERSTACK_SECRET_KEY not set — cannot fetch member details');
    memberCache.set(memberstackId, null);
    return null;
  }

  try {
    console.log(`[Memberstack] Fetching member details for ${memberstackId}...`);
    const res = await fetch(`https://admin.memberstack.com/members/${memberstackId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'unknown');
      console.error(`[Memberstack] API error ${res.status} for ${memberstackId}: ${errorText}`);
      memberCache.set(memberstackId, null);
      return null;
    }

    const data = await res.json();
    console.log(`[Memberstack] Raw API response for ${memberstackId}:`, JSON.stringify(data).substring(0, 500));

    // Memberstack API response structure: { data: { id, auth: { email }, customFields: { ... } } }
    const member = data.data ?? data;
    const email = member.auth?.email ?? member.email;

    if (!email) {
      console.warn(`[Memberstack] No email found in response for ${memberstackId}`);
      memberCache.set(memberstackId, null);
      return null;
    }

    const result: MemberstackMember = {
      email,
      firstName: member.customFields?.firstName ?? member.customFields?.first_name ?? null,
      lastName: member.customFields?.lastName ?? member.customFields?.last_name ?? null,
    };

    console.log(`[Memberstack] ✅ Resolved ${memberstackId} → ${result.email} (${result.firstName || 'no name'})`);
    memberCache.set(memberstackId, result);
    return result;
  } catch (err) {
    console.error('[Memberstack] Failed to fetch member:', err);
    memberCache.set(memberstackId, null);
    return null;
  }
}
