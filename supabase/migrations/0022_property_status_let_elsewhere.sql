-- A room let by another agent is a Property status (ADR 0016).
--
-- On its own: a value added with ADD VALUE cannot be used in the transaction
-- that adds it, and the applier runs each file as one. 0023 uses it.

ALTER TYPE property_status ADD VALUE IF NOT EXISTS 'let_elsewhere';
