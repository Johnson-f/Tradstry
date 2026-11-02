-- The position calculator's rule for a workspace: the percent of the balance
-- risked per trade, and the widest stop, as a percent of the entry, before
-- the calculator warns.
ALTER TABLE workspaces
    ADD COLUMN planning_risk_percent numeric CHECK (planning_risk_percent > 0 AND planning_risk_percent <= 100),
    ADD COLUMN max_stop_percent numeric CHECK (max_stop_percent > 0 AND max_stop_percent <= 100);
