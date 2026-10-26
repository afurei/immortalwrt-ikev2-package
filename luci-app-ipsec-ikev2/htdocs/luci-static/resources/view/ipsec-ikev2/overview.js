'use strict';
'require poll';
'require rpc';
'require ui';
'require view';

var callStatus = rpc.declare({
	object: 'luci.ipsec_ikev2',
	method: 'status',
	expect: { '': {} }
});

var callServiceAction = rpc.declare({
	object: 'luci.ipsec_ikev2',
	method: 'service_action',
	params: [ 'action' ],
	expect: { '': {} }
});

var callGetLogs = rpc.declare({
	object: 'luci.ipsec_ikev2',
	method: 'get_logs',
	params: [ 'limit' ],
	expect: { '': {} }
});

function badge(text, cls) {
	return E('span', { 'class': 'ifacebadge ' + (cls || '') }, text);
}

function statusClass(ok) {
	return ok ? 'active' : 'inactive';
}

function card(id, title, value, state) {
	return E('div', {
		'class': 'cbi-section',
		'style': 'display:inline-block;vertical-align:top;width:23%;min-width:180px;margin-right:1%;min-height:92px'
	}, [
		E('div', { 'style': 'color:#667;font-size:12px' }, title),
		E('div', { 'id': id + '-value', 'style': 'font-size:22px;font-weight:bold;margin:6px 0' }, value),
		E('div', { 'id': id + '-state' }, state)
	]);
}

function setText(id, text) {
	var el = document.getElementById(id);
	if (el)
		el.textContent = text;
}

function setNode(id, node) {
	var el = document.getElementById(id);
	if (el)
		el.replaceChildren(node);
}

function renderMissingPackages(pkgs) {
	if (!pkgs || !pkgs.length)
		return badge(_('ready'), 'active');

	return E('span', {}, [
		badge(_('missing'), 'inactive'),
		' ',
		E('small', {}, pkgs.join(', '))
	]);
}

function configState(res) {
	if (!res.kernel_ipsec_available)
		return [ _('Kernel unavailable'), false ];
	if (!res.ca_cert_exists || !res.server_cert_exists || !res.server_key_exists)
		return [ _('Certificates missing'), false ];
	return [ _('Certificates ready'), true ];
}

function runtimeTable(res) {
	var tableRows;

	res = res || {};

	var rows = [
		[ _('swanctl package'), res.swanctl_installed ? _('Installed') : _('Missing'), res.swanctl_installed ],
		[ _('Kernel XFRM/IPsec'), res.kernel_ipsec_available ? _('Available') : _('Unavailable'), res.kernel_ipsec_available ],
		[ _('charon process'), res.charon_running ? _('Running') : _('Stopped'), res.charon_running ],
		[ _('swanctl service'), res.service_running ? _('Running') : _('Stopped'), res.service_running ],
		[ _('CA certificate'), res.ca_cert_exists ? _('Present') : _('Missing'), res.ca_cert_exists ],
		[ _('Server certificate'), res.server_cert_exists ? _('Present') : _('Missing'), res.server_cert_exists ],
		[ _('Server private key'), res.server_key_exists ? _('Present') : _('Missing'), res.server_key_exists ],
		[ _('EAP users'), String(res.eap_users || 0), null ]
	];

	tableRows = [
		E('tr', { 'class': 'tr table-titles' }, [
			E('th', { 'class': 'th' }, _('Component')),
			E('th', { 'class': 'th' }, _('Status'))
		])
	];

	rows.forEach(function(row) {
		tableRows.push(E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td' }, row[0]),
			E('td', { 'class': 'td' }, row[2] == null ? row[1] : badge(row[1], statusClass(row[2])))
		]));
	});

	return E('table', { 'class': 'table' }, tableRows);
}

function refreshStatus() {
	return L.resolveDefault(callStatus(), {}).then(function(res) {
		var packagesReady = !!res.swanctl_installed && !(res.missing_packages || []).length;
		var config = configState(res);

		setText('service-value', res.service_running ? _('Running') : _('Stopped'));
		setNode('service-state', badge(res.service_enabled ? _('enabled') : _('disabled'), statusClass(res.service_enabled)));

		setText('sa-value', '%d / %d'.format(res.ike_sas || 0, res.child_sas || 0));
		setNode('sa-state', badge(_('IKE / CHILD'), ''));

		setText('packages-value', packagesReady ? _('Ready') : _('Missing'));
		setNode('packages-state', renderMissingPackages(res.missing_packages || []));

		setText('config-value', res.config_exists ? _('Present') : _('Missing'));
		setNode('config-state', badge(config[0], statusClass(config[1])));

		setNode('status-table', runtimeTable(res));
	});
}

function refreshLogs() {
	return L.resolveDefault(callGetLogs(80), {}).then(function(res) {
		setText('ipsec-log', res.logs || _('No matching log entries.'));
	});
}

function runServiceAction(action) {
	return L.resolveDefault(callServiceAction(action), {}).then(function(res) {
		if (!res.ok)
			ui.addNotification(null, E('p', res.error ? _(res.error) : (res.output || _('Service action failed.'))), 'danger');
		else
			ui.addTimeLimitedNotification(null, E('p', _('Service action completed: %s').format(action)), 5000, 'info');

		return Promise.all([ refreshStatus(), refreshLogs() ]);
	});
}

function serviceButton(label, action, cls) {
	return E('button', {
		'class': 'btn cbi-button ' + cls,
		'click': function(ev) {
			ev.preventDefault();
			return runServiceAction(action);
		}
	}, label);
}

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(callStatus(), {}),
			L.resolveDefault(callGetLogs(80), {})
		]);
	},

	render: function(data) {
		var status = data[0] || {};
		var logs = data[1] || {};
		var packagesReady = !!status.swanctl_installed && !(status.missing_packages || []).length;
		var config = configState(status);

		poll.add(function() {
			return Promise.all([ refreshStatus(), refreshLogs() ]);
		}, 10);

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('IPsec IKEv2 Road-Warrior')),
			E('div', { 'class': 'cbi-map-descr' }, _('Monitor strongSwan swanctl, active tunnels, package readiness, and recent IPsec log output.')),

			E('div', { 'class': 'cbi-section', 'style': 'margin-bottom:18px' }, [
				serviceButton(_('Enable at boot'), 'enable', 'cbi-button-positive'),
				' ',
				serviceButton(_('Start'), 'start', 'cbi-button-apply'),
				' ',
				serviceButton(_('Restart'), 'restart', 'cbi-button-action'),
				' ',
				serviceButton(_('Reload'), 'reload', 'cbi-button-reload'),
				' ',
				serviceButton(_('Stop'), 'stop', 'cbi-button-remove'),
				' ',
				serviceButton(_('Disable at boot'), 'disable', 'cbi-button-negative')
			]),

			E('div', {}, [
				card('service', _('swanctl service'), status.service_running ? _('Running') : _('Stopped'), badge(status.service_enabled ? _('enabled') : _('disabled'), statusClass(status.service_enabled))),
				card('sa', _('IKE / CHILD SA'), '%d / %d'.format(status.ike_sas || 0, status.child_sas || 0), badge(_('IKE / CHILD'), '')),
					card('packages', _('Required packages'), packagesReady ? _('Ready') : _('Missing'), renderMissingPackages(status.missing_packages || [])),
				card('config', _('Configuration'), status.config_exists ? _('Present') : _('Missing'), badge(config[0], statusClass(config[1])))
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Component and Service Status')),
				E('div', { 'id': 'status-table' }, runtimeTable(status))
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Recent Log')),
				E('pre', {
					'id': 'ipsec-log',
					'style': 'background:#151a22;color:#d8e1ed;border-radius:4px;padding:12px;min-height:140px;white-space:pre-wrap;overflow:auto'
				}, logs.logs || _('No matching log entries.'))
			])
		]);
	}
});
