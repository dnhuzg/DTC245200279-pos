const mysql = require('mysql2/promise');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql',
  port: Number(process.env.DB_PORT || 3306),
  user: required('DB_USER'),
  password: required('DB_PASSWORD'),
  database: required('DB_NAME'),
  charset: 'utf8mb4',
  // Trả DATETIME dạng chuỗi để không bị lệch múi giờ giữa container
  dateStrings: true,
  connectionLimit: 10,
  waitForConnections: true,
});

// Chạy hàm fn trong một transaction, tự commit/rollback
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, withTransaction };
