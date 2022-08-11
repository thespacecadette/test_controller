export const ResponseType = {
	NOTIFICATION: 'notification',
	NOTIFICATIONS: 'notifications',
	NOTIFICATION_LOG: 'notification_log',
};

export const ResponseMessages = {
	INVALID_DATA: 'Invalid data provided',
};

export const ResponseCodes = {
	VALIDATION_ERROR: 'ValidationError',
};

const _new = {
	resp: (
		errorCode: number,
		type: string,
		notifications: any,
		data: any,
		message: any,
		response: any
	) => {
		return {};
	},
};

export default {
	Response: {
		new: _new,
	},
};
