function _processnotification(
	data: any,
	notification: any,
	id: string,
	fn: (error: string, response: any) => any
) {}

function _resendNotification(
	log: any,
	id: string,
	fn: (error: string, log: any) => any
) {}

function getNotificationTemplateAvailableVars(event: string) {}

export default {
	_processnotification,
	_resendNotification,
	getNotificationTemplateAvailableVars,
};
