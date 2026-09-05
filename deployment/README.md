# Deployment

Everything runs on AWS under **https://interestled.com**:

```
interestled.com (Route 53 → CloudFront, ACM cert)
├── /*                → S3 bucket             (Expo web export, private, read via OAC)
├── /android-install  → S3 bucket             (static install page, from public/)
├── /downloads/*      → S3 bucket             (the Android APK)
└── /api/*            → api.interestled.com:443  (shared Lightsail host, Caddy → :7072)
```

The API is **not** a Lambda. It is a systemd service on a Lightsail instance
shared with [courtpot](https://github.com/RobinNagpal/courtpot) — one box, one
application per port:

```
                    shared Lightsail instance  (13.216.34.24, medium_3_0)
                    ┌───────────────────────────────────────────────┐
interestled.com  ──▶│ Caddy :443  api.interestled.com → :7072        │
  CloudFront        │  (Let's     api.courtpot.com    → :7071        │
                    │   Encrypt)                                     │
courtpot.com     ──▶│ systemd  interestled-api.service  :7072        │
  CloudFront        │ systemd  courtpot-api.service     :7071        │
                    └───────────────────────────────────────────────┘
```

**Only the instance is shared.** Each project keeps its own distribution,
bucket, certificate, Route 53 zone and deployer user, so the two never contend
over anything but CPU and memory — and the instance is the only meaningful
recurring cost, which is the reason to have one rather than two.

- The instance has its own Terraform stack in
  [`terraform/shared-host`](terraform/shared-host), with its own state bucket.
  It belongs to neither application; this stack reads its state read-only to
  find the same static IP courtpot's does.
- **Caddy terminates TLS on `api.interestled.com`** with a certificate it obtains
  and renews itself, and CloudFront reaches it over https. Encrypted on both
  hops, and the origin needs no ACM certificate — ACM here covers only
  `interestled.com` and `www`.
- The `/api/*` origin is reached by **hostname, not IP**: CloudFront requires a
  DNS name for a custom origin, and TLS needs one anyway. `api.interestled.com` is
  a plain A record to the instance's **static** IP, which survives the instance
  being recreated.
- **`www.interestled.com` is redirect-only** — a CloudFront viewer-request
  function answers it with a `301` to the apex, preserving path and query
  string, and is attached to both behaviours so `www…/api/*` redirects too.
- The web build is a static single-page app (`expo export --platform web`); the
  same function rewrites extension-less paths to `/index.html` so client routes
  survive a refresh. `/api/*` is excluded, since those have no dot either.
- Postgres is **not** provisioned here — bring a connection string and set it as
  the `DATABASE_URL` repository secret.

`api.interestled.com` is reachable directly, not only through CloudFront. That is
the same exposure the Lambda Function URL it replaced already had
(`authorization_type = "NONE"`): the API's own PIN-login/bearer-token auth is
the access control. Locking port 443 to CloudFront's published ranges would
also lock out `curl` when diagnosing a bad deploy, which is when you need it.

## The timeout that is not a default

Generating a knowledge map is a single large model call that routinely runs
20–40 seconds, far longer than ordinary CRUD. CloudFront's default origin read
timeout is 30s, which would turn a working generation into a 504:

| Setting | Default | Here | Why |
|---|---|---|---|
| CloudFront `origin_read_timeout` | 30s | **60s** | 60 is the ceiling without a quota increase |

Caddy imposes no read timeout of its own and the service has no request
deadline, so CloudFront is the only ceiling on the hop. If generation starts
timing out, request a CloudFront quota increase — there is nothing else to
raise. (On Lambda this also needed a function timeout; a long-lived process has
no equivalent, which is one thing the move simplified.)

## The Android build

`https://interestled.com/android-install` is a page with one button on it, and
the button downloads the APK built from the latest commit on `main`. That is the
whole distribution channel: no Play Store listing, no EAS account, no invite
list — a link you can send someone, and they have the app.

```
push to main
   ├── deploy.yml   → dist/ + public/android-install/index.html → S3
   └── android.yml  → expo prebuild → gradle assembleRelease    → S3 /downloads/
```

| Path | Written by | Cache-Control |
|---|---|---|
| `/android-install` | `deploy.yml`, from `apps/mobile/public/android-install/index.html` | `no-cache` |
| `/downloads/interestled.apk` | `android.yml` | `no-cache` |
| `/downloads/build.json` | `android.yml` | `no-cache` |
| `/downloads/builds/interestled-<version>-<code>-<sha>.apk` | `android.yml` | immutable |

**The two workflows share a bucket and must not delete each other's files.**
The web deploy syncs with `--delete`, which owns every key it is not told to
leave alone, so `downloads/*` is excluded there. Nothing else stops a web
deploy from removing the APK.

**Nothing about the APK is cached.** `interestled.apk` and `build.json` are
served `no-cache` and the build invalidates `/downloads/*`, because the one
promise the page makes is that the button gives you the current build. The
per-build copies under `builds/` are immutable, since their names say which
build they are; keep those and you can point a tester at the build before the
one that broke.

**`EXPO_PUBLIC_API_URL` is load-bearing here in a way it is not on the web.**
The web export leaves it empty on purpose — CloudFront serves the app and the
API from one origin, so a relative path is right. An APK has no origin, so the
Android build bakes in `vars.SITE_URL`; built without it, the app installs and
then fails on its first request.

### Why not EAS

Expo's build service would do this too, and it is the obvious answer. It is not
the one taken because the APK would live on Expo's servers behind Expo's URL,
which is the opposite of the requirement, and pulling it back to S3 means
keeping the account, the token and the free-tier queue in exchange for a
`prebuild` the runner can do itself in fifteen minutes. `ubuntu-latest` already
has the Android SDK and the JDK; `node-linker=hoisted` in `.npmrc` already
makes autolinking work in this workspace. So there is no vendor here at all,
and `make apk` reproduces exactly what CI does.

### Signing

The APK is signed with the debug keystore the Expo template ships, which is
what `assembleRelease` uses out of the box. Two consequences worth knowing
before this goes wider than people you can talk to:

- **The key is public.** Anyone can build an APK that Android accepts as an
  update to this one. For a link you hand to testers this is proportionate —
  they are already installing an unsigned-by-a-store app — but it is not a
  basis for wide distribution.
- **An Expo SDK upgrade could change the shipped keystore.** If it does, the
  next build will not install over the previous one and testers have to
  uninstall first. It is a fixed file in the template today, so this is a
  latent risk rather than a live one.

The fix for both is the same and is worth doing when the Play Store is: mint a
real keystore, hold it as a repository secret, and point the `release`
`signingConfig` at it instead. That is where the `preview` profile in
`apps/mobile/eas.json` still points, if you ever want EAS to do it.

### The pretty URL needs one `terraform apply`

`/android-install` has no dot in it, so the CloudFront viewer-request function
would otherwise treat it as a client-side route and answer with the SPA shell.
The function now answers it from `/android-install/index.html` first — but the
function is Terraform, not the deploy workflow, so it ships with
`terraform apply`, not with a push. Until that apply runs, the page is reachable
at `/android-install/index.html` and the APK at `/downloads/interestled.apk`;
both of those have dots and need nothing.

### Adding iOS

Not here. iOS builds need a paid Apple Developer account and a signing identity
to produce anything installable, and ad-hoc distribution needs each tester's
device UDID registered in advance — the "send someone a link" shape this page
exists for does not exist on iOS outside TestFlight. The page says so and points
at the web app.

## Before this is public

Registration is open and each topic costs a model call. The server can cap
generations per user, and **ships with every cap off** — each is a repository
variable (`MAX_TOPICS_PER_HOUR`, `MAX_GENERATED_NODES_PER_HOUR` and the rest;
knowledge doc 5 lists them), unset meaning no ceiling. Set them before exposing
this to the internet, and put a rate limit or a sign-up gate in front of
`/api/auth/register` as well: nothing limits how many accounts one person can
create, so a per-user ceiling alone is not a ceiling on the bill.

## The credential Terraform runs as

`terraform apply` for this stack runs as **interestled-infra**, not an account
administrator. That user is created by
[deployment/terraform/infra-identity](terraform/infra-identity/README.md),
which is a separate stack applied by an administrator — a user that could apply
the stack defining its own policy could widen it.

It carries a **permissions boundary**, and that is the load-bearing part rather
than the narrow policy. This stack creates IAM users, so its credential needs
`iam:CreateUser`, `iam:PutUserPolicy` and `iam:CreateAccessKey` — and anything
holding those three can mint itself an administrator. The boundary caps every
principal created here, denies `iam:*` outright, and cannot be edited or
detached by the user subject to it. Verified by attempting it: creating an
unbounded user, rewriting the boundary, stripping it off an existing user, and
attaching `AdministratorAccess` are all denied, as is reaching the shared RDS
or another project's bucket.

The key belongs in `~/.aws/credentials` as a named profile, and `.envrc` sets
`AWS_PROFILE=interestled-infra` — nothing else. An `AWS_ACCESS_KEY_ID` in the
environment takes precedence over a profile *and* over `--profile`, so a key
exported there would silently override the scoped identity it replaced.

```sh
cd deployment/terraform/infra-identity
terraform init -backend-config="bucket=interestled-tfstate-<account-id>"
terraform apply                                    # as an administrator, once
terraform output -raw infra_access_key_id
terraform output -raw infra_secret_access_key
```

Two things stay an administrator's job: this stack, and the shared Lightsail
host, which belongs to neither application.

## One-time setup

Run Terraform with **admin** credentials (your own, not the deployer's). State
lives in private, versioned, SSE-encrypted S3 buckets; create each first.

**1. The shared host** — already exists, and there is only ever one. Its stack
lives in the **courtpot** repository at `deployment/terraform/shared-host`; this
project only reads its state. Create it there if it does not exist yet, and add
an `interestled` entry to that stack's `apps` map so Caddy and systemd know
about this API.

**2. This project**

```sh
bash deployment/scripts/bootstrap-state-bucket.sh
cd deployment/terraform
terraform init -backend-config="bucket=interestled-tfstate-<account-id>"
terraform apply -var="domain_name=interestled.com"
```

`domain_name` has no default on purpose — it must already have a Route 53
hosted zone in this account, because the certificate is DNS-validated against
it, and a wrong value fails ten minutes into the apply.

That creates the bucket, distribution, certificate (DNS-validated in the
existing `interestled.com` zone), the `api.interestled.com` record pointing at the
shared host, and a `interestled-deployer` IAM user scoped to exactly: sync that
bucket and invalidate that distribution. Nothing in this stack can touch the
shared host — that is what the SSH key is for.

> The first apply takes ~5–10 minutes (certificate validation + CloudFront).

Then wire up GitHub Actions (**Settings → Secrets and variables → Actions**):

| Kind | Name | From |
|---|---|---|
| Secret | `AWS_ACCESS_KEY_ID` | `terraform output deployer_access_key_id` |
| Secret | `AWS_SECRET_ACCESS_KEY` | `terraform output -raw deployer_secret_access_key` |
| Secret | `DATABASE_URL` | your Postgres connection string |
| Secret | `SSH_PRIVATE_KEY` | shared-host: `terraform output -raw deploy_private_key` |
| Variable | `S3_BUCKET` | `terraform output -raw web_bucket` |
| Variable | `CLOUDFRONT_DISTRIBUTION_ID` | `terraform output -raw cloudfront_distribution_id` |
| Variable | `DEPLOY_HOST` | shared-host: `terraform output -raw static_ip` |
| Variable | `SSH_HOST_KEY` | `ssh-keyscan -t rsa,ecdsa,ed25519 <static-ip>` |
| Variable | `SITE_URL` | `https://interestled.com` |
| Variable | `LLM_PROVIDER` | `gemini` |
| Variable | `LLM_MODEL` | `gemini-3.1-pro-preview` — the model that builds maps |
| Variable | `LLM_CONTENT_MODEL` | `gemini-3.7-flash` — the model that writes cards, drills and verdicts |
| Variable | `LLM_AUDIO_MODEL` | `gemini-3.1-flash-tts-preview` — the model that reads a card out |
| Variable | `AUDIO_BUCKET` | `terraform output -raw audio_bucket` |
| Secret | `API_AWS_ACCESS_KEY_ID` | `terraform output api_access_key_id` |
| Secret | `API_AWS_SECRET_ACCESS_KEY` | `terraform output -raw api_secret_access_key` |
| Secret | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/apikey) |

The last four are the play button on a card, and they are the only optional rows
here: leave them unset and every route still serves, with the press failing on
that one card and saying which variable is missing. `API_AWS_*` are a **second**
IAM user, not the deployer above — the deployer syncs the web bucket and
invalidates the distribution, and this one can put and get objects in the audio
bucket and nothing else in the account. They are separate secrets because
`configure-aws-credentials` claims the unprefixed names for the web sync.

Reading a card out is the most expensive thing the product does: a model call to
write the script, then minutes of synthesised speech billed by the second. A
recording is made once and played from the bucket after that, and
`MAX_NARRATIONS_PER_HOUR` caps it per learner per hour if it is set — but it is
the number to watch on the bill.

`DATABASE_URL` is a secret because the workflow runs `prisma migrate deploy`
with it before shipping new code, so a deploy that adds a migration applies it.
It is the same string the workflow writes into `/etc/interestled-api.env`.

`SSH_HOST_KEY` is **pinned** rather than accepted on first use, so a hijacked
record cannot collect a key that can restart both APIs. Recreating the instance
changes it — re-run `ssh-keyscan` and update the variable when that happens, or
every deploy will fail at the SSH step.

The workflow writes `/etc/interestled-api.env` **whole** on every deploy, from
those values. A key that is not in the workflow is a key the service does
not get: adding a provider means adding its secret here *and* the line that
writes it, or generation fails at runtime with a missing key rather than at
deploy time.

## Every deploy after that

Push to `main`. `.github/workflows/deploy.yml`:

1. exports the web app with `EXPO_PUBLIC_API_URL=${{ vars.SITE_URL }}` baked in,
   syncs it to S3 and invalidates CloudFront;
2. runs `prisma migrate deploy`;
3. bundles `apps/server/src/index.ts` with esbuild
   (`deployment/scripts/build-server.sh`);
4. rsyncs the bundle to `/srv/interestled/next` on the shared host, swaps it into
   `current`, rewrites `/etc/interestled-api.env`, and restarts `interestled-api`;
5. polls `https://api.interestled.com/health` and dumps the service's journal if it
   never answers.

`.github/workflows/android.yml` runs beside it on the same push, building the
APK and writing it to `/downloads/` — separately, because a fifteen-minute
Gradle build must not hold up the API and a broken native build must not stop a
deploy. See *The Android build* above.

The bundle is staged and swapped rather than written in place, so systemd can
never restart into a half-transferred directory. The environment file is
rewritten every deploy, so the workflow — not a hand edit on the box — decides
what the service runs with.

The bundle ships the **x86_64** Prisma query engine next to `index.js`, because
the bundled client loads its engine from its own directory at runtime. That
target (`debian-openssl-3.0.x`) tracks the host image; an engine built for the
wrong libc or OpenSSL fails at the first query rather than at start-up.

## Operating the shared host

```sh
# Terraform holds both keys; deploy_private_key is CI's, admin is yours.
cd deployment/terraform/shared-host
terraform output -raw admin_private_key > ~/.ssh/shared-apps.pem
chmod 600 ~/.ssh/shared-apps.pem
ssh -i ~/.ssh/shared-apps.pem ubuntu@$(terraform output -raw static_ip)

sudo journalctl -u interestled-api -f     # this API's logs
sudo journalctl -u caddy -f            # TLS and routing
curl localhost:8080                    # host liveness, no certificate involved
curl localhost:7071/health             # this API, bypassing Caddy
```

**Adding an application, or changing a port**, is an edit to the `apps` map in
`terraform/shared-host/variables.tf` — but apply it by re-running the script on
the box, not with `terraform apply`. The map is part of `user_data`, and
changing `user_data` destroys and recreates the instance:

```sh
ssh -i ~/.ssh/shared-apps.pem ubuntu@<static-ip> \
  "sudo APPS_JSON='<the new map as JSON>' \
        DEPLOY_PUBLIC_KEY=\"\$(cat /home/deploy/.ssh/authorized_keys)\" \
        bash /root/provision.sh"
```

`provision.sh` is idempotent and derives everything it writes from `APPS_JSON`,
so a re-run converges. It leaves a copy at `/root/provision.sh` for exactly
this. Commit the variables change too, so the next instance is built the same.

**Recreating the instance** (a resize, or a rebuild) is safe but not free: no
data is lost, since state is in RDS and code is re-pushed by CI, but both APIs
are down until each project's workflow runs again, and `SSH_HOST_KEY` must be
updated in both repositories.

## Notes

- **Terraform state** lives in `interestled-tfstate-<account-id>` and
  `shared-host-tfstate-<account-id>` (private, versioned, encrypted). Both
  contain secrets — the deployer's access key here, the SSH private keys there.
- **Costs**: the Lightsail instance is the only real recurring line, and it is
  shared. S3 is pennies, CloudFront sits in its free tier at this scale, and the
  hosted zone is the $0.50/month you already pay. Splitting the two APIs onto
  separate instances would double the one number that matters.
