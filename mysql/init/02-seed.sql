-- Dữ liệu mẫu cho demo
SET NAMES utf8mb4;

INSERT INTO products (sku, name, category, unit, price, stock, min_stock) VALUES
  ('NG-001', 'Nước suối Aquafina 500ml',     'Nước giải khát', 'chai', 6000,  120, 24),
  ('NG-002', 'Coca-Cola lon 330ml',          'Nước giải khát', 'lon',  10000, 80,  24),
  ('NG-003', 'Trà xanh Không Độ 455ml',      'Nước giải khát', 'chai', 10000, 18,  24),
  ('NG-004', 'Sữa tươi TH True Milk 180ml',  'Sữa',            'hộp',  8000,  60,  20),
  ('NG-005', 'Sữa chua Vinamilk',            'Sữa',            'hộp',  7000,  4,   12),
  ('BK-001', 'Bánh mì sandwich Kinh Đô',     'Bánh kẹo',       'gói',  15000, 35,  10),
  ('BK-002', 'Bánh Chocopie hộp 12 cái',     'Bánh kẹo',       'hộp',  55000, 12,  5),
  ('BK-003', 'Kẹo cao su Doublemint',        'Bánh kẹo',       'thanh',5000,  3,   10),
  ('MI-001', 'Mì Hảo Hảo tôm chua cay',      'Thực phẩm khô',  'gói',  4500,  200, 50),
  ('MI-002', 'Phở bò Vifon',                 'Thực phẩm khô',  'gói',  9000,  40,  20),
  ('GV-001', 'Nước mắm Nam Ngư 500ml',       'Gia vị',         'chai', 32000, 15,  5),
  ('GV-002', 'Dầu ăn Neptune 1L',            'Gia vị',         'chai', 52000, 2,   5),
  ('HP-001', 'Kem đánh răng P/S 180g',       'Hóa mỹ phẩm',    'tuýp', 35000, 22,  6),
  ('HP-002', 'Dầu gội Clear 340g',           'Hóa mỹ phẩm',    'chai', 89000, 9,   4),
  ('HP-003', 'Nước rửa chén Sunlight 750g',  'Hóa mỹ phẩm',    'chai', 28000, 0,   5);

-- Vài hóa đơn mẫu (tồn kho ở trên đã là số SAU khi bán các hóa đơn này)
INSERT INTO invoices (id, customer_name, total, note, created_at) VALUES
  (1, 'Khách lẻ',        38000, NULL,               NOW() - INTERVAL 2 DAY),
  (2, 'Nguyễn Văn An',  117000, 'Khách quen',       NOW() - INTERVAL 1 DAY),
  (3, 'Khách lẻ',        47000, NULL,               NOW() - INTERVAL 3 HOUR);

INSERT INTO invoice_items (invoice_id, product_id, product_name, unit_price, quantity, line_total) VALUES
  (1, 2,  'Coca-Cola lon 330ml',         10000, 2, 20000),
  (1, 9,  'Mì Hảo Hảo tôm chua cay',      4500, 4, 18000),
  (2, 7,  'Bánh Chocopie hộp 12 cái',    55000, 1, 55000),
  (2, 11, 'Nước mắm Nam Ngư 500ml',      32000, 1, 32000),
  (2, 4,  'Sữa tươi TH True Milk 180ml',  8000, 2, 16000),
  (2, 5,  'Sữa chua Vinamilk',            7000, 2, 14000),
  (3, 1,  'Nước suối Aquafina 500ml',     6000, 2, 12000),
  (3, 13, 'Kem đánh răng P/S 180g',      35000, 1, 35000);
