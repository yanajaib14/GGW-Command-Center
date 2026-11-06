-- audit_log is append-only: reject every UPDATE and DELETE whichever database
-- role connects. Additive only; touches no existing data.
CREATE FUNCTION audit_log_block_mutation() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
	BEFORE UPDATE OR DELETE ON audit_log
	FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();
