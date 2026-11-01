# Putting ClinicFlow Cloud online

About 45 minutes. No coding and no terminal. You need three things: your GitHub login, a password manager (1Password, Bitwarden, or your browser's), and this page open beside you.

You will set up two free accounts:

- **Supabase** stores the data, in Canada.
- **Vercel** runs the app and gives you a web address.

> **Never paste a password or connection string into a chat, email or document.** Keep them only in your password manager and in the two websites below.

---

## Part 1. Database (Supabase), about 15 minutes

1. Go to **supabase.com** and click **Start your project**. Sign up with your GitHub account.
2. Click **New project**.
   - **Name:** `clinicflow`
   - **Database password:** click **Generate a password** and save it in your password manager as "Supabase master password".
   - **Region:** **Canada (Central)**. This keeps patient data in Canada. Do not pick any other region.
   - Click **Create new project** and wait about two minutes.
3. Make two more passwords in your password manager, each **24 characters, letters and numbers only** (turn symbols off; symbols break the connection strings). Name them:
   - "ClinicFlow owner password"
   - "ClinicFlow app password"
4. In Supabase, open **SQL Editor** in the left menu, click **New query**, and paste this. Replace the two `PASTE_…` parts with the passwords from step 3, keeping the single quotes:

   ```sql
   create role clinicflow_owner login password 'PASTE_OWNER_PASSWORD_HERE';
   create role clinicflow_app   login password 'PASTE_APP_PASSWORD_HERE';
   grant usage, create on schema public to clinicflow_owner;
   grant usage on schema public to clinicflow_app;
   ```

   Click **Run**. You should see "Success. No rows returned." Then delete the text from the editor so the passwords are not left on screen.
5. Click **Connect** at the top of the project page. You will build two connection strings from what it shows.

   **App connection (`DATABASE_URL`)**: under **Transaction pooler**, copy the string. It looks like
   `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-ca-central-1.pooler.supabase.com:6543/postgres`
   Change it in a text note on your computer, not online:
   - replace `postgres.` (just before the dot and the letters) with `clinicflow_app.`
   - replace `[YOUR-PASSWORD]` with the **app password**, no brackets.
   Result: `postgresql://clinicflow_app.abcdefgh:YourAppPassword@aws-0-ca-central-1.pooler.supabase.com:6543/postgres`
   Save it in your password manager as "ClinicFlow DATABASE_URL".

   **Owner connection (`DATABASE_OWNER_URL`)**: under **Session pooler**, copy the string (it ends in `:5432/postgres`). Make the same two changes, using `clinicflow_owner.` and the **owner password**. Save it as "ClinicFlow DATABASE_OWNER_URL".
6. Still in Supabase: **Project Settings → Data API**. If there is a switch to turn off the Data API, turn it off. ClinicFlow does not use it, and the app also locks it out on its own.

## Part 2. Get the code ready (GitHub), about 2 minutes

7. Open the ClinicFlow Cloud pull request on GitHub and click **Merge pull request**, then **Confirm merge**. This puts the cloud app on your main branch, which is what Vercel publishes.

## Part 3. The app (Vercel), about 15 minutes

8. Go to **vercel.com**, click **Sign Up**, choose **Hobby**, and continue with GitHub. Allow Vercel to see the **Sudhakar-Claude** repository when asked.
9. Click **Add New… → Project**, find **Sudhakar-Claude**, click **Import**.
10. On the setup screen:
    - **Project Name:** `clinicflow` (this becomes your address, e.g. `clinicflow.vercel.app`; if taken, try `clinicflow-peaceriver`).
    - **Root Directory:** click **Edit**, choose the **cloud** folder, click **Continue**.
    - **Framework Preset:** Next.js (it should pick this by itself).
    - Open **Environment Variables** and add these five, one at a time (name on the left, value on the right):

    | Name | Value |
    | --- | --- |
    | `DATABASE_URL` | your "ClinicFlow DATABASE_URL" from step 5 |
    | `DATABASE_OWNER_URL` | your "ClinicFlow DATABASE_OWNER_URL" from step 5 |
    | `SESSION_SECRET` | a new 48-character password from your password manager, letters and numbers |
    | `APP_URL` | `https://` plus your project name plus `.vercel.app`, e.g. `https://clinicflow.vercel.app` |
    | `SEED_DEMO` | `1` to load the demo clinic so you can try it; leave this out if you want to start empty |

11. Click **Deploy**. Wait two to four minutes. The build log will show `applied 0001_init.sql` and, if you set `SEED_DEMO`, `seeded demo org`. When you see the confetti screen, click **Continue to Dashboard**, then the address under **Domains**.
12. If the address Vercel gave you differs from what you typed for `APP_URL`, fix it: **Settings → Environment Variables → APP_URL → Edit**, then **Deployments → ⋯ on the latest → Redeploy**.
13. **Settings → Functions → Function Region**: choose the region closest to Canada (Montréal if listed, otherwise Washington, D.C.). Note this choice for your privacy consultant: the data is stored in Canada, and requests pass through this region while being processed.

## Part 4. Try it

14. Open `https://your-address/login` and sign in with `demo@clinicflow.app` / `demo-password-123` (only if you set `SEED_DEMO`). Click around: schedule, a patient, checkout, reports.
15. To set up your real clinic, open `https://your-address/signup` and create it with your own email. That is a separate, empty clinic. The demo clinic cannot see it and it cannot see the demo.
16. Your public booking page is shown under **Settings** in the app.

**Before any real patient data goes in:** change the demo password or delete the demo clinic, finish the privacy assessment, and turn on daily backups (Supabase → Database → Backups; point-in-time recovery is on the paid plan).

---

## If something goes wrong

| What you see | What it means |
| --- | --- |
| Build fails with `DATABASE_OWNER_URL is not set` | The variable name has a typo, or it was added after the deploy. Fix it, then **Redeploy**. |
| Build fails with `password authentication failed` | The password inside a connection string does not match step 4, or the username still says `postgres.` instead of `clinicflow_owner.` / `clinicflow_app.`. |
| Build fails with `Tenant or user not found` | The part after `clinicflow_owner.` must be your project's code, exactly as in the string Supabase gave you. |
| Login page loads but sign-in shows an error | Check `DATABASE_URL` uses the **Transaction pooler** (port `6543`) and the **app** password. |
| Invitation and intake links point to the wrong address | `APP_URL` is wrong; fix it and redeploy. |

Copy the exact error text (never a password) into the chat and ask for help.

## Afterwards

- Every change merged into `main` on GitHub redeploys automatically and applies any new database changes.
- **Own domain:** Vercel → Settings → Domains → add e.g. `app.peaceriverwellness.ca` and follow the instructions there. Then update `APP_URL` and redeploy.
- **Costs:** both free tiers cover a pilot. For production with real patients, expect Supabase Pro (about 25 USD a month, includes daily backups) and Vercel Pro (about 20 USD per team member a month).
