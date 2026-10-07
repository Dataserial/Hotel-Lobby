const {
  validateStay, validateGuestCount, calculatePrice,
} = require('../services/booking-validation');

describe('booking validation', () => {
  test.each([
    ['2026-02-29', '2026-03-01'],
    ['2026-13-01', '2026-13-02'],
    ['2026-10-10', '2026-10-10'],
    ['2026-10-11', '2026-10-10'],
    ['2026-01-01', '2027-01-02'],
    ['2026-1-01', '2026-01-02'],
  ])('rejects invalid stay %s to %s', (checkIn, checkOut) => {
    expect(() => validateStay(checkIn, checkOut)).toThrow(
      expect.objectContaining({ code: 'INVALID_DATE_RANGE' }));
  });

  test('uses half-open nights and allows adjacent stays', () => {
    expect(validateStay('2028-02-28', '2028-03-01').nights)
      .toEqual(['2028-02-28', '2028-02-29']);
    expect(validateStay('2028-03-01', '2028-03-02').nights)
      .toEqual(['2028-03-01']);
  });

  test('enforces capacity and integer baht snapshots', () => {
    expect(() => validateGuestCount(3, 2)).toThrow(
      expect.objectContaining({ code: 'CAPACITY_EXCEEDED' }));
    expect(() => validateGuestCount(1.5, 2)).toThrow();
    expect(calculatePrice(1800, 2)).toEqual({ pricePerNight: 1800, totalPrice: 3600 });
    expect(() => calculatePrice(1.5, 2)).toThrow(
      expect.objectContaining({ code: 'INVALID_PRICE' }));
  });
});
