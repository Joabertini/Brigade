PRAGMA foreign_keys = ON;

CREATE TABLE kitchens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- user_id points to Better Auth's user table once identity migration is installed.
CREATE TABLE memberships (
  kitchen_id TEXT NOT NULL REFERENCES kitchens(id),
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('chef', 'sous_chef', 'commis')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled')),
  PRIMARY KEY (kitchen_id, user_id)
);

CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  kitchen_id TEXT NOT NULL REFERENCES kitchens(id),
  owner_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'kitchen')),
  current_version INTEGER NOT NULL DEFAULT 1,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX recipes_by_kitchen ON recipes(kitchen_id, visibility);
CREATE INDEX recipes_by_owner ON recipes(owner_user_id);

CREATE TABLE recipe_versions (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  version INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  yield_milli INTEGER NOT NULL CHECK (yield_milli > 0),
  yield_unit TEXT NOT NULL,
  confirmed_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (recipe_id, version)
);

CREATE TABLE recipe_ingredients (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES recipe_versions(id),
  ingredient_name TEXT NOT NULL,
  net_milli INTEGER NOT NULL CHECK (net_milli > 0),
  unit TEXT NOT NULL,
  waste_permille INTEGER NOT NULL DEFAULT 0 CHECK (waste_permille BETWEEN 0 AND 999),
  position INTEGER NOT NULL
);
CREATE INDEX recipe_ingredients_by_version ON recipe_ingredients(version_id, position);

CREATE TABLE recipe_steps (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES recipe_versions(id),
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE recipe_step_ingredients (
  step_id TEXT NOT NULL REFERENCES recipe_steps(id),
  ingredient_id TEXT NOT NULL REFERENCES recipe_ingredients(id),
  PRIMARY KEY (step_id, ingredient_id)
);

CREATE TABLE productions (
  id TEXT PRIMARY KEY,
  kitchen_id TEXT NOT NULL REFERENCES kitchens(id),
  recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id),
  target_yield_milli INTEGER NOT NULL CHECK (target_yield_milli > 0),
  produced_yield_milli INTEGER NOT NULL DEFAULT 0 CHECK (produced_yield_milli >= 0),
  planned_for TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  event_id TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX productions_by_kitchen_date ON productions(kitchen_id, planned_for);

CREATE TABLE production_entries (
  operation_id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES productions(id),
  actor_user_id TEXT NOT NULL,
  amount_milli INTEGER NOT NULL CHECK (amount_milli > 0),
  recorded_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  kitchen_id TEXT NOT NULL REFERENCES kitchens(id),
  production_id TEXT REFERENCES productions(id),
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  assignee_user_id TEXT,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'doing', 'done', 'cancelled')),
  event_id TEXT
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  kitchen_id TEXT NOT NULL REFERENCES kitchens(id),
  name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  guest_count INTEGER CHECK (guest_count >= 0),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  kitchen_id TEXT NOT NULL REFERENCES kitchens(id),
  name TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT ''
);
CREATE TABLE purchase_orders (
  id TEXT PRIMARY KEY,
  kitchen_id TEXT NOT NULL REFERENCES kitchens(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'confirmed', 'received', 'cancelled')),
  sent_at TEXT,
  created_by_user_id TEXT NOT NULL
);
CREATE TABLE purchase_lines (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES purchase_orders(id),
  ingredient_name TEXT NOT NULL,
  quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
  unit TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
