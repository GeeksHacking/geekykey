# What does Cloud Run "v1" mean, and what does running the Event Service there involve?

Research for "What does Cloud Run "v1" mean, and what does running the Event Service there involve?", 3 Oct 2026. Sources are Google's own docs, checked 3 Oct 2026, plus Cloudflare's docs MCP for the Cloudflare side. Nothing was deployed or measured: the map deploys nothing before the redrawn spec. Numbers we can only get from a running service are marked **unmeasured**.

## Answer

- **"v1" can mean three things, and none of them blocks a Node server with a `mysql2` pool.** It could be the first-generation execution environment, the v1 Admin API (Knative-style YAML), or a Cloud Run *service* rather than a Cloud Run *function*. The docs can't tell us which one Julian meant, so it's a question for him (below).
- **Region: `asia-southeast1` (Singapore)** is the obvious choice. TiDB is in Singapore too, and the region offers everything we need. It is in Google's dearer Tier 2 price band.
- **Cold starts aren't documented.** With no instance running, a tap pays a container start *and* a first TiDB connection (about 1.2 s from a laptop on 25 Sep). That could use up the station's 3 s on its own. **Keeping 1 instance warm** with the default request-based billing costs about **US$10 a month** at Google's base (Iowa) prices before the free tier, and more in Singapore. With instance-based billing it's about **US$49 a month**. Startup CPU boost shortens a cold start but doesn't remove it.
- **The free tier covers a showcase day easily**: 2 million requests and 180,000 vCPU-seconds a month, per billing account. Once billing is on, usage past the free tier is simply billed. An ordinary budget only alerts. A spend cap, in preview, stops the service instead.
- **A `mysql2` pool works, with care.** Between requests, the instance gets almost no CPU, so the pool's timers and keep-alives stall. TiDB Cloud may also drop a connection open for more than 30 minutes. Connections need a short maximum lifetime and a retry on a stale one, and the pool should close on `SIGTERM`.
- **Deploying from GitHub needs no secret in GitHub either way.** A Cloud Build trigger uses Google's GitHub app. GitHub Actions uses Workload Identity Federation, which stores only two non-secret IDs. Images live in Artifact Registry.
- **Secrets:** Secret Manager values are read into environment variables when an instance starts. The service's own identity needs Secret Manager Secret Accessor to read them.
- **A custom domain behind Cloudflare is the hard part.** On Cloudflare's free plan, `event-api.` can't simply be proxied to the `run.app` address, because only Enterprise can rewrite the `Host` header. The options are a Worker that forwards (which counts against Workers' 100,000 requests a day), Cloud Run's domain mapping (a preview that Google calls "not production-ready"), or a Google load balancer (about US$18 a month).
- **Infrastructure as code:** Terraform or OpenTofu with Google's provider is the best documented way, with a small set of resources. Terraform's own docs steer away from the v1 resource.
- **Access:** Cloud Run Developer, plus Service Account User on the service's identity, lets Adam deploy without managing the project. Logs Viewer lets him read logs.
- **Logs:** request logs go to Cloud Logging and record no request headers, so `Authorization` and `Cookie` are not logged. The full URL, query string included, is logged.

## Findings

### What "v1" could mean

| Meaning | What it is | For a Node server with a `mysql2` pool |
|---|---|---|
| **First-generation execution environment** | gVisor sandbox, "fast cold start times and emulation of most, but not all operating system calls". Allows less than 512 MiB of memory. The second generation is a microVM with "full Linux compatibility", faster CPU and network under sustained load, at least 512 MiB, and sometimes "longer cold start times". Same price. For services, Cloud Run picks one by itself unless told. ([execution environments](https://docs.cloud.google.com/run/docs/about-execution-environments)) | Both work. Plain TCP and TLS to TiDB are ordinary system calls. The first generation's faster cold start is the reason to choose it. |
| **The v1 Admin API** | v1 uses Knative-style `namespaces/.../services` resources and YAML (`/apis/serving.knative.dev/v1/`). v2 uses `projects/.../locations/.../services`, and Google calls it "the preferred endpoint for all methods". ([REST reference](https://docs.cloud.google.com/run/docs/reference/rest)) Terraform's v1 resource, `google_cloud_run_service`, says: "We recommend using the `google_cloud_run_v2_service` resource". ([Terraform docs](https://github.com/hashicorp/terraform-provider-google/blob/main/website/docs/r/cloud_run_service.html.markdown)) Domain mappings exist only in the v1 API (Terraform's `google_cloud_run_domain_mapping` is built on it). | Either works; it only changes how the service is described. |
| **A Cloud Run service, not a function** | Cloud Run functions build a single handler from source. A service runs any container. The older Cloud Functions (1st gen) is a separate product with its own pricing. ([Cloud Functions 1st gen pricing](https://cloud.google.com/functions/pricing-1stgen)) | Today's Hono backend is a server, so it's a service. |

**Question for Julian:** "By 'Cloud Run v1', do you mean the first-generation execution environment, the v1 API and its Knative YAML (Terraform's `google_cloud_run_service`), or a Cloud Run service rather than a function?"

### Region

- `asia-southeast1` (Singapore) is in **Tier 2**. Tier 1 in Asia covers Taiwan, Tokyo, Osaka, Mumbai and Bangkok. ([locations](https://docs.cloud.google.com/run/docs/locations))
- Domain mapping is offered in `asia-southeast1`. ([locations](https://docs.cloud.google.com/run/docs/locations))
- **Round trip to TiDB: unmeasured.** Both are in Singapore, but on different clouds, so traffic crosses the public internet. The closest number we have: from Cloudflare's Singapore location, a query on an already-open connection took about 5 ms ([the benchmark](hyperdrive-alternatives-benchmark.md)).

### Cold starts and keeping an instance warm

- Google gives **no cold-start figures**. Its advice is minimum instances, startup CPU boost, and objects such as connection pools kept in global scope. ([general tips](https://docs.cloud.google.com/run/docs/tips/general))
- **Startup CPU boost** gives extra CPU "during instance startup time and for 10 seconds after the instance has started", and the extra CPU is billed. ([CPU](https://docs.cloud.google.com/run/docs/configuring/services/cpu))
- An idle instance that isn't a minimum instance is kept for at most 15 minutes. ([container contract](https://docs.cloud.google.com/run/docs/container-contract))
- **Billing modes** ([billing settings](https://docs.cloud.google.com/run/docs/configuring/billing-settings), [pricing](https://cloud.google.com/run/pricing)):
  - *Request-based* (the default): "CPU is only allocated during request processing." An idle minimum instance is billed at a low idle rate.
  - *Instance-based*: CPU is allocated "for the entire container instance lifecycle", and the whole lifetime is billed.
- **Cost of one warm instance**, 1 vCPU and 512 MiB for 30 days, at the prices on Google's pricing page (Iowa, `us-central1`). Singapore's Tier 2 prices are higher. The page only shows them through its region picker, which we couldn't read, so check them there before quoting.

  | Billing | Rate | 30 days |
  |---|---|---|
  | Request-based, idle minimum instance | CPU $0.0000025 and memory $0.0000025 per GiB, per second | about US$9.70 |
  | Instance-based | CPU $0.000018 and memory $0.000002 per GiB, per second | about US$49 |

  The free tier is "applied as a spending based discount", so part of this may be covered. A middle way the docs allow: minimum instances is a per-service setting, so it can be 1 only around event days and 0 otherwise.
- **Timeout:** "The timeout is set by default to 5 minutes (300 seconds) and can be extended up to 60 minutes" ([request timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout)). That limit doesn't bind us. The station's 3 s does.

### Free tier and billing

- Request-based services, per month: **180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests**. Instance-based: 240,000 vCPU-seconds and 450,000 GiB-seconds. "The free tier usage is aggregated across projects by billing account and resets every month", so GeeksHacking's other projects on the same billing account, the Portal among them, share it. ([pricing](https://cloud.google.com/run/pricing))
- Time is billed in steps of 100 ms, and with request-based billing only while at least one request is in progress. Up to 80 requests share one instance's time.
- **One showcase day, as an example only:** 300 passports polling every 5 s for 4 hours is about 860,000 requests. That is under half the month's 2 million. One instance busy for all 4 hours uses 14,400 vCPU-seconds, under a tenth of the free CPU. Taps add little. The real numbers come from the rehearsal.
- **Past the free tier, usage is billed.** Nothing stops it by default. An ordinary budget only sends alerts: "Setting an alerts-only budget doesn't automatically cap Google Cloud or Google Maps Platform usage or spending" ([budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets)). A **spend cap budget**, in preview and available for Cloud Run, blocks "all new usage for the specific service in the specified project" once reached, until someone lifts it by hand ([spend caps](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps)). On event day, a cap would take the Event Service down, not just stop the bill. The **maximum instances** setting is what limits how far the service can scale.
- Builds: "Each billing account comes with 2,500 free build-minutes per month" ([Cloud Build pricing](https://cloud.google.com/build/pricing)).

### Connections

- **Concurrency:** services created with `gcloud` or Terraform take up to "80 times the number of vCPUs" requests at once, and at most 1,000 ([concurrency](https://docs.cloud.google.com/run/docs/about-concurrency)). Below 1 vCPU, concurrency must be 1 ([CPU](https://docs.cloud.google.com/run/docs/configuring/services/cpu)). The default is 1 vCPU and 512 MiB.
- **Between requests:** with request-based billing, "the instance's access to CPU will be disabled or severely limited", and background work "resumes" on the next request ([general tips](https://docs.cloud.google.com/run/docs/tips/general)). A `mysql2` pool's idle timers and keep-alive pings therefore don't run while the instance waits. A connection can go stale without the pool noticing.
- **Dropped connections:** "Connection streams from your container to both VPC and internet can be occasionally terminated and replaced when underlying infrastructure is restarted or updated" ([container contract](https://docs.cloud.google.com/run/docs/container-contract)). On TiDB's side, Starter connections "might be terminated unexpectedly if they remain open for more than 30 minutes", and TiDB suggests a maximum connection lifetime, starting at 5 minutes ([TiDB Starter limitations](https://docs.pingcap.com/tidbcloud/serverless-limitations/)).
- **Shutdown:** Cloud Run sends `SIGTERM`, then `SIGKILL` 10 seconds later ([container contract](https://docs.cloud.google.com/run/docs/container-contract)). Closing the pool on `SIGTERM` lets TiDB end the sessions cleanly.
- **What follows for the code:** keep one pool in global scope, give connections a maximum lifetime of a few minutes, retry a query once when its connection turns out to be dead, and size the pool for the instance's concurrency.

### Deploying from GitHub

- **Cloud Build trigger:** Cloud Run "uses a Cloud Build trigger, to automatically build and deploy your code whenever new commits are pushed to a given branch". It connects through Google's GitHub app, so GitHub stores no secret. ([continuous deployment](https://docs.cloud.google.com/run/docs/continuous-deployment))
- **GitHub Actions with Workload Identity Federation** (`google-github-actions/auth`): "Workload Identity Federation is recommended over Service Account Keys as it obviates the need to export a long-lived credential". GitHub stores only the identity provider's name and a service account's email (or the project ID), and neither is secret. The workflow needs `id-token: write`. ([auth action](https://github.com/google-github-actions/auth)) The provider can be limited to one repository, and to `main`, which matters while the repo can't protect `main`.
- **Fewer secrets:** both ways keep none in GitHub. GitHub Actions keeps deploys next to the migrate-before-merge workflow. Cloud Build keeps everything inside Google Cloud.
- **Images** are stored in Artifact Registry. Deploying from source builds with Cloud Build, and the deployer then needs Cloud Run Source Developer and Service Usage Consumer, while Cloud Build's account needs Cloud Run Builder. ([IAM roles](https://docs.cloud.google.com/run/docs/reference/iam/roles))

### Secrets

- A secret can be a file or an environment variable. For environment variables, "Cloud Run retrieves the value of the secret prior to starting the instance". Google advises pinning a version rather than `latest`. ([secrets](https://docs.cloud.google.com/run/docs/configuring/services/secrets))
- The service's identity needs **Secret Manager Secret Accessor** (`roles/secretmanager.secretAccessor`). Anyone else holding that role, or broad project roles, can read the secrets too. So who can read them depends on who holds roles in GeeksHacking's project, which only Julian can say.

### A custom domain behind Cloudflare

| Way | How | Keeps Cloudflare's certificate and rules? | Cost and catches |
|---|---|---|---|
| Cloudflare proxies straight to `run.app` | A proxied CNAME to the service's `run.app` address | It would, but it doesn't work on its own: Google picks the service by the `Host` header, and on Cloudflare's free plan an origin rule can't override `Host`, SNI or DNS ("Enterprise" only; [origin rules](https://developers.cloudflare.com/rules/origin-rules/)) | None |
| A Worker on `event-api.` that forwards | The same pattern as `event-web` | Yes | Every request counts against GeeksHacking's 100,000 Workers requests a day ([limits](https://developers.cloudflare.com/workers/platform/limits/)) |
| Cloud Run domain mapping | DNS record pointed at Google; Google issues the certificate | Unclear: whether Google's certificate can be issued with Cloudflare's proxy on is **unchecked** | Free, in `asia-southeast1`, but a preview: "Due to latency issues, they are not production-ready". Certificates take about 15 minutes, up to 24 hours. Only `/` can be mapped. ([custom domains](https://docs.cloud.google.com/run/docs/mapping-custom-domains)) |
| Global external Application Load Balancer | Load balancer with a serverless back end; Cloudflare proxies to its IP address | Yes | First 5 forwarding rules **$0.025 an hour (about US$18 a month)** plus $0.008 per GiB processed ([network pricing](https://cloud.google.com/vpc/network-pricing)). Recommended by Google for production. |

- **Closing `run.app`:** the `--no-default-url` flag turns the `run.app` address off. Ingress can be set to "internal and Cloud Load Balancing", which only works with the load balancer. No ingress setting accepts "only Cloudflare". ([ingress](https://docs.cloud.google.com/run/docs/securing/ingress)) Without a load balancer, `run.app` stays public, and the Event Service's own keys are what protect it.
- A Worker such as the GeekyKey Service can call the `run.app` address directly, without going through `event-api.`.

### Infrastructure as code

- **Terraform or OpenTofu** with the `google` provider: `google_cloud_run_v2_service` is the recommended resource ([Terraform docs](https://github.com/hashicorp/terraform-provider-google/blob/main/website/docs/r/cloud_run_v2_service.html.markdown)). A minimal setup for one service:
  - `google_cloud_run_v2_service`: image, region, minimum and maximum instances, concurrency, secrets as environment variables
  - `google_service_account` for the service, with `google_secret_manager_secret_iam_member` granting it Secret Accessor
  - `google_secret_manager_secret` per secret. The values are best added by hand, because a value written in Terraform ends up in its state file.
  - `google_artifact_registry_repository` for images
  - `google_iam_workload_identity_pool` and `..._provider` for GitHub, and the deployer's roles through `google_project_iam_member`
  - a Cloud Storage bucket for Terraform's state
- **Pulumi** covers the same resources in TypeScript, and **plain `gcloud` scripts** are the least to learn but describe steps, not the end state. Neither was looked at in depth. Qing Guan's preference decides it.

### Access

- **Cloud Run Developer** (`roles/run.developer`): "read and write access to all Cloud Run resources", without managing the project. To deploy, the deployer also needs **Service Account User** on the service's identity. **Cloud Run Viewer** is read-only. ([IAM roles](https://docs.cloud.google.com/run/docs/reference/iam/roles))
- **Logs Viewer** (`roles/logging.viewer`) reads the logs. For deploying from source, see "Deploying from GitHub" above.

### Logs

- Request logs and container output go to Cloud Logging automatically ([logging](https://docs.cloud.google.com/run/docs/logging)).
- A request log's `httpRequest` has: method, URL, sizes, status, user agent, remote IP, server IP, referer, latency, cache fields and protocol. **No request headers**, so no `Authorization` or `Cookie` ([LogEntry](https://docs.cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry)). The **URL is logged with its query string**, so nothing secret should travel in a URL.
- The first 50 GiB a project a month are free, kept 30 days ([Cloud Logging pricing](https://cloud.google.com/stackdriver/pricing)).

## Open questions

- **For Julian:** which "v1" he meant (above), whether the Event Service gets its own Google Cloud project, and who holds roles there.
- **For Qing Guan:** Terraform, OpenTofu, Pulumi or `gcloud`, and where the state lives.
- **Measure at the first deploy:** cold start with and without CPU boost, the round trip to TiDB, and whether the first or second generation starts faster for our container.
- **Check before choosing domain mapping:** whether Google issues its certificate while Cloudflare proxies the record, and Singapore's Tier 2 prices.
