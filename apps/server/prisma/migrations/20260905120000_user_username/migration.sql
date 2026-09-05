-- A learner is addressed by a username now, and every public read is under it.
--
-- It is `slug` renamed in everything but the mechanics: the value is the same
-- one (email minus the domain, numbered on a collision), so nothing that was
-- built from it moves — every recording already in the bucket is under a folder
-- named after this, and a rename of the value would orphan all of them.
--
-- Added and backfilled rather than renamed, because migrations run from the
-- runner before the new bundle ships: for the minutes in between, the code still
-- serving selects "slug" by name, and a rename would make every query that
-- touches a user fail. The old column goes in the next schema change, once
-- nothing selects it.
--
-- The default is for the same gap in the other direction: the old code inserts a
-- user naming no username, and the column is NOT NULL.
ALTER TABLE "users" ADD COLUMN "username" TEXT NOT NULL DEFAULT md5((random())::text);

UPDATE "users" SET "username" = "slug";

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
