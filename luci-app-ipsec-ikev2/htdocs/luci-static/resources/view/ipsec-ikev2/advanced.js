'use strict';
'require rpc';
'require ui';
'require view';

var callSyncFirewall = rpc.declare({
	object: 'luci.ipsec_ikev2',
	method: 'sync_firewall',
	params: [ 'apply', 'internet_access', 'include_ah' ],
	expect: { '': {} }
});

var callValidateConfig = rpc.declare({
	object: 'luci.ipsec_ikev2',
	method: 'validate_config',
	expect: { '': {} }
});

var ITEM_LABELS = {
	'firewall zone vpn': _('VPN firewall zone'),
	'VPN uplink interface': _('VPN uplink interface'),
	'VPN uplink firewall zone': _('VPN uplink firewall zone'),
	'firewall commit': _('Firewall configuration commit'),
	'firewall reload': _('Firewall service reload'),
	'vpn egress masquerade': _('VPN egress masquerade'),
	'vpn egress masquerade source': _('VPN egress masquerade source'),
	'Allow-IKEv2-ISAKMP': _('Allow IKEv2 ISAKMP'),
	'Allow-IKEv2-ISAKMP src': _('Allow IKEv2 ISAKMP source zone'),
	'Allow-IKEv2-ISAKMP proto': _('Allow IKEv2 ISAKMP protocol'),
	'Allow-IKEv2-ISAKMP port': _('Allow IKEv2 ISAKMP port'),
	'Allow-IKEv2-ISAKMP target': _('Allow IKEv2 ISAKMP action'),
	'Allow-IKEv2-NAT-T': _('Allow IKEv2 NAT-T'),
	'Allow-IKEv2-NAT-T src': _('Allow IKEv2 NAT-T source zone'),
	'Allow-IKEv2-NAT-T proto': _('Allow IKEv2 NAT-T protocol'),
	'Allow-IKEv2-NAT-T port': _('Allow IKEv2 NAT-T port'),
	'Allow-IKEv2-NAT-T target': _('Allow IKEv2 NAT-T action'),
	'Allow-IKEv2-ESP': _('Allow IKEv2 ESP'),
	'Allow-IKEv2-ESP src': _('Allow IKEv2 ESP source zone'),
	'Allow-IKEv2-ESP proto': _('Allow IKEv2 ESP protocol'),
	'Allow-IKEv2-ESP target': _('Allow IKEv2 ESP action'),
	'Allow-IKEv2-AH': _('Allow IKEv2 AH'),
	'Allow-IKEv2-AH src': _('Allow IKEv2 AH source zone'),
	'Allow-IKEv2-AH proto': _('Allow IKEv2 AH protocol'),
	'Allow-IKEv2-AH target': _('Allow IKEv2 AH action')
};

var CHECK_LABELS = {
	'config_exists': _('IPsec config file'),
	'uci_available': _('uci command'),
	'pki_available': _('pki command'),
	'kernel_ipsec': _('Kernel XFRM/IPsec'),
	'xfrm_proto': _('netifd XFRM protocol'),
	'remote_rw_pubkey': _('Certificate remote profile'),
	'remote_rw_eap': _('EAP remote profile'),
	'ike_proposal': _('IKE proposal'),
	'child_tunnel': _('Child tunnel'),
	'esp_proposal': _('ESP proposal'),
	'address_pool': _('Address pool'),
	'eap_user_secrets': _('EAP user secrets'),
	'server_credentials': _('Server credentials'),
	'uplink_interface': _('VPN uplink interface'),
	'uplink_firewall_zone': _('VPN uplink firewall zone'),
	'xfrm_tunlink_match': _('XFRM tunnel link'),
	'xfrm_zone_match': _('XFRM firewall zone'),
	'xfrm_ifid_match': _('XFRM interface ID match'),
	'legacy_ipsec_disabled': _('Legacy IPsec service disabled')
};

var CHECK_MESSAGES = {
	'configured uplink interface exists': _('configured uplink interface exists'),
	'configured uplink interface is missing or invalid': _('configured uplink interface is missing or invalid'),
	'firewall zone for configured uplink exists': _('firewall zone for configured uplink exists'),
	'firewall zone for configured uplink is missing': _('firewall zone for configured uplink is missing'),
	'network.vpn.tunlink matches configured uplink interface': _('network.vpn.tunlink matches configured uplink interface'),
	'network.vpn.tunlink does not match configured uplink interface': _('network.vpn.tunlink does not match configured uplink interface'),
	'network.vpn.zone matches configured VPN firewall zone': _('network.vpn.zone matches configured VPN firewall zone'),
	'network.vpn.zone does not match configured VPN firewall zone': _('network.vpn.zone does not match configured VPN firewall zone')
};

var ITEM_MESSAGES = {
	'No configured uplink interface exists': _('No configured uplink interface exists'),
	'No firewall zone contains the configured uplink network': _('No firewall zone contains the configured uplink network'),
	'No VPN firewall zone is configured': _('No VPN firewall zone is configured'),
	'VPN and uplink firewall zones must be different': _('VPN and uplink firewall zones must be different'),
	'Existing firewall settings conflict with the configured values': _('Existing firewall settings conflict with the configured values'),
	'Failed to commit firewall configuration': _('Failed to commit firewall configuration'),
	'Failed to reload firewall service': _('Failed to reload firewall service'),
	'Firewall service reloaded': _('Firewall service reloaded')
};

function badge(text, cls) {
	return E('span', { 'class': 'ifacebadge ' + (cls || '') }, text);
}

function stateClass(state) {
	if (state == 'ok')
		return 'active';
	if (state == 'added')
		return 'active';
	if (state == 'missing')
		return 'inactive';
	if (state == 'conflict')
		return 'warning';
	return '';
}

function translateItemName(name) {
	var match;

	if ((match = (name || '').match(/^firewall zone (.+)$/)))
		return _('Firewall zone %s').format(match[1]);
	if ((match = (name || '').match(/^forwarding (.+) to (.+)$/)))
		return _('Forwarding %s to %s').format(match[1], match[2]);
	if ((match = (name || '').match(/^(.+) zone (input|output|forward)$/)))
		return _('%s zone %s').format(match[1], _(match[2]));
	if ((match = (name || '').match(/^(.+) zone network (.+)$/)))
		return _('%s zone network %s').format(match[1], match[2]);

	return ITEM_LABELS[name] || name || '-';
}

function translateCheckName(name) {
	return CHECK_LABELS[name] || name || '-';
}

function translateCheckMessage(message) {
	if (!message)
		return '-';

	return CHECK_MESSAGES[message] || _(message);
}

function translateItemMessage(message) {
	var match;

	if (!message)
		return '-';
	if (ITEM_MESSAGES[message])
		return ITEM_MESSAGES[message];
	if ((match = message.match(/^Created (.+) zone$/)))
		return _('Created firewall zone %s').format(match[1]);
	if ((match = message.match(/^(.+) zone is missing$/)))
		return _('Firewall zone %s is missing').format(match[1]);
	if ((match = message.match(/^(.+) zone exists$/)))
		return _('Firewall zone %s exists').format(match[1]);

	if ((match = message.match(/^Created firewall rule (.+)$/)))
		return _('Created firewall rule %s').format(match[1]);
	if ((match = message.match(/^Created (.+) to (.+) forwarding$/)))
		return _('Created %s to %s forwarding').format(match[1], match[2]);
	if ((match = message.match(/^(.+) to (.+) forwarding is missing$/)))
		return _('%s to %s forwarding is missing').format(match[1], match[2]);
	if ((match = message.match(/^(.+) to (.+) forwarding exists$/)))
		return _('%s to %s forwarding exists').format(match[1], match[2]);
	if ((match = message.match(/^Created (.+)$/)))
		return _('Created %s').format(match[1]);
	if ((match = message.match(/^(.+) is missing$/)))
		return _('%s is missing').format(match[1]);
	if ((match = message.match(/^(.+) is missing or invalid$/)))
		return _('%s is missing or invalid').format(match[1]);
	if ((match = message.match(/^(.+) exists with type (.+)$/)))
		return _('%s exists with type %s').format(match[1], match[2]);
	if ((match = message.match(/^(.+) exists$/)))
		return _('%s exists').format(match[1]);
	if ((match = message.match(/^(.+) is (.+), expected (.+)$/)))
		return _('%s is %s, expected %s').format(match[1], match[2], match[3]);
	if ((match = message.match(/^Set (.+) to (.+)$/)))
		return _('Set %s to %s').format(match[1], match[2]);
	if ((match = message.match(/^(.+) contains (.+)$/)))
		return _('%s contains %s').format(match[1], match[2]);
	if ((match = message.match(/^Added (.+) to (.+)$/)))
		return _('Added %s to %s').format(match[1], match[2]);
	if ((match = message.match(/^(.+) does not contain (.+)$/)))
		return _('%s does not contain %s').format(match[1], match[2]);
	if ((match = message.match(/^(.+) is (.+)$/)))
		return _('%s is %s').format(match[1], match[2]);

	return _(message);
}

function renderItems(items) {
	var rows;

	items = items || [];
	rows = [
		E('tr', { 'class': 'tr table-titles' }, [
			E('th', { 'class': 'th' }, _('Item')),
			E('th', { 'class': 'th' }, _('State')),
			E('th', { 'class': 'th' }, _('Message'))
		])
	];

	if (items.length) {
		items.forEach(function(item) {
			rows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, translateItemName(item.name)),
				E('td', { 'class': 'td' }, badge(item.state ? _(item.state) : '-', stateClass(item.state))),
				E('td', { 'class': 'td' }, translateItemMessage(item.message))
			]));
		});
	}
	else {
		rows.push(E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td', 'colspan': 3 }, _('No data loaded yet.'))
		]));
	}

	return E('table', { 'class': 'table' }, rows);
}

function renderValidation(checks) {
	var rows;

	checks = checks || [];
	rows = [
		E('tr', { 'class': 'tr table-titles' }, [
			E('th', { 'class': 'th' }, _('Check')),
			E('th', { 'class': 'th' }, _('State')),
			E('th', { 'class': 'th' }, _('Message'))
		])
	];

	if (checks.length) {
		checks.forEach(function(check) {
			rows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, translateCheckName(check.name)),
				E('td', { 'class': 'td' }, badge(check.ok ? _('ok') : _('review'), check.ok ? 'active' : 'inactive')),
				E('td', { 'class': 'td' }, translateCheckMessage(check.message))
			]));
		});
	}
	else {
		rows.push(E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td', 'colspan': 3 }, _('No validation data loaded yet.'))
		]));
	}

	return E('table', { 'class': 'table' }, rows);
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

function readFlag(id) {
	var el = document.getElementById(id);
	return !!(el && el.checked);
}

function previewFirewall() {
	return L.resolveDefault(callSyncFirewall(false, readFlag('internet-access'), readFlag('include-ah')), {}).then(function(res) {
		setNode('firewall-sync-table', renderItems(res.items));
		setText('firewall-sync-summary', res.ok ? _('Firewall preview loaded.') : (res.error ? _(res.error) : _('Firewall preview failed.')));
	});
}

function applyFirewall() {
	return L.resolveDefault(callSyncFirewall(true, readFlag('internet-access'), readFlag('include-ah')), {}).then(function(res) {
		setNode('firewall-sync-table', renderItems(res.items));
		setText('firewall-sync-summary', res.ok ? _('Firewall rules synchronized.') : (res.error ? _(res.error) : _('Firewall sync failed.')));
		if (res.ok)
			ui.addTimeLimitedNotification(null, E('p', _('Firewall rules synchronized.')), 5000, 'info');
		else
			ui.addNotification(null, E('p', res.error ? _(res.error) : _('Firewall sync failed.')), 'danger');
		return validate();
	});
}

function validate() {
	return L.resolveDefault(callValidateConfig(), {}).then(function(res) {
		setNode('validation-table', renderValidation(res.checks));
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

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(callSyncFirewall(false, true, false), {}),
			L.resolveDefault(callValidateConfig(), {})
		]);
	},

	render: function(data) {
		var firewall = data[0] || {};
		var validation = data[1] || {};

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Firewall and Diagnostics')),
			E('div', { 'class': 'cbi-map-descr' }, _('Preview and apply firewall rules derived from the configured uplink and VPN gateway settings.')),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Firewall Sync')),
				E('p', { 'class': 'cbi-section-descr', 'id': 'firewall-sync-summary' }, _('Rules are matched by zone and rule name, never blindly overwritten.')),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Options')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('label', {}, [ E('input', { 'type': 'checkbox', 'id': 'internet-access', 'checked': 'checked' }), ' ', _('Allow VPN clients to access the selected uplink zone') ]),
						E('br'),
						E('label', {}, [ E('input', { 'type': 'checkbox', 'id': 'include-ah' }), ' ', _('Also create optional AH rule') ])
					])
				]),
				E('div', { 'id': 'firewall-sync-table' }, renderItems(firewall.items)),
				E('div', { 'class': 'right' }, [
					button(_('Preview firewall'), previewFirewall),
					' ',
					button(_('Apply firewall'), applyFirewall, 'cbi-button-apply')
				])
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Diagnostics')),
				E('p', { 'class': 'cbi-section-descr' }, _('Configuration checks are read-only.')),
				E('div', { 'id': 'validation-table' }, renderValidation(validation.checks)),
				E('div', { 'class': 'right' }, button(_('Revalidate'), validate))
			])
		]);
	}
});
