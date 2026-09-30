ALTER TABLE recipes ADD COLUMN course TEXT;

-- Entradas, Principales and Postres are built in; a kitchen only stores the courses it adds.
CREATE TABLE kitchen_courses (
  kitchen_id TEXT NOT NULL REFERENCES kitchens(id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (kitchen_id, name)
);
