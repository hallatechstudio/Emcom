-- AlterEnum
ALTER TYPE "public"."EmergencyEventType" ADD VALUE 'REMINDER_SENT';

-- AlterEnum
ALTER TYPE "public"."NotificationType" ADD VALUE 'EMERGENCY_REMINDER';

-- AlterTable
ALTER TABLE "public"."emergencies" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "locationAccuracyM" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;
