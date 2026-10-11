/**
 * Requirements/packet agent — the "ok how do I actually get it" layer.
 * Per school: deadlines by round, required docs, which international aid forms apply
 * (CSS Profile / ISFAA / institutional), test policy, application fee + waiver availability.
 */
import { pool } from "../db/pool.js";
import { askForJson } from "../llm.js";

interface Packet {
  deadline_ed: string | null; // ISO date or null
  deadline_rd: string | null;
  required_docs: string[];
  aid_forms: string[];
  test_policy: "required" | "optional" | "not_accepted";
  application_fee_usd: number | null;
  fee_waiver_available: boolean;
}

export async function buildRequirementsPacket(universityId: string, rawPageText: string): Promise<Packet> {
  const packet = await askForJson<Packet>({
    system: `Extract an international-applicant requirements packet from raw admissions/aid page text.
Dates must be ISO (YYYY-MM-DD) or null if not stated. aid_forms should only include forms actually
mentioned (e.g. "CSS Profile", "ISFAA", "institutional aid form"). If something isn't stated, use
null/empty/false rather than guessing — downstream agents treat missing fields as "needs verification",
not as "no requirement".`,
    prompt: rawPageText.slice(0, 12000),
    maxTokens: 600,
  });

  await pool.query(
    `INSERT INTO requirements_packets (university_id, deadline_ed, deadline_rd, required_docs, aid_forms, test_policy, application_fee_usd, fee_waiver_available, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (university_id)
     DO UPDATE SET deadline_ed=$2, deadline_rd=$3, required_docs=$4, aid_forms=$5, test_policy=$6, application_fee_usd=$7, fee_waiver_available=$8, updated_at=now()`,
    [
      universityId,
      packet.deadline_ed,
      packet.deadline_rd,
      packet.required_docs,
      packet.aid_forms,
      packet.test_policy,
      packet.application_fee_usd,
      packet.fee_waiver_available,
    ]
  );

  return packet;
}
