-- Production: runs once, on the first start of an empty volume (no test database here).
CREATE DATABASE evolution;
\connect boramarca
-- Needed by the appointment overlap exclusion constraint (plan section 3).
CREATE EXTENSION IF NOT EXISTS btree_gist;
