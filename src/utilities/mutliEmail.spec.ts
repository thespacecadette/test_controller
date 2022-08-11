import multiEmail from './multiEmail';

describe('multiEmail', () => {
	it('should invalidate emails that equal {{EMAIL}}', () => {
		const test = '{{EMAIL}}';
		const result = multiEmail(test);

		expect(result).toBe(false);
	});

	it('should invalidate emails that arent in email format', () => {
		const test = 'test.test';
		const result = multiEmail(test);

		expect(result).toBe(false);
	});

	it('should validate emails that are valid', () => {
		const test = 'test.test@test.com';
		const result = multiEmail(test);

		expect(result).toBe(true);
	});
});
