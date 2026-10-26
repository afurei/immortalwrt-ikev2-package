'use strict';
'require rpc';
'require ui';
'require view';

var callListCerts = rpc.declare({
	object: 'luci.ipsec_ikev2',
	method: 'list_certs',
	expect: { '': {} }
});

var callGenerateCa = rpc.declare({
	object: 'luci.ipsec_ikev2',
	method: 'generate_ca',
	params: [ 'common_name', 'days' ],
	expect: { '': {} }
});

var callGenerateServer = rpc.declare({
	object: 'luci.ipsec_ikev2',
	method: 'generate_server_cert',
	params: [ 'identifier', 'days' ],
	expect: { '': {} }
});

var callGenerateClient = rpc.declare({
	object: 'luci.ipsec_ikev2',
	method: 'generate_client_cert',
	params: [ 'name', 'days' ],
	expect: { '': {} }
});

var callExportP12 = rpc.declare({
	object: 'luci.ipsec_ikev2',
	method: 'export_client_p12',
	params: [ 'name', 'password' ],
	expect: { '': {} }
});

function badge(text, cls) {
	return E('span', { 'class': 'ifacebadge ' + (cls || '') }, text);
}

function yesNo(v) {
	return v ? _('present') : _('missing');
}

function state(v) {
	return v ? 'active' : 'inactive';
}

function input(id, value, type, extra) {
	return E('input', Object.assign({
		'id': id,
		'class': 'cbi-input-text',
		'type': type || 'text',
		'value': value || ''
	}, extra || {}));
}

function getValue(id) {
	var el = document.getElementById(id);
	return el ? el.value.trim() : '';
}

function setValue(id, value) {
	var el = document.getElementById(id);
	if (el)
		el.value = value || '';
}

function setNode(id, node) {
	var el = document.getElementById(id);
	if (el)
		el.replaceChildren(node);
}

function setText(id, text) {
	var el = document.getElementById(id);
	if (el)
		el.textContent = text;
}

function notify(res, fallback) {
	var content = E('p', res.message ? _(res.message) : (res.error ? _(res.error) : fallback));

	if (res.ok)
		ui.addTimeLimitedNotification(null, content, 5000, 'info');
	else
		ui.addNotification(null, content, 'danger');
}

function renderCertSummary(cert) {
	cert = cert || {};

	return E('table', { 'class': 'table' }, [
		E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td' }, _('Certificate')), E('td', { 'class': 'td' }, badge(yesNo(cert.cert_exists), state(cert.cert_exists))) ]),
		E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td' }, _('Private key')), E('td', { 'class': 'td' }, badge(yesNo(cert.key_exists), state(cert.key_exists))) ]),
		E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td' }, _('Subject')), E('td', { 'class': 'td' }, cert.subject || '-') ]),
		E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td' }, _('Certificate identities')), E('td', { 'class': 'td' }, (cert.identities || []).join(', ') || '-') ]),
		E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td' }, _('Expires')), E('td', { 'class': 'td' }, cert.expires || '-') ]),
		E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td' }, _('Fingerprint')), E('td', { 'class': 'td' }, cert.fingerprint || '-') ])
	]);
}

function renderClients(clients) {
	var rows;

	clients = clients || [];
	rows = [
		E('tr', { 'class': 'tr table-titles' }, [
			E('th', { 'class': 'th' }, _('Name')),
			E('th', { 'class': 'th' }, _('Certificate')),
			E('th', { 'class': 'th' }, _('Private key')),
			E('th', { 'class': 'th' }, _('Expires')),
			E('th', { 'class': 'th' }, _('Fingerprint'))
		])
	];

	if (clients.length) {
		clients.forEach(function(client) {
			rows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, client.name || '-'),
				E('td', { 'class': 'td' }, badge(yesNo(client.cert_exists), state(client.cert_exists))),
				E('td', { 'class': 'td' }, badge(yesNo(client.key_exists), state(client.key_exists))),
				E('td', { 'class': 'td' }, client.expires || '-'),
				E('td', { 'class': 'td' }, client.fingerprint || '-')
			]));
		});
	}
	else {
		rows.push(E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td', 'colspan': 5 }, _('No client certificates found.'))
		]));
	}

	return E('table', { 'class': 'table' }, rows);
}

function refreshCerts() {
	return L.resolveDefault(callListCerts(), {}).then(function(res) {
		setNode('ca-summary', renderCertSummary(res.ca));
		setNode('server-summary', renderCertSummary(res.server));
		setNode('client-table', renderClients(res.clients));
		setValue('server-id', res.server && res.server.preferred_identifier);
	});
}

function runGenerateCa() {
	return L.resolveDefault(callGenerateCa(getValue('ca-cn'), getValue('ca-days')), {}).then(function(res) {
		notify(res, _('CA generation finished.'));
		return refreshCerts();
	});
}

function runGenerateServer() {
	return L.resolveDefault(callGenerateServer(getValue('server-id'), getValue('server-days')), {}).then(function(res) {
		notify(res, _('Server certificate generation finished.'));
		return refreshCerts();
	});
}

function runGenerateClient() {
	return L.resolveDefault(callGenerateClient(getValue('client-name'), getValue('client-days')), {}).then(function(res) {
		notify(res, _('Client certificate generation finished.'));
		return refreshCerts();
	});
}

function runExportP12() {
	return L.resolveDefault(callExportP12(getValue('client-name'), getValue('p12-password')), {}).then(function(res) {
		notify(res, _('Client p12 export finished.'));
		if (res.path)
			setText('p12-output', '%s (%s bytes)'.format(res.path, res.size || 0));
		return refreshCerts();
	});
}

function button(label, cb, cls) {
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

return view.extend({
	load: function() {
		return L.resolveDefault(callListCerts(), {});
	},

	render: function(data) {
		var serverIdentity;

		data = data || {};
		serverIdentity = data.server && data.server.preferred_identifier || '';

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Certificates')),
			E('div', { 'class': 'cbi-map-descr' }, _('Create and inspect CA, server, and client certificate material used by strongSwan. Private keys are never displayed in the browser.')),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('CA Certificate')),
					E('p', { 'class': 'cbi-section-descr' }, _('/etc/swanctl/x509ca/caCert.pem and /etc/swanctl/private/caKey.pem')),
				E('div', { 'id': 'ca-summary' }, renderCertSummary(data.ca)),
				formRow(_('Common name'), input('ca-cn', 'OpenWrt IKEv2 CA')),
				formRow(_('Lifetime days'), input('ca-days', '3650')),
				E('div', { 'class': 'right' }, button(_('Generate CA'), runGenerateCa, 'cbi-button-apply'))
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Server Certificate')),
				E('p', { 'class': 'cbi-section-descr' }, _('serverCert.pem and serverKey.pem')),
				E('div', { 'id': 'server-summary' }, renderCertSummary(data.server)),
				formRow(_('Certificate identity (SAN/CN)'), input('server-id', serverIdentity, 'text', {
					'placeholder': 'vpn.example.net',
					'maxlength': 253
				}), _('The value is embedded in the server certificate and must match the IKEv2 local identifier.')),
				formRow(_('Lifetime days'), input('server-days', '1825')),
				E('div', { 'class': 'right' }, button(_('Generate server certificate'), runGenerateServer, 'cbi-button-apply'))
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Client Certificate')),
				E('p', { 'class': 'cbi-section-descr' }, _('Generate client cert/key and export a password-protected .p12 bundle.')),
				formRow(_('Client name'), input('client-name', 'iphone-shaka'), _('Allowed characters: letters, numbers, dot, underscore, dash.')),
				formRow(_('Lifetime days'), input('client-days', '825')),
				formRow(_('Export password'), input('p12-password', '', 'password')),
				formRow(_('Last exported p12'), E('code', { 'id': 'p12-output' }, '-')),
				E('div', { 'class': 'right' }, [
					button(_('Generate client certificate'), runGenerateClient, 'cbi-button-apply'),
					' ',
					button(_('Export .p12'), runExportP12)
				])
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Client Certificates')),
					E('p', { 'class': 'cbi-section-descr' }, _('Known client identities from /etc/swanctl/x509 and /etc/swanctl/private.')),
				E('div', { 'id': 'client-table' }, renderClients(data.clients)),
				E('div', { 'class': 'right' }, button(_('Refresh'), refreshCerts))
			]),

			E('div', { 'class': 'alert-message warning' }, _('Exported .p12 bundles are written to /tmp/luci-ipsec-ikev2 with mode 0600. The password is not stored in UCI.'))
		]);
	}
});
