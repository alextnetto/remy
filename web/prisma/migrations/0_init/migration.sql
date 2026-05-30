-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "people" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "relationship_to_me" TEXT,
    "story" TEXT,
    "base" TEXT,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_methods" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "contact_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "important_dates" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "important_dates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "description" TEXT,
    "base" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_organizations" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "relationship" TEXT,
    "role" TEXT,

    CONSTRAINT "person_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moments" (
    "id" UUID NOT NULL,
    "title" TEXT,
    "description" TEXT NOT NULL,
    "place" TEXT,
    "occurred_at" DATE,
    "org_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moment_people" (
    "moment_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,

    CONSTRAINT "moment_people_pkey" PRIMARY KEY ("moment_id","person_id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_methods_person_id_idx" ON "contact_methods"("person_id");

-- CreateIndex
CREATE INDEX "important_dates_person_id_idx" ON "important_dates"("person_id");

-- CreateIndex
CREATE INDEX "notes_person_id_idx" ON "notes"("person_id");

-- CreateIndex
CREATE INDEX "person_organizations_person_id_idx" ON "person_organizations"("person_id");

-- CreateIndex
CREATE INDEX "person_organizations_org_id_idx" ON "person_organizations"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "person_organizations_person_id_org_id_relationship_key" ON "person_organizations"("person_id", "org_id", "relationship");

-- CreateIndex
CREATE INDEX "moments_org_id_idx" ON "moments"("org_id");

-- CreateIndex
CREATE INDEX "moment_people_person_id_idx" ON "moment_people"("person_id");

-- CreateIndex
CREATE INDEX "reminders_person_id_idx" ON "reminders"("person_id");

-- CreateIndex
CREATE INDEX "reminders_due_at_idx" ON "reminders"("due_at");

-- AddForeignKey
ALTER TABLE "contact_methods" ADD CONSTRAINT "contact_methods_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "important_dates" ADD CONSTRAINT "important_dates_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_organizations" ADD CONSTRAINT "person_organizations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_organizations" ADD CONSTRAINT "person_organizations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moments" ADD CONSTRAINT "moments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_people" ADD CONSTRAINT "moment_people_moment_id_fkey" FOREIGN KEY ("moment_id") REFERENCES "moments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_people" ADD CONSTRAINT "moment_people_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

