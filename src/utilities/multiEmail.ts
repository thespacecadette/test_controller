import validator from 'validator';

export default function (email_field: string): boolean {
	var email = email_field.split(',');

	for (let i = 0; i < email.length; i++) {
		if (
			!validator.isEmail(email[i] + '') ||
			email[i].trim() == '{{EMAIL}}'
		) {
			return false;
		}
	}
	return true;
}
