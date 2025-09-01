// Cloudflare Worker backend for Student Router
// Storage: KV (binding name: KV_STUDENTS)

const SCHEDULE = {
  capacities: {
    class: { sparta: 40, athens: 40 },
    recitations: { corinth: 40, argos: 40, thebes: 40, crete: 40 },
    ta: { woods: 16, johnnie: 16, siddhu: 16, mariam: 16, jack: 16 }
  },
  recitations: {
    corinth: { day: 'A' },
    argos: { day: 'A' },
    thebes: { day: 'B' },
    crete: { day: 'B' }
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/*$/, '');
    const method = request.method.toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }));
    }

    try {
      if (path.endsWith('/assign') && method === 'POST') {
        const body = await request.json();
        const result = await handleAssign(env.KV_STUDENTS, body);
        return cors(json(result));
      }

      if (path.endsWith('/counts') && method === 'GET') {
        const counts = await getCounts(env.KV_STUDENTS);
        return cors(json(counts));
      }

      if (path.endsWith('/roster') && method === 'GET') {
        const roster = await getRoster(env.KV_STUDENTS);
        return cors(json(roster));
      }

      return cors(json({ error: 'Not found' }, 404));
    } catch (err) {
      return cors(json({ ok: false, message: err?.message || String(err) }, 500));
    }
  }
};

function cors(resp) {
  resp.headers.set('Access-Control-Allow-Origin', '*');
  resp.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  resp.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return resp;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

async function handleAssign(KV, data) {
  const studentId = (data?.id || '').toString();
  if (!studentId) throw new Error('Missing id');

  const existing = await KV.get(`student:${studentId}`, { type: 'json' });
  // Enforce single submission per kerb: if a record already exists, return it unchanged
  if (existing) {
    return { ok: true, assignment: { class: existing.class, rec_a: existing.rec_a, rec_b: existing.rec_b, ta: existing.ta }, message: 'already_exists' };
  }
  const all = await listAllStudents(KV);
  const counts = calculateCounts(all);

  let assignment;
  // Compute first-time assignment only
  assignment = computeAssignment(studentId, data.availability, counts);

  if (!assignment.ok) return assignment;

  const row = {
    timestamp: new Date().toISOString(),
    id: studentId,
    name: (data.name || '').toString(),
    email: (data.email || '').toString(),
    availability: data.availability,
    class: assignment.class,
    rec_a: assignment.rec_a,
    rec_b: assignment.rec_b,
    ta: assignment.ta,
    locked: false,
    notes: ''
  };

  await KV.put(`student:${studentId}`, JSON.stringify(row));

  return { ok: true, assignment: { class: row.class, rec_a: row.rec_a, rec_b: row.rec_b, ta: row.ta }, created: !existing };
}

function computeAssignment(studentId, availability, counts) {
  const hash = getStableHash(studentId);

  const classChoice = selectMinFill(availability.class, counts.class, SCHEDULE.capacities.class, hash);
  if (!classChoice) return { ok: false, reason: 'no_feasible', details: { where: 'class' } };

  const dayAOptions = (availability.recitations || []).filter(r => SCHEDULE.recitations[r]?.day === 'A');
  const recAChoice = selectMinFill(dayAOptions, counts.recitations, SCHEDULE.capacities.recitations, hash);
  if (!recAChoice) return { ok: false, reason: 'no_feasible', details: { where: 'recitation_day_a' } };

  const dayBOptions = (availability.recitations || []).filter(r => SCHEDULE.recitations[r]?.day === 'B');
  const recBChoice = selectMinFill(dayBOptions, counts.recitations, SCHEDULE.capacities.recitations, hash);
  if (!recBChoice) return { ok: false, reason: 'no_feasible', details: { where: 'recitation_day_b' } };

  const taChoice = selectMinFill(availability.ta, counts.ta, SCHEDULE.capacities.ta, hash);
  if (!taChoice) return { ok: false, reason: 'no_feasible', details: { where: 'ta' } };

  return { ok: true, class: classChoice, rec_a: recAChoice, rec_b: recBChoice, ta: taChoice };
}

function selectMinFill(options, counts, capacities, hash) {
  if (!Array.isArray(options) || options.length === 0) return null;
  let best = null;
  let bestRatio = Infinity;
  let bestHash = Infinity;
  for (const option of options) {
    const count = counts[option] || 0;
    const capacity = capacities[option];
    if (!capacity) continue;
    const ratio = count / capacity;
    if (count >= capacity + 1) continue; // soft overflow of 1 allowed
    const tie = hash % 997;
    if (ratio < bestRatio || (ratio === bestRatio && tie < bestHash)) {
      best = option;
      bestRatio = ratio;
      bestHash = tie;
    }
  }
  return best;
}

function isAssignmentValid(assignment, availability, counts) {
  if (!availability?.class?.includes(assignment.class)) return false;
  if (!availability?.recitations?.includes(assignment.rec_a)) return false;
  if (!availability?.recitations?.includes(assignment.rec_b)) return false;
  if (!availability?.ta?.includes(assignment.ta)) return false;

  if ((counts.class[assignment.class] || 0) > SCHEDULE.capacities.class[assignment.class] + 1) return false;
  if ((counts.recitations[assignment.rec_a] || 0) > SCHEDULE.capacities.recitations[assignment.rec_a] + 1) return false;
  if ((counts.recitations[assignment.rec_b] || 0) > SCHEDULE.capacities.recitations[assignment.rec_b] + 1) return false;
  if ((counts.ta[assignment.ta] || 0) > SCHEDULE.capacities.ta[assignment.ta] + 1) return false;

  return true;
}

function getStableHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

async function getRoster(KV) {
  const list = await KV.list({ prefix: 'student:' });
  const out = [];
  for (const key of list.keys) {
    const row = await KV.get(key.name, { type: 'json' });
    if (row) out.push(row);
  }
  return out;
}

async function getCounts(KV) {
  const roster = await getRoster(KV);
  return calculateCounts(roster);
}

function calculateCounts(rows) {
  const counts = { class: {}, recitations: {}, ta: {} };
  for (const row of rows) {
    if (row.class) counts.class[row.class] = (counts.class[row.class] || 0) + 1;
    if (row.rec_a) counts.recitations[row.rec_a] = (counts.recitations[row.rec_a] || 0) + 1;
    if (row.rec_b) counts.recitations[row.rec_b] = (counts.recitations[row.rec_b] || 0) + 1;
    if (row.ta) counts.ta[row.ta] = (counts.ta[row.ta] || 0) + 1;
  }
  return counts;
}


