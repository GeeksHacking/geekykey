# The Event Service's Google Cloud setup

This is the runbook for everything the Event Service (`apps/event-service`) uses
on Google Cloud. Nothing here is infrastructure as code yet. Julian asked on 8 Oct 2026
for the services to be set up by hand while the architecture settles, and turned into code
later. So every `gcloud` command that made something is written down here, in the order it
was run, with a line on what it's for. Anyone can repeat it on a new project, and it's
the list to work from when it does become code.

The deploy itself isn't by hand: `.github/workflows/deploy.yml` builds, migrates and
deploys on every push to `main`. What it deploys with is in this folder:

```text
infra/
├── README.md               this runbook
├── project.env             the Google Cloud project, region and image repository
├── production/
│   ├── deploy.env          the service, its deploy account, and each secret pinned to a version
│   └── settings.env        the service's settings, which the deploy sets on Cloud Run
└── staging/
    ├── deploy.env          the same, for event-service-staging
    └── settings.env
```

Change a setting or a secret's version in those files, through a pull request, never in
the console. The next deploy sets them, and anything changed by hand is overwritten.

One step isn't on Google Cloud: [step 12](#12-the-geekykey-services-build-on-cloudflare),
how Cloudflare builds and deploys the GeekyKey Service (`apps/geekykey-service`), a Worker
the Event Service's hand-offs come from. It's here so the one runbook has every service.

## What lives where

| What | Name | What it's for |
|---|---|---|
| Project | `geekykey-b035a` ("GeekyKey") | Our own project, on GeeksHacking's billing account. It is also our Firebase project |
| Region | `asia-southeast1` | Singapore, where TiDB is |
| Image repository | `event-service` | Holds the Event Service's images, which the deploy builds |
| Cloud Run services | `event-service`, `event-service-staging` | Production at `event-api.geekshacking.com`, and staging at its `run.app` address only |
| Service accounts the services run as | `event-service`, `event-service-staging` | Each can read only its own service's `app-secrets` |
| Service accounts the deploy signs in as | `event-service-deployer`, `event-service-staging-deployer` | Production's works only from `main`. Staging's works from any branch and can't touch production |
| Secrets | `event-service-…` and `event-service-staging-…` | For each service, `app-secrets` (its session secret, app login and two keys, in one) and `migration-database-url` |
| Keyless sign-in | Pool `github`, provider `geekykey` | Lets this repo's workflows sign in to Google Cloud without a key |

**GitHub holds no secret.** (Nor a Cloudflare API token: nothing here deploys to
Cloudflare.) The workflow signs in through
the keyless sign-in (Workload Identity Federation), and reads the one secret it needs, the
migration login, from Secret Manager.

## Who runs what

Adam has the Editor role on the project. It lets him turn on APIs and create the image
repository, the service accounts, the services and the secrets, and add secret values.
It doesn't let him give anyone a role, or read a secret's value. Steps 6 to 8 are all
grants: about twenty-two of them. Rather than make each one in the console, Julian, as
Owner, gave Adam a role that can grant (Owner, or Security Admin with Workload Identity
Pool Admin, asked 9 Oct 2026), and Adam ran those steps from here. That role was taken
away again after 9 Oct (found on 13 Oct 2026), so a grant made since is Julian's, or
needs the role back for a while. Julian also runs step 9, because mapping a domain needs
whoever verified `geekshacking.com` with Google, and step 10, on the billing account. He
works in the web console, so his steps say where each one is there too.

| Step | Who | Run |
|---|---|---|
| [1. Turn on the APIs](#1-turn-on-the-apis) | Adam | 9 Oct 2026 |
| [2. The image repository](#2-the-image-repository) | Adam | 9 Oct 2026 |
| [3. The service accounts](#3-the-service-accounts) | Adam | 9 Oct 2026 |
| [4. The secrets, without values](#4-the-secrets-without-values) | Adam | 9 Oct 2026. `app-secrets`: 13 Oct 2026 |
| [5. The two services](#5-the-two-services) | Adam | 9 Oct 2026 |
| [6. The keyless sign-in](#6-the-keyless-sign-in) | Adam, with the access Julian gave | 9 Oct 2026 |
| [7. Who may do what](#7-who-may-do-what) | Adam, with the access Julian gave. `app-secrets`: Julian | 9 Oct 2026. `app-secrets`: 14 Oct 2026 |
| [8. Logs for the team](#8-logs-for-the-team) | Adam, with the access Julian gave | 9 Oct 2026 |
| [9. The address](#9-the-address) | Julian, once Adam says it's ready | 11 Oct 2026 |
| [10. A budget alert](#10-a-budget-alert) | Julian, still to confirm | Not yet |
| [11. The secret values](#11-the-secret-values) | Adam | 9 Oct 2026. `app-secrets`: 14 Oct 2026 |
| [12. The GeekyKey Service's build on Cloudflare](#12-the-geekykey-services-build-on-cloudflare) | Julian, in the Cloudflare dashboard (BAC-44) | Not yet |

When you run a step, put the date in the table, and change any command you ran
differently so it says what you actually ran.

## Before you start

Sign in, and point `gcloud` at the project:

```bash
gcloud auth login
gcloud config set project geekykey-b035a
```

Or use Cloud Shell, a terminal inside the [Google Cloud console](https://console.cloud.google.com/?project=geekykey-b035a)
(the `>_` button, top right), where `gcloud` is already installed and signed in as you.
Then only the second command is needed.

Every command below is written for zsh or bash, from any folder.

## 1. Turn on the APIs

Each Google Cloud product has to be turned on in a project before it can be used. Cloud
Run (`run`) was turned on from the console on 9 Oct 2026, and Artifact Registry
(`artifactregistry`) was already on, for Firebase. Turning on one that's already on
changes nothing, so on a new project the same command turns them all on:

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com
```

- `run`: Cloud Run, which runs the services.
- `artifactregistry`: where their images are kept.
- `secretmanager`: where the services' secrets are kept.
- `iam`: service accounts, and the keyless sign-in's pool.
- `iamcredentials` and `sts`: the keyless sign-in. GitHub's token is swapped for a
  short-lived Google one (`sts`), which then acts as a deploy account (`iamcredentials`).

## 2. The image repository

Where the deploy pushes each image it builds, and where Cloud Run pulls it from.

```bash
gcloud artifacts repositories create event-service \
  --location=asia-southeast1 \
  --repository-format=docker \
  --description="The Event Service's images, pushed by the deploy workflow"
```

## 3. The service accounts

A service account is an identity for a program rather than a person. There are four.

Each service runs as its own account, so it can read only its own secrets:

```bash
gcloud iam service-accounts create event-service \
  --display-name="Event Service (production), runs the service"
gcloud iam service-accounts create event-service-staging \
  --display-name="Event Service (staging), runs the service"
```

The deploy workflow signs in as one of two more, so production's and staging's deploys
can't reach each other's service or secrets:

```bash
gcloud iam service-accounts create event-service-deployer \
  --display-name="Deploys event-service, from main only"
gcloud iam service-accounts create event-service-staging-deployer \
  --display-name="Deploys event-service-staging, from any branch"
```

Turning on Cloud Run also made Google's "Default compute service account"
(`468223998400-compute@developer.gserviceaccount.com`). It has no role in this project,
and nothing of ours runs as it.

## 4. The secrets, without values

A secret is created empty. Its value is added later as version 1, from Adam's laptop
(step 11), so no value ever passes through this runbook, the repo or GitHub.

```bash
for service in event-service event-service-staging; do
  for name in app-secrets migration-database-url; do
    gcloud secrets create "$service-$name" --replication-policy=automatic
  done
done
```

That makes four:

| Secret | Read by | Becomes |
|---|---|---|
| `event-service-app-secrets` | The service, at start-up | `APP_SECRETS`, one JSON object, which the server unpacks into the four below |
| `event-service-migration-database-url` | The deploy workflow only | The TiDB migration login, for `db:migrate` |
| `event-service-staging-…` | The same, for staging | The same, on `geekykey_staging` |

What's inside each `app-secrets`:

| Name | What it is |
|---|---|
| `SESSION_SECRET` | Signs the session cookie |
| `DATABASE_URL` | The TiDB app login |
| `EVENT_SERVICE_KEY` | The key the GeekyKey side's requests to the Event side carry, from checkpoint 3 |
| `CLAIMS_STAND_IN_KEY` | The key the GeekyKey side's requests to the claims stand-in carry, from checkpoint 3 until the switch |

Until the split, both ends of those requests are inside the one server, so it both sends
and checks each key. From checkpoint 4, the GeekyKey Service sends them from a Worker,
which keeps its own copy of production's two as Workers secrets, named
`EVENT_SERVICE_KEY_SHOWCASE` and `CLAIMS_STAND_IN_KEY` there.

The four live in one secret because Secret Manager bills each stored version, after the
first 6 on the billing account, and one secret for each made ten (13 Oct 2026, BAC-30, at
Julian's suggestion). The migration login stays apart, because the deploy accounts read
it and the services must not. The cost is in changing one of the four (see
[Changing a secret](#changing-a-secret)).

Until 13 Oct each of the four was a secret of its own: `session-secret` and `database-url`
from 9 Oct, and `event-service-key` and `claims-stand-in-key` from 13 Oct. The keys were
deleted the same day, and the other two on 14 Oct, once both services ran on
`app-secrets` (step 11).

## 5. The two services

Each service is created once here, running Google's sample image, with every setting that
doesn't change from deploy to deploy. The deploy workflow then replaces the image and sets
the settings and secrets from the files in this folder, and leaves the rest alone.

```bash
for service in event-service event-service-staging; do
  gcloud run deploy "$service" \
    --region=asia-southeast1 \
    --image=us-docker.pkg.dev/cloudrun/container/hello \
    --service-account="$service@geekykey-b035a.iam.gserviceaccount.com" \
    --cpu=1 \
    --memory=512Mi \
    --concurrency=80 \
    --cpu-throttling \
    --cpu-boost \
    --execution-environment=gen1 \
    --min=0 \
    --max=2 \
    --no-allow-unauthenticated
done
```

- `--cpu=1 --memory=512Mi`: one processor and 512 MiB for each instance.
- `--concurrency=80`: one instance takes up to 80 requests at once before Cloud Run starts
  another.
- `--cpu-throttling`: request-based billing. The instance gets its processor only while a
  request is in progress, and we pay only for that time.
- `--cpu-boost`: extra processor while an instance starts, to shorten a cold start. Kept
  after measuring it on staging on 10 and 11 Oct 2026: cold taps took 1.3 to 2.0 s on Cloud
  Run with it, and 1.3 to 2.1 s without ([the measurements](../.scratch/db-hosting/assets/cold-start.md)).
- `--execution-environment=gen1`: the first-generation environment, which starts faster
  and is what Julian means by "v1" (8 Oct 2026).
- `--min=0 --max=2`: no instance when nobody is calling, and never more than two, which
  also caps TiDB at 20 connections. The minimum goes to 1 on event days (see
  [The warm instance](#the-warm-instance)).
- `--no-allow-unauthenticated`: nobody can call it yet. Step 7 opens it, just before the
  first deploy.

Their `run.app` addresses, which never change:

- `event-service`: `https://event-service-468223998400.asia-southeast1.run.app`
- `event-service-staging`: `https://event-service-staging-468223998400.asia-southeast1.run.app`

## 6. The keyless sign-in

GitHub gives every workflow run a signed token that says which repo, branch and event it
came from. Google is told to trust those tokens, but only from this repo. Then each deploy
account says which runs may act as it.

The pool and the provider:

```bash
gcloud iam workload-identity-pools create github \
  --location=global \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc geekykey \
  --location=global \
  --workload-identity-pool=github \
  --display-name="GeeksHacking/geekykey" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.repository_id + ':' + assertion.run_id,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository_id == '1310668143'"
```

`1310668143` is the ID GitHub gives `GeeksHacking/geekykey`. It's checked rather than the
name, because a deleted repo's name can be taken by someone else, but its ID never is.

The mapping copies what Google needs out of each token:

- `google.subject` names the run in Google's audit logs, as the repo's ID and the run's
  ID, the number in the run's address on GitHub (`…/actions/runs/NUMBER`). It isn't the token's own
  subject (`sub`), for two reasons. This repo's tokens use GitHub's newer subjects,
  which carry IDs as well as names (`repo:GeeksHacking@42840940/geekykey@1310668143:ref:…`),
  and Google refuses a subject longer than 127 characters, which a long branch name passes.
- `attribute.repository_id` is the repo's ID, which staging's binding checks.
- `attribute.ref` is the branch the run is on, such as `refs/heads/main`, which
  production's binding checks. A pull request's run has `refs/pull/NUMBER/merge` instead.

Production's deploy account, only for runs on `main`:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  event-service-deployer@geekykey-b035a.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/468223998400/locations/global/workloadIdentityPools/github/attribute.ref/refs/heads/main"
```

Staging's deploy account, for any run from this repo:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  event-service-staging-deployer@geekykey-b035a.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/468223998400/locations/global/workloadIdentityPools/github/attribute.repository_id/1310668143"
```

On 9 Oct this step first ran with an older mapping and a production binding on the
token's subject, which this repo's subjects never match. It was put right straight after,
before any deploy, with:

```bash
gcloud iam workload-identity-pools providers update-oidc geekykey \
  --location=global --workload-identity-pool=github \
  --attribute-mapping="google.subject=assertion.repository_id + ':' + assertion.run_id,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref"
gcloud iam service-accounts remove-iam-policy-binding \
  event-service-deployer@geekykey-b035a.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principal://iam.googleapis.com/projects/468223998400/locations/global/workloadIdentityPools/github/subject/repo:GeeksHacking/geekykey:ref:refs/heads/main"
```

followed by production's binding above. On a new project, run the commands above this
note and skip these.

Never add a workflow that runs `on: pull_request_target`. It runs for someone else's pull
request, yet its ref is `main`'s, so it could act as production's deploy account.

## 7. Who may do what

Every grant is on one service, one secret or one account, not on the whole project, so
each account can reach only what's listed here.

Each service reads its own `app-secrets`, and nothing else:

```bash
for service in event-service event-service-staging; do
  gcloud secrets add-iam-policy-binding "$service-app-secrets" \
    --member="serviceAccount:$service@geekykey-b035a.iam.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
done
```

Julian makes these two, since Adam can no longer grant. In the console, it's Security →
Secret Manager, then for each secret: open it, the Permissions tab, Grant access, with the
role Secret Manager Secret Accessor, to:

| Secret | Principal |
|---|---|
| `event-service-app-secrets` | `event-service@geekykey-b035a.iam.gserviceaccount.com` |
| `event-service-staging-app-secrets` | `event-service-staging@geekykey-b035a.iam.gserviceaccount.com` |

Each `migration-database-url`'s Permissions tab shows a grant made the same way on 9 Oct,
to its deploy account, to compare with.
No value is seen or needed: a grant only lets the service read its own secret.

(On 9 Oct the same grant was made on each service's `session-secret` and `database-url`,
which `app-secrets` replaces.)

Each deploy account may push images, read its own migration login, deploy its own
service, and start that service as the service's own account:

```bash
for service in event-service event-service-staging; do
  deployer="serviceAccount:$service-deployer@geekykey-b035a.iam.gserviceaccount.com"

  gcloud artifacts repositories add-iam-policy-binding event-service \
    --location=asia-southeast1 --member="$deployer" --role=roles/artifactregistry.writer

  gcloud secrets add-iam-policy-binding "$service-migration-database-url" \
    --member="$deployer" --role=roles/secretmanager.secretAccessor

  gcloud run services add-iam-policy-binding "$service" \
    --region=asia-southeast1 --member="$deployer" --role=roles/run.developer

  gcloud iam service-accounts add-iam-policy-binding \
    "$service@geekykey-b035a.iam.gserviceaccount.com" \
    --member="$deployer" --role=roles/iam.serviceAccountUser
done
```

Neither deploy account can read the secrets the service reads: Cloud Run checks those
against the service's own account when it starts an instance.

Both deploy accounts push to the one image repository, so staging's could push over a
tag production pushed. We accept that, because the deploy never runs an image by its tag.
It runs it by its digest, a fingerprint of the image's exact contents, so an image pushed
later under the same tag is a different image, and production keeps running its own.

Anyone may call each service, because stations and the screens do. The routes check their
own keys and sessions:

```bash
for service in event-service event-service-staging; do
  gcloud run services add-iam-policy-binding "$service" \
    --region=asia-southeast1 --member=allUsers --role=roles/run.invoker
done
```

Then check steps 6 and 7:

```bash
gcloud iam workload-identity-pools providers describe geekykey \
  --location=global --workload-identity-pool=github --format="value(state,attributeCondition)"
gcloud run services get-iam-policy event-service --region=asia-southeast1
```

The first should say `ACTIVE` and the repo's ID, `1310668143`. The second should list
`allUsers` as invoker and `event-service-deployer` as developer.

And check that only each service's own account can read its `app-secrets`:

```bash
for service in event-service event-service-staging; do
  gcloud secrets get-iam-policy "$service-app-secrets" --format="value(bindings.members)"
done
for deployer in event-service-deployer event-service-staging-deployer; do
  gcloud projects get-iam-policy geekykey-b035a --flatten="bindings[].members" \
    --filter="bindings.members:$deployer@geekykey-b035a.iam.gserviceaccount.com" \
    --format="value(bindings.role)"
done
```

The first loop should print two lines: `serviceAccount:event-service@…`, then
`serviceAccount:event-service-staging@…`. The second should print nothing, since a
deploy account with a role on the whole project could read every secret in it.

## 8. Logs for the team

Adam and Ethan read the services' logs (Logs Viewer). Adam's Editor role already covers
it, and deploying and adding secret values, but he gets Logs Viewer too, so he keeps it if
Editor is ever narrowed. Nobody else needs it (Zi Tao and Joshua, 9 Oct). Put each
person's Google account in place of the placeholder:

```bash
for person in ADAM_EMAIL ETHAN_EMAIL; do
  gcloud projects add-iam-policy-binding geekykey-b035a \
    --member="user:$person" --role=roles/logging.viewer
done
```

## 9. The address

`event-api.geekshacking.com` is mapped to `event-service`, the way GeeksHacking's
`portal-api.` is mapped to the Portal. Google issues its certificate. Mapping a domain
needs someone who has verified `geekshacking.com` with Google, so Julian runs it. In the
console, it's Cloud Run → Domain mappings → Add mapping, with service `event-service` and
domain `event-api.geekshacking.com`, which then shows the DNS record. With `gcloud`:

```bash
gcloud beta run domain-mappings create \
  --service=event-service \
  --domain=event-api.geekshacking.com \
  --region=asia-southeast1
```

Then it shows the DNS record it needs:

```bash
gcloud beta run domain-mappings describe \
  --domain=event-api.geekshacking.com \
  --region=asia-southeast1 \
  --format="value(status.resourceRecords)"
```

That record goes into Cloudflare's DNS for `geekshacking.com`. Add it with the proxy
**off** (grey cloud, "DNS only") until the certificate is issued, because Google's docs warn
that a proxy in front of a mapping can stop its certificate from being issued or renewed.
Julian adds it, once we tell him the service is ready. The certificate can take from 15
minutes to a day. `event-service-staging` has no mapping, only its `run.app` address.

Julian made the mapping in the console on 11 Oct 2026, at 15:23 UTC. It asked for one
record, a `CNAME` from `event-api` to `ghs.googlehosted.com.`, and Google's certificate
was ready seven minutes later. The record has Cloudflare's proxy **on** (orange cloud), as
Julian set it. Adam kept it on, on 12 Oct 2026, after a request sent the way a station
sends one passed through to the service. So:

- Cloudflare answers for `event-api.`, with its own certificate (Let's Encrypt's, on 12 Oct),
  and passes each request on to Google. Stations trust it: their 14 roots cover the
  certificate authorities Cloudflare uses, as they must for `key-api.` anyway.
- Cloud Run's request log shows Cloudflare's addresses, not each caller's.
- Cloudflare's SSL/TLS mode for `geekshacking.com` must stay Full or Full (strict). Flexible
  would send requests on to Google over plain `http://`, which Cloud Run answers with a
  redirect to `https://`, so every request would go round in circles.
- Cloudflare's "Always Use HTTPS" stays off, as Google's docs ask when Cloudflare is in
  front of a mapping. Cloud Run sends `http://` on to `https://` itself.
- Google's certificate expires on 9 Jan 2027, and Google renews it before then. In
  mid-December, check under Cloud Run → Domain mappings that it did. If it didn't,
  switch the record to DNS only until it has.

To see whether the proxy is on, from any laptop:

```bash
dig +short event-api.geekshacking.com
curl -sI https://event-api.geekshacking.com/api/health | grep -i '^server:'
```

With the proxy on, as now, the first prints only Cloudflare's addresses, and the second
says `server: cloudflare`. With it off, the first starts with `ghs.googlehosted.com.`, and
the second says `server: Google Frontend`. The certificate's issuer doesn't tell you,
because Cloudflare sometimes uses Google Trust Services too.

## 10. A budget alert

Still to confirm with Julian (asked 8 Oct 2026, not answered). A budget doesn't stop
anything. It emails when the project's spending passes each step. The amount here is a
placeholder. In the console, it's Billing → Budgets & alerts → Create budget, scoped to
`geekykey-b035a`. With `gcloud`, budgets have their own API to turn on first:

```bash
gcloud services enable billingbudgets.googleapis.com
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="GeekyKey Event Service" \
  --budget-amount=10USD \
  --filter-projects=projects/geekykey-b035a \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0
```

It emails the billing account's admins, which is Julian. For Adam to get it too, make an
email channel for him first, and add its name to the budget:

```bash
gcloud beta monitoring channels create \
  --display-name="Adam" --type=email --channel-labels=email_address=ADAM_EMAIL
# Prints the channel's name, projects/geekykey-b035a/notificationChannels/NUMBER.
# Add to the budgets create command above:
#   --notifications-rule-monitoring-notification-channels=THAT_NAME
```

## 11. The secret values

Adam adds each value from his laptop, as version 1, keeping no copy. Nothing is typed on
the command line, so nothing lands in the shell's history. `tr -d '\n'` and `printf '%s'`
keep a newline out of the value.

The migration logins, from the files `db:logins` saved. `sed` picks the URL out of the
file without running it:

```bash
sed -n 's/^TIDB_MIGRATION_URL=//p' ~/.config/geekykey/tidb-migration.env | tr -d '\n' \
  | gcloud secrets versions add event-service-migration-database-url --data-file=-
sed -n 's/^TIDB_MIGRATION_URL=//p' ~/.config/geekykey/tidb-staging-migration.env | tr -d '\n' \
  | gcloud secrets versions add event-service-staging-migration-database-url --data-file=-
```

Each service's `app-secrets`, as one JSON object. Nobody ever needs to see its values:

- the session secret is 48 random bytes, in base64;
- the app login gets a new password, since one is shown only once, when it's made;
- each key is 32 random bytes, written as 64 lower-case hex characters, as the API
  agreement says under "Event Service keys". No chat, dashboard or shell treats a hex
  character specially, and a double-click selects the whole key, so it survives being
  copied at checkpoint 4.

Each value is generated on its own, so production's and staging's differ. `db:logins`
prints the app login's URL, but `sed` takes it out of what's printed, so it never shows.
The values reach `jq` as environment variables, which only your own account can see, not
as arguments, which any account on the laptop can list, and `jq -j` writes no newline:

```bash
cd apps/event-service   # from the repo's root: db:logins is the Event Service's script

# $1 is the service; the rest go to db:logins.
app_secrets() {
  local service=$1; shift
  local url
  url=$(mise exec -- pnpm db:logins --env-file ~/.config/geekykey/tidb.env \
    --new-app-password "$@" | sed -n 's/^App login: *\(mysql:\/\/.*\)$/\1/p')
  [[ $url == mysql://* ]] || { echo "No app login URL, so nothing added"; return 1; }
  DATABASE_URL=$url \
    SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n') \
    EVENT_SERVICE_KEY=$(openssl rand -hex 32) \
    CLAIMS_STAND_IN_KEY=$(openssl rand -hex 32) \
    jq -jn '{SESSION_SECRET: env.SESSION_SECRET, DATABASE_URL: env.DATABASE_URL,
      EVENT_SERVICE_KEY: env.EVENT_SERVICE_KEY, CLAIMS_STAND_IN_KEY: env.CLAIMS_STAND_IN_KEY}' \
    | gcloud secrets versions add "$service-app-secrets" --data-file=-
}

app_secrets event-service-staging --staging
app_secrets event-service
```

A new app login password stops the running service opening new connections to TiDB, so
each line runs only once that service can read its `app-secrets` (step 7), and its deploy
follows straight after: staging's from the branch, production's by the merge.

Then check each has one version, that it's enabled, and that it holds the four names (the
check prints the names, never a value):

```bash
for service in event-service event-service-staging; do
  gcloud secrets versions list "$service-app-secrets" --format="value(name.basename(),state)"
done
```

It should print `1` and `enabled` twice. Your account can't read the versions themselves,
so the server checks the rest: a deploy whose `APP_SECRETS` isn't valid, or is missing a
value, stops at start-up and logs which setting is wrong.

The old secrets are deleted once nothing can read them. The four keys went on 13 Oct 2026:
no revision ever pinned them, and nobody had a copy:

```bash
for service in event-service event-service-staging; do
  for name in event-service-key claims-stand-in-key; do
    gcloud secrets delete "$service-$name" --quiet
  done
done
```

Each service's `session-secret` and `database-url` went on 14 Oct 2026, once both services
ran on `app-secrets`:

```bash
for service in event-service event-service-staging; do
  for name in session-secret database-url; do
    gcloud secrets delete "$service-$name" --quiet
  done
done
```

Deleting a secret can't be undone, and a revision that pins a deleted one can't start, so
rolling back to it fails too. They were deleted once both services' latest revisions pinned
only `APP_SECRETS` (see [Adding a secret](#adding-a-secret)). So never roll back past
`event-service-00032-9g9` or `event-service-staging-00009-98z`, the first revisions on
`APP_SECRETS`.

On 9 Oct staging's app login got two versions, because its `db:logins` ran twice and the
first URL's password no longer worked. Version 1 was disabled, and on 13 Oct destroyed,
since a disabled version is still billed. Destroying a version can't be undone either, so
only destroy one whose value is dead:

```bash
gcloud secrets versions destroy 1 --secret=event-service-staging-database-url
```

## 12. The GeekyKey Service's build on Cloudflare

The Worker `geekykey-service`, which holds `key-api.geekshacking.com`, lives in
GeeksHacking's Cloudflare account, where only Julian can set its secrets or connect it.
Once connected, Workers Builds deploys it from `main` on every merge that touches it.
Nothing in this repo deploys it, and GitHub holds no Cloudflare token. Its settings that
aren't secret are in `apps/geekykey-service/wrangler.jsonc`, which every deploy applies.

**The secrets go on first.** A deploy fails while a secret listed under
`secrets.required` in `wrangler.jsonc` isn't set on the Worker, and so would the first
build. In the dashboard: Workers & Pages, then `geekykey-service`, then Settings, then
Variables and Secrets. Julian adds each as the Secret type, not as text:

| Secret | Value |
|---|---|
| `EVENT_SERVICE_KEY_SHOWCASE` | The `EVENT_SERVICE_KEY` in production's `app-secrets`, at the version `infra/production/deploy.env` pins. Julian copies it across himself, so it never passes through a chat |
| `CLAIMS_STAND_IN_KEY` | The `CLAIMS_STAND_IN_KEY` in the same version |
| `SESSION_SECRET` | A new random value of at least 32 characters, from a password generator, which nobody keeps |

They go under Variables and Secrets only. The Builds page has its own Variables and secrets
box, for the build variables below, and a secret put there exists only while the build runs.
The deploy can't see it, so it fails with "The following required secrets have not been
set", as the first build did on 19 Oct 2026.

**Then the build.** On the same Worker, Settings, then Builds, then Connect, with this
repo. The form saves whatever is typed without checking it: a stray `/*`, comma or new line
stays in the value, so each one is typed exactly as below, with nothing around it. The watch
paths aren't on the Connect form. They appear under Settings, then Builds, once it's saved.

| Setting | Value | Why |
|---|---|---|
| Branch | `main` | Only reviewed code deploys |
| Enable Preview builds | Unticked | The Worker has no preview URLs (`preview_urls` is `false`) |
| Root directory | `apps/geekykey-service` | Where its `wrangler.jsonc` is, and where both commands run |
| Build command | `cd ../.. && pnpm install --frozen-lockfile --filter @geekykey/geekykey-service...` | Installs from the repo's root, where the lockfile is, only what this Worker needs (the trailing `...` takes in `packages/handoff`), and fails rather than change the lockfile, as CI does |
| Deploy command | `pnpm exec wrangler deploy` | The Wrangler version in its `package.json` |
| Build watch paths, include | `apps/geekykey-service/*`, `packages/handoff/*`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | Its own code, the package it bundles, and its dependencies. A merge touching none of them doesn't rebuild it |
| Build watch paths, exclude | None | |
| Build variable `NODE_VERSION` | `24.21.0` | The Node the rest of the repo pins, in `.mise.toml` |
| Build variable `PNPM_VERSION` | `12.5.1` | The pnpm in the root `package.json`, so the build installs as CI and our laptops do. The build image's own is 10.11.1 |
| Build variable `SKIP_DEPENDENCY_INSTALL` | `1` | So the one install is the build command's, from the repo's root. Otherwise Workers Builds installs on its own first, in the root directory |
| Build variable `WRANGLER_SEND_METRICS` | `false` | Wrangler sends anonymous usage data unless told not to |
| API token | The one Workers Builds makes | |

**Then the first build.** Connecting starts no build. The first one runs on the next merge
to `main` that touches a watch path, so once Julian has connected the Worker, Adam merges a
pull request that changes something in `apps/geekykey-service`. Julian sees the build in the
Worker's Deployments tab, under View build history, and a failed one can be run again from
there with Retry build.

Adam rehearsed this build on his own Cloudflare account on 18 Oct 2026, from a fork of the
repo, with these settings and three made-up secrets. The deploy command was
`pnpm exec wrangler versions upload` instead, because `key-api.` isn't on his account. The
build passed in 30 seconds. Its log shows `nodejs@24.21.0, pnpm@12.5.1`, so the build image
honours both variables, and the install added 127 packages from the lockfile unchanged.
Wrangler 4.151.0 then uploaded the Worker, 146 KiB gzipped, with a 16 ms start-up. What
the rehearsal couldn't try is `wrangler deploy` attaching `key-api.`, which only the
production account can do.

Julian connected the Worker on 19 Oct 2026. Once he had moved the secrets out of the Builds
box, the deploy passed, and `key-api.geekshacking.com/api/health` answered with
`"service":"geekykey-service"`. The deploy also took off `event-service.geekshacking.com`,
a custom domain added in the dashboard, because every deploy sets the Worker's custom
domains to the ones in `wrangler.jsonc`.

After the first build, the checks are in checkpoint 4 of the migration spec: a test
station's tap through `key-api.`, and the log check on the Worker's invocation logs.

## Day to day

### The warm instance

With no instance running, the first tap waits for one to start, about 1.3 to 2.0 seconds
(measured 11 Oct 2026). On event days one instance is kept running: the rehearsal (by 7 Nov), and from the morning of 17 Nov to the
end of 18 Nov. This changes the service, not a revision, so a deploy doesn't undo it.

Switch it on:

```bash
gcloud run services update event-service --region=asia-southeast1 --min=1
```

Switch it off again afterwards:

```bash
gcloud run services update event-service --region=asia-southeast1 --min=0
```

Check which it is:

```bash
gcloud run services describe event-service --region=asia-southeast1 \
  --format="value(metadata.annotations.'run.googleapis.com/minScale')"
```

An empty answer means 0.

### Rolling back

Each deploy makes a new revision: the service's settings and image as they were at that
deploy. The old ones stay, so traffic can be sent back to one. To send all of it back:

```bash
gcloud run revisions list --service=event-service --region=asia-southeast1
gcloud run services update-traffic event-service --region=asia-southeast1 \
  --to-revisions=REVISION_NAME=100
```

Pick the revision that was serving before the bad deploy. The list's `READY` column isn't
proof that a revision can start: one that never started says `True` once it's retired.
`gcloud run revisions describe REVISION_NAME --region=asia-southeast1` shows
`ContainerHealthy` as `False` for one that never started. Don't pick one older than the
last change of secret (see [Changing a secret](#changing-a-secret)).

Then revert the bad commit on `main`. Its deploy sends traffic back to the newest revision
by itself. So does *any* push to `main`, a docs change included: until the revert is
merged, merge nothing else, or the bad version comes back. The database is never rolled back, which is why every migration has to work
with the version already running.

To end a rollback without a deploy, as when trying it on staging, send traffic back to the
newest revision, which is what the deploy does after every deploy:

```bash
gcloud run services update-traffic event-service --region=asia-southeast1 --to-latest
```

Tried on `event-service-staging` on 12 Oct 2026: from revision `00007` back to `00006`, then
`--to-latest`. Each switch took about 9 seconds. The logs (`resource.labels.revision_name`)
showed the old revision answering from the next request on. That request took 6.5 seconds,
because the old revision had no instance running and had to start one, longer than the
cold starts measured before. How the warm instance behaves during a rollback is checked
at the rehearsal.

### Adding a secret

A deploy fails if its service's account can't read every secret `deploy.env` pins. So a
new secret is made (step 4), opened to its service (step 7) and given its value (step 11)
before the pull request that pins it merges, since the merge deploys production. The branch
can deploy staging first, by running the deploy by hand. Then check the new revision has it:

```bash
gcloud run services describe event-service-staging --region=asia-southeast1 \
  --format="value(spec.template.spec.containers[0].env[].name)"
```

It lists the names of the service's settings and secrets, never their values. A secret
inside `APP_SECRETS` is added there instead, as a new version of it (see below), and the
server must accept its name first: it stops at start-up on a name it doesn't know.

### Changing a secret

Add the new value as a new version (as in step 11), then change the version number in that
service's `deploy.env` in a pull request. The deploy after it merges uses the new value.

A new version of `app-secrets` holds all four values, so the three that aren't changing go
into it as they are. Adam's account can't read them, so either:

- Julian, who can, makes the new version in the console: he views the latest version's
  value, and adds a new version with that JSON and the one value changed;
- or Adam runs step 11's `app_secrets` again, which makes every value new: everyone is
  signed out, and from checkpoint 4 Julian sets the two keys on the Worker again.

If one value leaks, take the second way anyway, since the other three were stored with it.
Never roll back past a change of secret: the old revision uses the old value, which may no
longer work or may be the one that leaked. If the bad deploy is the one that changed a
secret, fix it forward instead: add a version that works, and pin it in a new pull request.
