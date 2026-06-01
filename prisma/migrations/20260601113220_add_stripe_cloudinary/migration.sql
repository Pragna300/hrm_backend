/*
  Warnings:

  - You are about to drop the column `logo_url` on the `organization` table. All the data in the column will be lost.
  - You are about to drop the `employee_documents` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "InquiryType" AS ENUM ('GENERAL', 'DEMO_REQUEST', 'TECHNICAL_SUPPORT', 'EMPLOYEE_ISSUE', 'PAYROLL_ISSUE', 'ATTENDANCE_ISSUE', 'FEATURE_REQUEST', 'BUG_REPORT', 'PARTNERSHIP');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "InquiryPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- DropForeignKey
ALTER TABLE "employee_documents" DROP CONSTRAINT "employee_documents_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "employee_documents" DROP CONSTRAINT "employee_documents_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "employee_documents" DROP CONSTRAINT "employee_documents_uploaded_by_user_id_fkey";

-- AlterTable
ALTER TABLE "organization" DROP COLUMN "logo_url",
ADD COLUMN     "stripe_customer_id" TEXT,
ADD COLUMN     "trial_ends_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "stripe_subscription_id" TEXT;

-- DropTable
DROP TABLE "employee_documents";

-- CreateTable
CREATE TABLE "archived_documents" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "employee_id" INTEGER,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "file_url" VARCHAR(2000) NOT NULL,
    "file_type" VARCHAR(50),
    "file_size" INTEGER,
    "category" VARCHAR(100),
    "uploaded_by_user_id" INTEGER,
    "is_organization_wide" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archived_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_inquiries" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "organization_name" VARCHAR(255),
    "inquiry_type" "InquiryType" NOT NULL,
    "subject" VARCHAR(500),
    "message" TEXT NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "InquiryPriority" NOT NULL DEFAULT 'MEDIUM',
    "admin_notes" TEXT,
    "assigned_admin_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "archived_documents_organization_id_idx" ON "archived_documents"("organization_id");

-- CreateIndex
CREATE INDEX "archived_documents_employee_id_idx" ON "archived_documents"("employee_id");

-- CreateIndex
CREATE INDEX "contact_inquiries_status_idx" ON "contact_inquiries"("status");

-- CreateIndex
CREATE INDEX "contact_inquiries_inquiry_type_idx" ON "contact_inquiries"("inquiry_type");

-- CreateIndex
CREATE INDEX "contact_inquiries_created_at_idx" ON "contact_inquiries"("created_at");

-- AddForeignKey
ALTER TABLE "archived_documents" ADD CONSTRAINT "archived_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archived_documents" ADD CONSTRAINT "archived_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archived_documents" ADD CONSTRAINT "archived_documents_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_inquiries" ADD CONSTRAINT "contact_inquiries_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_inquiries" ADD CONSTRAINT "contact_inquiries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
