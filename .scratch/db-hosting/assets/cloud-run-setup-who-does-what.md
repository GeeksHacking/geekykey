# The Event Service's Cloud Run setup: what Adam does, and what Julian does

Written 9 Oct 2026, for BAC-18 ([PR #46](https://github.com/GeeksHacking/geekykey/pull/46)). The runbook is `infra/README.md` on that branch; the step numbers below are its steps.

**Where things stand.** The project is our Firebase project, `geekykey-b035a`, on GeeksHacking's billing account. Adam is Editor there, which creates things but grants nothing. On 9 Oct he ran steps 1 to 5: the APIs, the image repository, four service accounts, six secrets and the two Cloud Run services, `event-service` and `event-service-staging`, both closed to callers for now. Four of the six secrets have their values. Everything that grants access needs more than Editor: steps 6 to 10.

## Adam

In this order.

1. **Send Julian [the message](#julian) below.** Once he's given you the access, run the runbook's steps 6 to 8 yourself. Step 8 needs Ethan's Google account, which goes nowhere in the repo.

2. **Add production's app login** (step 11). It gets a new password, shown once. Run each block on its own: pasted together, the prompt starts even if the first command fails.

   ```bash
   cd ~/workspace/github.com/geekykey/apps/backend
   mise exec -- pnpm db:logins --env-file ~/.config/geekykey/tidb.env --new-app-password
   ```

   Copy the `mysql://` URL it prints after "App login:", then paste it at this prompt, where it won't show:

   ```bash
   read -rs "url?Production app login URL: " && printf '%s' "$url" \
     | gcloud secrets versions add event-service-database-url --data-file=- ; unset url
   ```

3. **Add staging's app login** (step 11). Its URL isn't kept anywhere either, so it gets a new password the same way, with `--staging`. That option came over from the unmerged BAC-15 branch into PR #46 on 9 Oct, so run it from that branch until the PR merges:

   ```bash
   cd ~/workspace/github.com/geekykey
   git switch adam/bac-18-the-runbook-and-the-deploy-workflow-cloud-run-secret-manager
   cd apps/backend
   mise exec -- pnpm db:logins --env-file ~/.config/geekykey/tidb.env --new-app-password --staging
   ```

   Then, on its own:

   ```bash
   read -rs "url?Staging app login URL: " && printf '%s' "$url" \
     | gcloud secrets versions add event-service-staging-database-url --data-file=- ; unset url
   ```

   Clear the terminal after each of steps 2 and 3 (Cmd-K), since the URL stays on screen.

4. **Once you've run steps 6 and 7,** check them:

   ```bash
   gcloud iam workload-identity-pools providers describe geekykey \
     --location=global --workload-identity-pool=github --format="value(state,attributeCondition)"
   gcloud run services get-iam-policy event-service --region=asia-southeast1
   ```

   The first should say `ACTIVE` and the repo's ID, `1310668143`. The second should list `allUsers` as invoker and `event-service-deployer` as developer.

5. **Put the dates in the runbook's table,** and change any command you ran differently so it says what you ran. Then mark PR #46 ready, and merge it.

6. **Know that the merge deploys production first.** GitHub only lets a workflow be run by hand once it's on `main`, so staging can't be deployed before the merge. Production holds only test data until the rehearsal, so this is safe to accept. Run staging by hand straight after (Actions > Deploy > Run workflow), which is BAC-19. The proof, the log check and the cold-start numbers are BAC-11 and BAC-12.

7. **If the merge's deploy fails,** read its log in the Actions tab. The likeliest causes: a grant missing from step 7, or a secret with no version 1.

## Julian

He works in the web console only, and asked for less text (9 Oct). So he gives Adam the access, and Adam runs steps 6 to 8 himself. The message:

> Fair, sorry! Shorter version, all in the web console:
>
> 1. **Make me Owner of the GeekyKey project** (`geekykey-b035a`): IAM & Admin → IAM → Grant access → my account → role "Owner". Then I'll set up the GitHub sign-in and the permissions myself, and write down every step. If you'd rather not give Owner, "Security Admin" plus "Workload Identity Pool Admin" also works.
> 2. **Later, when I say it's ready:** Cloud Run → Domain mappings → Add mapping → service `event-service`, domain `event-api.geekshacking.com`. Then add the DNS record it shows in Cloudflare, with the proxy off. It needs you because you verified geekshacking.com.
> 3. **A budget alert** if you want one: Billing → Budgets & alerts, for this project. What amount?
> 4. **When you get a chance:** disconnect Workers Builds from `apps/backend`.
