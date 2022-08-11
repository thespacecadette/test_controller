import * as moment from 'moment';
import validator from 'validator';
import async from 'async';
import sails from 'sails';
import { hasIn, isNil, isEmpty, pick } from 'lodash';
import ModelService from './src/services/modelService';
import multiEmail from './src/utilities/multiEmail';
import RestApiService, { ResponseType, ResponseMessages, ResponseCodes } from './src/services/restApiService';
import NotificationService from './src/services/notificationService';
import CustomerService from './src/services/customerService';

import { ERRORS } from './src/constants/errors';
import { MOBILE_VALIDATOR } from './src/utilities/validator';

const NotificationLogs = new ModelService.Instance().create('NotificationLog');
const NotificationTemplates = new ModelService.Instance().create(
	'NotificationTemplate'
);

/**
 * Notifications GET REST Endpoint
 * @param req
 * @param res
 */
const get = function (req: any, res: any): any {
	if (!isEmpty(req.param('_id'))) {
		var notification = req._companyAccount.company.notifications.id(
			req.param('_id')
		);
		if (isEmpty(notification)) {
			return RestApiService.Response.new.resp(
				ERRORS.NOT_FOUND.CODE,
				ResponseType.NOTIFICATION,
				null,
				null,
				ERRORS.NOT_FOUND.MESSAGE,
				res
			);
		}
		if (req.param('action') === 'test') {
			NotificationService._processnotification(
				{
					user: !!req._currentUser && !!req._currentUser.email ? req._currentUser.email : '', 
					notice: 'THIS IS TEST',
					testing: 'thisisfortest',
				},
				notification,
				req._companyAccount._id,
				function (err, response) {
					if (typeof notification.toObject === 'function')
						notification = notification.toObject();
					if (err) {
						notification.testre = '' + err;
						return RestApiService.Response.new.resp(
							ERRORS.OKAY.CODE,
							ResponseType.NOTIFICATION,
							notification,
							null,
							null,
							res
						);
					}
					notification.testre = response;
					return RestApiService.Response.new.resp(
						ERRORS.OKAY.CODE,
						ResponseType.NOTIFICATION,
						notification,
						null,
						null,
						res
					);
				}
			);
		} else {
			return RestApiService.Response.new.resp(
				ERRORS.OKAY.CODE,
				ResponseType.NOTIFICATION,
				notification,
				null,
				null,
				res
			);
		}
	} else {
		return RestApiService.Response.new.resp(
			ERRORS.OKAY.CODE,
			ResponseType.NOTIFICATIONS,
			req._companyAccount.company.notifications,
			{ count: req._companyAccount.company.notifications.length },
			null,
			res
		);
	}
};

const resendNotification = function (req: any, res: any): void {
	var query = { company_id: req._companyAccount._id, _id: req.param('_id') };

	NotificationLogs.findOne(query, function (err, log) {
		if (err || !log) {
			return RestApiService.Response.new.resp(
				ERRORS.NOT_FOUND.CODE,
				ResponseType.NOTIFICATION_LOG,
				null,
				null,
				ERRORS.NOT_FOUND.MESSAGE,
				res
			);
		}
		if (log) {
			if (req.body.destination) {
				if (
					log.type == 'webhook' &&
					!validator.isURL(req.body.destination + '', {
						require_protocol: true,
					})
				)
					return RestApiService.Response.new.resp(
						ERRORS.BAD_REQUEST.CODE,
						ResponseType.NOTIFICATION_LOG,
						null,
						null,
						{
							message: ResponseMessages.INVALID_DATA,
							code: ResponseCodes.VALIDATION_ERROR,
							errors: 'Destination: URL is not correct',
						},
						res
					);
				if (log.type == 'email' && !multiEmail(req.body.destination))
					return RestApiService.Response.new.resp(
						ERRORS.BAD_REQUEST.CODE,
						ResponseType.NOTIFICATION_LOG,
						null,
						null,
						{
							message: ResponseMessages.INVALID_DATA,
							code: ResponseCodes.VALIDATION_ERROR,
							errors: 'Destination: one or more email addresses entered are invalid',
						},
						res
					);
				if (
					log.type == 'sms' &&
					!(
						req.body.destination.match(MOBILE_VALIDATOR) ||
						req.body.destination == '{{PHONE}}'
					)
				)
					return RestApiService.Response.new.resp(
						ERRORS.BAD_REQUEST.CODE,
						ResponseType.NOTIFICATION_LOG,
						null,
						null,
						{
							message: ResponseMessages.INVALID_DATA,
							code: ResponseCodes.VALIDATION_ERROR,
							path: 'phone',
							errors: 'Destination: invalid phone number. Should be in international E.164 format',
						},
						res
					);
				log.destination = req.body.destination;
			}
			NotificationService._resendNotification(
				log,
				req._companyAccount._id,
				function (err, nlog) {
					// TODO: handle error: err
					async.waterfall(
						[_getRootId, _updateLogParentRootId, _updateRootStatus],
						function (err) {
							if (err)
								return RestApiService.Response.new.resp(
									ERRORS.INTERNAL_ERROR.CODE,
									ResponseType.NOTIFICATION_LOG,
									nlog,
									null,
									'Internal error while resending notification',
									res
								);
							return RestApiService.Response.new.resp(
								ERRORS.OKAY.CODE,
								ResponseType.NOTIFICATION_LOG,
								nlog,
								null,
								null,
								res
							);
						}
					);
					function _getRootId(next) {
						return next(
							null,
							log.parent_id ? log.parent_root_id || null : log.id
						);
					}
					function _updateLogParentRootId(rootId, next) {
						if (!rootId) return next(null, null);
						NotificationLogs.update(
							{ _id: nlog.id },
							{ parent_root_id: rootId },
							function (err) {
								if (err) return next(err);
								return next(null, rootId);
							}
						);
					}
					function _updateRootStatus(rootId, next) {
						if (nlog.success !== true || !rootId)
							return next(null, null);
						return NotificationLogs.update(
							{ _id: rootId },
							{ status: 'complete' },
							function (err, data) {
								if (err) return next(err);
								return next(null, rootId);
							}
						);
					}
				}
			);
		}
	});
}

const deleteNotificationLog = (req: any, res: any): void {
	var query = {
		company_id: req._companyAccount._id,
		_id: req.param('_id'),
		archived: false,
	};
	NotificationLogs.findOne(query, function (err, log) {
		if (err || !log) {
			return RestApiService.Response.new.resp(
				ERRORS.NOT_FOUND.CODE,
				ResponseType.NOTIFICATION_LOG,
				null,
				null,
				ERRORS.NOT_FOUND.MESSAGE,
				res
			);
			//return ErrorService.err({message: err},
			//  ErrorService.statusCodes.STATUS_FAIL_NOT_FOUND, res);
		}
		log.archived = true;
		log.save(function (txErr, logm) {
			return RestApiService.Response.new.resp(
				ERRORS.OKAY.CODE,
				'charge',
				logm,
				null,
				null,
				res
			);
		});
	});
}

const getLogs = function (req: any, res: any): void {
	var SKIP = 0;
	var LIMIT = 100;
	if (isNaN(req.query.limit)) req.query.limit = null;
	if (isNaN(req.query.skip)) req.query.skip = null;
	var limit = Number(req.query.limit || LIMIT);
	var skip = Number(req.query.skip || SKIP);
	if (limit > 1000) limit = 1000;
	var proj = {
		company_id: false,
		__v: false,
	};

	if (req.param('_id')) {
		var query = {
			company_id: req._companyAccount._id,
			_id: req.param('_id'),
		};
		NotificationLogs.findOne(query, proj, function (err, log) {
			if (err || !log) {
				return RestApiService.Response.new.resp(
					ERRORS.NOT_FOUND.CODE,
					ResponseType.NOTIFICATION_LOG,
					null,
					null,
					ERRORS.NOT_FOUND.MESSAGE,
					res
				);
				//return ErrorService.err({message: err},
				//  ErrorService.statusCodes.STATUS_FAIL_NOT_FOUND, res);
			}
			if (log) {
				return RestApiService.Response.new.resp(
					ERRORS.OKAY.CODE,
					ResponseType.NOTIFICATION_LOG,
					log,
					null,
					null,
					res
				);
			}
		});
	} else {
		var query = { company_id: req._companyAccount._id, archived: false };

		if (req.param('archived') == 'true') {
			query['archived'] = true;
		}
		if (req.param('success') == 'true') {
			query['success'] = true;
		}
		if (req.param('success') == 'false') {
			query['success'] = false;
		}
		if (req.param('parent_id')) {
			query['parent_id'] = req.param('parent_id');
		}
		if (req.param('event')) {
			query['event'] = req.param('event');
		}
		if (req.param('type')) {
			query['type'] = req.param('type');
		}
		if (req.param('relation_id')) {
			query['_object_id'] = req.param('relation_id');
		}
		if (req.param('created_at.from')) {
			query['created_at'] = {};
			query['created_at']['$gte'] = moment(
				req.param('created_at.from')
			).toDate();
		}
		if (req.param('created_at.to')) {
			if (!query['created_at']) query['created_at'] = {};
			query['created_at']['$lte'] = moment(
				req.param('created_at.to')
			).toDate();
		}
		var sort = { created_at: -1 };
		if (req.param('sortkey')) {
			var sortkey = req.param('sortkey');
			sort = {};
			sort[sortkey] = 1;
			if (req.param('sortdirection') == 'DESC') {
				sort[sortkey] = -1;
			}
		}
		var result = { count: 0, skip: skip, limit: limit, logs: [] };
		var defresult = result;
		async.waterfall(
			[
				function (callback) {
					NotificationLogs.count(query, callback);
				},
				function (count, callback) {
					result.count = count;
					var opts = { limit: limit, skip: skip, sort: sort };
					if (limit == 0) return callback(null, null);
					NotificationLogs.find(query, proj, opts, callback);
				},
				function (subs, callback) {
					if (subs) {
						result.logs = subs;
					}
					callback(null, result);
				},
			],
			function (err, result) {
				if (err) {
					return RestApiService.Response.new.resp(
						ERRORS.OKAY.CODE,
						'notification_logs',
						[],
						defresult,
						null,
						res
					);
				}

				return RestApiService.Response.new.resp(
					ERRORS.OKAY.CODE,
					'notification_logs',
					result.logs,
					result,
					null,
					res
				);
			}
		);
	}
}

/**
 * Notifications POST REST Endpoint
 * @param req
 * @param res
 */
const post = function (req: any, res: any): any {
	// TODO: All of the below can be refactored into one return function with a switch statement for req.body.type for readability
	if (req.body.type != 'webhook' && !req.body.template_id)
		return RestApiService.Response.new.resp(
			ERRORS.BAD_REQUEST.CODE,
			ResponseType.NOTIFICATION,
			null,
			null,
			{
				message: ResponseMessages.INVALID_DATA,
				code: ResponseCodes.VALIDATION_ERROR,
				errors: 'No Template Id provided',
			},
			res
		);
	if (!req.body.destination)
		return RestApiService.Response.new.resp(
			ERRORS.BAD_REQUEST.CODE,
			ResponseType.NOTIFICATION,
			null,
			null,
			{
				message: ResponseMessages.INVALID_DATA,
				code: ResponseCodes.VALIDATION_ERROR,
				errors: 'No Payload Destination provided',
			},
			res
		);
	if (!req.body.event)
		return RestApiService.Response.new.resp(
			ERRORS.BAD_REQUEST.CODE,
			ResponseType.NOTIFICATION,
			null,
			null,
			{
				message: ResponseMessages.INVALID_DATA,
				code: ResponseCodes.VALIDATION_ERROR,
				errors: 'No Notification Event provided',
			},
			res
		);
	if (
		req.body.type != 'webhook' &&
		req.body.type != 'email' &&
		req.body.type != 'sms'
	)
		return RestApiService.Response.new.resp(
			ERRORS.BAD_REQUEST.CODE,
			ResponseType.NOTIFICATION,
			null,
			null,
			{
				message: ResponseMessages.INVALID_DATA,
				code: ResponseCodes.VALIDATION_ERROR,
				errors: 'Not valid Notification Type: ' + req.body.type,
			},
			res
		);
	if (
		req.body.type == 'webhook' &&
		!validator.isURL(req.body.destination + '', { require_protocol: true })
	)
		return RestApiService.Response.new.resp(
			ERRORS.BAD_REQUEST.CODE,
			ResponseType.NOTIFICATION,
			null,
			null,
			{
				message: ResponseMessages.INVALID_DATA,
				code: ResponseCodes.VALIDATION_ERROR,
				errors: 'Destination: URL is not correct',
			},
			res
		);
	if (req.body.type == 'email' && !multiEmail(req.body.destination))
		return RestApiService.Response.new.resp(
			ERRORS.BAD_REQUEST.CODE,
			ResponseType.NOTIFICATION,
			null,
			null,
			{
				message: ResponseMessages.INVALID_DATA,
				code: ResponseCodes.VALIDATION_ERROR,
				errors: 'Destination: one or more email addresses entered are invalid',
			},
			res
		);
	if (
		req.body.type == 'email' &&
		req.body.from &&
		!validator.isEmail(req.body.from + '')
	) {
		return RestApiService.Response.new.resp(
			ERRORS.BAD_REQUEST.CODE,
			ResponseType.NOTIFICATION,
			null,
			null,
			{
				message: ResponseMessages.INVALID_DATA,
				code: ResponseCodes.VALIDATION_ERROR,
				errors: 'From: is not valid email address',
			},
			res
		);
	}
	if (
		req.body.type == 'sms' &&
		!(
			req.body.destination.match(MOBILE_VALIDATOR) ||
			req.body.destination == '{{PHONE}}'
		)
	) {
		return RestApiService.Response.new.resp(
			ERRORS.BAD_REQUEST.CODE,
			ResponseType.NOTIFICATION,
			null,
			null,
			{
				message: ResponseMessages.INVALID_DATA,
				code: ResponseCodes.VALIDATION_ERROR,
				path: 'phone',
				errors: 'Destination: invalid phone number. Should be in international E.164 format',
			},
			res
		);
	}
	if (req.body.type == 'sms' && sails.config.disable_sms)
		return RestApiService.Response.new.resp(
			ERRORS.BAD_REQUEST.CODE,
			ResponseType.NOTIFICATION,
			null,
			null,
			{
				message: ResponseMessages.INVALID_DATA,
				code: ResponseCodes.VALIDATION_ERROR,
				errors:
					'SMS notifications not allowed in ' +
					sails.config.environment +
					' mode',
			},
			res
		);
	if (req.body.type === 'webhook') {
		const hooks: string[] = Object.values(CompanyAccount.notificationWebhookFields)
		const webhookBody = pick(
			req.body,
			hooks
		);

		NotificationService.notificationServiceValidation(() => {
			const notification =
				req._companyAccount.company.notifications.create(webhookBody);
			req._companyAccount.company.notifications.push(notification);
			req._companyAccount.save(function (err) {
				if (err) {
					return RestApiService.Response.new.resp(
						ERRORS.BAD_REQUEST.CODE,
						ResponseType.NOTIFICATION,
						notification,
						null,
						{
							message: ResponseMessages.INVALID_DATA,
							code: ResponseCodes.VALIDATION_ERROR,
							errors: err,
						},
						res
					);
				}

				if (req.body.event === 'card_expiration_warning') {
					CustomerService.update_expiration_warning_flags(
						req._companyAccount,
						true,
						function (err, custs) {}
					);
				}

				return RestApiService.Response.new.resp(
					ERRORS.CREATED.CODE,
					ResponseType.NOTIFICATION,
					req._companyAccount.company.notifications[
						req._companyAccount.company.notifications.length - 1
					],
					null,
					null,
					res
				);
			});
		}, res, CompanyAccount, webhookBody);
	} else {
		var query = {
			company_id: req._companyAccount._id,
			_id: req.body.template_id,
			archived: 'false',
		};
		NotificationTemplates.findOne(query, function (err, template) {
			if (err || !template) {
				return RestApiService.Response.new.resp(
					ERRORS.BAD_REQUEST.CODE,
					ResponseType.NOTIFICATION,
					null,
					null,
					{
						message: ResponseMessages.INVALID_DATA,
						code: ResponseCodes.VALIDATION_ERROR,
						errors: 'No Template with provided Id',
					},
					res
				);
			} else {
				if (req.body.event != template.notification_event)
					return RestApiService.Response.new.resp(
						ERRORS.BAD_REQUEST.CODE,
						ResponseType.NOTIFICATION,
						null,
						null,
						{
							message: ResponseMessages.INVALID_DATA,
							code: ResponseCodes.VALIDATION_ERROR,
							errors: 'Template Notification Event mismatch',
						},
						res
					);
				var notBody = req.body;
				notBody.template_id = template._id;
				var notification =
					req._companyAccount.company.notifications.create(notBody);
				req._companyAccount.company.notifications.push(notification);
				req._companyAccount.save(function (err, company) {
					if (err) {
						return RestApiService.Response.new.resp(
							ERRORS.BAD_REQUEST.CODE,
							ResponseType.NOTIFICATION,
							notification,
							null,
							{
								message: ResponseMessages.INVALID_DATA,
								code: ResponseCodes.VALIDATION_ERROR,
								errors: err,
							},
							res
						);
					}
					if ((req.body.event = 'card_expiration_warning')) {
						CustomerService.update_expiration_warning_flags(
							req._companyAccount,
							true,
							function (err, custs) {}
						);
					}
					// finally, we're good to go by now
					return RestApiService.Response.new.resp(
						ERRORS.CREATED.CODE,
						ResponseType.NOTIFICATION,
						req._companyAccount.company.notifications[
							req._companyAccount.company.notifications.length - 1
						],
						null,
						null,
						res
					);
				});
			}
		});
	}
}

const getTemplate = function(req: any, res: any): void {
	var SKIP = 0;
	var LIMIT = 100;
	if (isNaN(req.query.limit)) req.query.limit = null;
	if (isNaN(req.query.skip)) req.query.skip = null;
	var limit = Number(req.query.limit || LIMIT);
	var skip = Number(req.query.skip || SKIP);
	if (limit > 1000) limit = 1000;

	const _id = req.param('_id')
	// I fixed archived to be a boolean, as it was a string false in previous code
	var query: any = { company_id: req._companyAccount._id, archived: false };
	
	if (!isEmpty(_id)) {
		query._id = _id 

		NotificationTemplates.findOne(
			query,
			{ __v: 0 },
			function (err, template) {
				if (err || !template) {
					return RestApiService.Response.new.resp(
						ERRORS.NOT_FOUND.CODE,
						'template',
						null,
						null,
						ERRORS.NOT_FOUND.MESSAGE,
						res
					);
				} else {
					return RestApiService.Response.new.resp(
						ERRORS.OKAY.CODE,
						'template',
						template,
						null,
						null,
						res
					);
				}
			}
		);
	} else {
		var proj = {
			company_id: false,
			__v: false,
			user_id: false,
		};
		if (req.param('notification_event'))
			query.notification_event = req.param('notification_event');
		if (req.param('html') == 'true') query.html = true;
		if (req.param('html') == 'false') query.html = { $ne: true };
		if (req.param('created_at.from')) {
			query['created_at'] = {};
			query['created_at']['$gte'] = moment(
				req.param('created_at.from')
			).toDate();
		}
		if (req.param('created_at.to')) {
			if (!query['created_at']) query['created_at'] = {};
			query['created_at']['$lte'] = moment(
				req.param('created_at.to')
			).toDate();
		}
		var sort = { created_at: -1 };
		if (req.param('sortkey')) {
			var sortkey = req.param('sortkey');
			sort = {};
			sort[sortkey] = 1;
			if (req.param('sortdirection') == 'DESC') {
				sort[sortkey] = -1;
			}
		}

		var result: any = { count: 0, skip: skip, limit: limit, charges: [] };
		var defresult = result;
		// TODO: The below code can be abstracted into a simpler function.
		// e.g. async(callbacks[], errorCallback)
		async.waterfall(
			[
				function (callback) {
					NotificationTemplates.count(query, callback);
				},
				function (count, callback) {
					result.count = count;
					var opts = { limit: limit, skip: skip, sort: sort };
					if (limit == 0) return callback(null, null);
					NotificationTemplates.find(query, proj, opts, callback);
				},
				function (subs, callback) {
					if (subs) {
						result.templates = subs;
					}
					callback(null, result);
				},
			],
			function (err, result) {
				if (err) {
					// FIXME: Flagging that an error results in a 200 response (possibly on purpose, but not clear in code why). 
					return RestApiService.Response.new.resp(
						ERRORS.OKAY.CODE,
						'templates',
						[],
						defresult,
						null,
						res
					);
				}
				return RestApiService.Response.new.resp(
					ERRORS.OKAY.CODE,
					'templates',
					result.templates,
					result,
					null,
					res
				);
			}
		);
	}
}

const updateTemplate = function(req: any, res: any): void {
	var query = {
		company_id: req._companyAccount._id,
		_id: req.param('_id'),
		archived: 'false',
	};
	NotificationTemplates.findOne(query, { __v: 0 }, function (err, template) {
		if (err || !template) {
			return RestApiService.Response.new.resp(
				ERRORS.NOT_FOUND.CODE,
				'template',
				null,
				null,
				ERRORS.NOT_FOUND.MESSAGE,
				res
			);
		} else {
			var tempupdates = req.body;
			if (tempupdates.body && tempupdates.body != template.body)
				template.body = tempupdates.body;
			if (tempupdates.label && tempupdates.label != template.label)
				template.label = tempupdates.label;
			if (
				(tempupdates.html === true || tempupdates.html === false) &&
				template.html != tempupdates.html
			)
				template.html = tempupdates.html;
			if (
				tempupdates.notification_event &&
				tempupdates.notification_event != template.notification_event
			)
				template.notification_event = tempupdates.notification_event;
			template.save(function (err, template) {
				if (err) {
					return RestApiService.Response.new.resp(
						ERRORS.INTERNAL_ERROR.CODE,
						'template',
						null,
						null,
						'System error',
						res
					);
				} else {
					return RestApiService.Response.new.resp(
						ERRORS.OKAY.CODE,
						'template',
						template,
						null,
						null,
						res
					);
				}
			});
		}
	});
}

const deleteTemplate = function(req: any, res: any): void {
	var query = {
		company_id: req._companyAccount._id,
		_id: req.param('_id'),
		archived: 'false',
	};
	NotificationTemplates.findOne(query, { __v: 0 }, function (err, template) {
		if (err || !template) {
			return RestApiService.Response.new.resp(
				ERRORS.NOT_FOUND.CODE,
				'template',
				null,
				null,
				ERRORS.NOT_FOUND.MESSAGE,
				res
			);
		} else {
			template.archived = true;
			template.save(function (err, template) {
				if (err) {
					return RestApiService.Response.new.resp(
						ERRORS.INTERNAL_ERROR.CODE,
						'template',
						null,
						null,
						'System error',
						res
					);
				} else {
					return RestApiService.Response.new.resp(
						ERRORS.OKAY.CODE,
						'template',
						template,
						null,
						null,
						res
					);
				}
			});
		}
	});
}

/**
 * Notifications Template POST REST Endpoint
 * @param req
 * @param res
 */
const postTemplate = function(req: any, res: any): any {
	var template = req.body;
	delete template.archived,
		template.created_at,
		template.company_id,
		template.user_id,
		template.updated_at;
	template.company_id = req._companyAccount._id;
	if (
		hasIn(req, '_currentUser._id') &&
		!isNil(req._currentUser._id) &&
		req._currentUser._id !== ''
	)
		template.user_id = req._currentUser._id;
	if (!req.body.notification_event)
		return RestApiService.Response.new.resp(
			ERRORS.BAD_REQUEST.CODE,
			ResponseType.NOTIFICATION,
			null,
			null,
			{
				message: ResponseMessages.INVALID_DATA,
				code: ResponseCodes.VALIDATION_ERROR,
				errors: 'No Notification Event provided',
			},
			res
		);
	var notificationTemplate = new NotificationTemplates(req.body);
	notificationTemplate.save(function (err, notificationTemplate) {
		if (err) {
			return RestApiService.Response.new.resp(
				ERRORS.BAD_REQUEST.CODE,
				ResponseType.NOTIFICATION,
				notificationTemplate,
				null,
				{
					message: ResponseMessages.INVALID_DATA,
					code: ResponseCodes.VALIDATION_ERROR,
					errors: err,
				},
				res
			);
		}
		return RestApiService.Response.new.resp(
			ERRORS.CREATED.CODE,
			'template',
			notificationTemplate,
			null,
			null,
			res
		);
	});
}

/**
 * Notifications DELETE REST Endpoint
 * @param req
 * @param res
 */

const _delete = function(req: any, res: any): any {
	var notification = req._companyAccount.company.notifications.id(
		req.param('_id')
	);
	if (isEmpty(notification)) {
		return RestApiService.Response.new.resp(
			ERRORS.NOT_FOUND.CODE,
			ResponseType.NOTIFICATION,
			null,
			null,
			ERRORS.NOT_FOUND.MESSAGE,
			res
		);
	}

	var event = notification.event;
	notification.remove();
	req._companyAccount.save(function (err) {
		if (err) {
			return RestApiService.Response.new.resp(
				ERRORS.NOT_FOUND.CODE,
				ResponseType.NOTIFICATION,
				null,
				null,
				ERRORS.NOT_FOUND.MESSAGE,
				res
			);
		}
		if ((event === 'card_expiration_warning')) {
			CustomerService.update_expiration_warning_flags(
				req._companyAccount,
				false,
				function (err, custs) {
					// TODO: handle
				}
			);
		}
		return RestApiService.Response.new.resp(
			ERRORS.OKAY.CODE,
			ResponseType.NOTIFICATION,
			notification,
			null,
			null,
			res
		);
	});
}

const getTemplateVars = function(req: any, res: any): any {
	if (!isEmpty(req.param('event'))) {
		var eVars = NotificationService.getNotificationTemplateAvailableVars(
			req.param('event')
		);
		if (!isEmpty(eVars))
			return RestApiService.Response.new.resp(
				ERRORS.OKAY.CODE,
				'variables',
				eVars,
				null,
				null,
				res
			);
		else
			return RestApiService.Response.new.resp(
				ERRORS.NOT_FOUND.CODE,
				'variables',
				null,
				null,
				ERRORS.NOT_FOUND.MESSAGE,
				res
			);
	} else {
		var eVars =
			NotificationService.getNotificationTemplateAvailableVars(null);
		return RestApiService.Response.new.resp(
			ERRORS.OKAY.CODE,
			'variables',
			eVars,
			null,
			null,
			res
		);
	}
}

const badRequestResponseError = function(error, type, res): any {
	return RestApiService.Response.new.resp(
		ERRORS.BAD_REQUEST.CODE,
		type,
		null,
		null,
		{
			message: ResponseMessages.INVALID_DATA,
			code: ResponseCodes.VALIDATION_ERROR,
			errors: error,
		},
		res
	);
}

export default {
    badRequestResponseError,
	// Fixed reserved word
	delete: _delete,
	deleteNotificationLog,
	deleteTemplate,
	get,
	getLogs,
	getTemplate,
	getTemplateVars,
    multiEmail,
	resendNotification,
	post,
	postTemplate,
	updateTemplate,
};
