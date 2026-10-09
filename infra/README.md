# The Event Service's Google Cloud setup

This is the runbook for everything the Event Service (`apps/backend` until the split) uses
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

## What lives where

| What | Name | What it's for |
|---|---|---|
| Project | `geekykey-b035a` ("GeekyKey") | Our own project, on GeeksHacking's billing account. It is also our Firebase project |
| Region | `asia-southeast1` | Singapore, where TiDB is |
| Image repository | `event-service` | Holds the backend's images, which the deploy builds |
| Cloud Run services | `event-service`, `event-service-staging` | Production at `event-api.geekshacking.com`, and staging at its `run.app` address only |
| Service accounts the services run as | `event-service`, `event-service-staging` | Each can read only its own service's two secrets |
| Service accounts the deploy signs in as | `event-service-deployer`, `event-service-staging-deployer` | Production's works only from `main`. Staging's works from any branch and can't touch production |
| Secrets | `event-service-…` and `event-service-staging-…` | `SESSION_SECRET`, `DATABASE_URL` and `MIGRATION_DATABASE_URL`, for each service |
| Keyless sign-in | Pool `github`, provider `geekykey` | Lets this repo's workflows sign in to Google Cloud without a key |

**GitHub holds no secret.** (Nor a Cloudflare API token: nothing here deploys to
Cloudflare.) The workflow signs in through
the keyless sign-in (Workload Identity Federation), and reads the one secret it needs, the
migration login, from Secret Manager.

## Who runs what

Adam has the Editor role on the project. It lets him turn on APIs and create the image
repository, the service accounts, the services and the secrets, and add secret values.
It doesn't let him give anyone a role. So Julian, as Owner, runs every command that grants
access: the keyless sign-in, the deploy accounts' access, opening the services to the
internet, the domain mapping and the budget.

| Step | Who | Run |
|---|---|---|
| [1. Turn on the APIs](#1-turn-on-the-apis) | Adam | 9 Oct 2026 |
| [2. The image repository](#2-the-image-repository) | Adam | 9 Oct 2026 |
| [3. The service accounts](#3-the-service-accounts) | Adam | 9 Oct 2026 |
| [4. The secrets, without values](#4-the-secrets-without-values) | Adam | 9 Oct 2026 |
| [5. The two services](#5-the-two-services) | Adam | 9 Oct 2026 |
| [6. The keyless sign-in](#6-the-keyless-sign-in) | Julian | Not yet |
| [7. Who may do what](#7-who-may-do-what) | Julian | Not yet |
| [8. Logs for the team](#8-logs-for-the-team) | Julian | Not yet |
| [9. The address](#9-the-address) | Julian | Not yet |
| [10. A budget alert](#10-a-budget-alert) | Julian, still to confirm | Not yet |
| [11. The secret values](#11-the-secret-values) | Adam | Session secrets and migration logins 9 Oct 2026. App logins not yet |

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
  for name in session-secret database-url migration-database-url; do
    gcloud secrets create "$service-$name" --replication-policy=automatic
  done
done
```

That makes six:

| Secret | Read by | Becomes |
|---|---|---|
| `event-service-session-secret` | The service, at start-up | `SESSION_SECRET`, which signs the session cookie |
| `event-service-database-url` | The service, at start-up | `DATABASE_URL`, the TiDB app login |
| `event-service-migration-database-url` | The deploy workflow only | The TiDB migration login, for `db:migrate` |
| `event-service-staging-…` | The same, for staging | The same, on `geekykey_staging` |

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
- `--cpu-boost`: extra processor while an instance starts, to shorten a cold start.
- `--execution-environment=gen1`: the first-generation environment, which starts faster
  and is what Julian means by "v1" (8 Oct 2026).
- `--min=0 --max=2`: no instance when nobody is calling, and never more than two, which
  also caps TiDB at 20 connections. The minimum goes to 1 on event days (see
  [The warm instance](#the-warm-instance)).
- `--no-allow-unauthenticated`: nobody can call it yet. Julian opens it in step 7, once
  the real image is ready.

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
  --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id" \
  --attribute-condition="assertion.repository_id == '1310668143'"
```

`1310668143` is the ID GitHub gives `GeeksHacking/geekykey`. It's checked rather than the
name, because a deleted repo's name can be taken by someone else, but its ID never is.

Production's deploy account, only for runs on `main`. A token's subject is
`repo:GeeksHacking/geekykey:ref:refs/heads/main` only when the run is on `main`; a pull
request's says `pull_request` instead, and another branch's names that branch:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  event-service-deployer@geekykey-b035a.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principal://iam.googleapis.com/projects/468223998400/locations/global/workloadIdentityPools/github/subject/repo:GeeksHacking/geekykey:ref:refs/heads/main"
```

Staging's deploy account, for any run from this repo:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  event-service-staging-deployer@geekykey-b035a.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/468223998400/locations/global/workloadIdentityPools/github/attribute.repository_id/1310668143"
```

If a job in the workflow ever gets an `environment:`, its token's subject names the
environment instead of the branch, and production's deploy stops working. That's on
purpose: check this binding before adding one.

## 7. Who may do what

Every grant is on one service, one secret or one account, not on the whole project, so
each account can reach only what's listed here.

Each service reads its own app login and session secret, and nothing else:

```bash
for service in event-service event-service-staging; do
  for name in session-secret database-url; do
    gcloud secrets add-iam-policy-binding "$service-$name" \
      --member="serviceAccount:$service@geekykey-b035a.iam.gserviceaccount.com" \
      --role=roles/secretmanager.secretAccessor
  done
done
```

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
needs someone who has verified `geekshacking.com` with Google, so Julian runs it:

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

That record goes into Cloudflare's DNS for `geekshacking.com`, with the proxy **off**
(grey cloud, "DNS only"). Julian adds it, once we tell him the service is ready. The certificate can take from 15
minutes to a day. `event-service-staging` has no mapping, only its `run.app` address.

## 10. A budget alert

Still to confirm with Julian (asked 8 Oct 2026, not answered). A budget doesn't stop
anything. It emails when the project's spending passes each step. The amount here is a
placeholder. Budgets have their own API to turn on first:

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

The session secrets, which nobody ever needs to see:

```bash
for service in event-service event-service-staging; do
  openssl rand -base64 48 | tr -d '\n' \
    | gcloud secrets versions add "$service-session-secret" --data-file=-
done
```

The migration logins, from the files `db:logins` saved. `sed` picks the URL out of the
file without running it:

```bash
sed -n 's/^TIDB_MIGRATION_URL=//p' ~/.config/geekykey/tidb-migration.env | tr -d '\n' \
  | gcloud secrets versions add event-service-migration-database-url --data-file=-
sed -n 's/^TIDB_MIGRATION_URL=//p' ~/.config/geekykey/tidb-staging-migration.env | tr -d '\n' \
  | gcloud secrets versions add event-service-staging-migration-database-url --data-file=-
```

The app logins. An app login's password is shown only once, when it's made, so each one
gets a new password here. `db:logins` shows the login's URL once, then `read -s` takes it
without showing what you paste. One at a time, from `apps/backend`:

```bash
mise exec -- pnpm db:logins --env-file ~/.config/geekykey/tidb.env --new-app-password
read -rs "url?Production app login URL: " && printf '%s' "$url" \
  | gcloud secrets versions add event-service-database-url --data-file=- ; unset url

mise exec -- pnpm db:logins --env-file ~/.config/geekykey/tidb.env --new-app-password --staging
read -rs "url?Staging app login URL: " && printf '%s' "$url" \
  | gcloud secrets versions add event-service-staging-database-url --data-file=- ; unset url
```

Clear the terminal after each (Cmd-K), since the URL stayed on screen.

(`read -rs "url?…"` is zsh. In bash, it's `read -rsp "…" url`.)

Each service's `deploy.env` already pins version 1 of each secret.

## Day to day

### The warm instance

With no instance running, the first tap waits for one to start. On event days one
instance is kept running: the rehearsal (by 7 Nov), and from the morning of 17 Nov to the
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

Then revert the bad commit on `main`. Its deploy sends traffic back to the newest revision
by itself. So does *any* push to `main`, a docs change included: until the revert is
merged, merge nothing else, or the bad version comes back. The database is never rolled back, which is why every migration has to work
with the version already running.

### Changing a secret

Add the new value as a new version (as in step 11), then change the version number in that
service's `deploy.env` in a pull request. The deploy after it merges uses the new value.
Never roll back past a change of key, or the old revision uses the old one.
