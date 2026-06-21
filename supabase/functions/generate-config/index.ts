// NetLab AI — Supabase Edge Function: generate-config
// Acts as a secure proxy between the browser and OpenRouter.
// The OPENROUTER_API_KEY never leaves this function.
//
// Deploy:  supabase functions deploy generate-config
// Secret:  supabase secrets set OPENROUTER_API_KEY=sk-or-...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_ENGLISH   = 'anthropic/claude-haiku-4-5';
const MODEL_NATIVE    = 'anthropic/claude-sonnet-4-6';

const PLAN_LIMITS: Record<string, number> = {
  free:       5,
  basic:      Infinity,
  pro:        Infinity,
  all_access: Infinity,
};

const PLAN_LANGUAGES: Record<string, string[]> = {
  free:       ['english'],
  basic:      ['english', 'malayalam'],
  pro:        ['english', 'malayalam', 'hindi'],
  all_access: ['english', 'malayalam', 'hindi'],
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // ── 1. Verify user JWT ────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  // ── 2. Parse request body ─────────────────────────────────────────────────
  let body: {
    configType: string;
    fields: Record<string, string>;
    language: string;
    extraContext?: string;
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { configType, fields, language, extraContext } = body;
  if (!configType || !language) {
    return json({ error: 'Missing configType or language' }, 400);
  }

  // ── 3. Check plan & usage ─────────────────────────────────────────────────
  // Use service role client for writing usage (bypasses RLS for server ops)
  const sbAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: planRow, error: planErr } = await sbAdmin
    .from('user_plans')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (planErr || !planRow) {
    // Auto-create free plan if missing
    const resetAt = new Date();
    resetAt.setMonth(resetAt.getMonth() + 1, 1);
    resetAt.setHours(0, 0, 0, 0);
    await sbAdmin.from('user_plans').insert({
      user_id: user.id,
      plan: 'free',
      generations_used: 0,
      generations_reset_at: resetAt.toISOString(),
    });
  }

  const plan       = planRow?.plan ?? 'free';
  const used       = planRow?.generations_used ?? 0;
  const resetAt    = planRow?.generations_reset_at;
  const limit      = PLAN_LIMITS[plan] ?? 5;
  const allowedLangs = PLAN_LANGUAGES[plan] ?? ['english'];

  // Reset monthly counter if past reset date
  let effectiveUsed = used;
  if (resetAt && new Date(resetAt) <= new Date()) {
    const nextReset = new Date();
    nextReset.setMonth(nextReset.getMonth() + 1, 1);
    nextReset.setHours(0, 0, 0, 0);
    await sbAdmin.from('user_plans').update({
      generations_used: 0,
      generations_reset_at: nextReset.toISOString(),
    }).eq('user_id', user.id);
    effectiveUsed = 0;
  }

  // Check language permission
  if (!allowedLangs.includes(language)) {
    return json({ error: `Your plan does not include ${language} explanations. Please upgrade.` }, 403);
  }

  // Check generation limit
  if (limit !== Infinity && effectiveUsed >= limit) {
    return json({
      error: `You have used all ${limit} free generations this month. Upgrade to continue.`,
      limitReached: true,
    }, 403);
  }

  // ── 4. Build prompt ───────────────────────────────────────────────────────
  const { system, userMsg } = buildPrompt(configType, fields, language, extraContext);
  const model = language === 'english' ? MODEL_ENGLISH : MODEL_NATIVE;

  // ── 5. Call OpenRouter ────────────────────────────────────────────────────
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) return json({ error: 'API key not configured on server' }, 500);

  let orRes: Response;
  try {
    orRes = await fetch(OPENROUTER_BASE, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
        'HTTP-Referer':  'https://netlabai.in',
        'X-Title':       'NetLab AI',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: userMsg },
        ],
        max_tokens:  2000,
        temperature: 0.2,
      }),
    });
  } catch (e) {
    return json({ error: 'Failed to reach OpenRouter: ' + (e as Error).message }, 502);
  }

  if (!orRes.ok) {
    const errBody = await orRes.json().catch(() => ({}));
    return json({ error: errBody?.error?.message || `OpenRouter error ${orRes.status}` }, 502);
  }

  const orJson   = await orRes.json();
  const fullText = orJson.choices?.[0]?.message?.content ?? '';

  // ── 6. Increment usage ────────────────────────────────────────────────────
  await sbAdmin.from('user_plans')
    .update({ generations_used: effectiveUsed + 1 })
    .eq('user_id', user.id);

  // ── 7. Return result ──────────────────────────────────────────────────────
  return json({
    text:          fullText,
    model,
    generationsUsed: effectiveUsed + 1,
    generationsLimit: limit === Infinity ? null : limit,
    plan,
  });
});

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildPrompt(
  configType: string,
  fields: Record<string, string>,
  lang: string,
  extraContext?: string
): { system: string; userMsg: string } {
  const langInstructions: Record<string, string> = {
    english: `Write all explanations in English. Use clear, simple language suitable for a CCNA exam student.`,
    malayalam: `Explanation section ഉം walkthrough ഉം Malayalam-ൽ എഴുതുക (Unicode script മാത്രം — romanized text ഒരിക്കലും ഉപയോഗിക്കരുത്). Technical terms (VLAN, OSPF, ACL, etc.) English-ൽ തന്നെ നിലനിർത്തുക; explanation sentences Malayalam-ൽ ആക്കുക. ഒരു Kerala instructor class-ൽ explain ചെയ്യുന്നത് പോലെ natural ആയ code-switched style ഉപയോഗിക്കുക.`,
    hindi: `Explanation section और walkthrough हिंदी में लिखें (Unicode Devanagari script only — romanized Hindi कभी नहीं). Technical terms (VLAN, OSPF, ACL, etc.) English में रखें; explanation sentences हिंदी में लिखें. Natural code-switched style जैसे एक Indian instructor class में समझाता है.`,
  };

  const system = `You are NetLab AI — an expert Cisco IOS network configuration assistant for Indian CCNA/CCNP students.

STRICT RULES:
1. CLI commands must always be 100% correct, standard Cisco IOS syntax. Never translate, alter, or romanize Cisco commands.
2. Only the explanation/walkthrough section is localized to the user's chosen language.
3. For Malayalam or Hindi: use native Unicode script only. NEVER use romanized/Latin-script transliteration for explanations.
4. All configs must be exam-correct. Do not invent non-existent Cisco commands.
5. Connect explanations to CCNA exam objectives wherever relevant.
6. Format output as two clearly separated sections:

SECTION 1: [CISCO IOS CONFIG]
(raw Cisco IOS commands, properly indented, with brief inline ! comments)

SECTION 2: [EXPLANATION]
(friendly, pedagogical walkthrough of WHY each command block exists — in the requested language)

${langInstructions[lang] ?? langInstructions['english']}`;

  const typeNames: Record<string, string> = {
    'vlan':          'VLAN Configuration',
    'static-routing':'Static Routing',
    'rip':           'RIP Routing (v2)',
    'ospf':          'OSPF Single-Area Routing',
    'acl-standard':  'Standard ACL',
    'acl-extended':  'Extended ACL',
    'nat-static':    'Static NAT',
    'nat-pat':       'NAT PAT / Overload',
    'security':      'Basic Security (SSH + Port Security)',
  };

  let userMsg = `Generate a complete Cisco IOS ${typeNames[configType] ?? configType} configuration with the following parameters:\n\n`;
  for (const [k, v] of Object.entries(fields)) {
    if (v) {
      const label = k.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      userMsg += `${label}: ${v}\n`;
    }
  }
  if (extraContext) userMsg += `\nExtra context: ${extraContext}`;

  return { system, userMsg };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
