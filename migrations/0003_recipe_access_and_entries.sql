CREATE TABLE recipe_access (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  access TEXT NOT NULL DEFAULT 'read' CHECK (access IN ('read')),
  granted_by_user_id TEXT NOT NULL,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (recipe_id, user_id)
);
CREATE INDEX recipe_access_by_user ON recipe_access(user_id, recipe_id);

CREATE TRIGGER production_entry_add
AFTER INSERT ON production_entries
BEGIN
  UPDATE productions
  SET produced_yield_milli = produced_yield_milli + NEW.amount_milli,
      status = CASE WHEN status = 'planned' THEN 'in_progress' ELSE status END
  WHERE id = NEW.production_id;
END;
