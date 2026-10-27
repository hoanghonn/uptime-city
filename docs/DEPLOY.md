# Deploy to Cloud Run

One container serves the web app and the API. Cloud Build builds the `Dockerfile` from source, so no local Docker is needed.

Run these once, from the repo root, in your own GCP project (replace `PROJECT`):

```bash
gcloud config set project PROJECT
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com

# Secrets come straight from your local .env, never typed on the command line.
set -a; . ./.env; set +a
printf %s "$META_API_KEY"       | gcloud secrets create uptime-meta-api-key --data-file=-
printf %s "$BASETEN_API_KEY"    | gcloud secrets create uptime-baseten-api-key --data-file=-
printf %s "$ELEVENLABS_API_KEY" | gcloud secrets create uptime-elevenlabs-api-key --data-file=-
PROJECT_NUMBER=$(gcloud projects describe PROJECT --format='value(projectNumber)')
for s in uptime-meta-api-key uptime-baseten-api-key uptime-elevenlabs-api-key; do
  gcloud secrets add-iam-policy-binding $s --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" --role=roles/secretmanager.secretAccessor
done
```

Deploy (and redeploy after every change):

```bash
gcloud run deploy uptime-city --source . --region us-central1 --allow-unauthenticated \
  --min-instances 1 --max-instances 1 --concurrency 80 --timeout 3600 --cpu 1 --memory 1Gi \
  --set-env-vars BOT_MODEL=meta-models/muse-spark-open,DAILY_BUDGET_USD=6 \
  --set-secrets META_API_KEY=uptime-meta-api-key:latest,BASETEN_API_KEY=uptime-baseten-api-key:latest,ELEVENLABS_API_KEY=uptime-elevenlabs-api-key:latest
```

Why these flags:
- `--max-instances 1`: the run caps and the daily budget live in memory, so one instance keeps them exact.
- `--min-instances 1`: no cold start when a judge opens the link. Keep it until the community vote closes on 16 Nov, then set it to 0.
- `--timeout 3600`: push-to-talk uses a WebSocket.
- `us-central1`: close to the Meta API and to most judges.

Smoke test: open the URL, play stage 1, and check `https://<url>/api/status` says `{"mode":"full"}`.
