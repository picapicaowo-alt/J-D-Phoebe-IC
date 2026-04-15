-- Align rows with current Prisma enums before db push (local dev only).
-- Use values that exist on BOTH the old and new enum variants (BUNNY may not exist until after push).
UPDATE "CompanionProfile" SET species = 'DOG' WHERE species::text IN ('OTTER', 'RABBIT');
UPDATE "RecognitionEvent" SET "tagCategory" = 'RESULT' WHERE "tagCategory"::text = 'LEADERSHIP';
