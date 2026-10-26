# Free preview deployment

This topology is for development, demonstrations, and closed testing. Free services sleep, have no
uptime guarantee, and can delay API and push processing. Do not present it as a dependable emergency
service.

## Topology

- Admin web: Cloudflare Workers (`apps/web/wrangler.jsonc`)
- Private media: Cloudflare R2 through its S3-compatible API
- API + notification worker: one Render free web service (`render.yaml`)
- Database: Neon free PostgreSQL
- Queues/realtime/rate limits: Upstash free Redis
- Mobile binaries: Expo EAS free allowance

The combined API/worker entrypoint is intentionally preview-only. Paid production should use the
existing separate `dist/main.js` and `dist/worker.js` entrypoints.

## 1. Create external resources

1. Create a Neon project and copy its pooled PostgreSQL connection string. Require TLS (`sslmode=require`).
2. Create an Upstash Redis database and copy the TLS URL (`rediss://...`). BullMQ requires the native
   Redis endpoint, not the REST endpoint.
3. Create a private Cloudflare R2 bucket and an API token limited to object read/write for that bucket.
4. Add an R2 CORS policy allowing `PUT`, `GET`, and `HEAD` from the admin origin and any web origin that
   will upload media. Native mobile requests do not use browser CORS.
5. Choose an SMTP provider and create credentials. The API deliberately refuses memory-only mail in
   production.

## 2. Deploy API + worker to Render

Connect the Git repository as a Render Blueprint. Render detects the root `render.yaml`. Supply every
value marked `sync: false` when prompted:

| Variable                                   | Value                                                             |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `DATABASE_URL`                             | Neon pooled connection URL with TLS                               |
| `REDIS_URL`                                | Upstash native `rediss://` URL                                    |
| `CORS_ORIGINS`                             | Final Cloudflare web origin, e.g. `https://admin.example.com`     |
| `PUBLIC_WEB_URL`                           | The same admin origin                                             |
| `SMTP_*`, `MAIL_FROM`                      | SMTP provider credentials and verified sender                     |
| `S3_ENDPOINT`                              | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`                   |
| `S3_PUBLIC_ENDPOINT`                       | Same R2 S3 endpoint; presigned URLs do not support custom domains |
| `S3_BUCKET`                                | R2 bucket name                                                    |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Bucket-scoped R2 credentials                                      |
| `EXPO_ACCESS_TOKEN`                        | Expo access token for real Expo push delivery                     |

The container runs `prisma migrate deploy` before each start. After deployment, verify:

```bash
curl https://<render-host>/health/live
curl https://<render-host>/health/ready
```

Free Render services sleep after inactivity. While asleep, realtime disconnects and queued push
notifications wait until the service wakes.

## 3. Deploy the admin web to Cloudflare

Set these build variables/secrets for the Workers project:

```text
NEXT_PUBLIC_API_URL=https://<render-host>
NEXT_PUBLIC_MEDIA_ORIGIN=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
API_INTERNAL_URL=https://<render-host>
```

Then authenticate and deploy:

```bash
pnpm --filter @emcom/shared-types build
pnpm --filter @emcom/api-client build
pnpm --filter @emcom/web deploy:cloudflare
```

Once the final Workers/custom-domain URL is known, update `CORS_ORIGINS` and `PUBLIC_WEB_URL` on Render
and redeploy/restart the service.

## 4. Configure mobile

Set `EXPO_PUBLIC_API_URL` to the Render API origin in the intended EAS profile. Set the EAS project ID
in `apps/mobile/app.json`, make a development build, and validate registration and push reception on a
physical device.

## 5. Smoke test

1. Register and verify a user.
2. Create a community and approve a second member.
3. Register the physical device for push.
4. Submit and confirm a normal emergency.
5. Verify inbox, realtime refresh, push record, acknowledgment, update, reminder, and resolution.
6. Upload and retrieve one photo through its R2 presigned URLs.
