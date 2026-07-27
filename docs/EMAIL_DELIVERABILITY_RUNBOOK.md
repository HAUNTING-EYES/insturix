# Insturix email deliverability runbook

Last verified: 2026-07-28

## Architecture decision

Insturix sends directly through Amazon SES. It does not use Loops or another
email service provider.

- Region: `ap-south-1`
- Transactional sender: `no-reply@insturix.com`
- Marketing sender: `updates@insturix.com`
- Transactional configuration set: `insturix-transactional`
- Marketing configuration set: `insturix-marketing`
- IP strategy: SES shared IP pool
- Consent and preference source of truth: MongoDB
- Provider suppression: SES account and configuration-set suppression
- Marketing unsubscribe: application-owned RFC 8058 one-click endpoint

The shared pool is intentional. AWS recommends it for irregular or small
volumes; dedicated IPs need sustained volume to maintain reputation and add
cost and operational risk. Reconsider managed dedicated IPs only after Insturix
consistently sends at least several hundred messages per day and has stable
per-provider traffic.

## Verified AWS state

The following state was read from SES v2 on 2026-07-28:

- Production access is enabled.
- Account status is `HEALTHY`.
- Sending is enabled.
- Daily quota is 50,000 recipients.
- Maximum accepted rate is 14 recipients per second.
- `insturix.com` is a verified domain identity.
- Easy DKIM is enabled and verified with a 2048-bit key.
- Custom MAIL FROM is `mail.insturix.com`; its MX state is successful.
- Account suppression is enabled for hard bounces and complaints.
- No dedicated IP pools exist.
- Both configuration sets have reputation metrics enabled.
- Both configuration sets suppress bounces and complaints.
- Both configuration sets publish send, reject, bounce, complaint, delivery,
  delivery-delay, rendering-failure, and subscription events to the default
  EventBridge bus.
- Open and click tracking are not enabled.

Event publication is configured, but there is not yet a durable EventBridge
consumer. Do not describe bounce/complaint ingestion as complete until a rule
and consumer update the application's `email_suppressions` collection and have
been tested end to end.

## Launch blockers

Marketing campaigns must remain disabled until every blocker in this section is
closed.

### 1. Repair the Hostinger MAIL FROM SPF record

The live TXT record at `mail.insturix.com` is malformed. It currently contains
a hostname prefix and a non-ASCII spacing artifact. Replace the record in
Hostinger DNS with exactly:

```text
Type: TXT
Name/host: mail
Value: v=spf1 include:amazonses.com ~all
```

Use ordinary ASCII spaces. Do not prefix the value with `mail.insturix.com`.
There must be only one SPF TXT record at this hostname.

Keep this existing record:

```text
Type: MX
Name/host: mail
Priority: 10
Value: feedback-smtp.ap-south-1.amazonses.com
```

After DNS propagation:

1. Query TXT and MX through at least two public resolvers.
2. Confirm SES still reports `MailFromDomainStatus=SUCCESS`.
3. Send an internal seed message and verify `spf=pass`, `dkim=pass`, and
   `dmarc=pass` in the received message headers.

### 2. Restore MongoDB Atlas connectivity

The production `MONGODB_URI` currently fails direct authentication, and recent
Vercel logs contain repeated Atlas server-selection and TLS timeouts. Consent,
suppression, campaign progress, and cooldown records all depend on MongoDB, so
SES must not send while this dependency is unhealthy.

Repair procedure:

1. In Atlas, create or rotate a dedicated Insturix application database user.
2. Grant only the database roles needed by `insturix_prod`; do not use an Atlas
   owner/admin credential in Vercel.
3. Prefer Vercel Static IPs for the function region and allowlist only those
   addresses in Atlas. Secure Compute is appropriate when enterprise-level
   private networking is required.
4. If temporary wildcard access is unavoidable, combine it with a unique,
   high-entropy, least-privilege database credential and remove the wildcard as
   soon as static egress is available.
5. Update `MONGODB_URI` in Vercel Production as a sensitive value.
6. Redeploy, then verify newsletter preference reads/writes, campaign creation,
   and worker progress from production.

### 3. Add a durable SES event consumer

Create EventBridge rules for both configuration sets and route the following
events to a durable, authenticated consumer:

- Hard bounce: add an active global `hard_bounce` suppression.
- Complaint: add an active global `complaint` suppression.
- Delivery delay: retain operational telemetry; do not suppress immediately.
- Reject or rendering failure: mark the delivery attempt failed and alert.
- Delivery: mark the attempt delivered when delivery tracking is implemented.

Processing must be idempotent using the SES message/event identifier. Event
payloads must never be accepted from an unauthenticated public request.

### 4. Add warm-up cohort controls

The campaign worker currently evaluates the complete candidate pool. Before the
first production marketing campaign, add a server-owned audience cap and an
engagement/consent ordering strategy. A client-only limit is not sufficient.

Eligible recipients must always satisfy all of these conditions:

- Explicit `product_updates` opt-in
- Active contact
- Not globally unsubscribed
- No active topic or global suppression
- No SES account suppression
- Prefer recent consent or engagement during warm-up

## Domain warm-up plan

This is a domain/audience warm-up plan on the SES shared pool, not dedicated-IP
warm-up.

First calculate the eligible opt-in pool after MongoDB is restored. For each
stage, send the lower of the percentage and cap:

| Stage | Eligible pool | Hard cap | Minimum observation |
| --- | ---: | ---: | ---: |
| Internal | Staff and seed inboxes only | 20 | 24 hours |
| 1 | 5% most recently engaged/consented | 50 | 24 hours |
| 2 | 10% | 100 | 24 hours |
| 3 | 20% | 250 | 24 hours |
| 4 | 40% | 500 | 24 hours |
| 5 | 70% | 1,000 | 24 hours |
| 6 | 100% | No fixed cap | Continue monitoring |

For a pool smaller than a stage cap, use the percentage. Do not pad a cohort
with unconsented, purchased, scraped, dormant, or guessed addresses.

Advance only when all gates are green:

- Hard bounce rate below 2%
- Complaint rate below 0.08%
- Gmail Postmaster spam rate below 0.1%
- No SES account/configuration-set warning
- No material delivery-delay spike
- Unsubscribe endpoint returns success and updates preferences promptly

Pause immediately on:

- Any unknown-recipient or consent-policy bypass
- Complaint rate at or above 0.08%
- Hard bounce rate at or above 2%
- Gmail spam rate at or above 0.1%
- SES enforcement or reputation warning
- MongoDB, QStash, or event-consumer degradation

AWS places accounts under review at a 5% bounce rate or 0.1% complaint rate.
The Insturix gates are intentionally lower so action happens before an AWS
enforcement threshold.

## DMARC progression

The current record is:

```text
v=DMARC1; p=none
```

This meets the minimum bulk-sender policy requirement, but it provides no
enforcement. Keep `p=none` during initial validation. Add aggregate reporting
only after a monitored mailbox or DMARC report processor exists. Once all
legitimate senders pass alignment for at least two weeks:

1. Move to `p=quarantine; pct=25`.
2. Increase to `pct=100` after clean reports.
3. Move to `p=reject` only after every legitimate sender is accounted for.

Do not change DMARC enforcement merely to make a checker show green.

## Pre-send checklist

- [ ] Hostinger SPF record is corrected and visible through public DNS.
- [ ] Seed message passes SPF, DKIM, and DMARC.
- [ ] MongoDB production authentication and network access are healthy.
- [ ] EventBridge bounce/complaint consumer is deployed and tested.
- [ ] Production deployment contains the three SES configuration variables.
- [ ] QStash signing credentials have been reviewed/rotated.
- [ ] Warm-up audience cap is enforced on the server.
- [ ] First cohort contains only recent explicit opt-ins.
- [ ] Gmail Postmaster Tools is configured for `insturix.com`.
- [ ] An operator is available for the 24-hour observation window.

## Primary references

- [AWS: dedicated IP addresses (managed)](https://docs.aws.amazon.com/ses/latest/dg/managed-dedicated-sending.html)
- [AWS: custom MAIL FROM domain](https://docs.aws.amazon.com/ses/latest/dg/mail-from.html)
- [AWS: DMARC with SES](https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dmarc.html)
- [AWS: configuration sets](https://docs.aws.amazon.com/ses/latest/dg/creating-configuration-sets.html)
- [AWS: event destinations](https://docs.aws.amazon.com/ses/latest/dg/event-destinations-manage.html)
- [AWS: account suppression list](https://docs.aws.amazon.com/ses/latest/dg/sending-email-suppression-list.html)
- [AWS: reputation enforcement thresholds](https://docs.aws.amazon.com/ses/latest/dg/monitoring-sender-reputation-pausing-account.html)
- [Google: email sender guidelines](https://support.google.com/mail/answer/81126)
- [Yahoo: sender best practices](https://senders.yahooinc.com/best-practices/)
- [Vercel: static outbound IPs and Secure Compute](https://examples.vercel.com/kb/guide/how-to-allowlist-deployment-ip-address)
- [MongoDB Atlas: IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
