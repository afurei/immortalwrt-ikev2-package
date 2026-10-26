'use strict';
'require rpc';
'require ui';
'require view';

var callListEapUsers = rpc.declare({
	object: 'luci.ipsec_ikev2',
	method: 'list_eap_users',
	expect: { '': {} }
});

var callSetEapUser = rpc.declare({
	object: 'luci.ipsec_ikev2',
	method: 'set_eap_user',
	params: [ 'id', 'secret', 'enabled' ],
	expect: { '': {} }
});

var callDeleteEapUser = rpc.declare({
	object: 'luci.ipsec_ikev2',
	method: 'delete_eap_user',
	params: [ 'id' ],
	expect: { '': {} }
});

function badge(text, cls) {
	return E('span', { 'class': 'ifacebadge ' + (cls || '') }, text);
}

function input(id, value, type) {
	return E('input', {
		'id': id,
		'class': 'cbi-input-text',
		'type': type || 'text',
		'value': value || ''
	});
}

function checkbox(id, checked) {
	var attrs = {
		'id': id,
		'type': 'checkbox'
	};

	if (checked)
		attrs.checked = 'checked';

	return E('input', attrs);
}

function getValue(id) {
	var el = document.getElementById(id);
	return el ? el.value.trim() : '';
}

function setValue(id, value) {
	var el = document.getElementById(id);
	if (el)
		el.value = value;
}

function getChecked(id) {
	var el = document.getElementById(id);
	return el ? !!el.checked : false;
}

function setNode(id, node) {
	var el = document.getElementById(id);
	if (el)
		el.replaceChildren(node);
}

function notify(res, fallback) {
	var content = E('p', res.message ? _(res.message) : (res.error ? _(res.error) : fallback));

	if (res.ok)
		ui.addTimeLimitedNotification(null, content, 5000, 'info');
	else
		ui.addNotification(null, content, 'danger');
}

function actionButton(label, cb, cls) {
	return E('button', {
		'class': 'btn cbi-button ' + (cls || 'cbi-button-action'),
		'click': function(ev) {
			ev.preventDefault();
			return cb();
		}
	}, label);
}

function formRow(label, control, hint) {
	return E('div', { 'class': 'cbi-value' }, [
		E('label', { 'class': 'cbi-value-title' }, label),
		E('div', { 'class': 'cbi-value-field' }, [ control, hint ? E('div', { 'class': 'cbi-value-description' }, hint) : '' ])
	]);
}

function refreshUsers() {
	return L.resolveDefault(callListEapUsers(), {}).then(function(res) {
		setNode('eap-user-table', renderUsers(res.users || []));
	});
}

function saveUser(id, secret, enabled) {
	return L.resolveDefault(callSetEapUser(id, secret, enabled), {}).then(function(res) {
		notify(res, _('EAP user action failed.'));
		return refreshUsers().then(function() {
			return res;
		});
	});
}

function runSaveUser() {
	return saveUser(getValue('eap-id'), getValue('eap-secret'), getChecked('eap-enabled')).then(function(res) {
		if (res.ok)
			setValue('eap-secret', '');
	});
}

function deleteUser(id) {
	if (!confirm(_('Delete EAP user %s?').format(id)))
		return Promise.resolve();

	return L.resolveDefault(callDeleteEapUser(id), {}).then(function(res) {
		notify(res, _('EAP user deleted.'));
		return refreshUsers();
	});
}

function renderUsers(users) {
	var rows = [
		E('tr', { 'class': 'tr table-titles' }, [
			E('th', { 'class': 'th' }, _('Username')),
			E('th', { 'class': 'th' }, _('Enabled')),
			E('th', { 'class': 'th' }, _('Stored secret')),
			E('th', { 'class': 'th' }, _('Section')),
			E('th', { 'class': 'th' }, _('Actions'))
		])
	];

	if (!users || !users.length) {
		rows.push(E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td', 'colspan': 5 }, _('No EAP users found.'))
		]));
	} else {
		users.forEach(function(user) {
			rows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, user.id || '-'),
				E('td', { 'class': 'td' }, badge(user.enabled ? _('yes') : _('no'), user.enabled ? 'active' : 'inactive')),
				E('td', { 'class': 'td' }, badge(user.has_secret ? _('stored') : _('not set'), user.has_secret ? 'active' : 'inactive')),
				E('td', { 'class': 'td' }, user.section || '-'),
				E('td', { 'class': 'td' }, [
					actionButton(user.enabled ? _('Disable') : _('Enable'), function() {
						return saveUser(user.id, '', !user.enabled);
					}, user.enabled ? 'cbi-button-reset' : 'cbi-button-apply'),
					' ',
					actionButton(_('Delete'), function() {
						return deleteUser(user.id);
					}, 'cbi-button-remove')
				])
			]));
		});
	}

	return E('table', { 'class': 'table' }, rows);
}

return view.extend({
	load: function() {
		return L.resolveDefault(callListEapUsers(), {});
	},

	render: function(data) {
		data = data || {};

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('EAP Users')),
			E('div', { 'class': 'cbi-map-descr' }, _('Manage EAP-MSCHAPv2 username/password identities. Passwords are stored in UCI secrets and never returned to the browser.')),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('EAP User')),
				formRow(_('Username'), input('eap-id', 'user@example.net')),
				formRow(_('Password'), input('eap-secret', '', 'password'), _('Leave empty only when updating an existing user without changing the password.')),
				formRow(_('Enabled'), checkbox('eap-enabled', true)),
				E('div', { 'class': 'right' }, actionButton(_('Save EAP user'), runSaveUser, 'cbi-button-apply'))
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Configured EAP Users')),
				E('p', { 'class': 'cbi-section-descr' }, _('EAP-MSCHAPv2 identities stored as mschapv2_secrets.')),
				E('div', { 'id': 'eap-user-table' }, renderUsers(data.users || [])),
				E('div', { 'class': 'right' }, actionButton(_('Refresh'), refreshUsers))
			])
		]);
	}
});
