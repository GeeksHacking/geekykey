# The Event Service's Cloud Run setup: what Adam does, and what Julian does

Written 9 Oct 2026, for BAC-18 ([PR #46](https://github.com/GeeksHacking/geekykey/pull/46)). The runbook is `infra/README.md` on that branch; the step numbers below are its steps.

**Where things stand.** The project is our Firebase project, `geekykey-b035a`, on GeeksHacking's billing account. Adam is Editor there, which creates things but grants nothing. On 9 Oct he ran steps 1 to 5: the APIs, the image repository, four service accounts, six secrets and the two Cloud Run services, `event-service` and `event-service-staging`, both closed to callers for now. Four of the six secrets have their values. Everything that grants access is Julian's, as Owner: steps 6 to 10.

## Adam

In this order.

1. **Send Julian [his part](#julian) below,** and send him privately the Google accounts for Logs Viewer: Adam's and Ethan's. Zi Tao doesn't need the logs (9 Oct). The accounts go nowhere in the repo.

2. **Add production's app login** (step 11). It gets a new password, shown once, from `apps/backend`:

   ```bash
   mise exec -- pnpm db:logins --env-file ~/.config/geekykey/tidb.env --new-app-password
   read -rs "url?Production app login URL: " && printf '%s' "$url" \
     | gcloud secrets versions add event-service-database-url --data-file=- ; unset url
   ```

3. **Add staging's app login** (step 11). Its URL isn't kept anywhere either, so it gets a new password the same way, with `--staging`. That option came over from the unmerged BAC-15 branch into PR #46 on 9 Oct, so run it from that branch until the PR merges:

   ```bash
   mise exec -- pnpm db:logins --env-file ~/.config/geekykey/tidb.env --new-app-password --staging
   read -rs "url?Staging app login URL: " && printf '%s' "$url" \
     | gcloud secrets versions add event-service-staging-database-url --data-file=- ; unset url
   ```

   Clear the terminal after each of steps 2 and 3 (Cmd-K), since the URL stays on screen.

4. **Once Julian has run steps 6 and 7,** check them:

   ```bash
   gcloud iam workload-identity-pools providers describe geekykey \
     --location=global --workload-identity-pool=github --format="value(state,attributeCondition)"
   gcloud run services get-iam-policy event-service --region=asia-southeast1
   ```

   The first should say `ACTIVE` and the repo's ID, `1310668143`. The second should list `allUsers` as invoker and `event-service-deployer` as developer.

5. **Put the dates in the runbook's table,** and change any command Julian ran differently so it says what he ran. Then mark PR #46 ready, and merge it.

6. **Know that the merge deploys production first.** GitHub only lets a workflow be run by hand once it's on `main`, so staging can't be deployed before the merge. Production holds only test data until the rehearsal, so this is safe to accept. Run staging by hand straight after (Actions > Deploy > Run workflow), which is BAC-19. The proof, the log check and the cold-start numbers are BAC-11 and BAC-12.

7. **If the merge's deploy fails,** read its log in the Actions tab. The likeliest causes: a grant missing from step 7, or a secret with no version 1.

## Julian

Hi Julian. The Event Service's Google Cloud setup is ready for your part. It's in our Firebase project, `geekykey-b035a` (number `468223998400`), on GeeksHacking's billing account.

I've made, with my Editor role: the APIs, the image repository `event-service` in `asia-southeast1`, four service accounts, six secrets, and the two Cloud Run services `event-service` and `event-service-staging`. Editor can't grant access, so the rest needs you as Owner. Every command is in `infra/README.md` in [PR #46](https://github.com/GeeksHacking/geekykey/pull/46), with a line on what each is for. Steps 6 to 8 are below too, so you can paste them as they are. Could you run them, and tell me the date you did?

**How to run them.** The quickest way is Cloud Shell, a terminal inside the Google Cloud console with `gcloud` already signed in as you, so nothing needs installing. Open [the console for `geekykey-b035a`](https://console.cloud.google.com/?project=geekykey-b035a), click the Cloud Shell button (`>_`, top right), and paste one block at a time into the terminal it opens. Step 7 is one loop that runs the grants for both services, about twenty commands, so give it a minute or two. Any grant can be pasted again safely: one that's already there is left as it is.

**Or let me run them.** If you'd rather not, give me two roles instead, and I'll run steps 6 to 8 myself and tell you when they're done. Security Admin lets me grant roles in this project, which is close to what Owner can do, so it's your call:

```bash
for role in roles/iam.securityAdmin roles/iam.workloadIdentityPoolAdmin; do
  gcloud projects add-iam-policy-binding geekykey-b035a --member="user:ADAM_EMAIL" --role="$role"
done
```

**Step 6, the keyless sign-in from GitHub.** Google trusts GitHub's tokens only from `GeeksHacking/geekykey`, checked by repo ID. Production's deploy account is usable only from `main`; staging's from any branch of the repo.

```bash
gcloud config set project geekykey-b035a

gcloud iam workload-identity-pools create github \
  --location=global --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc geekykey \
  --location=global \
  --workload-identity-pool=github \
  --display-name="GeeksHacking/geekykey" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id" \
  --attribute-condition="assertion.repository_id == '1310668143'"

gcloud iam service-accounts add-iam-policy-binding \
  event-service-deployer@geekykey-b035a.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principal://iam.googleapis.com/projects/468223998400/locations/global/workloadIdentityPools/github/subject/repo:GeeksHacking/geekykey:ref:refs/heads/main"

gcloud iam service-accounts add-iam-policy-binding \
  event-service-staging-deployer@geekykey-b035a.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/468223998400/locations/global/workloadIdentityPools/github/attribute.repository_id/1310668143"
```

**Step 7, who may do what.** Every grant is on one service, secret or account, never the whole project. Each service reads only its own session secret and app login. Each deploy account may push images, read its own migration login, deploy its own service and start it as the service's account. Then both services are opened to callers, since stations and the screens call them.

```bash
for service in event-service event-service-staging; do
  for name in session-secret database-url; do
    gcloud secrets add-iam-policy-binding "$service-$name" \
      --member="serviceAccount:$service@geekykey-b035a.iam.gserviceaccount.com" \
      --role=roles/secretmanager.secretAccessor
  done

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

  gcloud run services add-iam-policy-binding "$service" \
    --region=asia-southeast1 --member=allUsers --role=roles/run.invoker
done
```

**Step 8, Logs Viewer** for Adam and Ethan, with the accounts I've sent you separately. Nobody else needs it.

```bash
for person in ADAM_EMAIL ETHAN_EMAIL; do
  gcloud projects add-iam-policy-binding geekykey-b035a \
    --member="user:$person" --role=roles/logging.viewer
done
```

**Step 9, `event-api.geekshacking.com`,** later: I'll tell you when the service is ready for it. It's a Cloud Run domain mapping, like `portal-api.`, and needs someone who has verified `geekshacking.com` with Google, which I think is you. Then the DNS record it asks for goes into Cloudflare, with the proxy off (grey cloud):

```bash
gcloud beta run domain-mappings create \
  --service=event-service --domain=event-api.geekshacking.com --region=asia-southeast1
gcloud beta run domain-mappings describe \
  --domain=event-api.geekshacking.com --region=asia-southeast1 \
  --format="value(status.resourceRecords)"
```

**Step 10, the budget alert,** if you agree: on this project, to you and me. The runbook has a placeholder of US$10 a month, with emails at 50%, 90% and 100%. What amount would you like?

**And from 8 Oct, still to do:** disconnect Workers Builds from `apps/backend`, which still builds every push to `main` and fails.

Thanks!
