CREATE TABLE catalog_ingredients (
  id TEXT PRIMARY KEY,
  kitchen_id TEXT NOT NULL REFERENCES kitchens(id),
  name TEXT NOT NULL,
  base_unit TEXT NOT NULL CHECK (base_unit IN ('g', 'ml', 'un', 'atado', 'paq', 'bandeja')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT
);
CREATE UNIQUE INDEX catalog_ingredients_name ON catalog_ingredients(kitchen_id, name COLLATE NOCASE);
CREATE INDEX catalog_ingredients_kitchen ON catalog_ingredients(kitchen_id, archived_at);

ALTER TABLE recipe_ingredients ADD COLUMN catalog_ingredient_id TEXT REFERENCES catalog_ingredients(id);
CREATE INDEX recipe_ingredients_catalog ON recipe_ingredients(catalog_ingredient_id);

CREATE TABLE stock_movements (
  operation_id TEXT PRIMARY KEY,
  kitchen_id TEXT NOT NULL REFERENCES kitchens(id),
  ingredient_id TEXT NOT NULL REFERENCES catalog_ingredients(id),
  delta_milli INTEGER NOT NULL CHECK (delta_milli <> 0),
  kind TEXT NOT NULL CHECK (kind IN ('received', 'consumed', 'adjustment')),
  note TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX stock_movements_ingredient ON stock_movements(kitchen_id, ingredient_id, created_at);

CREATE TRIGGER stock_movement_ingredient_kitchen BEFORE INSERT ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'ingredient belongs to another kitchen')
    WHERE NOT EXISTS (SELECT 1 FROM catalog_ingredients WHERE id = NEW.ingredient_id AND kitchen_id = NEW.kitchen_id AND archived_at IS NULL);
  SELECT RAISE(ABORT, 'stock cannot be negative')
    WHERE COALESCE((SELECT SUM(delta_milli) FROM stock_movements WHERE ingredient_id = NEW.ingredient_id), 0) + NEW.delta_milli < 0;
END;

ALTER TABLE purchase_lines ADD COLUMN catalog_ingredient_id TEXT REFERENCES catalog_ingredients(id);
CREATE INDEX purchase_lines_catalog ON purchase_lines(catalog_ingredient_id);
