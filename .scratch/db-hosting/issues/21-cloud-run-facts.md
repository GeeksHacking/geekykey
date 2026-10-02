# What does Cloud Run "v1" mean, and what does running the Event Service there involve?

Type: research
Status: open
Blocked by: none
Part of: [Move GeekyKey to TiDB and Cloudflare](../map.md)

## Question

Julian said the Event Service runs on Google Cloud Run, and "we should try to use Cloud Run v1" (WhatsApp, 2 Oct 2026). Qing Guan will advise on the setup and said to manage it as infrastructure as code. This ticket gathers the facts that "Does a station wait for the Event Service's verdict?" and "How is the Event Service built, deployed and staged on Cloud Run?" need. It decides nothing.

Find out, from Google's own docs where possible:

- **What "v1" most likely means.** It could be the Admin API v1 (the Knative-style service YAML), the first-generation execution environment, or Cloud Run services as opposed to Cloud Run functions. What does each choice rule in or out for a Node server with a `mysql2` connection pool? If it can't be settled from the docs, write down the question to put to Julian.
- **Region.** TiDB is on Alibaba Cloud in Singapore. Is `asia-southeast1` the obvious choice, and roughly what is the round trip from there to TiDB?
- **Cold starts.** How long does a small Node container take to start, with minimum instances at 0? What does keeping 1 instance always running cost a month? Is there a cheaper middle way, such as CPU boost at start-up or CPU only while handling requests? The station waits at most 3 s for the Event Service ("How does the GeekyKey Service trigger an Event Service, and know which one a station belongs to?"), and our first TiDB connection took about 1.2 s on 25 Sep.
- **The free tier,** in requests, CPU and memory, against one showcase day. What happens when billing is on and the free tier runs out?
- **Connections.** How many requests one instance handles at once, how a `mysql2` pool behaves when the instance is idle or its CPU is throttled between requests, and what happens to open connections when an instance shuts down.
- **Deploying from GitHub.** Cloud Build triggers against GitHub Actions with Workload Identity Federation, and which needs fewer secrets kept in GitHub. Where the container image is stored (Artifact Registry).
- **Secrets.** Secret Manager mounted as environment variables, and who can read them.
- **A custom domain behind Cloudflare.** Cloud Run domain mapping (and whether it's offered in `asia-southeast1`), a load balancer, or Cloudflare proxying to the `run.app` address. Which keeps `event-api.geekshacking.com` on Cloudflare's certificate and rules?
- **Infrastructure as code.** Terraform or OpenTofu with Google's provider, against Pulumi or plain `gcloud` scripts. What a minimal setup for one service, its secrets and its deploy access looks like.
- **Access.** The smallest roles that let Adam deploy and read logs without managing the project, in case Julian allows it.
- **Logs.** Where request logs go, and whether they record request headers such as `Authorization` (see "Check the first deployed Worker's logs for keys").

Findings go in [research/cloud-run.md](../research/cloud-run.md), with a source for each fact.
