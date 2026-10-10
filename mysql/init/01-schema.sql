-- Schema CSDL cho hệ thống POS (chạy tự động lần đầu MySQL khởi tạo volume)
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS products (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  sku         VARCHAR(32)   NOT NULL,
  name        VARCHAR(150)  NOT NULL,
  category    VARCHAR(60)   NOT NULL DEFAULT 'Khác',
  unit        VARCHAR(20)   NOT NULL DEFAULT 'cái',
  price       INT UNSIGNED  NOT NULL COMMENT 'Giá bán (VND)',
  stock       INT UNSIGNED  NOT NULL DEFAULT 0 COMMENT 'Số lượng tồn kho',
  min_stock   INT UNSIGNED  NOT NULL DEFAULT 5 COMMENT 'Ngưỡng cảnh báo tồn kho thấp',
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_sku (sku),
  KEY idx_products_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoices (
  id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  customer_name  VARCHAR(100)  NOT NULL DEFAULT 'Khách lẻ',
  total          BIGINT UNSIGNED NOT NULL DEFAULT 0,
  note           VARCHAR(255)  NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_invoices_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lưu lại tên/giá tại thời điểm bán để hóa đơn cũ không bị đổi khi sửa sản phẩm
CREATE TABLE IF NOT EXISTS invoice_items (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  invoice_id    INT UNSIGNED  NOT NULL,
  product_id    INT UNSIGNED  NOT NULL,
  product_name  VARCHAR(150)  NOT NULL,
  unit_price    INT UNSIGNED  NOT NULL,
  quantity      INT UNSIGNED  NOT NULL,
  line_total    BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_items_invoice (invoice_id),
  KEY idx_items_product (product_id),
  CONSTRAINT fk_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT,
  CONSTRAINT chk_items_qty CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
