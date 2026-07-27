import targets from "../../data/targets.json";

const API_URL =
  "https://www.cmconnectadmin.meghalaya.gov.in/admin-api/api/v1/hdsbpm/getMBMACooperativesData";

export const dynamic = "force-dynamic";

type TargetRow = {
  region: string;
  district: string;
  block: string;
  ivcs: string;
  target: number;
};

type LiveRow = {
  district: string;
  block: string;
  ivcs: string;
  registrations: number;
};

const typedTargets = targets as TargetRow[];

function classifyRegion(district: string) {
  const value = district.toLowerCase();
  if (value.includes("garo")) return "Garo";
  if (value.includes("jaintia")) return "Jaintia";
  return "Khasi";
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/integrated village co[- ]?operative society/g, "")
    .replace(/multipurpose cooperative society/g, "")
    .replace(/farmer producer cooperative society/g, "")
    .replace(/livestock cooperative society/g, "")
    .replace(/\bivcs\b|\bltd\b|\blimited\b|\bc\s*&\s*rd\s*block\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function editDistance(a: string, b: string) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

function similarity(a: string, b: string) {
  if (!a && !b) return 1;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length, 1);
}

function regionForDistrict(district: string) {
  return classifyRegion(district);
}

function joinTargets(liveRows: LiveRow[]) {
  const output = typedTargets.map((row) => ({
    ...row,
    region: classifyRegion(row.district),
    registrations: 0,
    listed: true,
  }));

  for (const live of liveRows) {
    const districtCandidates = output
      .map((row, index) => ({ row, index }))
      .filter(
        ({ row }) => normalize(row.district) === normalize(live.district),
      );
    const liveIvcs = normalize(live.ivcs);
    const liveBlock = normalize(live.block);

    let best:
      | { index: number; score: number; blockScore: number }
      | undefined;

    for (const candidate of districtCandidates) {
      const score = similarity(liveIvcs, normalize(candidate.row.ivcs));
      const blockScore = similarity(liveBlock, normalize(candidate.row.block));
      if (
        !best ||
        score > best.score ||
        (score === best.score && blockScore > best.blockScore)
      ) {
        best = { index: candidate.index, score, blockScore };
      }
    }

    if (best && best.score >= 0.72) {
      output[best.index].registrations += live.registrations;
    } else {
      output.push({
        region: regionForDistrict(live.district),
        district: live.district,
        block: live.block.replace(/\s*C\s*&\s*RD Block$/i, "").trim(),
        ivcs: live.ivcs,
        target: 0,
        registrations: live.registrations,
        listed: false,
      });
    }
  }

  return output;
}

export async function GET() {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({}),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Source API returned ${response.status}`);
    }

    const payload = (await response.json()) as {
      rows?: Array<{ data?: unknown[] }>;
    };
    const sourceRecords = (payload.rows || []).flatMap((row) =>
      Array.isArray(row.data) ? row.data : [],
    ) as Array<Record<string, unknown>>;

    const grouped = new Map<string, LiveRow>();

    sourceRecords.forEach((record) => {
      const district = String(record.district_name || "Not specified").trim();
      const block = String(record.block_name || "Not specified").trim();
      const ivcs = String(
        record.ivcs_name || record.ivcs_filled_by_name || "Not specified",
      ).trim();
      const key = `${district}\u0000${block}\u0000${ivcs}`;
      const current = grouped.get(key);
      if (current) current.registrations += 1;
      else grouped.set(key, { district, block, ivcs, registrations: 1 });
    });

    const records = joinTargets([...grouped.values()]);

    return Response.json(
      { records, updatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (error) {
    return Response.json(
      {
        records: joinTargets([]),
        updatedAt: new Date().toISOString(),
        stale: true,
        error: error instanceof Error ? error.message : "Source API unavailable",
      },
      { status: 200 },
    );
  }
}
