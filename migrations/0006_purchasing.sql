ALTER TABLE purchase_orders ADD COLUMN created_at TEXT;
ALTER TABLE purchase_orders ADD COLUMN note TEXT NOT NULL DEFAULT '';
UPDATE purchase_orders SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
CREATE INDEX purchase_orders_kitchen ON purchase_orders(kitchen_id, status, created_at);

CREATE TABLE purchase_receipts (
  operation_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES purchase_orders(id),
  received_by_user_id TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE purchase_receipt_lines (
  id TEXT PRIMARY KEY,
  receipt_operation_id TEXT NOT NULL REFERENCES purchase_receipts(operation_id),
  purchase_line_id TEXT NOT NULL REFERENCES purchase_lines(id),
  quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0)
);
CREATE INDEX purchase_receipt_lines_order_line ON purchase_receipt_lines(purchase_line_id);

CREATE TRIGGER purchase_receipt_line_valid BEFORE INSERT ON purchase_receipt_lines
BEGIN
  SELECT RAISE(ABORT, 'receipt line belongs to another order')
    WHERE NOT EXISTS (
      SELECT 1 FROM purchase_receipts r JOIN purchase_lines l ON l.order_id = r.order_id
      WHERE r.operation_id = NEW.receipt_operation_id AND l.id = NEW.purchase_line_id
    );
  SELECT RAISE(ABORT, 'received more than ordered')
    WHERE COALESCE((SELECT SUM(quantity_milli) FROM purchase_receipt_lines WHERE purchase_line_id = NEW.purchase_line_id), 0)
      + NEW.quantity_milli > (SELECT quantity_milli FROM purchase_lines WHERE id = NEW.purchase_line_id);
END;
