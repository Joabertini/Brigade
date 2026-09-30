CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  kitchen_id TEXT NOT NULL REFERENCES kitchens(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('chef', 'sous_chef', 'commis')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by_user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX invitations_by_kitchen ON invitations(kitchen_id, email);
