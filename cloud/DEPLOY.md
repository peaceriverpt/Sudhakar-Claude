# Deploying ClinicFlow Cloud

This takes about 45 minutes the first time and needs no coding. You will create two accounts: a database host and an app host. Both have free tiers that are enough for a pilot.

Patient data must stay in Canada, so pick Canadian regions where shown.

## 1. Create the database (Neon or Supabase)

**Option A: Neon** (simplest)
1. Go to neon.tech and sign up. Create a project named `clinicflow`, region **AWS ca-central-1 (Canada)**.
2. In the project dashboard, open **Roles** and create two roles: `clinicflow_owner` and `clinicflow_app`. Save both passwords in your password manager.
3. Open **Databases** and create a database named `clinicflow` owned by `clinicflow_owner`.
4. Open the **SQL editor** and run: `grant usage on schema public to clinicflow_app;`
5. From **Connection details**, copy the connection string once for each role. You now have:
   - `DATABASE_OWNER_URL` (the `clinicflow_owner` string)
   - `DATABASE_URL` (the `clinicflow_app` string)

**Option B: Supabase**: create a project in the **Canada (Central)** region, then follow the same role steps in the SQL editor:
```sql
create role clinicflow_owner login password '…';
create role clinicflow_app login password '…';
create database clinicflow owner clinicflow_owner;
```

Both providers take automatic daily backups. Turn on point-in-time recovery once you have real patients.

## 2. Load the schema

On any computer with Node.js installed (or ask whoever helps you technically to run these once):
```bash
cd cloud
npm install
DATABASE_OWNER_URL="<owner string>" npm run db:migrate
```
To load the demo clinic as well: `DATABASE_OWNER_URL="<owner string>" npm run db:seed`

## 3. Deploy the app (Vercel)

1. Go to vercel.com, sign up with your GitHub account, click **Add New → Project** and pick this repository.
2. Set **Root Directory** to `cloud`. Framework is detected as Next.js.
3. Under **Environment Variables** add:
   - `DATABASE_URL` = the `clinicflow_app` connection string
   - `DATABASE_OWNER_URL` = the `clinicflow_owner` connection string
   - `SESSION_SECRET` = a long random string (40+ characters; a password generator works)
   - `APP_URL` = the address Vercel gives you, e.g. `https://clinicflow-yourname.vercel.app` (update it later if you add your own domain)
4. Click **Deploy**. Two minutes later you have a live address. Open `/signup` to create your clinic, or `/login` with the demo account if you seeded it.
5. In Vercel's project settings, under **Functions**, choose the **Toronto (yyz1)** region so the app runs near the database.

## 4. After it is live

- **Own domain**: Vercel → Settings → Domains → add `app.yourclinic.com` and follow the DNS instructions. Update `APP_URL`.
- **Invite staff**: Settings → Team & logins. Send each person their link.
- **Booking page**: Settings shows the public address to put on your website.
- **Updates**: every change merged into `main` on GitHub deploys automatically.
- **Backups**: confirm in the database dashboard that backups are enabled, and once a quarter restore one to a scratch project to be sure it works.

## Environment variables, in one place

| Name | What it is |
| --- | --- |
| `DATABASE_URL` | Connection for the app role (`clinicflow_app`). Row-level security applies to it. |
| `DATABASE_OWNER_URL` | Connection for the owner role. Only used by migrations and seeding. |
| `SESSION_SECRET` | Signs login cookies and tokens. Changing it signs everyone out. |
| `APP_URL` | Public address of the app, used in invitation and intake links. |

## Costs at pilot scale

Neon or Supabase free tier plus Vercel Hobby covers a pilot. For production with five clinics expect roughly 30 to 60 USD a month across both, as estimated earlier.
