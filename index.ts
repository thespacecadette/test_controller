import moment from 'moment';
import validator from 'validator';
import lodash from 'lodash';
import ModelService from '../services/ModelService';

const NotificationLogs = new ModelService.Instance.create('NotificationLog');
const NotificationTemplates = new ModelService.Instance.create(
	'NotificationTemplate'
);
const CompanyAccount = new ModelService.Instance.create('CompanyAccount');
const NotificationServiceModel = new ModelService.Instance.create(
	'NotificationService'
);

/**
 * Notifications GET REST Endpoint
 * @param req
 * @param res
 */
const get = function (req: any, res: any): any {
	if (req.param('_id')) {
		var notification = req._companyAccount.company.notifications.id(
			req.param('_id')
		);
		if (!notification) {
			//return ErrorService.err({message: 'Resource not found'},
			//  ErrorService.statusCodes.STATUS_FAIL_NOT_FOUND, res);
			return RestApiService.Response.new.resp(
				404,
				'notification',
				null,
				null,
				'Not Found',
				res
			);
		}
		if (req.param('action') == 'test') {
			NotificationService._processnotification(
				{
					user: req._currentUser.email, // @TODO add alternative !!!
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
							200,
							'notification',
							notification,
							null,
							null,
							res
						);
						//return RestApiService.Response.success({notification: notification,
						//  test:testre
						//}, res);
					}
					notification.testre = response;
					if (response.statusCode)
						testre = 'http responce status: ' + response.statusCode;
					return RestApiService.Response.new.resp(
						200,
						'notification',
						notification,
						null,
						null,
						res
					);
					//return RestApiService.Response.success({notification: notification,
					//test:testre
					//}, res);
				}
			);
		} else {
			return RestApiService.Response.new.resp(
				200,
				'notification',
				notification,
				null,
				null,
				res
			);
			// return RestApiService.Response.success({notification: notification}, res);
		}
	} else {
		//          NotificationService._dispatch(req, "data tata some JSON", "transaction failure");
		return RestApiService.Response.new.resp(
			200,
			'notifications',
			req._companyAccount.company.notifications,
			{ count: req._companyAccount.company.notifications.length },
			null,
			res
		);
		// return RestApiService.Response.success({notifications: req._companyAccount.companies.notifications}, res);
	}
};

const resendNotification = function (req: any, res: any): void {
	var query = { company_id: req._companyAccount._id, _id: req.param('_id') };
	NotificationLogs.findOne(query, function (err, log) {
		if (err || !log) {
			return RestApiService.Response.new.resp(
				404,
				'notification_log',
				null,
				null,
				'Not Found',
				res
			);
			//return ErrorService.err({message: err},
			//  ErrorService.statusCodes.STATUS_FAIL_NOT_FOUND, res);
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
						400,
						'notification_log',
						null,
						null,
						{
							message: 'Invalid data provided',
							code: 'ValidationError',
							errors: 'Destination: URL is not correct',
						},
						res
					);
				if (log.type == 'email' && !multiEmail(req.body.destination))
					return RestApiService.Response.new.resp(
						400,
						'notification_log',
						null,
						null,
						{
							message: 'Invalid data provided',
							code: 'ValidationError',
							errors: 'Destination: one or more email addresses entered are invalid',
						},
						res
					);
				if (
					log.type == 'sms' &&
					!(
						req.body.destination.match(/^\+[1-9]\d{1,14}$/g) ||
						req.body.destination == '{{PHONE}}'
					)
				)
					return RestApiService.Response.new.resp(
						400,
						'notification_log',
						null,
						null,
						{
							message: 'Invalid data provided',
							code: 'ValidationError',
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
					async.waterfall(
						[_getRootId, _updateLogParentRootId, _updateRootStatus],
						function (err) {
							if (err)
								return RestApiService.Response.new.resp(
									500,
									'notification_log',
									nlog,
									null,
									'Internal error while resending notification',
									res
								);
							return RestApiService.Response.new.resp(
								200,
								'notification_log',
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
				404,
				'notification_log',
				null,
				null,
				'Not Found',
				res
			);
			//return ErrorService.err({message: err},
			//  ErrorService.statusCodes.STATUS_FAIL_NOT_FOUND, res);
		}
		log.archived = true;
		log.save(function (txErr, logm) {
			return RestApiService.Response.new.resp(
				200,
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
					404,
					'notification_log',
					null,
					null,
					'Not Found',
					res
				);
				//return ErrorService.err({message: err},
				//  ErrorService.statusCodes.STATUS_FAIL_NOT_FOUND, res);
			}
			if (log) {
				return RestApiService.Response.new.resp(
					200,
					'notification_log',
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
			query['created_at']['$gte'] = new moment(
				req.param('created_at.from')
			).toDate();
		}
		//{"created_at": {"$gte": new Date(2012, 7, 14), "$lt": new Date(2012, 7, 15)}})
		if (req.param('created_at.to')) {
			if (!query['created_at']) query['created_at'] = {};
			query['created_at']['$lte'] = new moment(
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
						200,
						'notification_logs',
						[],
						defresult,
						null,
						res
					);
					//return ErrorService.err({message: 'database query error'}, ErrorService.statusCodes.STATUS_SRV_ERROR, res);
				}
				return RestApiService.Response.new.resp(
					200,
					'notification_logs',
					result.logs,
					result,
					null,
					res
				);
				//return RestApiService.Response.success(result, res);
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
	if (req.body.type != 'webhook' && !req.body.template_id)
		return RestApiService.Response.new.resp(
			400,
			'notification',
			null,
			null,
			{
				message: 'Invalid data provided',
				code: 'ValidationError',
				errors: 'No Template Id provided',
			},
			res
		);
	if (!req.body.destination)
		return RestApiService.Response.new.resp(
			400,
			'notification',
			null,
			null,
			{
				message: 'Invalid data provided',
				code: 'ValidationError',
				errors: 'No Payload Destination provided',
			},
			res
		);
	if (!req.body.event)
		return RestApiService.Response.new.resp(
			400,
			'notification',
			null,
			null,
			{
				message: 'Invalid data provided',
				code: 'ValidationError',
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
			400,
			'notification',
			null,
			null,
			{
				message: 'Invalid data provided',
				code: 'ValidationError',
				errors: 'Not valid Notification Type: ' + req.body.type,
			},
			res
		);
	if (
		req.body.type == 'webhook' &&
		!validator.isURL(req.body.destination + '', { require_protocol: true })
	)
		return RestApiService.Response.new.resp(
			400,
			'notification',
			null,
			null,
			{
				message: 'Invalid data provided',
				code: 'ValidationError',
				errors: 'Destination: URL is not correct',
			},
			res
		);
	if (req.body.type == 'email' && !multiEmail(req.body.destination))
		return RestApiService.Response.new.resp(
			400,
			'notification',
			null,
			null,
			{
				message: 'Invalid data provided',
				code: 'ValidationError',
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
			400,
			'notification',
			null,
			null,
			{
				message: 'Invalid data provided',
				code: 'ValidationError',
				errors: 'From: is not valid email address',
			},
			res
		);
	}
	if (
		req.body.type == 'sms' &&
		!(
			req.body.destination.match(/^\+[1-9]\d{1,14}$/g) ||
			req.body.destination == '{{PHONE}}'
		)
	) {
		return RestApiService.Response.new.resp(
			400,
			'notification',
			null,
			null,
			{
				message: 'Invalid data provided',
				code: 'ValidationError',
				path: 'phone',
				errors: 'Destination: invalid phone number. Should be in international E.164 format',
			},
			res
		);
	}
	if (req.body.type == 'sms' && sails.config.disable_sms)
		return RestApiService.Response.new.resp(
			400,
			'notification',
			null,
			null,
			{
				message: 'Invalid data provided',
				code: 'ValidationError',
				errors:
					'SMS notifications not allowed in ' +
					sails.config.environment +
					' mode',
			},
			res
		);
	if (req.body.type === 'webhook') {
		function createNotification() {
			const webhookBody = lodash.pick(
				req.body,
				Object.values(CompanyAccount.notificationWebhookFields)
			);
			const notification =
				req._companyAccount.company.notifications.create(webhookBody);
			req._companyAccount.company.notifications.push(notification);
			req._companyAccount.save(function (err) {
				if (err) {
					return RestApiService.Response.new.resp(
						400,
						'notification',
						notification,
						null,
						{
							message: 'Invalid data provided',
							code: 'ValidationError',
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
					201,
					'notification',
					req._companyAccount.company.notifications[
						req._companyAccount.company.notifications.length - 1
					],
					null,
					null,
					res
				);
			});
		}
		function notificationServiceValidation(callback) {
			const { notificationServiceId, destination } =
				CompanyAccount.notificationWebhookFields;
			const webhookBody = lodash.pick(
				req.body,
				Object.values(CompanyAccount.notificationWebhookFields)
			);
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
							500,
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
		notificationServiceValidation(createNotification);
	} else {
		var query = {
			company_id: req._companyAccount._id,
			_id: req.body.template_id,
			archived: 'false',
		};
		NotificationTemplates.findOne(query, function (err, template) {
			if (err || !template) {
				return RestApiService.Response.new.resp(
					400,
					'notification',
					null,
					null,
					{
						message: 'Invalid data provided',
						code: 'ValidationError',
						errors: 'No Template with provided Id',
					},
					res
				);
			} else {
				if (req.body.event != template.notification_event)
					return RestApiService.Response.new.resp(
						400,
						'notification',
						null,
						null,
						{
							message: 'Invalid data provided',
							code: 'ValidationError',
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
							400,
							'notification',
							notification,
							null,
							{
								message: 'Invalid data provided',
								code: 'ValidationError',
								errors: err,
							},
							res
						);
						//return ErrorService.err({message: 'Invalid data provided', errors: err},
						//  ErrorService.statusCodes.STATUS_FAIL_BAD_REQUEST, res);
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
						201,
						'notification',
						req._companyAccount.company.notifications[
							req._companyAccount.company.notifications.length - 1
						],
						null,
						null,
						res
					);
					//return RestApiService.Response.success({notification: notification}, res);
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
	if (req.param('_id')) {
		var query = {
			company_id: req._companyAccount._id,
			_id: req.param('_id'),
			archived: 'false',
		};
		NotificationTemplates.findOne(
			query,
			{ __v: 0 },
			function (err, template) {
				if (err || !template) {
					return RestApiService.Response.new.resp(
						404,
						'template',
						null,
						null,
						'Not Found',
						res
					);
				} else {
					return RestApiService.Response.new.resp(
						200,
						'template',
						template,
						null,
						null,
						res
					);
					// return RestApiService.Response.success({notification: notification}, res);
				}
			}
		);
	} else {
		var query = { company_id: req._companyAccount._id, archived: false };
		//if (req.param('archived') == 'true') {
		//  query['archived'] = true;
		//}
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
			query['created_at']['$gte'] = new moment(
				req.param('created_at.from')
			).toDate();
		}
		if (req.param('created_at.to')) {
			if (!query['created_at']) query['created_at'] = {};
			query['created_at']['$lte'] = new moment(
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
		//console.log(req.params);
		var result = { count: 0, skip: skip, limit: limit, charges: [] };
		var defresult = result;
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
					return RestApiService.Response.new.resp(
						200,
						'templates',
						[],
						defresult,
						null,
						res
					);
					//return ErrorService.err({message: 'database query error'}, ErrorService.statusCodes.STATUS_SRV_ERROR, res);
				}
				return RestApiService.Response.new.resp(
					200,
					'templates',
					result.templates,
					result,
					null,
					res
				);
				//return RestApiService.Response.success(result, res);
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
				404,
				'template',
				null,
				null,
				'Not Found',
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
						500,
						'template',
						null,
						null,
						'System error',
						res
					);
				} else {
					return RestApiService.Response.new.resp(
						200,
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
				404,
				'template',
				null,
				null,
				'Not Found',
				res
			);
		} else {
			template.archived = true;
			template.save(function (err, template) {
				if (err) {
					return RestApiService.Response.new.resp(
						500,
						'template',
						null,
						null,
						'System error',
						res
					);
				} else {
					return RestApiService.Response.new.resp(
						200,
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
		lodash.hasIn(req, '_currentUser._id') &&
		!lodash.isNil(req._currentUser._id) &&
		req._currentUser._id !== ''
	)
		template.user_id = req._currentUser._id;
	if (!req.body.notification_event)
		return RestApiService.Response.new.resp(
			400,
			'notification',
			null,
			null,
			{
				message: 'Invalid data provided',
				code: 'ValidationError',
				errors: 'No Notification Event provided',
			},
			res
		);
	var notificationTemplate = new NotificationTemplates(req.body);
	notificationTemplate.save(function (err, notificationTemplate) {
		if (err) {
			return RestApiService.Response.new.resp(
				400,
				'notification',
				notificationTemplate,
				null,
				{
					message: 'Invalid data provided',
					code: 'ValidationError',
					errors: err,
				},
				res
			);
		}
		return RestApiService.Response.new.resp(
			201,
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
	if (!notification) {
		return RestApiService.Response.new.resp(
			404,
			'notification',
			null,
			null,
			'Not Found',
			res
		);
	}
	var event = notification.event;
	notification.remove();
	req._companyAccount.save(function (err) {
		if (err) {
			return RestApiService.Response.new.resp(
				404,
				'notification',
				null,
				null,
				'Not Found',
				res
			);
			//return ErrorService.err({message: 'Invalid data provided', errors: err.errors},
			//  ErrorService.statusCodes.STATUS_FAIL_BAD_REQUEST, res);
		}
		if ((event = 'card_expiration_warning')) {
			CustomerService.update_expiration_warning_flags(
				req._companyAccount,
				false,
				function (err, custs) {}
			);
		}
		return RestApiService.Response.new.resp(
			200,
			'notification',
			notification,
			null,
			null,
			res
		);
		// return RestApiService.Response.success({notification: notification,deleted:'ok'}, res);
	});
}

const getTemplateVars = function(req: any, res: any): any {
	if (req.param('event')) {
		var eVars = NotificationService.getNotificationTemplateAvailableVars(
			req.param('event')
		);
		if (eVars)
			return RestApiService.Response.new.resp(
				200,
				'variables',
				eVars,
				null,
				null,
				res
			);
		else
			return RestApiService.Response.new.resp(
				404,
				'variables',
				null,
				null,
				'Not Found',
				res
			);
	} else {
		var eVars =
			NotificationService.getNotificationTemplateAvailableVars(null);
		return RestApiService.Response.new.resp(
			200,
			'variables',
			eVars,
			null,
			null,
			res
		);
	}
}

export default {
	get,
	resendNotification,
	deleteNotificationLog,
	getLogs,
	post,
	getTemplate,
	updateTemplate,
	deleteTemplate,
	postTemplate,
	// Fixed reserved word
	delete: _delete,
	getTemplateVars,
};

function multiEmail(email_field: string): boolean {
	var email = email_field.split(',');
	for (var i = 0; i < email.length; i++) {
		if (
			!validator.isEmail(email[i] + '') &&
			email[i].trim() != '{{EMAIL}}'
		) {
			return false;
		}
	}
	return true;
}

function badRequestResponseError(error, type, res): any {
	return RestApiService.Response.new.resp(
		400,
		type,
		null,
		null,
		{
			message: 'Invalid data provided',
			code: 'ValidationError',
			errors: error,
		},
		res
	);
}
