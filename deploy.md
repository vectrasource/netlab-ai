# NetLab AI — Deploy Checklist

## 1. Supabase Database (one time)
Run `supabase-setup.sql` in Supabase Dashboard → SQL Editor

## 2. Install Supabase CLI (one time)
```
npm install -g supabase
```

## 3. Link project (one time)
```
supabase login
supabase link --project-ref enqqdltgkpiarfdfkfgm
```

## 4. Set secrets (one time — never commit these)
```
supabase secrets set OPENROUTER_API_KEY=sk-or-YOUR_KEY_HERE
```
Get your OpenRouter key from: https://openrouter.ai/keys

## 5. Deploy edge function
```
supabase functions deploy generate-config --no-verify-jwt
```
Note: `--no-verify-jwt` is NOT set — the function verifies the JWT itself.
Remove the flag above; just run:
```
supabase functions deploy generate-config
```

## 6. Deploy frontend to Vercel
```
vercel --prod
```
Set these in Vercel dashboard → Project → Settings → Environment Variables:
(none needed — all secrets live in Supabase)

## 7. Add your Vercel URL to Supabase Auth
Supabase Dashboard → Authentication → URL Configuration
- Site URL: https://your-project.vercel.app
- Redirect URLs: https://your-project.vercel.app/**

## 8. Enable Google OAuth (optional)
Supabase Dashboard → Authentication → Providers → Google
- Add your Google Cloud OAuth 2.0 client ID + secret
- Authorised redirect URI: https://enqqdltgkpiarfdfkfgm.supabase.co/auth/v1/callback

## 9. Razorpay (when ready)
Replace RAZORPAY_LINK_PLACEHOLDER in index.html with actual payment links.
Then manually update user's `plan` column in user_plans table after payment.

---

## Re-deploy after changes

Edge function changed:
```
supabase functions deploy generate-config
```

Frontend changed:
```
vercel --prod
```
