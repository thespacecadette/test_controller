import { pick } from 'lodash';
import ModelService from './modelService';
import RestApiService from './../services/restApiService';

import { ERRORS } from './../constants/errors';

const NotificationServiceModel = new ModelService.Instance().create(
	'NotificationService'
);
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

function badRequestResponseError(message: string, type: any, res: any) {}

function notificationServiceValidation(
	callback: any,
	res: any,
	CompanyAccount: any,
	webhookBody: any
) {
	const { notificationServiceId, destination } =
		CompanyAccount.notificationWebhookFields;
	if (!webhookBody[notificationServiceId]) return callback();
	const { protocol } = new URL(webhookBody[destination]);
	const type = 'notification_service';
	if (protocol !== 'https:') {
		return badRequestResponseError(
			'The webhook destination should be in conjunction with HTTPS to provide confidentiality.',
			type,
			res
		);
	}
	NotificationServiceModel.findOne(
		{ _id: webhookBody[notificationServiceId] },
		(err, notificationService) => {
			if (err) {
				return RestApiService.Response.new.resp(
					ERRORS.INTERNAL_ERROR.CODE,
					type,
					null,
					null,
					'Internal error while resending notification',
					res
				);
			}
			if (!notificationService) {
				return badRequestResponseError(
					'Notification Service was not found by provided id',
					type,
					res
				);
			}
			return callback(null, notificationService);
		}
	);
}

export default {
	_processnotification,
	_resendNotification,
	getNotificationTemplateAvailableVars,
	notificationServiceValidation,
};
