-- Keep updated_at current on every UPDATE, including raw SQL. Additive only.
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
	NEW.updated_at = now();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER organizations_set_updated_at
	BEFORE UPDATE ON organizations
	FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER locations_set_updated_at
	BEFORE UPDATE ON locations
	FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER employees_set_updated_at
	BEFORE UPDATE ON employees
	FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER roles_set_updated_at
	BEFORE UPDATE ON roles
	FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER role_assignments_set_updated_at
	BEFORE UPDATE ON role_assignments
	FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER invitations_set_updated_at
	BEFORE UPDATE ON invitations
	FOR EACH ROW EXECUTE FUNCTION set_updated_at();
