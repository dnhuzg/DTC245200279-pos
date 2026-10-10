class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Kiểm tra số nguyên trong khoảng [min, max]; ném lỗi 400 nếu sai
function toInt(value, field, { min = 0, max = 2_000_000_000 } = {}) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `Trường "${field}" phải là số nguyên từ ${min} đến ${max}`);
  }
  return n;
}

function toText(value, field, { max = 150, required = true, fallback = '' } = {}) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) {
    if (required) throw new HttpError(400, `Trường "${field}" không được để trống`);
    return fallback;
  }
  if (s.length > max) throw new HttpError(400, `Trường "${field}" tối đa ${max} ký tự`);
  return s;
}

module.exports = { HttpError, toInt, toText };
