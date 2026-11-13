-- Runs once, on the first start of an empty volume.
CREATE DATABASE boramarca_test;
CREATE DATABASE evolution;
-- Needed by the appointment overlap exclusion constraint (plan section 3).
\connect boramarca
CREATE EXTENSION IF NOT EXISTS btree_gist;
\connect boramarca_test
CREATE EXTENSION IF NOT EXISTS btree_gist;
