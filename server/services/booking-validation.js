class BookingError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'BookingError';
    this.status = status;
    this.code = code;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseHotelDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BookingError(400, 'INVALID_DATE_RANGE', 'Dates must use YYYY-MM-DD.');
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (year < 1 || date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new BookingError(400, 'INVALID_DATE_RANGE', 'The date is not a real calendar day.');
  }
  return date;
}

function validateStay(checkInDate, checkOutDate) {
  const start = parseHotelDate(checkInDate);
  const end = parseHotelDate(checkOutDate);
  const nightCount = (end.getTime() - start.getTime()) / DAY_MS;
  if (!Number.isInteger(nightCount) || nightCount < 1 || nightCount > 365) {
    throw new BookingError(400, 'INVALID_DATE_RANGE', 'Stay must be between 1 and 365 nights.');
  }
  const nights = Array.from({ length: nightCount }, (_, offset) =>
    new Date(start.getTime() + offset * DAY_MS).toISOString().slice(0, 10));
  return { checkInDate, checkOutDate, nightCount, nights };
}

function validateGuestCount(guestCount, capacity) {
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 20) {
    throw new BookingError(400, 'INVALID_GUEST_COUNT', 'Guest count must be an integer from 1 to 20.');
  }
  if (capacity !== undefined && guestCount > capacity) {
    throw new BookingError(400, 'CAPACITY_EXCEEDED', 'Guest count exceeds room capacity.');
  }
  return guestCount;
}

function calculatePrice(basePrice, nightCount) {
  if (!Number.isSafeInteger(basePrice) || basePrice < 0 ||
      !Number.isSafeInteger(nightCount) || nightCount < 1 ||
      !Number.isSafeInteger(basePrice * nightCount) || basePrice * nightCount > 2147483647) {
    throw new BookingError(400, 'INVALID_PRICE', 'Room price must be a safe nonnegative integer in baht.');
  }
  return { pricePerNight: basePrice, totalPrice: basePrice * nightCount };
}

module.exports = {
  BookingError,
  parseHotelDate,
  validateStay,
  validateGuestCount,
  calculatePrice,
};
