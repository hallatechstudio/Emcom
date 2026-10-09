-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "public"."OtpPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "public"."CommunityType" AS ENUM ('ESTATE', 'NEIGHBORHOOD', 'CHURCH', 'SCHOOL', 'WORKPLACE', 'HOTEL', 'APARTMENT_COMPLEX', 'INDUSTRIAL_FACILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "public"."MembershipStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'REMOVED', 'LEFT');

-- CreateEnum
CREATE TYPE "public"."EmergencyPathway" AS ENUM ('NORMAL', 'CRITICAL');

-- CreateEnum
CREATE TYPE "public"."EmergencyStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISMISSED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "public"."EmergencyCategory" AS ENUM ('FIRE', 'SECURITY_THREAT', 'MEDICAL_EMERGENCY', 'ELECTRICAL_EMERGENCY', 'GAS_LEAK', 'FLOOD', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."EmergencyEventType" AS ENUM ('REPORTED', 'CRITICAL_ALERT_TRIGGERED', 'ADDITIONAL_TRIGGER', 'CONFIRMED', 'DISMISSED', 'COMMUNITY_ALERTED', 'UPDATE_SENT', 'RESOLVED');

-- CreateEnum
CREATE TYPE "public"."MediaStatus" AS ENUM ('PENDING_UPLOAD', 'ATTACHED');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('JOIN_REQUEST', 'MEMBERSHIP_APPROVED', 'MEMBERSHIP_REJECTED', 'EMERGENCY_REPORT_RECEIVED', 'EMERGENCY_CONFIRMED', 'EMERGENCY_BROADCAST', 'CRITICAL_ALERT', 'EMERGENCY_UPDATE', 'EMERGENCY_RESOLVED', 'REPORT_DISMISSED');

-- CreateEnum
CREATE TYPE "public"."NotificationPriority" AS ENUM ('NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "public"."DeliveryStatus" AS ENUM ('QUEUED', 'PROVIDER_ACCEPTED', 'FAILED', 'INVALID_TOKEN', 'SKIPPED');

-- CreateEnum
CREATE TYPE "public"."DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "public"."PushProviderName" AS ENUM ('MOCK', 'EXPO', 'FCM');

-- CreateEnum
CREATE TYPE "public"."OutboxStatus" AS ENUM ('PENDING', 'DISPATCHED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "public"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."otp_codes" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "public"."OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "replacedById" UUID,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."communities" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."CommunityType" NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "whatsappUrl" TEXT,
    "inviteCode" TEXT NOT NULL,
    "inviteCodeRotatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."community_code_history" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "retiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredById" UUID,

    CONSTRAINT "community_code_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."community_identification_fields" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_identification_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."community_memberships" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "public"."MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "status" "public"."MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "identificationValue" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."emergencies" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "pathway" "public"."EmergencyPathway" NOT NULL,
    "status" "public"."EmergencyStatus" NOT NULL,
    "category" "public"."EmergencyCategory",
    "location" TEXT,
    "description" TEXT,
    "instructions" TEXT,
    "reporterId" UUID NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" UUID,
    "dismissedAt" TIMESTAMP(3),
    "dismissedById" UUID,
    "dismissalReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,
    "resolutionMessage" TEXT,
    "additionalTriggerCount" INTEGER NOT NULL DEFAULT 0,
    "eventSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."emergency_alerts" (
    "id" UUID NOT NULL,
    "emergencyId" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "pathway" "public"."EmergencyPathway" NOT NULL,
    "triggeredById" UUID NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "broadcastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."alert_recipients" (
    "id" UUID NOT NULL,
    "alertId" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "addedAfterBroadcast" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."alert_acknowledgments" (
    "id" UUID NOT NULL,
    "alertId" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_acknowledgments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."emergency_updates" (
    "id" UUID NOT NULL,
    "emergencyId" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."emergency_events" (
    "id" UUID NOT NULL,
    "emergencyId" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" "public"."EmergencyEventType" NOT NULL,
    "actorId" UUID,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."emergency_media" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "emergencyId" UUID,
    "uploaderId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "public"."MediaStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."device_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "public"."DevicePlatform" NOT NULL,
    "provider" "public"."PushProviderName" NOT NULL,
    "appVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invalidatedAt" TIMESTAMP(3),
    "invalidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "communityId" UUID,
    "emergencyId" UUID,
    "type" "public"."NotificationType" NOT NULL,
    "priority" "public"."NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notification_deliveries" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "deviceTokenId" UUID NOT NULL,
    "provider" "public"."PushProviderName" NOT NULL,
    "status" "public"."DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."outbox_events" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "communityId" UUID,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "public"."OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" UUID NOT NULL,
    "communityId" UUID,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."idempotency_records" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "coalesced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE INDEX "otp_codes_userId_purpose_createdAt_idx" ON "public"."otp_codes"("userId", "purpose", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "public"."refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "public"."refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "public"."refresh_tokens"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "communities_inviteCode_key" ON "public"."communities"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "community_code_history_code_key" ON "public"."community_code_history"("code");

-- CreateIndex
CREATE INDEX "community_code_history_communityId_idx" ON "public"."community_code_history"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "community_identification_fields_communityId_key" ON "public"."community_identification_fields"("communityId");

-- CreateIndex
CREATE INDEX "community_memberships_communityId_status_role_idx" ON "public"."community_memberships"("communityId", "status", "role");

-- CreateIndex
CREATE INDEX "community_memberships_userId_status_idx" ON "public"."community_memberships"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "community_memberships_communityId_userId_key" ON "public"."community_memberships"("communityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "community_memberships_id_communityId_key" ON "public"."community_memberships"("id", "communityId");

-- CreateIndex
CREATE INDEX "emergencies_communityId_status_createdAt_idx" ON "public"."emergencies"("communityId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "emergencies_communityId_pathway_createdAt_idx" ON "public"."emergencies"("communityId", "pathway", "createdAt");

-- CreateIndex
CREATE INDEX "emergencies_reporterId_createdAt_idx" ON "public"."emergencies"("reporterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "emergencies_id_communityId_key" ON "public"."emergencies"("id", "communityId");

-- CreateIndex
CREATE UNIQUE INDEX "emergency_alerts_emergencyId_key" ON "public"."emergency_alerts"("emergencyId");

-- CreateIndex
CREATE INDEX "emergency_alerts_communityId_broadcastAt_idx" ON "public"."emergency_alerts"("communityId", "broadcastAt");

-- CreateIndex
CREATE UNIQUE INDEX "emergency_alerts_id_communityId_key" ON "public"."emergency_alerts"("id", "communityId");

-- CreateIndex
CREATE UNIQUE INDEX "emergency_alerts_emergencyId_communityId_key" ON "public"."emergency_alerts"("emergencyId", "communityId");

-- CreateIndex
CREATE INDEX "alert_recipients_communityId_idx" ON "public"."alert_recipients"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "alert_recipients_alertId_userId_key" ON "public"."alert_recipients"("alertId", "userId");

-- CreateIndex
CREATE INDEX "alert_acknowledgments_communityId_idx" ON "public"."alert_acknowledgments"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "alert_acknowledgments_alertId_userId_key" ON "public"."alert_acknowledgments"("alertId", "userId");

-- CreateIndex
CREATE INDEX "emergency_updates_emergencyId_createdAt_idx" ON "public"."emergency_updates"("emergencyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "emergency_events_emergencyId_seq_key" ON "public"."emergency_events"("emergencyId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "emergency_media_objectKey_key" ON "public"."emergency_media"("objectKey");

-- CreateIndex
CREATE INDEX "emergency_media_emergencyId_idx" ON "public"."emergency_media"("emergencyId");

-- CreateIndex
CREATE INDEX "emergency_media_uploaderId_status_idx" ON "public"."emergency_media"("uploaderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "public"."device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_userId_invalidatedAt_idx" ON "public"."device_tokens"("userId", "invalidatedAt");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "public"."notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_communityId_createdAt_idx" ON "public"."notifications"("communityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_dedupeKey_key" ON "public"."notifications"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_queuedAt_idx" ON "public"."notification_deliveries"("status", "queuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_notificationId_deviceTokenId_key" ON "public"."notification_deliveries"("notificationId", "deviceTokenId");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_dedupeKey_key" ON "public"."outbox_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "outbox_events_status_availableAt_idx" ON "public"."outbox_events"("status", "availableAt");

-- CreateIndex
CREATE INDEX "audit_logs_communityId_createdAt_idx" ON "public"."audit_logs"("communityId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "public"."audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "public"."audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "idempotency_records_createdAt_idx" ON "public"."idempotency_records"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_userId_key_key" ON "public"."idempotency_records"("userId", "key");

-- AddForeignKey
ALTER TABLE "public"."otp_codes" ADD CONSTRAINT "otp_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."communities" ADD CONSTRAINT "communities_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."community_code_history" ADD CONSTRAINT "community_code_history_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."community_identification_fields" ADD CONSTRAINT "community_identification_fields_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."community_memberships" ADD CONSTRAINT "community_memberships_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."community_memberships" ADD CONSTRAINT "community_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."community_memberships" ADD CONSTRAINT "community_memberships_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."emergencies" ADD CONSTRAINT "emergencies_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."emergencies" ADD CONSTRAINT "emergencies_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."emergency_alerts" ADD CONSTRAINT "emergency_alerts_emergencyId_communityId_fkey" FOREIGN KEY ("emergencyId", "communityId") REFERENCES "public"."emergencies"("id", "communityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."emergency_alerts" ADD CONSTRAINT "emergency_alerts_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."alert_recipients" ADD CONSTRAINT "alert_recipients_alertId_communityId_fkey" FOREIGN KEY ("alertId", "communityId") REFERENCES "public"."emergency_alerts"("id", "communityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."alert_recipients" ADD CONSTRAINT "alert_recipients_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."alert_recipients" ADD CONSTRAINT "alert_recipients_membershipId_communityId_fkey" FOREIGN KEY ("membershipId", "communityId") REFERENCES "public"."community_memberships"("id", "communityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."alert_acknowledgments" ADD CONSTRAINT "alert_acknowledgments_alertId_communityId_fkey" FOREIGN KEY ("alertId", "communityId") REFERENCES "public"."emergency_alerts"("id", "communityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."alert_acknowledgments" ADD CONSTRAINT "alert_acknowledgments_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."alert_acknowledgments" ADD CONSTRAINT "alert_acknowledgments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."alert_acknowledgments" ADD CONSTRAINT "alert_acknowledgments_membershipId_communityId_fkey" FOREIGN KEY ("membershipId", "communityId") REFERENCES "public"."community_memberships"("id", "communityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."emergency_updates" ADD CONSTRAINT "emergency_updates_emergencyId_communityId_fkey" FOREIGN KEY ("emergencyId", "communityId") REFERENCES "public"."emergencies"("id", "communityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."emergency_updates" ADD CONSTRAINT "emergency_updates_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."emergency_updates" ADD CONSTRAINT "emergency_updates_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."emergency_events" ADD CONSTRAINT "emergency_events_emergencyId_communityId_fkey" FOREIGN KEY ("emergencyId", "communityId") REFERENCES "public"."emergencies"("id", "communityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."emergency_events" ADD CONSTRAINT "emergency_events_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."emergency_events" ADD CONSTRAINT "emergency_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."emergency_media" ADD CONSTRAINT "emergency_media_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."emergency_media" ADD CONSTRAINT "emergency_media_emergencyId_fkey" FOREIGN KEY ("emergencyId") REFERENCES "public"."emergencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."emergency_media" ADD CONSTRAINT "emergency_media_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."device_tokens" ADD CONSTRAINT "device_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "public"."notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_deviceTokenId_fkey" FOREIGN KEY ("deviceTokenId") REFERENCES "public"."device_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- ---------------------------------------------------------------------------
-- Hand-written invariants (not expressible in Prisma schema). See docs/data-model.md.
-- ---------------------------------------------------------------------------

-- Append-only tables: audit trail and emergency timeline can never be edited or deleted.
CREATE OR REPLACE FUNCTION emcom_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION emcom_forbid_mutation();
CREATE TRIGGER emergency_events_append_only BEFORE UPDATE OR DELETE ON emergency_events
  FOR EACH ROW EXECUTE FUNCTION emcom_forbid_mutation();

-- Incidents are never hard-deleted during routine operation.
CREATE TRIGGER emergencies_no_delete BEFORE DELETE ON emergencies
  FOR EACH ROW EXECUTE FUNCTION emcom_forbid_mutation();

-- Emergency shape invariants.
ALTER TABLE emergencies
  ADD CONSTRAINT emergencies_normal_has_category CHECK (pathway <> 'NORMAL' OR category IS NOT NULL),
  ADD CONSTRAINT emergencies_critical_not_pending CHECK (pathway <> 'CRITICAL' OR status IN ('ACTIVE', 'RESOLVED')),
  ADD CONSTRAINT emergencies_resolved_has_message CHECK (status <> 'RESOLVED' OR ("resolutionMessage" IS NOT NULL AND "resolvedAt" IS NOT NULL)),
  ADD CONSTRAINT emergencies_dismissed_has_time CHECK (status <> 'DISMISSED' OR "dismissedAt" IS NOT NULL);

