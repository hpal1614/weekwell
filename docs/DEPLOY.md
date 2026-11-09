# Put Weekwell online, with Google sign-in, and install it like an app

You end up with a private web address, for example `https://weekwell-yourname.vercel.app`:

- **Only your Google account can sign in.** Anyone else sees the sign-in page and nothing else.
- **Install it on your phone or computer** like an app. No Apple developer account or App Store needed.
- **Your data stays where it is now, in Neon.**

Everything below is **free**: Vercel Hobby plan, Google sign-in, Neon free plan.

It takes about 20 minutes, done once. You need: your GitHub account, your Google account, and the `DATABASE_URL` from your `.env.local` file.

---

## Step 0: Get the code onto `main`

The new code is on the branch `claude/clever-meitner-jwwlip`. Vercel publishes from `main`, so merge that branch into `main` on GitHub with a pull request, then **Merge**.

> ⚠️ **Do this before Step 1.** The old version on `main` has **no login**. If Vercel builds the old `main` with your `DATABASE_URL`, anyone with the link could see your budget. Once the new code is on `main`, the server refuses to show data until login is fully set up.

## Step 1: Create the Vercel project (gives you your web address)

1. Go to **vercel.com** and **Sign up with GitHub**. Choose the free **Hobby** plan.
2. **Add New… → Project**, then **Import** `hpal1614/weekwell`.
3. Leave the Framework Preset as **Other**. The repo's `vercel.json` already sets the build.
4. Open **Environment Variables** and add these, ticking **Production only**:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | The `DATABASE_URL=` line from your `.env.local` (starts with `postgresql://`) |
   | `ALLOWED_EMAILS` | Your Gmail address. Several are allowed, comma-separated. |
   | `SESSION_SECRET` | A long random string. On your computer, run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste the result. |

   Why **Production only**: preview copies of the app then have no database access at all.
5. Click **Deploy**. When it finishes, copy your address (e.g. `https://weekwell-abc.vercel.app`).

If you open it now, it says login isn't set up yet. That's expected and safe: it refuses to show data until Step 3 is done.

## Step 2: Create the Google sign-in client

1. Go to **console.cloud.google.com**, then **Select a project → New project**. Name it `Weekwell` and create it.
2. Menu → **APIs & Services → OAuth consent screen**. This may be called **Google Auth Platform**.
   - **Get started**, or **Branding**: app name `Weekwell`, support email = your Gmail.
   - **Audience**: **External**, and leave it in **Testing**. Under **Test users**, **Add users**: your Gmail.

   Testing mode is fine forever for personal use. It means only the test users you list can sign in.
3. **Clients** (or **Credentials → Create credentials**) → **OAuth client ID**:
   - Application type: **Web application**, name `Weekwell`.
   - **Authorised JavaScript origins**: your Vercel address, e.g. `https://weekwell-abc.vercel.app`, with no slash at the end.
   - **Authorised redirect URIs**: the same address plus `/auth/google`, e.g. `https://weekwell-abc.vercel.app/auth/google`.
   - **Create**. Copy the **Client ID**, which ends in `.apps.googleusercontent.com`. You don't need the client secret.

## Step 3: Connect them

1. In Vercel: **Project → Settings → Environment Variables**. Add `GOOGLE_CLIENT_ID` = the Client ID, Production.
2. **Deployments**, then on the latest one **⋯ → Redeploy**.
3. Open your address, tap **Sign in with Google**, and choose your account. Your budget appears.

The first time it starts, your data is upgraded to the new format automatically, with a backup copy kept first.

**Then:** tap **Backup → Download backup**, and keep the file in Google Drive.

## Step 4: Install it

| Device | How |
|---|---|
| **iPhone** | Open the address in **Safari** → **Share** (square with arrow) → **Add to Home Screen** → Add |
| **Android** | Open it in **Chrome** → ⋮ menu → **Install app** (or **Add to Home screen**) |
| **Computer (Chrome)** | Click the **install icon** at the right of the address bar, or ⋮ → **Cast, save and share → Install page as app** |

It opens full screen with the Weekwell icon, like an app. You stay signed in for 30 days at a time. Each time you use it, the 30 days restart.

---

## Step 5 (optional): Connect Up Bank so spending logs itself

1. In the **Up app**, open your profile → **Data sharing** → **Personal Access Token**, and follow the steps. It may send you to api.up.com.au to sign in.
2. **Copy the token.** It starts with `up:yeah:`. Treat it like a password: it lets Weekwell **read** your Up accounts. Up's API can't move money.
3. In **Vercel → weekwell → Settings → Environment Variables**:
   - **Key:** `UP_API_TOKEN`
   - **Value:** the token
   - Switch the **lock** toggle on, choose **Production**, then **Save**.
4. **Deployments → ⋯ → Redeploy.**
5. Open Weekwell → **Spending**. A **Sync Up** button appears, and your Up card purchases from the last 6 weeks come in.

From then on, Weekwell checks Up for new purchases every time you open it.

- **What gets logged:** only card purchases from your Up Spending account.
- **What's skipped:** transfers, Saver activity, pay coming in, and bills already in your plan (rent, Netflix, gym, Afterpay…), so nothing is counted twice.
- **Correcting a category:** fix one synced purchase and Weekwell remembers it for that shop.
- **Turning it off:** delete the token in the Up app (Data sharing) or remove `UP_API_TOKEN` in Vercel.

---

## How it's protected

- Google proves who you are. The server checks Google's signature, that the sign-in was made for **your** client ID, and that the email is on `ALLOWED_EMAILS`.
- Your session is a signed, httpOnly cookie, which page scripts can't read. Remove an email from `ALLOWED_EMAILS` and redeploy, and that account is signed out.
- Changes are only accepted from the Weekwell site itself (cross-site request protection), and strict security headers are sent.
- If any login setting is missing, the server **refuses to show data** rather than running open.
- The app's offline cache only stores the app's own files, never your budget data.
- Your database password (`DATABASE_URL`) lives only in Vercel's encrypted settings and your own `.env.local`, never in GitHub.

## Running it on your computer

Same as before: `npm install`, then `npm start`, then open `http://127.0.0.1:3000`.

Without `GOOGLE_CLIENT_ID` in `.env.local`, there's no login locally. To test Google sign-in locally:

1. Add `http://localhost:3000` to the client's JavaScript origins.
2. Add `http://localhost:3000/auth/google` to its redirect URIs.
3. Put `GOOGLE_CLIENT_ID`, `ALLOWED_EMAILS` and `SESSION_SECRET` in `.env.local`, and open `http://localhost:3000`.

## Problems?

| What you see | Fix |
|---|---|
| "Login is not set up on this server yet" | An environment variable is missing (the page lists which). Add it, then Redeploy. |
| Google says **Error 400: redirect_uri_mismatch** or **origin not allowed** | The address in Step 2 must match exactly: `https`, no trailing slash, and the redirect ends in `/auth/google` |
| Google says **Access blocked: app not verified / not a test user** | Add your Gmail under **Audience → Test users** |
| "That Google account isn't allowed" | The email isn't in `ALLOWED_EMAILS` (check spelling), or you picked another Google account |
| Build fails at `db:migrate` | `DATABASE_URL` is missing or wrong. Copy it again from `.env.local`. |
