# AWS preview server (single EC2 instance, US region)

A throw-away preview of the whole app on one server: the Supabase stack in Docker, the Next.js production build with `APP_STAGE=preview` (sandbox payments allowed), and Caddy on port 80 routing `/auth/v1`, `/rest/v1`, `/storage/v1`, `/realtime/v1` to Supabase and everything else to the app. The same layout was run locally through Caddy and passed all 22 end-to-end checks.

**Not for real customers.** The local Supabase stack signs sessions with Supabase's public demo secret, traffic is plain HTTP, and only the sandbox gateway is enabled. Keep the security group limited to your own IP address.

## Resources

| Resource | Setting |
|---|---|
| Region | `us-east-2` (Ohio; owner decision: US hosting only) |
| EC2 | Ubuntu Server 24.04 LTS x86_64 AMI, `t3.medium` (4 GB; `bootstrap.sh` adds 4 GB swap), 30 GB gp3 root volume, public IP in the default VPC |
| Security group | Inbound TCP 80 from the owner's IP `/32` only; no SSH (use Session Manager) |
| IAM instance profile | `AmazonSSMManagedInstanceCore`, so the server can be managed with SSM Run Command / Session Manager without opening port 22 |
| User data | `bootstrap.sh` (installs Docker, Node 22, Caddy; clones this branch; starts Supabase; builds; creates systemd units) |
| Tags | `Project=researchdesk-preview` on everything, so it can be found and deleted together |

Cost at on-demand prices: roughly $30 per month for the instance and $2–3 for the volume while it exists; stopping the instance stops the instance charge.

## After launch

1. Wait 10–15 minutes; bootstrap logs to `/var/log/researchdesk-bootstrap.log` and writes `/opt/researchdesk/READY` when the site answers.
2. Open `http://<public-ip>` and register an account (email confirmation is off in this stack).
3. Make it the owner, via Session Manager:
   ```bash
   sudo docker exec supabase_db_researchdesk-pro psql -U postgres -c \
     "insert into public.user_roles (user_id, role) select id, 'admin' from auth.users where email = 'you@example.com';"
   ```
4. Open `http://<public-ip>/en/admin` and enrol an authenticator app.

## Updating and removing

- Update to the latest commit on the branch: re-run the bootstrap (`sudo bash /opt/researchdesk/app/deploy/aws-preview/bootstrap.sh`); it re-clones, rebuilds and restarts.
- Remove: terminate the instance, then delete the security group and the IAM role/instance profile tagged `Project=researchdesk-preview`. Nothing else is created.
